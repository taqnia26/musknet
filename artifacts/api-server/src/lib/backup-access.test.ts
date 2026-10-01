import { describe, expect, it } from "vitest";
import {
  BACKUP_ACCESS_ATTEMPT_WINDOW_MS,
  BACKUP_ACCESS_MAX_BAD_ATTEMPTS,
  BACKUP_ACCESS_TTL_MS,
  backupAdminSessionHash,
} from "./backup-access";

describe("backup access security limits", () => {
  it("uses an absolute ten-minute grant and limits five failures per fifteen-minute window", () => {
    expect(BACKUP_ACCESS_TTL_MS).toBe(10 * 60 * 1000);
    expect(BACKUP_ACCESS_ATTEMPT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(BACKUP_ACCESS_MAX_BAD_ATTEMPTS).toBe(5);
  });

  it("binds the access grant to an opaque hash of the admin bearer session", () => {
    const token = "authenticated-admin-bearer-token";
    const hash = backupAdminSessionHash(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(backupAdminSessionHash(token)).toBe(hash);
    expect(backupAdminSessionHash("another-admin-session")).not.toBe(hash);
  });
});