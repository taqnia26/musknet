import { pool } from "@workspace/db";
import {
  appAssetRoots,
  createBackupEngine,
  type BackupReason,
} from "./engine";
import { GcsBackupStorage } from "./gcs-storage";
import { LocalBackupStorage } from "./local-storage";
import { assertPrivateBackupDirectory, backupStorageConfig } from "./storage-config";

let engine: ReturnType<typeof createBackupEngine> | undefined;

function getEngine() {
  if (!engine) {
    const config = backupStorageConfig();
    const root = config.privateRoot;
    const fileRoots = appAssetRoots(import.meta.dirname);
    if (config.driver === "local") {
      assertPrivateBackupDirectory(config.directory, fileRoots);
    }
    engine = createBackupEngine({
      pool,
      storage: config.driver === "local"
        ? new LocalBackupStorage(config.directory, root)
        : new GcsBackupStorage(root),
      privateObjectRoot: root,
      fileRoots,
      assertFenced: async () => {
        const { assertBackupExclusiveFence } = await import("../backup-fence");
        await assertBackupExclusiveFence();
      },
    });
  }
  return engine;
}

export function runBackup(input: {
  id: string;
  reason: BackupReason;
  actorId: number | null;
}): Promise<{ rowCount: number; tableCount: number; fileCount: number; bytes: number; schemaHash: string }> {
  return getEngine().runBackup(input);
}

export function inspectBackup(id: string): Promise<{
  rowCount: number;
  tableCount: number;
  fileCount: number;
  bytes: number;
  schemaHash: string;
  createdAt: string;
  compatible: boolean;
}> {
  return getEngine().inspectBackup(id);
}

export function runRestore(id: string): Promise<void> {
  return getEngine().runRestore(id);
}

export async function probeBackupStorage(): Promise<{ ready: boolean; reason: string | null }> {
  try {
    return await getEngine().probeBackupStorage();
  } catch (error) {
    return {
      ready: false,
      reason: error instanceof Error ? error.message : "Backup storage is not configured",
    };
  }
}

export {
  BACKUP_EXCLUSIONS,
  BACKUP_OBJECT_PREFIX,
  BackupEngineError,
  BackupRecoveryRequiredError,
  createBackupEngine,
  createBackupId,
  isBackupObjectPath,
  privateStorageRoot,
  appAssetRoots,
} from "./engine";
export type {
  BackupDbClient,
  BackupDbPool,
  BackupEngineOptions,
  BackupFileRoot,
  BackupInspection,
  BackupObjectStorage,
  BackupReason,
  BackupSummary,
  StoredObject,
} from "./engine";