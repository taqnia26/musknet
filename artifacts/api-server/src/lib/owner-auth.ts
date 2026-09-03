import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { db, ownerSessionsTable, ownerUsersTable } from "@workspace/db";

const scrypt = promisify(nodeScrypt);
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export class OwnerConfigurationError extends Error {}

export async function hashOwnerPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${digest.toString("hex")}`;
}

export async function verifyOwnerPassword(password: string, encoded: string) {
  const [algorithm, salt, expectedHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let seedPromise: Promise<void> | undefined;
export function ensureOwnerSeeded() {
  seedPromise ??= (async () => {
    const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
    const password = process.env.OWNER_PASSWORD;
    if (!email || !password) throw new OwnerConfigurationError("OWNER_EMAIL and OWNER_PASSWORD must be configured");
    if (password.length < 8) throw new OwnerConfigurationError("OWNER_PASSWORD must be at least 8 characters");
    const name = process.env.OWNER_NAME?.trim() || "Owner";

    const [existing] = await db.select({
      id: ownerUsersTable.id,
      passwordHash: ownerUsersTable.passwordHash,
    }).from(ownerUsersTable)
      .where(eq(ownerUsersTable.email, email)).limit(1);
    if (!existing) {
      await db.insert(ownerUsersTable).values({
        email,
        name,
        passwordHash: await hashOwnerPassword(password),
        isActive: true,
      });
    } else if (!(await verifyOwnerPassword(password, existing.passwordHash))) {
      await db.update(ownerUsersTable).set({
        name,
        passwordHash: await hashOwnerPassword(password),
      }).where(eq(ownerUsersTable.id, existing.id));
    }
  })().catch((error) => {
    seedPromise = undefined;
    throw error;
  });
  return seedPromise;
}

export function publicOwner(user: typeof ownerUsersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export async function createOwnerSession(ownerUserId: number) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(ownerSessionsTable).values({
    ownerUserId,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
  });
  return token;
}

export async function ownerFromToken(token: string | undefined) {
  if (!token) return null;
  const [row] = await db.select({ user: ownerUsersTable }).from(ownerSessionsTable)
    .innerJoin(ownerUsersTable, eq(ownerSessionsTable.ownerUserId, ownerUsersTable.id))
    .where(and(
      eq(ownerSessionsTable.tokenHash, tokenHash(token)),
      gt(ownerSessionsTable.expiresAt, new Date()),
      eq(ownerUsersTable.isActive, true),
    ))
    .limit(1);
  return row?.user ?? null;
}

export async function revokeOwnerSession(token: string) {
  await db.delete(ownerSessionsTable).where(eq(ownerSessionsTable.tokenHash, tokenHash(token)));
}