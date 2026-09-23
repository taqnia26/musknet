import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  db,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

const suffix = Date.now();
const base = 1_860_000_000 + (suffix % 20_000_000);
const roles = [
  { id: base, module: "site-content" },
  { id: base + 1, module: "distributors" },
  { id: base + 2, module: "contracts" },
  { id: base + 3, module: "revenue" },
  { id: base + 4, module: "customer-service" },
  { id: base + 5, module: "integrations" },
  { id: base + 6, module: null },
] as const;
const tokens = new Map<string, string>();
const auth = (module: string) => ({ Authorization: `Bearer ${tokens.get(module)}` });

beforeAll(async () => {
  await db.insert(adminPermissionsTable).values(
    roles.flatMap(({ module }) => module
      ? ["view", "edit", "delete"].map((action) => ({ module, action }))
      : []),
  ).onConflictDoNothing();
  await db.insert(adminUsersTable).values(await Promise.all(roles.map(async ({ id, module }) => ({
    id,
    email: `permission-matrix-${module ?? "none"}-${suffix}@example.com`,
    name: `Permission ${module ?? "none"}`,
    passwordHash: await hashAdminPassword("permission-matrix"),
  }))));
  const permissions = await db.select().from(adminPermissionsTable)
    .where(inArray(adminPermissionsTable.module, roles.flatMap(({ module }) => module ? [module] : [])));
  await db.insert(adminUserPermissionsTable).values(roles.flatMap(({ id, module }) => {
    const permission = permissions.find((row) => row.module === module && row.action === "view");
    return permission ? [{ adminUserId: id, permissionId: permission.id }] : [];
  }));
  for (const { id, module } of roles) tokens.set(module ?? "none", await createAdminSession(id));
});

afterAll(async () => {
  const ids = roles.map(({ id }) => id);
  await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId, ids));
  await db.delete(adminUserPermissionsTable).where(inArray(adminUserPermissionsTable.adminUserId, ids));
  await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, ids));
});

describe.sequential("expanded admin permission matrix", () => {
  it("allows storefront viewing but rejects content editing without edit permission", async () => {
    await request(app).get("/api/admin/site-content").set(auth("site-content")).expect(200);
    await request(app).put("/api/admin/site-content").set(auth("site-content")).send({}).expect(403);
    await request(app).get("/api/admin/site-content").set(auth("none")).expect(403);
  });

  it("keeps B2B companies, catalog, and contracts independently scoped", async () => {
    await request(app).get("/api/admin/distributors").set(auth("distributors")).expect(200);
    await request(app).get("/api/admin/distributor-catalog").set(auth("distributors")).expect(200);
    await request(app).get("/api/admin/contracts").set(auth("distributors")).expect(403);
    await request(app).get("/api/admin/contracts").set(auth("contracts")).expect(200);
    await request(app).get("/api/admin/distributors").set(auth("contracts")).expect(403);
  });

  it("isolates revenue, customer service, and integrations permissions", async () => {
    await request(app).get("/api/admin/analytics/revenue").set(auth("revenue")).expect(200);
    await request(app).get("/api/admin/integrations").set(auth("revenue")).expect(403);
    await request(app).get("/api/admin/whatsapp/chats").set(auth("revenue")).expect(403);
    await request(app).get("/api/admin/whatsapp/status").expect(401);
    await request(app).post("/api/admin/whatsapp/connect").expect(401);
    await request(app).post("/api/admin/whatsapp/disconnect").expect(401);
    await request(app).get("/api/admin/whatsapp/status").set(auth("revenue")).expect(403);
    await request(app).post("/api/admin/whatsapp/connect").set(auth("revenue")).expect(403);
    await request(app).post("/api/admin/whatsapp/disconnect").set(auth("revenue")).expect(403);
    await request(app).post("/api/admin/whatsapp/connect").set(auth("customer-service")).expect(403);
    await request(app).post("/api/admin/whatsapp/disconnect").set(auth("customer-service")).expect(403);

    await request(app).get("/api/admin/whatsapp/chats").set(auth("customer-service")).expect(200);
    await request(app).get("/api/admin/analytics/revenue").set(auth("customer-service")).expect(403);
    await request(app).post("/api/admin/whatsapp/chats/test/messages")
      .set(auth("customer-service")).send({ text: "not sent" }).expect(403);
    await request(app).patch("/api/admin/whatsapp/chats/test")
      .set(auth("customer-service")).send({ name: "New name" }).expect(403);
    await request(app).patch("/api/admin/whatsapp/chats/test")
      .set(auth("revenue")).send({ name: "New name" }).expect(403);
    await request(app).patch("/api/admin/whatsapp/chats/test").send({ name: "New name" }).expect(401);

    await request(app).get("/api/admin/integrations").set(auth("integrations")).expect(200);
    await request(app).put("/api/admin/integrations/smsa")
      .set(auth("integrations")).send({}).expect(403);
    await request(app).get("/api/admin/analytics/revenue").set(auth("integrations")).expect(403);
  });

  it("returns 403 for direct section URLs without permission", async () => {
    for (const path of [
      "/api/admin/site-content",
      "/api/admin/distributors",
      "/api/admin/contracts",
      "/api/admin/analytics/revenue",
      "/api/admin/whatsapp/chats",
      "/api/admin/integrations",
      "/api/admin/shipping?channel=online",
    ]) {
      const response = await request(app).get(path).set(auth("none"));
      expect(response.status, path).toBe(403);
    }
  });
});