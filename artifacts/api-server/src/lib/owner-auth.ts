import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import {
  db,
  ownerSessionNotificationsTable,
  ownerSessionsTable,
  ownerUsersTable,
  ownerCredentialsTable,
} from "@workspace/db";

const scrypt = promisify(nodeScrypt);
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export class OwnerConfigurationError extends Error {}

export async function ownerCredentials() {
  const [configured] = await db.select().from(ownerCredentialsTable).limit(1);
  if (configured) return configured;
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) return null;
  if (password.length < 8) throw new OwnerConfigurationError("OWNER_PASSWORD must be at least 8 characters");
  return { id: 0, email, passwordHash: await hashOwnerPassword(password), updatedAt: new Date(), updatedBy: null };
}

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
    const configured = await db.select().from(ownerCredentialsTable).limit(1);
    const email = configured[0]?.email ?? process.env.OWNER_EMAIL?.trim().toLowerCase();
    const password = process.env.OWNER_PASSWORD;
    if (!email || (!configured[0] && !password)) throw new OwnerConfigurationError("Owner credentials must be configured");
    if (!configured[0] && password!.length < 8) throw new OwnerConfigurationError("OWNER_PASSWORD must be at least 8 characters");
    const name = process.env.OWNER_NAME?.trim() || "Owner";

    const [existing] = await db.select({
      id: ownerUsersTable.id,
      passwordHash: ownerUsersTable.passwordHash,
      email: ownerUsersTable.email,
    }).from(ownerUsersTable).limit(1);
    if (!existing) {
      await db.insert(ownerUsersTable).values({
        email,
        name,
        passwordHash: configured[0]?.passwordHash ?? await hashOwnerPassword(password!),
        isActive: true,
      });
    } else if (configured[0] && (existing.email !== email || existing.passwordHash !== configured[0].passwordHash)) {
      await db.update(ownerUsersTable).set({ email, passwordHash: configured[0].passwordHash, name }).where(eq(ownerUsersTable.id, existing.id));
    } else if (!configured[0] && !(await verifyOwnerPassword(password!, existing.passwordHash))) {
      await db.update(ownerUsersTable).set({
        name,
        passwordHash: await hashOwnerPassword(password!),
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

type OwnerSessionDevice = {
  deviceLabel: string;
  browser: string;
  operatingSystem: string;
};

function parseOwnerSessionDevice(userAgent: string | undefined): OwnerSessionDevice {
  const agent = userAgent ?? "";
  const deviceLabel = /mobile|iphone|ipod|android.+mobile/i.test(agent)
    ? "Mobile device"
    : /ipad|android/i.test(agent)
      ? "Tablet"
      : "Desktop";

  const browser = /edg\//i.test(agent)
    ? "Microsoft Edge"
    : /opr\//i.test(agent)
      ? "Opera"
      : /firefox\//i.test(agent)
        ? "Firefox"
        : /chrome\//i.test(agent)
          ? "Google Chrome"
          : /safari\//i.test(agent)
            ? "Safari"
            : "Unknown browser";

  const operatingSystem = /windows/i.test(agent)
    ? "Windows"
    : /iphone|ipad|ipod/i.test(agent)
        ? "iOS"
      : /macintosh|mac os x/i.test(agent)
        ? "macOS"
        : /android/i.test(agent)
          ? "Android"
          : /linux/i.test(agent)
            ? "Linux"
            : "Unknown operating system";

  return { deviceLabel, browser, operatingSystem };
}

export async function createOwnerSession(ownerUserId: number, userAgent?: string) {
  const token = randomBytes(32).toString("base64url");
  const device = parseOwnerSessionDevice(userAgent);
  const { session, notificationCount } = await db.transaction(async (tx) => {
    const recipients = await tx.select({ id: ownerSessionsTable.id })
      .from(ownerSessionsTable)
      .where(and(
        eq(ownerSessionsTable.ownerUserId, ownerUserId),
        gt(ownerSessionsTable.expiresAt, new Date()),
      ));
    const [createdSession] = await tx.insert(ownerSessionsTable).values({
      ownerUserId,
      tokenHash: tokenHash(token),
      ...device,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    }).returning();
    if (recipients.length > 0) {
      await tx.insert(ownerSessionNotificationsTable).values(recipients.map((recipient) => ({
        ownerUserId,
        recipientSessionId: recipient.id,
        newSessionId: createdSession.id,
        ...device,
        sessionCreatedAt: createdSession.createdAt,
        readAt: null,
      })));
    }
    return { session: createdSession, notificationCount: recipients.length };
  });
  return { token, session, notificationCount };
}

export async function ownerSessionFromToken(token: string | undefined) {
  if (!token) return null;
  const [row] = await db.select({
    session: ownerSessionsTable,
    user: ownerUsersTable,
  }).from(ownerSessionsTable)
    .innerJoin(ownerUsersTable, eq(ownerSessionsTable.ownerUserId, ownerUsersTable.id))
    .where(and(
      eq(ownerSessionsTable.tokenHash, tokenHash(token)),
      gt(ownerSessionsTable.expiresAt, new Date()),
      eq(ownerUsersTable.isActive, true),
    ))
    .limit(1);
  return row ?? null;
}

export async function ownerFromToken(token: string | undefined) {
  return (await ownerSessionFromToken(token))?.user ?? null;
}

export async function revokeOwnerSession(token: string) {
  await db.delete(ownerSessionsTable).where(eq(ownerSessionsTable.tokenHash, tokenHash(token)));
}