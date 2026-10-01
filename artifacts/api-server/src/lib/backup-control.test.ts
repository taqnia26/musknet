import { describe, expect, it } from "vitest";
import {
  backupEngineRunInput,
  backupExemptFromMaintenance,
  normalizeBackupCounts,
  nextScheduledAt,
  sanitizeBackupError,
  validateBackupSchedule,
  withBackupWorkerLock,
  type BackupScheduleInput,
} from "./backup-control";

const dailySchedule = (overrides: Partial<BackupScheduleInput> = {}): BackupScheduleInput => ({
  enabled: true,
  frequency: "daily",
  localDate: null,
  localTime: "18:00",
  weekday: null,
  timeZone: "Asia/Riyadh",
  ...overrides,
});

describe("backup control scheduling", () => {
  it("passes null actor ids for scheduled system backups", () => {
    expect(backupEngineRunInput({ id: "scheduled-job", actorId: null }, "scheduled")).toEqual({
      id: "scheduled-job",
      reason: "scheduled",
      actorId: null,
    });
  });

  it("rejects missing engine counts instead of fabricating zeros", () => {
    expect(normalizeBackupCounts({
      bytes: 24,
      rowCount: 3,
      tableCount: 2,
      fileCount: 1,
    })).toEqual({ bytes: 24, rowCount: 3, tableCount: 2, fileCount: 1 });
    expect(() => normalizeBackupCounts({ rowCount: 3, tableCount: 2, fileCount: 1 }))
      .toThrow("Backup engine returned an invalid bytes count");
  });

  it("balances the control lock across sequential jobs on the same connection", async () => {
    let locked = false;
    const calls: string[] = [];
    const client = {
      async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[] }> {
        if (text.includes("pg_try_advisory_lock")) {
          calls.push("lock");
          const acquired = !locked;
          locked = acquired || locked;
          return { rows: [{ locked: acquired } as unknown as T] };
        }
        if (text.includes("pg_advisory_unlock")) {
          calls.push("unlock");
          const wasLocked = locked;
          locked = false;
          return { rows: [{ pg_advisory_unlock: wasLocked } as unknown as T] };
        }
        throw new Error("Unexpected worker query");
      },
      release() {},
    };

    for (const job of ["job-1", "job-2"]) {
      const result = await withBackupWorkerLock(client, async () => {
        calls.push(job);
        return job;
      });
      expect(result).toEqual({ acquired: true, value: job });
      expect(locked).toBe(false);
    }
    expect(calls).toEqual(["lock", "job-1", "unlock", "lock", "job-2", "unlock"]);
  });

  it("computes local daily times with the selected IANA zone", () => {
    expect(nextScheduledAt(dailySchedule(), new Date("2025-01-01T14:00:00.000Z"))?.toISOString())
      .toBe("2025-01-01T15:00:00.000Z");
    expect(nextScheduledAt(dailySchedule(), new Date("2025-01-01T15:01:00.000Z"))?.toISOString())
      .toBe("2025-01-02T15:00:00.000Z");
  });

  it("handles one-off and weekday schedules in local calendar time", () => {
    expect(nextScheduledAt(dailySchedule({
      frequency: "once", localDate: "2025-05-02", localTime: "08:15",
    }), new Date("2025-05-01T00:00:00.000Z"))?.toISOString()).toBe("2025-05-02T05:15:00.000Z");

    expect(nextScheduledAt(dailySchedule({
      frequency: "weekly", weekday: 0, localTime: "04:00",
    }), new Date("2025-01-05T00:00:00.000Z"))?.toISOString()).toBe("2025-01-05T01:00:00.000Z");
  });

  it("skips a nonexistent daylight-saving wall-clock minute to the next valid daily occurrence", () => {
    expect(nextScheduledAt(dailySchedule({
      timeZone: "America/New_York",
      localTime: "02:30",
    }), new Date("2025-03-09T00:00:00.000Z"))?.toISOString()).toBe("2025-03-10T06:30:00.000Z");
  });

  it("validates weekdays, clock syntax, and IANA time zones", () => {
    expect(validateBackupSchedule(dailySchedule())).toBeNull();
    expect(validateBackupSchedule(dailySchedule({ localTime: "24:00" }))).toContain("HH:mm");
    expect(validateBackupSchedule(dailySchedule({ timeZone: "Mars/Olympus" }))).toContain("IANA");
    expect(validateBackupSchedule(dailySchedule({ frequency: "weekly", weekday: null }))).toContain("Weekday");
    expect(validateBackupSchedule(dailySchedule({ frequency: "once", localDate: null }))).toContain("local date");
  });

  it("exempts only the guarded backup namespace from the outer maintenance middleware", () => {
    expect(backupExemptFromMaintenance("GET", "/api/admin/backups")).toBe(true);
    expect(backupExemptFromMaintenance("GET", "/admin/backups/abc/preview")).toBe(true);
    expect(backupExemptFromMaintenance("POST", "/api/admin/backups/unlock")).toBe(true);
    expect(backupExemptFromMaintenance("GET", "/api/admin/orders")).toBe(false);
  });

  it("sanitizes credential material before persisting worker errors", () => {
    const sanitized = sanitizeBackupError(new Error(
      "Request failed postgres://operator:very-secret@db.local/store password=hunter2 AWS_SECRET_ACCESS_KEY=hidden",
    ));
    expect(sanitized).not.toContain("very-secret");
    expect(sanitized).not.toContain("hunter2");
    expect(sanitized).not.toContain("hidden");
    expect(sanitized).toContain("[database URL]");
  });
});