import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  campaignCouponsTable,
  campaignsTable,
  couponsTable,
  db,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

const suffix = Date.now();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const userIds: number[] = [];
const couponIds: number[] = [];
let campaignId: number;
let editorToken: string;
let viewerToken: string;
let outsiderToken: string;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `campaign-root-${suffix}@example.com`;
  process.env.ADMIN_PASSWORD = "campaign-test-password";

  await db.insert(adminPermissionsTable).values([
    { module: "campaigns", action: "view" },
    { module: "campaigns", action: "edit" },
  ]).onConflictDoNothing();

  const passwordHash = await hashAdminPassword("campaign-test-password");
  const users = await db.insert(adminUsersTable).values([
    { email: `campaign-editor-${suffix}@example.com`, name: "Campaign Editor", passwordHash },
    { email: `campaign-viewer-${suffix}@example.com`, name: "Campaign Viewer", passwordHash },
    { email: `campaign-outsider-${suffix}@example.com`, name: "Campaign Outsider", passwordHash },
  ]).returning();
  userIds.push(...users.map((user) => user.id));

  const permissions = await db.select().from(adminPermissionsTable)
    .where(eq(adminPermissionsTable.module, "campaigns"));
  const viewPermission = permissions.find((permission) => permission.action === "view");
  const editPermission = permissions.find((permission) => permission.action === "edit");
  if (!viewPermission || !editPermission) throw new Error("Campaign permissions were not seeded");

  await db.insert(adminUserPermissionsTable).values([
    { adminUserId: users[0].id, permissionId: viewPermission.id },
    { adminUserId: users[0].id, permissionId: editPermission.id },
    { adminUserId: users[1].id, permissionId: viewPermission.id },
  ]);

  [editorToken, viewerToken, outsiderToken] = await Promise.all(users.map((user) => createAdminSession(user.id)));

  const coupons = await db.insert(couponsTable).values([
    { code: `CAMPAIGN-A-${suffix}`, discountType: "percentage", discountValue: 10 },
    { code: `CAMPAIGN-B-${suffix}`, discountType: "fixed", discountValue: 25 },
    { code: `CAMPAIGN-C-${suffix}`, discountType: "percentage", discountValue: 15 },
  ]).returning();
  couponIds.push(...coupons.map((coupon) => coupon.id));
});

afterAll(async () => {
  if (campaignId) {
    await db.delete(campaignCouponsTable).where(eq(campaignCouponsTable.campaignId, campaignId));
    await db.delete(campaignsTable).where(eq(campaignsTable.id, campaignId));
  }
  if (couponIds.length) await db.delete(couponsTable).where(inArray(couponsTable.id, couponIds));
  if (userIds.length) {
    await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId, userIds));
    await db.delete(adminUserPermissionsTable).where(inArray(adminUserPermissionsTable.adminUserId, userIds));
    await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, userIds));
  }
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
});

describe.sequential("admin campaign lifecycle and authorization", () => {
  it("creates, updates, pauses, and links multiple coupons to a campaign", async () => {
    const created = await request(app).post("/api/admin/campaigns").set(auth(editorToken)).send({
      name: "Launch Campaign",
      channel: "instagram",
      status: "draft",
      startsAt: "2027-01-01T00:00:00.000Z",
      endsAt: "2027-01-31T23:59:59.000Z",
      couponIds: [couponIds[0], couponIds[1]],
    }).expect(201);
    campaignId = created.body.id;
    expect(created.body).toMatchObject({
      name: "Launch Campaign",
      channel: "instagram",
      status: "draft",
    });
    expect(created.body.coupons.map((coupon: { id: number }) => coupon.id).sort()).toEqual(
      [couponIds[0], couponIds[1]].sort(),
    );

    const updated = await request(app).patch(`/api/admin/campaigns/${campaignId}`)
      .set(auth(editorToken))
      .send({ name: "Updated Launch Campaign", status: "active", couponIds: [couponIds[1], couponIds[2]] })
      .expect(200);
    expect(updated.body).toMatchObject({ name: "Updated Launch Campaign", status: "active" });
    expect(updated.body.coupons.map((coupon: { id: number }) => coupon.id).sort()).toEqual(
      [couponIds[1], couponIds[2]].sort(),
    );

    const paused = await request(app).post(`/api/admin/campaigns/${campaignId}/pause`)
      .set(auth(editorToken))
      .expect(200);
    expect(paused.body.status).toBe("paused");
  });

  it("rejects create and update requests whose end is not after the start", async () => {
    await request(app).post("/api/admin/campaigns").set(auth(editorToken)).send({
      name: "Invalid Campaign",
      channel: "email",
      status: "draft",
      startsAt: "2027-02-10T00:00:00.000Z",
      endsAt: "2027-02-01T00:00:00.000Z",
      couponIds: [],
    }).expect(400);

    await request(app).patch(`/api/admin/campaigns/${campaignId}`).set(auth(editorToken)).send({
      startsAt: "2027-03-10T00:00:00.000Z",
      endsAt: "2027-03-01T00:00:00.000Z",
    }).expect(400);

    const [stored] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
    expect(stored.startsAt.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(stored.endsAt.toISOString()).toBe("2027-01-31T23:59:59.000Z");
  });

  it("allows viewing without editing and hides campaign data without view permission", async () => {
    const listed = await request(app).get("/api/admin/campaigns").set(auth(viewerToken)).expect(200);
    expect(listed.body.some((campaign: { id: number }) => campaign.id === campaignId)).toBe(true);

    await request(app).patch(`/api/admin/campaigns/${campaignId}`)
      .set(auth(viewerToken))
      .send({ name: "Forbidden" })
      .expect(403);
    await request(app).post(`/api/admin/campaigns/${campaignId}/pause`)
      .set(auth(viewerToken))
      .expect(403);

    await request(app).get("/api/admin/campaigns").set(auth(outsiderToken)).expect(403);
    await request(app).get("/api/admin/campaigns/coupon-options").set(auth(outsiderToken)).expect(403);
  });
});