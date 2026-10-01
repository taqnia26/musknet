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
  siteContentHistoryTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

const suffix = `${Date.now()}-${process.pid}`;
const baseId = 1_900_000_000 + (Date.now() % 100_000_000);
const roles = [
  { id: baseId, name: "view" },
  { id: baseId + 1, name: "edit" },
  { id: baseId + 2, name: "contracts" },
  { id: baseId + 3, name: "delete" },
  { id: baseId + 4, name: "restore" },
] as const;
const rolePermissions: Record<string, readonly (readonly [string, string])[]> = {
  view: [["site-content", "view"]],
  edit: [["site-content", "edit"]],
  contracts: [["contracts", "edit"]],
  delete: [["site-content", "delete"]],
  restore: [["site-content", "edit"], ["site-content", "delete"]],
};
const tokens = new Map<string, string>();
const auth = (name: string) => ({ Authorization: `Bearer ${tokens.get(name)}` });

const deletableKey = `custom.site-content-delete-${suffix}`;
const retainedKey = `custom.site-content-retained-${suffix}`;
const addedKey = `custom.site-content-added-${suffix}`;
const conflictKey = `custom.site-content-conflict-${suffix}`;
const secretKey = `custom.secret-site-content-${suffix}`;
const financialKey = `custom.financial-site-content-${suffix}`;
const corruptedArchiveKey = `seller_legal_profile_test_${suffix}_corrupt`;
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
const fixtureKeys = [deletableKey, retainedKey, conflictKey, secretKey, financialKey, corruptedArchiveKey, ...protectedKeys];
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
  await db.insert(adminUserPermissionsTable).values(roles.flatMap(({ id, name }) =>
    rolePermissions[name].map(([module, action]) => {
      const found = permissions.find((row) => row.module === module && row.action === action);
      if (!found) throw new Error(`Missing ${module}:${action} test permission`);
      return { adminUserId: id, permissionId: found.id };
    }),
  ));
  for (const { id, name } of roles) tokens.set(name, await createAdminSession(id));

  await db.insert(siteContentTable).values([
    { key: deletableKey, data: { fixture: "deletable" }, updatedBy: "site-content-delete-test" },
    { key: retainedKey, data: { fixture: "retained" }, updatedBy: "site-content-delete-test" },
    { key: conflictKey, data: { fixture: "archived-before-edit" }, updatedBy: "site-content-delete-test" },
    { key: secretKey, data: { fixture: "secret", apiKey: "do-not-archive" }, updatedBy: "site-content-delete-test" },
    { key: financialKey, data: { fixture: "financial", accountBalance: 125 }, updatedBy: "site-content-delete-test" },
    ...protectedKeys.map((key) => ({
      key,
      data: { fixture: "protected", key },
      updatedBy: "site-content-delete-test",
    })),
  ]);
});

