import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  db,
} from "@workspace/db";

const scrypt = promisify(nodeScrypt);
const modules = ["dashboard", "products", "categories", "orders", "coupons", "customers", "inventory", "distributors", "staff", "hr", "finance", "manufacturing", "exhibitions"];
const actions = ["view", "edit", "delete"];

export async function hashAdminPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${digest.toString("hex")}`;
}

export async function verifyAdminPassword(password: string, encoded: string) {
  const [algorithm, salt, expectedHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

let seedPromise: Promise<void> | undefined;
export function ensureAdminSeeded() {
  seedPromise ??= (async () => {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be configured");
    if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");
    await db.insert(adminPermissionsTable).values(
      modules.flatMap((module) => actions.map((action) => ({ module, action }))),
    ).onConflictDoNothing();
    const existing = await db.select({ id: adminUsersTable.id }).from(adminUsersTable)
      .where(eq(adminUsersTable.email, email)).limit(1);
    if (existing.length === 0) {
      await db.insert(adminUsersTable).values({
        email,
        name: "Super Admin",
        passwordHash: await hashAdminPassword(password),
        isSuperAdmin: true,
        isActive: true,
      });
    }
  })().catch((error) => {
    seedPromise = undefined;
    throw error;
  });
  return seedPromise;
}

export async function permissionsFor(userId: number, superAdmin: boolean) {
  if (superAdmin) return modules.flatMap((module) => actions.map((action) => `${module}:${action}`));
  const rows = await db.select({ module: adminPermissionsTable.module, action: adminPermissionsTable.action })
    .from(adminUserPermissionsTable)
    .innerJoin(adminPermissionsTable, eq(adminUserPermissionsTable.permissionId, adminPermissionsTable.id))
    .where(eq(adminUserPermissionsTable.adminUserId, userId));
  return rows.map((row) => `${row.module}:${row.action}`);
}

export async function publicAdmin(user: typeof adminUsersTable.$inferSelect) {
  return {
    id: user.id, email: user.email, name: user.name, isSuperAdmin: user.isSuperAdmin,
    isActive: user.isActive, permissions: await permissionsFor(user.id, user.isSuperAdmin),
    lastLoginAt: user.lastLoginAt, createdAt: user.createdAt,
  };
}

export async function createAdminSession(adminUserId: number) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(adminSessionsTable).values({
    adminUserId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
  });
  return token;
}

export async function adminFromToken(token: string | undefined) {
  if (!token) return null;
  const [row] = await db.select({ user: adminUsersTable }).from(adminSessionsTable)
    .innerJoin(adminUsersTable, eq(adminSessionsTable.adminUserId, adminUsersTable.id))
    .where(and(eq(adminSessionsTable.tokenHash, tokenHash(token)), gt(adminSessionsTable.expiresAt, new Date()), eq(adminUsersTable.isActive, true)))
    .limit(1);
  return row?.user ?? null;
}

export async function revokeAdminSession(token: string) {
  await db.delete(adminSessionsTable).where(eq(adminSessionsTable.tokenHash, tokenHash(token)));
}