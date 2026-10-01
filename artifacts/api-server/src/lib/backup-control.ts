import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import {
  backupRecordsTable,
  backupRuntimeTable,
  backupSettingsTable,
  db,
  pool,
} from "@workspace/db";
import type { BackupRecord, BackupSettings } from "@workspace/db";
import { BackupRecoveryRequiredError } from "./backups/index";

const DEFAULT_TIME_ZONE = "Asia/Riyadh";
const WORKER_POLL_MS = 10_000;
const LEASE_MS = 30_000;
const HEARTBEAT_MS = 8_000;
// Uses the one-int advisory-lock key space; the backup engine uses its own
// distinct two-int lock and can safely lock its own snapshot/restore operation.
const WORKER_ADVISORY_LOCK = 764_211_902;
type BackupEngineReason = "manual" | "scheduled" | "pre_restore";
type BackupWorkerClient = {
  query<T extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  release(error?: Error | boolean): void;
};

export type BackupFrequency = "once" | "daily" | "weekly";
export type BackupScheduleInput = {
  enabled: boolean;
  frequency: BackupFrequency;
  localDate: string | null;
  localTime: string;
  weekday: number | null;
  timeZone: string;
};
export type BackupScheduleView = BackupScheduleInput & {
  nextRunAt: Date | null;
  lastRunAt: Date | null;
};

function validDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function validTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function localDateAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) => parts.find((entry) => entry.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateParts(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month, day };
}

