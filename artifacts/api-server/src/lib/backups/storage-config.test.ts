import { describe, expect, it } from "vitest";
import { assertPrivateBackupDirectory, backupStorageConfig } from "./storage-config";

describe("backup storage configuration", () => {
  it("defaults to local without requiring Replit configuration", () => {
    expect(backupStorageConfig({}, "/srv/store")).toEqual({
      driver: "local", privateRoot: "local", directory: "/srv/store/.backups",
    });
    expect(backupStorageConfig({ PRIVATE_OBJECT_DIR: "/unused/cloud" }, "/srv/store").driver).toBe("local");
  });

  it("resolves configured local directories and rejects unknown drivers", () => {
    expect(backupStorageConfig({ BACKUP_STORAGE_DIR: "/var/lib/store/backups" }).directory).toBe("/var/lib/store/backups");
    expect(() => backupStorageConfig({ BACKUP_STORAGE_DRIVER: "unknown" })).toThrow(/local or gcs/);
  });

  it("requires cloud root only for explicit gcs selection", () => {
    expect(() => backupStorageConfig({ BACKUP_STORAGE_DRIVER: "gcs" })).toThrow();
    expect(backupStorageConfig({ BACKUP_STORAGE_DRIVER: "gcs", PRIVATE_OBJECT_DIR: "/bucket/private" }))
      .toEqual({ driver: "gcs", privateRoot: "bucket/private" });
  });

  it("keeps private archives out of served filesystem roots", () => {
    const roots = [{ directory: "/srv/store/attached_assets" }];
    expect(() => assertPrivateBackupDirectory("/srv/store/attached_assets", roots)).toThrow();
    expect(() => assertPrivateBackupDirectory("/srv/store/attached_assets/backups", roots)).toThrow();
    expect(() => assertPrivateBackupDirectory("/srv/store/attached_assets-other", roots)).not.toThrow();
  });
});