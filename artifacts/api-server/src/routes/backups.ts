import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { z } from "zod/v4";
import { backupRecordsTable, db } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { adminFromToken, ensureAdminSeeded } from "../lib/admin-auth";
import {
  authorizeBackupRestore,
  backupAdminSessionHash,
  requireBackupAccess,
  unlockBackupAccess,
  BackupAccessError,
} from "../lib/backup-access";
import {
  createBackupJob,
  createRestoreJob,
  getBackupExclusions,
  getBackupSchedule,
  getBackupStorageStatus,
  getMaintenanceState,
  isValidBackupId,
  listBackupRecords,
  previewBackup,
  saveBackupSchedule,
  sanitizeBackupError,
  type BackupScheduleInput,
} from "../lib/backup-control";

const router: IRouter = Router();
const bearer = (req: Request) => {
  const header = req.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
};
const route = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch((error) => {
      if (res.headersSent) {
        next(error);
        return;
      }
      res.status(500).json({ error: sanitizeBackupError(error) });
    });
  };

const scheduleSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(["once", "daily", "weekly"]),
  localDate: z.string().nullable(),
  localTime: z.string(),
  weekday: z.number().int().min(0).max(6).nullable(),
  timeZone: z.string(),
});

function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
}

router.use("/admin/backups", noStore);
router.use("/admin/backups", async (req, res, next) => {
  try {
    await ensureAdminSeeded();
    const token = bearer(req);
    const admin = await adminFromToken(token);
    if (!admin) {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }
    if (!admin.isSuperAdmin) {
      res.status(403).json({ error: "Super administrator access required" });
      return;
    }
    res.locals.admin = admin;
    res.locals.backupAdminSessionHash = backupAdminSessionHash(token!);
    next();
  } catch (error) {
    next(error);
  }
});
router.use("/admin/backups", async (req, res, next) => {
  const originalPath = req.originalUrl.split("?")[0].replace(/\/+$/, "");
  const isUnlock = req.method === "POST" &&
    (req.path === "/unlock" || originalPath.endsWith("/admin/backups/unlock"));
  if (req.method === "GET" || isUnlock) {
    next();
    return;
  }
  try {
    const runtime = await getMaintenanceState();
    if (runtime.recoveryRequired) {
      res.status(423).json({
        error: "Backup recovery required; maintenance remains enabled until an operator completes recovery",
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
});
router.use("/admin/backups", async (req, res, next) => {
  const originalPath = req.originalUrl.split("?")[0].replace(/\/+$/, "");
  if (req.path === "/unlock" || originalPath.endsWith("/admin/backups/unlock")) {
    next();
    return;
  }
  try {
    await requireBackupAccess(res.locals.backupAdminSessionHash, req.header("X-Backup-Access"));
    next();
  } catch (error) {
    if (error instanceof BackupAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    next(error);
  }
});

function sendKnownError(res: Response, error: unknown) {
  if (error instanceof BackupAccessError) {
    res.status(error.status).json({ error: error.message });
    return true;
  }
  const pgError = error as { code?: string } | null;
  if (pgError?.code === "23505") {
    res.status(409).json({ error: "Another backup or restore job is already queued or running" });
    return true;
  }
  const message = error instanceof Error ? error.message : "Backup request failed";
  if (message === "Completed backup not found") {
    res.status(404).json({ error: message });
    return true;
  }
  if (/schedule|time zone|weekday|local time|local date|label|future occurrence|frequency/i.test(message)) {
    res.status(400).json({ error: message });
    return true;
  }
  if (/storage is unavailable|storage/i.test(message)) {
    res.status(503).json({ error: message });
    return true;
  }
  if (/incompatible|integrity/i.test(message)) {
    res.status(409).json({ error: message });
    return true;
  }
  return false;
}

router.post("/admin/backups/unlock", route(async (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password || password.length > 1024) {
    res.status(400).json({ error: "Owner password is required" });
    return;
  }
  try {
    const grant = await unlockBackupAccess(res.locals.backupAdminSessionHash, password);
    res.json({ accessToken: grant.accessToken, expiresAt: grant.expiresAt });
  } catch (error) {
    if (!sendKnownError(res, error)) throw error;
  }
}));

router.get("/admin/backups", route(async (_req, res) => {
  const [records, schedule, runtime, storage, exclusions] = await Promise.all([
    listBackupRecords(),
    getBackupSchedule(),
    getMaintenanceState(),
    getBackupStorageStatus(),
    getBackupExclusions(),
  ]);
  const backups = records.map((record) => ({
    id: record.id,
    reason: record.reason,
    status: record.status,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    bytes: record.bytes,
    rowCount: record.rowCount,
    tableCount: record.tableCount,
    fileCount: record.fileCount,
    error: record.error,
    safetyBackupId: record.safetyBackupId,
  }));
  res.json({
    backups,
    schedule,
    runtime: {
      busy: runtime.busy,
      operation: runtime.operation,
      jobId: runtime.jobId,
      maintenance: runtime.maintenance,
    },
    storage,
    exclusions,
  });
}));

router.post("/admin/backups", route(async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  if (body.label !== undefined && (typeof body.label !== "string" || body.label.length > 120)) {
    res.status(400).json({ error: "Backup label must be 120 characters or fewer" });
    return;
  }
  try {
    const job = await createBackupJob(res.locals.admin.id, body.label as string | undefined);
    res.status(202).json({ job });
  } catch (error) {
    if (!sendKnownError(res, error)) throw error;
  }
}));

router.put("/admin/backups/schedule", route(async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const schedule = await saveBackupSchedule(parsed.data as BackupScheduleInput, res.locals.admin.id);
    res.json({ schedule });
  } catch (error) {
    if (!sendKnownError(res, error)) throw error;
  }
}));

router.get("/admin/backups/:id/preview", route(async (req, res) => {
  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!isValidBackupId(id)) {
    res.status(400).json({ error: "Invalid backup id" });
    return;
  }
  try {
    res.json(await previewBackup(id));
  } catch (error) {
    if (!sendKnownError(res, error)) throw error;
  }
}));

