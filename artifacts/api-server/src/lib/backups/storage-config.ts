import path from "node:path";
import { privateStorageRoot } from "./engine";

export function backupStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
  workingDirectory = process.cwd(),
) {
  const driver = env.BACKUP_STORAGE_DRIVER?.trim() || "local";
  if (driver === "local") {
    return {
      driver,
      privateRoot: "local",
      directory: path.resolve(workingDirectory, env.BACKUP_STORAGE_DIR?.trim() || ".backups"),
    } as const;
  }
  if (driver === "gcs") {
    return { driver, privateRoot: privateStorageRoot(env.PRIVATE_OBJECT_DIR) } as const;
  }
  throw new Error("BACKUP_STORAGE_DRIVER must be local or gcs");
}

export function assertPrivateBackupDirectory(
  directory: string,
  servedRoots: readonly { directory: string }[],
) {
  for (const root of servedRoots) {
    const relative = path.relative(path.resolve(root.directory), directory);
    if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
      throw new Error("BACKUP_STORAGE_DIR must be outside every served upload/assets directory");
    }
  }
}