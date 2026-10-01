import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import { backupAccessGrantsTable, db, ownerCredentialsTable } from "@workspace/db";
import { verifyOwnerPassword } from "./owner-auth";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const BACKUP_ACCESS_TTL_MS = 10 * 60 * 1000;
export const BACKUP_ACCESS_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const BACKUP_ACCESS_MAX_BAD_ATTEMPTS = 5;

export class BackupAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type BackupAccessExecutor = Pick<typeof db, "select" | "insert" | "delete" | "execute">;

async function ownerPasswordHash() {
  const [credentials] = await db.select({ passwordHash: ownerCredentialsTable.passwordHash })
    .from(ownerCredentialsTable).limit(1);
  if (!credentials?.passwordHash) {
    throw new BackupAccessError("Owner password is not configured", 503);
  }
  return credentials.passwordHash;
}

async function lockSessionAttempts(tx: BackupAccessExecutor, adminSessionHash: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${adminSessionHash}, 0))`);
}

async function attemptBudgetAvailable(tx: BackupAccessExecutor, adminSessionHash: string) {
  const now = new Date();
  await tx.delete(backupAccessGrantsTable).where(lte(backupAccessGrantsTable.expiresAt, now));
  const cutoff = new Date(now.getTime() - BACKUP_ACCESS_ATTEMPT_WINDOW_MS);
  const [attempts] = await tx.select({ total: count() }).from(backupAccessGrantsTable)
    .where(and(
      eq(backupAccessGrantsTable.adminSessionHash, adminSessionHash),
      eq(backupAccessGrantsTable.outcome, "rejected"),
      gt(backupAccessGrantsTable.createdAt, cutoff),
    ));
  return Number(attempts?.total ?? 0) < BACKUP_ACCESS_MAX_BAD_ATTEMPTS;
}

async function logAttempt(tx: BackupAccessExecutor, adminSessionHash: string, outcome: "rejected" | "restore-authorized") {
  const createdAt = new Date();
  await tx.insert(backupAccessGrantsTable).values({
    adminSessionHash,
    outcome,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + BACKUP_ACCESS_ATTEMPT_WINDOW_MS),
  });
}

/** Verify against the single currently stored owner credential, never environment values. */
export async function unlockBackupAccess(adminSessionHash: string, password: string) {
  const accessToken = randomBytes(32).toString("base64url");
  const result = await db.transaction(async (tx) => {
    await lockSessionAttempts(tx, adminSessionHash);
    if (!(await attemptBudgetAvailable(tx, adminSessionHash))) return { limited: true as const };
    const [credentials] = await tx.select({ passwordHash: ownerCredentialsTable.passwordHash })
      .from(ownerCredentialsTable).limit(1);
    if (!credentials?.passwordHash) {
      throw new BackupAccessError("Owner password is not configured", 503);
    }
    if (!password || !(await verifyOwnerPassword(password, credentials.passwordHash))) {
      await logAttempt(tx, adminSessionHash, "rejected");
      return { rejected: true as const };
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + BACKUP_ACCESS_TTL_MS);
    await tx.insert(backupAccessGrantsTable).values({
      adminSessionHash,
      accessTokenHash: sha256(accessToken),
      passwordFingerprint: sha256(credentials.passwordHash),
      outcome: "granted",
      createdAt,
      expiresAt,
    });
    return { expiresAt };
  });
  if ("limited" in result) {
    throw new BackupAccessError("Too many incorrect backup password attempts; try again in 15 minutes", 429);
  }
  if ("rejected" in result) {
    throw new BackupAccessError("Owner password is incorrect", 401);
  }
  return { accessToken, expiresAt: result.expiresAt };
}

/** Grants are bound to this bearer session and invalidated if the owner password changes. */
export async function requireBackupAccess(adminSessionHash: string, accessToken: string | undefined) {
  if (!accessToken) throw new BackupAccessError("Backup access is locked; unlock with the owner password", 423);
  const currentHash = await ownerPasswordHash();
  const [grant] = await db.select({ id: backupAccessGrantsTable.id })
    .from(backupAccessGrantsTable)
    .where(and(
      eq(backupAccessGrantsTable.adminSessionHash, adminSessionHash),
      eq(backupAccessGrantsTable.accessTokenHash, sha256(accessToken)),
      eq(backupAccessGrantsTable.passwordFingerprint, sha256(currentHash)),
      eq(backupAccessGrantsTable.outcome, "granted"),
      gt(backupAccessGrantsTable.expiresAt, new Date()),
    )).limit(1);
  if (!grant) throw new BackupAccessError("Backup access is expired or invalid; unlock again", 423);
}

/** Each restore performs a new password check even when the access grant is still valid. */
export async function authorizeBackupRestore(adminSessionHash: string, password: string) {
  const result = await db.transaction(async (tx) => {
    await lockSessionAttempts(tx, adminSessionHash);
    if (!(await attemptBudgetAvailable(tx, adminSessionHash))) return { limited: true as const };
    const [credentials] = await tx.select({ passwordHash: ownerCredentialsTable.passwordHash })
      .from(ownerCredentialsTable).limit(1);
    if (!credentials?.passwordHash) {
      throw new BackupAccessError("Owner password is not configured", 503);
    }
    if (!password || !(await verifyOwnerPassword(password, credentials.passwordHash))) {
      await logAttempt(tx, adminSessionHash, "rejected");
      return { rejected: true as const };
    }
    await logAttempt(tx, adminSessionHash, "restore-authorized");
    return { fingerprint: sha256(credentials.passwordHash) };
  });
  if ("limited" in result) {
    throw new BackupAccessError("Too many incorrect backup password attempts; try again in 15 minutes", 429);
  }
  if ("rejected" in result) {
    throw new BackupAccessError("Owner password is incorrect", 401);
  }
  return result.fingerprint;
}

export function backupAdminSessionHash(bearerToken: string) {
  return sha256(bearerToken);
}