router.post("/admin/backups/:id/restore", route(async (req, res) => {
  const backupId = typeof req.params.id === "string" ? req.params.id : "";
  if (!isValidBackupId(backupId)) {
    res.status(400).json({ error: "Invalid backup id" });
    return;
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const confirmation = typeof req.body?.confirmation === "string" ? req.body.confirmation : "";
  if (confirmation !== backupId) {
    res.status(400).json({ error: "Type the exact backup id to confirm this restore" });
    return;
  }
  if (!password || password.length > 1024) {
    res.status(400).json({ error: "Owner password is required for every restore" });
    return;
  }
  const sessionHash = res.locals.backupAdminSessionHash as string;
  try {
    await authorizeBackupRestore(sessionHash, password);
    const [record] = await db.select({ id: backupRecordsTable.id, status: backupRecordsTable.status })
      .from(backupRecordsTable).where(and(
        eq(backupRecordsTable.id, backupId),
        eq(backupRecordsTable.status, "completed"),
      )).limit(1);
    if (!record) {
      res.status(404).json({ error: "Completed backup not found" });
      return;
    }
    const preview = await previewBackup(backupId);
    if (!preview.compatible) {
      res.status(409).json({ error: preview.reason ?? "Backup schema or integrity is incompatible" });
      return;
    }
    const storage = await getBackupStorageStatus();
    if (!storage.ready) {
      res.status(503).json({ error: storage.reason ?? "Backup storage is unavailable" });
      return;
    }
    const job = await createRestoreJob(res.locals.admin.id, backupId);
    res.status(202).json({ job });
  } catch (error) {
    if (!sendKnownError(res, error)) throw error;
  }
}));

export default router;