/** Find the matching UTC instant rather than assuming a fixed timezone offset. */
function instantAtLocalTime(dateString: string, localTime: string, timeZone: string, after: Date) {
  const { year, month, day } = dateParts(dateString);
  const [hour, minute] = localTime.split(":").map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const wanted = `${dateString} ${localTime}`;
  const start = Math.floor((naive - 18 * 60 * 60 * 1000) / 60_000) * 60_000;
  const end = naive + 18 * 60 * 60 * 1000;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let candidate = start; candidate <= end; candidate += 60_000) {
    const instant = new Date(candidate);
    if (instant <= after) continue;
    const parts = formatter.formatToParts(instant);
    const part = (name: string) => parts.find((entry) => entry.type === name)?.value ?? "";
    const actual = `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
    if (actual === wanted) return instant;
  }
  // A local wall-clock time can be skipped by a daylight-saving transition.
  return null;
}

function nextLocalDate(dateString: string) {
  const { year, month, day } = dateParts(dateString);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function validateBackupSchedule(input: BackupScheduleInput) {
  if (!["once", "daily", "weekly"].includes(input.frequency)) return "Frequency must be once, daily, or weekly";
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.localTime)) return "Local time must use HH:mm";
  if (!validTimeZone(input.timeZone)) return "Time zone must be a valid IANA time zone";
  if (input.frequency === "once" && input.enabled && (!input.localDate || !validDateString(input.localDate))) {
    return "A valid local date is required for a one-time schedule";
  }
  if (input.localDate !== null && !validDateString(input.localDate)) return "Local date must use YYYY-MM-DD";
  if (input.frequency === "weekly" && (!Number.isInteger(input.weekday) || input.weekday! < 0 || input.weekday! > 6)) {
    return "Weekday must be an integer from 0 (Sunday) to 6 (Saturday)";
  }
  if (input.weekday !== null && (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6)) {
    return "Weekday must be an integer from 0 (Sunday) to 6 (Saturday)";
  }
  return null;
}

/** Returns the next occurrence strictly after `after`; date/time are local to timeZone. */
export function nextScheduledAt(schedule: BackupScheduleInput, after = new Date()) {
  if (!schedule.enabled || !validTimeZone(schedule.timeZone)) return null;
  if (schedule.frequency === "once") {
    if (!schedule.localDate || !validDateString(schedule.localDate)) return null;
    return instantAtLocalTime(schedule.localDate, schedule.localTime, schedule.timeZone, after);
  }
  let date = localDateAt(after, schedule.timeZone);
  for (let dayOffset = 0; dayOffset <= 370; dayOffset += 1) {
    const { year, month, day } = dateParts(date);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (schedule.frequency === "daily" || weekday === schedule.weekday) {
      const candidate = instantAtLocalTime(date, schedule.localTime, schedule.timeZone, after);
      if (candidate) return candidate;
    }
    date = nextLocalDate(date);
  }
  return null;
}

export function backupExemptFromMaintenance(_method: string, path: string) {
  return /^\/(?:api\/)?admin\/backups(?:\/|$)/.test(path);
}

export async function getMaintenanceState() {
  const [runtime] = await db.select({
    maintenance: backupRuntimeTable.maintenance,
    recoveryRequired: backupRuntimeTable.recoveryRequired,
    operation: backupRuntimeTable.operation,
    jobId: backupRuntimeTable.jobId,
    leaseExpiresAt: backupRuntimeTable.leaseExpiresAt,
  }).from(backupRuntimeTable).where(eq(backupRuntimeTable.id, 1)).limit(1);
  return {
    maintenance: runtime?.maintenance ?? false,
    recoveryRequired: runtime?.recoveryRequired ?? false,
    operation: runtime?.operation ?? null,
    jobId: runtime?.jobId ?? null,
    busy: runtime?.jobId !== null && runtime?.jobId !== undefined,
    leaseExpiresAt: runtime?.leaseExpiresAt ?? null,
  };
}

export async function getBackupSchedule(): Promise<BackupScheduleView> {
  const [row] = await db.select().from(backupSettingsTable).where(eq(backupSettingsTable.id, 1)).limit(1);
  if (!row) {
    return {
      enabled: false, frequency: "daily", localDate: null, localTime: "02:00",
      weekday: null, timeZone: DEFAULT_TIME_ZONE, nextRunAt: null, lastRunAt: null,
    };
  }
  return {
    enabled: row.enabled,
    frequency: row.frequency as BackupFrequency,
    localDate: row.localDate,
    localTime: row.localTime,
    weekday: row.weekday,
    timeZone: row.timeZone,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
  };
}

export async function saveBackupSchedule(input: BackupScheduleInput, actorId: number) {
  const validationError = validateBackupSchedule(input);
  if (validationError) throw new Error(validationError);
  const nextRunAt = nextScheduledAt(input);
  if (input.enabled && !nextRunAt) throw new Error("The selected schedule has no future occurrence");
  const values = {
    ...input,
    nextRunAt,
    updatedBy: actorId,
    updatedAt: new Date(),
  };
  const [row] = await db.insert(backupSettingsTable).values({ id: 1, ...values })
    .onConflictDoUpdate({ target: backupSettingsTable.id, set: values })
    .returning();
  return getBackupScheduleFromRow(row);
}

function getBackupScheduleFromRow(row: BackupSettings): BackupScheduleView {
  return {
    enabled: row.enabled,
    frequency: row.frequency as BackupFrequency,
    localDate: row.localDate,
    localTime: row.localTime,
    weekday: row.weekday,
    timeZone: row.timeZone,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
  };
}

export function sanitizeBackupError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Backup operation failed";
  return raw
    .replace(/(?:postgres(?:ql)?|mysql):\/\/[^\s"'`]+/gi, "[database URL]")
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[redacted]@")
    .replace(/\b(password|passwd|secret|token|credential|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\b(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|access[_-]?key|secret[_-]?key|session[_-]?token)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/([?&](?:password|secret|token|key|signature)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .slice(0, 500) || "Backup operation failed";
}

type CountValues = { bytes: number; rowCount: number; tableCount: number; fileCount: number };
function countValues(value: unknown): CountValues {
  const root = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const nested = root.counts && typeof root.counts === "object" ? root.counts as Record<string, unknown> : {};
  const metric = (name: string) => {
    const number = Number(root[name] ?? nested[name]);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  };
  return { bytes: metric("bytes"), rowCount: metric("rowCount"), tableCount: metric("tableCount"), fileCount: metric("fileCount") };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function backupEngine() {
  return import("./backups/index");
}

async function probeStorage() {
  try {
    const result = await (await backupEngine()).probeBackupStorage();
    return { ready: result.ready === true, reason: result.ready ? null : sanitizeBackupError(result.reason ?? "Backup storage is unavailable") };
  } catch (error) {
    return { ready: false, reason: sanitizeBackupError(error) };
  }
}

export async function getBackupStorageStatus() {
  return probeStorage();
}

export async function getBackupExclusions() {
  try {
    const engine = await backupEngine() as { BACKUP_EXCLUSIONS?: unknown };
    return Array.isArray(engine.BACKUP_EXCLUSIONS)
      ? engine.BACKUP_EXCLUSIONS.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function listBackupRecords() {
  return db.select().from(backupRecordsTable).orderBy(desc(backupRecordsTable.createdAt));
}

export async function createBackupJob(actorId: number, label?: string) {
  const storage = await probeStorage();
  if (!storage.ready) throw new Error(`Backup storage is unavailable: ${storage.reason ?? "storage probe failed"}`);
  const cleanLabel = label?.trim() || null;
  if (cleanLabel && cleanLabel.length > 120) throw new Error("Backup label must be 120 characters or fewer");
  const [job] = await db.insert(backupRecordsTable).values({
    reason: "manual", status: "queued", label: cleanLabel, actorId,
  }).returning();
  return job;
}

export async function createRestoreJob(actorId: number, backupId: string, label?: string) {
  const [job] = await db.insert(backupRecordsTable).values({
    reason: "restore", status: "queued", label: label ?? null, actorId, safetyBackupId: null,
    targetBackupId: backupId,
  }).returning();
  return job;
}

export async function previewBackup(backupId: string) {
  const [record] = await db.select().from(backupRecordsTable).where(eq(backupRecordsTable.id, backupId)).limit(1);
  if (!record || record.status !== "completed" || record.reason === "restore") {
    throw new Error("Completed backup not found");
  }
  const inspected = await (await backupEngine()).inspectBackup(backupId);
  const root = asRecord(inspected);
  const manifest = asRecord(root.manifest ?? inspected);
  const counts = countValues(root.counts ? root : manifest);
  const compatible = root.compatible === true || manifest.compatible === true;
  const reason = typeof root.reason === "string" ? sanitizeBackupError(root.reason)
    : typeof manifest.reason === "string" ? sanitizeBackupError(manifest.reason)
      : compatible ? null : "Backup schema or integrity is incompatible";
  const exclusions = Array.isArray(root.exclusions) ? root.exclusions
    : Array.isArray(manifest.exclusions) ? manifest.exclusions : await getBackupExclusions();
  return {
    id: backupId,
    createdAt: record.createdAt,
    bytes: counts.bytes ?? record.bytes,
    rowCount: counts.rowCount ?? record.rowCount,
    tableCount: counts.tableCount ?? record.tableCount,
    fileCount: counts.fileCount ?? record.fileCount,
    compatible,
    reason,
    exclusions: exclusions.filter((item): item is string => typeof item === "string"),
  };
}

async function updateRecord(id: string, values: Partial<typeof backupRecordsTable.$inferInsert>) {
  await db.update(backupRecordsTable).set(values).where(eq(backupRecordsTable.id, id));
}

async function runBackupRecord(id: string, reason: BackupEngineReason, actorId: number) {
  const storage = await probeStorage();
  if (!storage.ready) throw new Error(storage.reason ?? "Backup storage is unavailable");
  const result = await (await backupEngine()).runBackup({ id, reason, actorId });
  return countValues(result);
}

async function finishBackupRecord(id: string, counts: CountValues) {
  await updateRecord(id, { ...counts, status: "completed", completedAt: new Date(), error: null });
}

async function processBackupJob(job: BackupRecord) {
  const actorId = job.actorId ?? 0;
  if (job.reason !== "restore") {
    const reason = job.reason === "scheduled" ? "scheduled" : "manual";
    const counts = await runBackupRecord(job.id, reason, actorId);
    await finishBackupRecord(job.id, counts);
    return;
  }

  const targetId = job.targetBackupId ?? "";
  if (!targetId) throw new Error("Restore target is missing");
  const preview = await previewBackup(targetId);
  if (!preview.compatible) throw new Error(preview.reason ?? "Backup schema or integrity is incompatible");

  const safetyId = randomUUID();
  const [safetyRecord] = await db.insert(backupRecordsTable).values({
    id: safetyId, reason: "pre_restore", status: "running", actorId: job.actorId,
  }).returning();
  await updateRecord(job.id, { safetyBackupId: safetyRecord.id });
  try {
    const safetyCounts = await runBackupRecord(safetyRecord.id, "pre_restore", actorId);
    await finishBackupRecord(safetyRecord.id, safetyCounts);
  } catch (error) {
    await updateRecord(safetyRecord.id, {
      status: "failed",
      error: sanitizeBackupError(error),
      completedAt: new Date(),
    });
    throw error;
  }

  // The engine is invoked only after a completed safety snapshot is durable.
  await (await backupEngine()).runRestore(targetId);
  await updateRecord(job.id, { status: "completed", completedAt: new Date(), error: null });
}

async function runtimeUpsert() {
  await db.insert(backupRuntimeTable).values({ id: 1 })
    .onConflictDoNothing({ target: backupRuntimeTable.id });
}

async function recoverExpiredLease() {
  await runtimeUpsert();
  const now = new Date();
  const [runtime] = await db.select().from(backupRuntimeTable).where(eq(backupRuntimeTable.id, 1)).limit(1);
  const jobId = runtime?.jobId;
  if (runtime?.recoveryRequired || !jobId || !runtime.leaseExpiresAt || runtime.leaseExpiresAt > now) return;
  const requiresRecovery = runtime.operation === "restore";
  const failureMessage = requiresRecovery
    ? "Worker lease expired during restore; maintenance remains enabled and operator recovery is required"
    : "Worker lease expired before the job completed; it was not automatically marked complete";
  await db.transaction(async (tx) => {
    await tx.update(backupRecordsTable).set({
      status: "failed",
      error: failureMessage,
      completedAt: now,
    }).where(eq(backupRecordsTable.status, "running"));
    await tx.update(backupRuntimeTable).set({
      jobId: requiresRecovery ? jobId : null,
      operation: requiresRecovery ? "recovery_required" : null,
      maintenance: requiresRecovery,
      recoveryRequired: requiresRecovery,
      leaseOwner: null,
      leaseExpiresAt: null, heartbeatAt: now, updatedAt: now,
    }).where(and(eq(backupRuntimeTable.id, 1), eq(backupRuntimeTable.jobId, jobId)));
  });
}

async function enqueueDueSchedule(now: Date) {
  const [schedule] = await db.select().from(backupSettingsTable)
    .where(and(eq(backupSettingsTable.id, 1), eq(backupSettingsTable.enabled, true), lte(backupSettingsTable.nextRunAt, now)))
    .limit(1);
  if (!schedule?.nextRunAt) return false;
  const dueAt = schedule.nextRunAt;
  const nextInput: BackupScheduleInput = {
    enabled: schedule.enabled,
    frequency: schedule.frequency as BackupFrequency,
    localDate: schedule.localDate,
    localTime: schedule.localTime,
    weekday: schedule.weekday,
    timeZone: schedule.timeZone,
  };
  const nextRunAt = schedule.frequency === "once" ? null : nextScheduledAt(nextInput, now);
  return db.transaction(async (tx) => {
    const [advanced] = await tx.update(backupSettingsTable).set({
      enabled: schedule.frequency === "once" ? false : schedule.enabled,
      lastRunAt: dueAt,
      nextRunAt,
      updatedAt: now,
    }).where(and(
      eq(backupSettingsTable.id, 1),
      eq(backupSettingsTable.nextRunAt, dueAt),
    )).returning({ id: backupSettingsTable.id });
    if (!advanced) return false;
    await tx.insert(backupRecordsTable).values({ reason: "scheduled", status: "queued" });
    return true;
  });
}

async function pickNextJob() {
  const [job] = await db.select().from(backupRecordsTable)
    .where(eq(backupRecordsTable.status, "queued"))
    .orderBy(asc(backupRecordsTable.createdAt))
    .limit(1);
  return job;
}

async function processNextJob(workerId: string) {
  await runtimeUpsert();
  const now = new Date();
  const job = await pickNextJob();
  if (!job) {
    await enqueueDueSchedule(now);
    return false;
  }
  const operation = job.reason === "restore" ? "restore" : "backup";
  await db.transaction(async (tx) => {
    await tx.update(backupRecordsTable).set({ status: "running" })
      .where(and(eq(backupRecordsTable.id, job.id), eq(backupRecordsTable.status, "queued")));
    await tx.update(backupRuntimeTable).set({
      jobId: job.id, operation, maintenance: true, recoveryRequired: false,
      leaseOwner: workerId, leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      heartbeatAt: now, updatedAt: now,
    }).where(eq(backupRuntimeTable.id, 1));
  });
  const runningJob = { ...job, status: "running" as const };
  let requiresRecovery = false;
  try {
    await processBackupJob(runningJob);
  } catch (error) {
    const sanitized = sanitizeBackupError(error);
    await updateRecord(job.id, { status: "failed", error: sanitized, completedAt: new Date() });
    if (error instanceof BackupRecoveryRequiredError) {
      requiresRecovery = true;
      const at = new Date();
      await db.update(backupRuntimeTable).set({
        operation: "recovery_required",
        recoveryRequired: true,
        maintenance: true,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: at,
        updatedAt: at,
      }).where(and(eq(backupRuntimeTable.id, 1), eq(backupRuntimeTable.jobId, job.id)));
    }
  } finally {
    if (!requiresRecovery) {
      const endedAt = new Date();
      await db.update(backupRuntimeTable).set({
        jobId: null, operation: null, maintenance: false, recoveryRequired: false, leaseOwner: workerId,
        leaseExpiresAt: new Date(endedAt.getTime() + LEASE_MS), heartbeatAt: endedAt, updatedAt: endedAt,
      }).where(and(eq(backupRuntimeTable.id, 1), eq(backupRuntimeTable.jobId, job.id)));
    }
  }
  return true;
}

let workerStarted = false;
let workerStopping = false;
export function startBackupWorker() {
  if (workerStarted) return;
  workerStarted = true;
  workerStopping = false;
  const workerId = randomUUID();
  let client: BackupWorkerClient | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const loop = async () => {
    try {
      while (!workerStopping) {
        try {
          const currentClient = client ?? await pool.connect();
          client = currentClient;
          const lock = await currentClient.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [WORKER_ADVISORY_LOCK]);
          if (!lock.rows[0]?.locked) {
            currentClient.release();
            client = undefined;
            await sleep(WORKER_POLL_MS);
            continue;
          }

          await runtimeUpsert();
          await recoverExpiredLease();
          const priorRuntime = await getMaintenanceState();
          if (priorRuntime.recoveryRequired) {
            if (heartbeat) clearInterval(heartbeat);
            heartbeat = undefined;
            await currentClient.query("select pg_advisory_unlock($1)", [WORKER_ADVISORY_LOCK]);
            currentClient.release();
            client = undefined;
            await sleep(WORKER_POLL_MS);
            continue;
          }
          if (priorRuntime.jobId) {
            const waitMs = Math.max(1000, Math.min(WORKER_POLL_MS, (priorRuntime.leaseExpiresAt?.getTime() ?? Date.now()) - Date.now() + 500));
            await currentClient.query("select pg_advisory_unlock($1)", [WORKER_ADVISORY_LOCK]);
            currentClient.release();
            client = undefined;
            await sleep(waitMs);
            continue;
          }
          const now = new Date();
          await db.update(backupRuntimeTable).set({
            leaseOwner: workerId, leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
            heartbeatAt: now, updatedAt: now,
          }).where(eq(backupRuntimeTable.id, 1));
          heartbeat = setInterval(() => {
            const at = new Date();
            void db.update(backupRuntimeTable).set({
              leaseExpiresAt: new Date(at.getTime() + LEASE_MS), heartbeatAt: at, updatedAt: at,
            }).where(and(eq(backupRuntimeTable.id, 1), eq(backupRuntimeTable.leaseOwner, workerId)))
              .catch(() => undefined);
          }, HEARTBEAT_MS);

          const processed = await processNextJob(workerId);
          if (processed) continue;
          // Reacquire / release between scheduler polls so a sleeping deployment
          // does not falsely suggest the scheduler has run while it was stopped.
          clearInterval(heartbeat);
          heartbeat = undefined;
          await currentClient.query("select pg_advisory_unlock($1)", [WORKER_ADVISORY_LOCK]);
          currentClient.release();
          client = undefined;
          await sleep(WORKER_POLL_MS);
        } catch (error) {
          console.error("Backup worker iteration failed:", sanitizeBackupError(error));
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = undefined;
          if (client) {
            try { client.release(true); } catch { /* already released */ }
            client = undefined;
          }
          await sleep(WORKER_POLL_MS);
        }
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      if (client) {
        try { await client.query("select pg_advisory_unlock($1)", [WORKER_ADVISORY_LOCK]); } catch { /* connection lost */ }
        client.release();
      }
      workerStarted = false;
    }
  };
  void loop();
  return () => { workerStopping = true; };
}

export function defaultBackupSchedule(): BackupScheduleInput {
  return {
    enabled: false, frequency: "daily", localDate: null, localTime: "02:00",
    weekday: null, timeZone: DEFAULT_TIME_ZONE,
  };
}

export function isValidBackupId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}