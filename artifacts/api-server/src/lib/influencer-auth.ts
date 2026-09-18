import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import { db, influencersTable, influencerSessionsTable } from "@workspace/db";
const scrypt = promisify(nodeScrypt);
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
export async function hashInfluencerPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${((await scrypt(password, salt, 64)) as Buffer).toString("hex")}`;
}
export async function verifyInfluencerPassword(password: string, encoded: string) {
  const [algorithm, salt, expectedHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer, expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function createInfluencerSession(influencerId: number) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(influencerSessionsTable).values({ influencerId, tokenHash: digest(token), expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) });
  return token;
}
export async function influencerFromToken(token?: string) {
  if (!token) return null;
  const [row] = await db.select({ influencer: influencersTable }).from(influencerSessionsTable)
    .innerJoin(influencersTable, eq(influencerSessionsTable.influencerId, influencersTable.id))
    .where(and(eq(influencerSessionsTable.tokenHash, digest(token)), gt(influencerSessionsTable.expiresAt, new Date()), eq(influencersTable.isActive, true))).limit(1);
  return row?.influencer ?? null;
}
export async function revokeInfluencerSession(token: string) {
  await db.delete(influencerSessionsTable).where(eq(influencerSessionsTable.tokenHash, digest(token)));
}