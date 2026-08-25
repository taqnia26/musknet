import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  db,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

const seedEmail = `route-super-${Date.now()}@example.com`;
const createdIds: number[] = [];
const temporarilyDisabledSuperIds: number[] = [];
let superId: number;
let superToken: string;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = seedEmail;
  process.env.ADMIN_PASSWORD = "route-test-password";

  // The first request initializes the environment-backed super administrator.
  await request(app).get("/api/admin/dashboard").expect(401);
  const [superAdmin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, seedEmail));
  superId = superAdmin.id;
  createdIds.push(superId);
  superToken = await createAdminSession(superId);
  const activeSuperAdmins = await db.select({ id: adminUsersTable.id }).from(adminUsersTable)
    .where(and(eq(adminUsersTable.isSuperAdmin, true), eq(adminUsersTable.isActive, true)));
  temporarilyDisabledSuperIds.push(...activeSuperAdmins.filter((user) => user.id !== superId).map((user) => user.id));
  if (temporarilyDisabledSuperIds.length) {
    await db.update(adminUsersTable).set({ isActive: false })
      .where(inArray(adminUsersTable.id, temporarilyDisabledSuperIds));
  }
});

afterAll(async () => {
  if (temporarilyDisabledSuperIds.length) {
    await db.update(adminUsersTable).set({ isActive: true })
      .where(inArray(adminUsersTable.id, temporarilyDisabledSuperIds));
  }
  if (createdIds.length) {
    await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, createdIds));
  }
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
});

describe.sequential("admin route authorization", () => {
  it("returns 401 when an admin session is missing", async () => {
    const response = await request(app).get("/api/admin/products").expect(401);
    expect(response.body.error).toMatch(/authentication/i);
  });

  it("allows view-only staff to read but returns 403 for edits", async () => {
    const email = `route-viewer-${Date.now()}@example.com`;
    const [viewer] = await db.insert(adminUsersTable).values({
      email,
      name: "View Only",
      passwordHash: await hashAdminPassword("viewer-test-password"),
    }).returning();
    createdIds.push(viewer.id);
    const [permission] = await db.select().from(adminPermissionsTable)
      .where(eq(adminPermissionsTable.module, "products"))
      .then((rows) => rows.filter((row) => row.action === "view"));
    await db.insert(adminUserPermissionsTable).values({
      adminUserId: viewer.id,
      permissionId: permission.id,
    });
    const token = await createAdminSession(viewer.id);

    await request(app).get("/api/admin/products").set("Authorization", `Bearer ${token}`).expect(200);
    const denied = await request(app)
      .patch("/api/admin/products/1")
      .set("Authorization", `Bearer ${token}`)
      .send({ nameEn: "Forbidden edit" })
      .expect(403);
    expect(denied.body.error).toMatch(/permission/i);
  });

  it("prevents disabling or demoting the sole active super administrator", async () => {
    const demotion = await request(app)
      .patch(`/api/admin/staff/${superId}`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ isSuperAdmin: false })
      .expect(409);
    expect(demotion.body.error).toMatch(/sole super administrator/i);

    const disable = await request(app)
      .delete(`/api/admin/staff/${superId}`)
      .set("Authorization", `Bearer ${superToken}`)
      .expect(409);
    expect(disable.body.error).toMatch(/sole super administrator/i);
  });
});