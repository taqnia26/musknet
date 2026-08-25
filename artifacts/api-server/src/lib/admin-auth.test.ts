import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  db,
} from "@workspace/db";
import {
  adminFromToken,
  createAdminSession,
  hashAdminPassword,
  permissionsFor,
  verifyAdminPassword,
} from "./admin-auth";

const emails: string[] = [];

afterEach(async () => {
  for (const email of emails) {
    const [user] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).where(eq(adminUsersTable.email, email));
    if (user) await db.delete(adminUsersTable).where(eq(adminUsersTable.id, user.id));
  }
  emails.length = 0;
});

describe.sequential("admin authentication and authorization", () => {
  it("uses salted scrypt hashes and rejects an incorrect password", async () => {
    const first = await hashAdminPassword("correct horse battery");
    const second = await hashAdminPassword("correct horse battery");
    expect(first).not.toBe(second);
    expect(await verifyAdminPassword("correct horse battery", first)).toBe(true);
    expect(await verifyAdminPassword("incorrect password", first)).toBe(false);
  });

  it("uses opaque revocable sessions and rejects inactive administrators", async () => {
    const email = `admin-test-${Date.now()}@example.com`;
    emails.push(email);
    const [user] = await db.insert(adminUsersTable).values({
      email, name: "Test Admin", passwordHash: await hashAdminPassword("test password"),
    }).returning();
    const token = await createAdminSession(user.id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await adminFromToken(token))?.id).toBe(user.id);
    await db.update(adminUsersTable).set({ isActive: false }).where(eq(adminUsersTable.id, user.id));
    expect(await adminFromToken(token)).toBeNull();
  });

  it("returns only explicitly assigned permissions for regular staff", async () => {
    const email = `permission-test-${Date.now()}@example.com`;
    emails.push(email);
    const [user] = await db.insert(adminUsersTable).values({
      email, name: "Permission Test", passwordHash: await hashAdminPassword("test password"),
    }).returning();
    const [permission] = await db.insert(adminPermissionsTable).values({ module: "products", action: "view" })
      .onConflictDoUpdate({
        target: [adminPermissionsTable.module, adminPermissionsTable.action],
        set: { module: "products" },
      }).returning();
    await db.insert(adminUserPermissionsTable).values({ adminUserId: user.id, permissionId: permission.id });
    expect(await permissionsFor(user.id, false)).toEqual(["products:view"]);
    expect(await permissionsFor(user.id, true)).toContain("staff:delete");
    await db.delete(adminUserPermissionsTable).where(eq(adminUserPermissionsTable.adminUserId, user.id));
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, user.id));
  });
});