afterAll(async () => {
  const ids = roles.map(({ id }) => id);
  await db.delete(siteContentHistoryTable).where(inArray(siteContentHistoryTable.key, [...fixtureKeys, addedKey]));
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

    const [archive] = await db.select().from(siteContentHistoryTable)
      .where(eq(siteContentHistoryTable.key, deletableKey));
    expect(archive).toMatchObject({
      key: deletableKey,
      data: { fixture: "deletable" },
      deletedBy: String(roles.find(({ name }) => name === "delete")!.id),
      restoredBy: null,
      restoredAt: null,
    });
    const history = await request(app).get("/api/admin/site-content-history").set(auth("view")).expect(200);
    const historyItem = history.body.find((item: { id: number }) => item.id === archive.id);
    expect(historyItem).toEqual({
      id: archive.id,
      key: deletableKey,
      deletedBy: archive.deletedBy,
      deletedAt: archive.deletedAt.toISOString(),
      restoredBy: null,
      restoredAt: null,
      canRestore: true,
    });
    expect(historyItem).not.toHaveProperty("data");
  });

  it("rejects protected keys and lookalikes without changing their saved content", async () => {
    for (const key of protectedKeys) {
      const response = await request(app).delete(`/api/admin/site-content/${encodeURIComponent(key)}`)
        .set(auth("delete")).expect(400);
      expect(response.body.error).toContain("protected");
      expect(response.body.error).toContain("محمي");
    }
    for (const key of [secretKey, financialKey]) {
      const response = await request(app).delete(`/api/admin/site-content/${encodeURIComponent(key)}`)
        .set(auth("delete")).expect(400);
      expect(response.body.error).toContain("protected");
      expect(response.body.error).toContain("محمي");
    }

    const rows = await db.select().from(siteContentTable)
      .where(inArray(siteContentTable.key, [...protectedKeys, secretKey, financialKey]));
    expect(rows).toHaveLength(protectedKeys.length + 2);
    expect(rows.filter((row) => protectedKeys.includes(row.key))
      .every((row) => (row.data as { fixture?: string }).fixture === "protected")).toBe(true);
    expect(rows.find((row) => row.key === secretKey)?.data).toEqual({ fixture: "secret", apiKey: "do-not-archive" });
    expect(rows.find((row) => row.key === financialKey)?.data).toEqual({ fixture: "financial", accountBalance: 125 });
    const archives = await db.select().from(siteContentHistoryTable)
      .where(inArray(siteContentHistoryTable.key, [secretKey, financialKey]));
    expect(archives).toHaveLength(0);

    const sellerDelete = await request(app).delete("/api/admin/site-content/seller_legal_profile")
      .set(auth("delete")).expect(400);
    expect(sellerDelete.body.error).toContain("محمي");

    const response = await request(app).get("/api/admin/site-content").set(auth("view")).expect(200);
    for (const key of protectedKeys) {
      expect(response.body.find((row: { key: string }) => row.key === key)?.canDelete).toBe(false);
    }
    expect(response.body.find((row: { key: string }) => row.key === secretKey)?.canDelete).toBe(false);
    expect(response.body.find((row: { key: string }) => row.key === financialKey)?.canDelete).toBe(false);
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

  it("requires view permission for history and both edit and delete to restore", async () => {
    await request(app).get("/api/admin/site-content-history").expect(401);
    await request(app).get("/api/admin/site-content-history").set(auth("edit")).expect(403);
    await request(app).get("/api/admin/site-content-history").set(auth("delete")).expect(403);
    await request(app).get("/api/admin/site-content-history").set(auth("contracts")).expect(403);

    const [archive] = await db.select().from(siteContentHistoryTable)
      .where(eq(siteContentHistoryTable.key, deletableKey));
    for (const role of ["edit", "delete"]) {
      await request(app).post(`/api/admin/site-content-history/${archive.id}/restore`)
        .set(auth(role)).expect(403);
    }
    const persisted = await db.select().from(siteContentHistoryTable)
      .where(eq(siteContentHistoryTable.id, archive.id));
    expect(persisted[0]?.restoredAt).toBeNull();
  });

  it("marks and rejects a corrupted archive whose key is protected", async () => {
    const [archive] = await db.insert(siteContentHistoryTable).values({
      key: corruptedArchiveKey,
      data: { fixture: "must-not-restore" },
      deletedBy: "corrupted-archive-test",
    }).returning();
    const history = await request(app).get("/api/admin/site-content-history").set(auth("view")).expect(200);
    const metadata = history.body.find((item: { id: number }) => item.id === archive.id);
    expect(metadata).toMatchObject({ key: corruptedArchiveKey, canRestore: false });
    expect(metadata).not.toHaveProperty("data");

    const response = await request(app).post(`/api/admin/site-content-history/${archive.id}/restore`)
      .set(auth("restore")).expect(400);
    expect(response.body.error).toContain("protected");
    expect(await db.select().from(siteContentTable).where(eq(siteContentTable.key, corruptedArchiveKey)))
      .toHaveLength(0);
  });

  it("restores once under concurrent requests, rejects repeats, and reloads the saved value", async () => {
    const [archive] = await db.select().from(siteContentHistoryTable)
      .where(eq(siteContentHistoryTable.key, deletableKey));
    const responses = await Promise.all([
      request(app).post(`/api/admin/site-content-history/${archive.id}/restore`).set(auth("restore")),
      request(app).post(`/api/admin/site-content-history/${archive.id}/restore`).set(auth("restore")),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const restored = responses.find(({ status }) => status === 200)!;
    expect(restored.body).toMatchObject({
      key: deletableKey,
      data: { fixture: "deletable" },
      canDelete: true,
    });
    await request(app).post(`/api/admin/site-content-history/${archive.id}/restore`)
      .set(auth("restore")).expect(409);

    const reloaded = await request(app).get("/api/admin/site-content").set(auth("view")).expect(200);
    expect(reloaded.body.find((row: { key: string }) => row.key === deletableKey)?.data)
      .toEqual({ fixture: "deletable" });
    const [marked] = await db.select().from(siteContentHistoryTable)
      .where(eq(siteContentHistoryTable.id, archive.id));
    expect(marked.restoredBy).toBe(String(roles.find(({ name }) => name === "restore")!.id));
    expect(marked.restoredAt).toBeInstanceOf(Date);
  });

  it("keeps old archive durable across edits and never overwrites a colliding key", async () => {
    await request(app).delete(`/api/admin/site-content/${conflictKey}`).set(auth("delete")).expect(204);
    const [archive] = await db.select().from(siteContentHistoryTable)
      .where(eq(siteContentHistoryTable.key, conflictKey));

    await request(app).put("/api/admin/site-content")
      .set(auth("edit"))
      .send({ items: [{ key: conflictKey, data: { fixture: "newer-edit" } }] })
      .expect(200);
    const reloaded = await request(app).get("/api/admin/site-content").set(auth("view")).expect(200);
    expect(reloaded.body.find((row: { key: string }) => row.key === conflictKey)?.data)
      .toEqual({ fixture: "newer-edit" });
    const history = await request(app).get("/api/admin/site-content-history").set(auth("view")).expect(200);
    const metadata = history.body.find((item: { id: number }) => item.id === archive.id);
    expect(metadata.canRestore).toBe(false);
    expect(metadata).not.toHaveProperty("data");

    const [durable] = await db.select().from(siteContentHistoryTable)
      .where(eq(siteContentHistoryTable.id, archive.id));
    expect(durable.data).toEqual({ fixture: "archived-before-edit" });
    await request(app).post(`/api/admin/site-content-history/${archive.id}/restore`)
      .set(auth("restore")).expect(409);
    const [notOverwritten] = await db.select().from(siteContentTable)
      .where(eq(siteContentTable.key, conflictKey));
    expect(notOverwritten.data).toEqual({ fixture: "newer-edit" });

    await db.delete(siteContentTable).where(eq(siteContentTable.key, conflictKey));
    const available = await request(app).get("/api/admin/site-content-history").set(auth("view")).expect(200);
    expect(available.body.find((item: { id: number }) => item.id === archive.id)?.canRestore).toBe(true);
    const response = await request(app).post(`/api/admin/site-content-history/${archive.id}/restore`)
      .set(auth("restore")).expect(200);
    expect(response.body.data).toEqual({ fixture: "archived-before-edit" });
  });
});