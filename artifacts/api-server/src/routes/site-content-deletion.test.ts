import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  db,
  siteContentTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

const suffix = `${Date.now()}-${process.pid}`;
const baseId = 1_900_000_000 + (Date.now() % 100_000_000);
const roles = [
  { id: baseId, name: "view", permission: ["site-content", "view"] },
  { id: baseId + 1, name: "edit", permission: ["site-content", "edit"] },
  { id: baseId + 2, name: "contracts", permission: ["contracts", "edit"] },
  { id: baseId + 3, name: "delete", permission: ["site-content", "delete"] },
] as const;
const tokens = new Map<string, string>();
const auth = (name: string) => ({ Authorization: `Bearer ${tokens.get(name)}` });

const deletableKey = `custom.site-content-delete-${suffix}`;
const retainedKey = `custom.site-content-retained-${suffix}`;
const addedKey = `custom.site-content-added-${suffix}`;
const protectedKeys = [
  `seller_legal_profile_test_${suffix}`,
  `legal_terms_test_${suffix}`,
  `billing_settings_test_${suffix}`,
  `future_settings_test_${suffix}`,
  `Custom.site-content-${suffix}`,
  `custom.site-content-${suffix}Upper`,
  `custom.-site-content-${suffix}`,
  `custom._site-content-${suffix}`,
  `custom.site-content-${suffix}.`,
  `custom..site-content-${suffix}`,
  ` custom.site-content-${suffix}`,
  `custom.site-content-${suffix} `,
  `custom.site-content-${suffix}\n`,
  `customx.site-content-${suffix}`,
];
const fixtureKeys = [deletableKey, retainedKey, ...protectedKeys];
let originalSiteContent: Array<typeof siteContentTable.$inferSelect> = [];

beforeAll(async () => {
  originalSiteContent = await db.select().from(siteContentTable);
  const requiredPermissions = [
    { module: "site-content", action: "view" },
    { module: "site-content", action: "edit" },
    { module: "site-content", action: "delete" },
    { module: "contracts", action: "edit" },
  ];
  await db.insert(adminPermissionsTable).values(requiredPermissions).onConflictDoNothing();
  await db.insert(adminUsersTable).values(await Promise.all(roles.map(async ({ id, name }) => ({
    id,
    email: `site-content-delete-${name}-${suffix}@example.com`,
    name: `Site content ${name}`,
    passwordHash: await hashAdminPassword("site-content-delete-test"),
  }))));
  const permissions = await db.select().from(adminPermissionsTable)
    .where(inArray(adminPermissionsTable.module, ["site-content", "contracts"]));
  await db.insert(adminUserPermissionsTable).values(roles.map(({ id, permission }) => {
    const found = permissions.find((row) => row.module === permission[0] && row.action === permission[1]);
    if (!found) throw new Error(`Missing ${permission[0]}:${permission[1]} test permission`);
    return { adminUserId: id, permissionId: found.id };
  }));
  for (const { id, name } of roles) tokens.set(name, await createAdminSession(id));

  await db.insert(siteContentTable).values([
    { key: deletableKey, data: { fixture: "deletable" }, updatedBy: "site-content-delete-test" },
    { key: retainedKey, data: { fixture: "retained" }, updatedBy: "site-content-delete-test" },
    ...protectedKeys.map((key) => ({
      key,
      data: { fixture: "protected", key },
      updatedBy: "site-content-delete-test",
    })),
  ]);
});

afterAll(async () => {
  const ids = roles.map(({ id }) => id);
  await db.delete(siteContentTable).where(inArray(siteContentTable.key, [...fixtureKeys, addedKey]));
  await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId, ids));
  await db.delete(adminUserPermissionsTable).where(inArray(adminUserPermissionsTable.adminUserId, ids));
  await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, ids));
});

describe.sequential("admin site content deletion", () => {
  it("requires the site-content delete permission specifically", async () => {
    await request(app).delete(`/api/admin/site-content/${deletableKey}`).expect(401);
    for (const role of ["view", "edit", "contracts"]) {
      await request(app).delete(`/api/admin/site-content/${deletableKey}`)
        .set(auth(role)).expect(403);
    }
    const row = await db.select().from(siteContentTable).where(eq(siteContentTable.key, deletableKey));
    expect(row).toHaveLength(1);
  });

  it("deletes one eligible key and the deletion survives a GET reload", async () => {
    await request(app).delete(`/api/admin/site-content/${deletableKey}`)
      .set(auth("delete")).expect(204);

    const response = await request(app).get("/api/admin/site-content").set(auth("view")).expect(200);
    expect(response.body.some((row: { key: string }) => row.key === deletableKey)).toBe(false);
    expect(response.body.find((row: { key: string }) => row.key === retainedKey)?.canDelete).toBe(true);
    await request(app).delete(`/api/admin/site-content/${deletableKey}`)
      .set(auth("delete")).expect(404);
  });

  it("rejects protected keys and lookalikes without changing their saved content", async () => {
    for (const key of protectedKeys) {
      const response = await request(app).delete(`/api/admin/site-content/${encodeURIComponent(key)}`)
        .set(auth("delete")).expect(400);
      expect(response.body.error).toContain("protected");
      expect(response.body.error).toContain("محمي");
    }

    const rows = await db.select().from(siteContentTable)
      .where(inArray(siteContentTable.key, protectedKeys));
    expect(rows).toHaveLength(protectedKeys.length);
    expect(rows.every((row) => (row.data as { fixture?: string }).fixture === "protected")).toBe(true);

    const sellerDelete = await request(app).delete("/api/admin/site-content/seller_legal_profile")
      .set(auth("delete")).expect(400);
    expect(sellerDelete.body.error).toContain("محمي");

    const response = await request(app).get("/api/admin/site-content").set(auth("view")).expect(200);
    for (const key of protectedKeys) {
      expect(response.body.find((row: { key: string }) => row.key === key)?.canDelete).toBe(false);
    }
    const sellerBefore = originalSiteContent.find((row) => row.key === "seller_legal_profile");
    const sellerAfter = (await db.select().from(siteContentTable)
      .where(eq(siteContentTable.key, "seller_legal_profile")))[0];
    expect(sellerAfter).toEqual(sellerBefore);
  });

  it("computes canDelete on upsert responses and omission preserves saved keys", async () => {
    const upsert = await request(app).put("/api/admin/site-content")
      .set(auth("edit"))
      .send({ items: [{ key: addedKey, data: { fixture: "added" } }] })
      .expect(200);

    expect(upsert.body.find((row: { key: string }) => row.key === addedKey)?.canDelete).toBe(true);
    expect(upsert.body.find((row: { key: string }) => row.key === retainedKey)?.canDelete).toBe(true);
    expect(upsert.body.find((row: { key: string }) => row.key === protectedKeys[0])?.canDelete).toBe(false);

    const reloaded = await request(app).get("/api/admin/site-content").set(auth("view")).expect(200);
    expect(reloaded.body.some((row: { key: string }) => row.key === retainedKey)).toBe(true);
    expect(reloaded.body.some((row: { key: string }) => row.key === addedKey)).toBe(true);

    if (originalSiteContent.length) {
      const untouchedOriginalRows = await db.select().from(siteContentTable)
        .where(inArray(siteContentTable.key, originalSiteContent.map((row) => row.key)));
      expect(untouchedOriginalRows.sort((a, b) => a.key.localeCompare(b.key)))
        .toEqual([...originalSiteContent].sort((a, b) => a.key.localeCompare(b.key)));
    }
  });
});