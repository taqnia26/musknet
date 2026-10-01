import { describe, expect, it } from "vitest";
import {
  backupExemptFromMaintenance,
  nextScheduledAt,
  sanitizeBackupError,
  validateBackupSchedule,
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