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
  customersTable,
  db,
  ordersTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

const suffix = Date.now();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const userIds: number[] = [];
const couponIds: number[] = [];
const campaignIds: number[] = [];
const orderIds: number[] = [];
let customerId: number;
let editorToken: string;
let viewerToken: string;
let outsiderToken: string;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `campaign-root-${suffix}@example.com`;
  process.env.ADMIN_PASSWORD = "campaign-test-password";

  await db.insert(adminPermissionsTable).values([
    { module: "campaigns", action: "view" },
    { module: "campaigns", action: "edit" },
    { module: "coupons", action: "delete" },
  ]).onConflictDoNothing();

  const passwordHash = await hashAdminPassword("campaign-test-password");
  const users = await db.insert(adminUsersTable).values([
    { email: `campaign-editor-${suffix}@example.com`, name: "Campaign Editor", passwordHash },
    { email: `campaign-viewer-${suffix}@example.com`, name: "Campaign Viewer", passwordHash },
    { email: `campaign-outsider-${suffix}@example.com`, name: "Campaign Outsider", passwordHash },
  ]).returning();
  userIds.push(...users.map((user) => user.id));

  const permissions = await db.select().from(adminPermissionsTable)
    .where(inArray(adminPermissionsTable.module, ["campaigns", "coupons"]));
  const permissionId = (module: string, action: string) => {
    const permission = permissions.find((row) => row.module === module && row.action === action);
    if (!permission) throw new Error(`Permission not seeded: ${module}.${action}`);
    return permission.id;
  };
  await db.insert(adminUserPermissionsTable).values([
    { adminUserId: users[0].id, permissionId: permissionId("campaigns", "view") },
    { adminUserId: users[0].id, permissionId: permissionId("campaigns", "edit") },
    { adminUserId: users[0].id, permissionId: permissionId("coupons", "delete") },
    { adminUserId: users[1].id, permissionId: permissionId("campaigns", "view") },
  ]);
  [editorToken, viewerToken, outsiderToken] = await Promise.all(
    users.map((user) => createAdminSession(user.id)),
  );

  const coupons = await db.insert(couponsTable).values([
    { code: `CAMPAIGN-A-${suffix}`, discountType: "percentage", discountValue: 10 },
    { code: `CAMPAIGN-B-${suffix}`, discountType: "fixed", discountValue: 25 },
    { code: `CAMPAIGN-UNUSED-${suffix}`, discountType: "percentage", discountValue: 15 },
    { code: `CAMPAIGN-INACTIVE-${suffix}`, discountType: "percentage", discountValue: 5, isActive: false },
  ]).returning();
  couponIds.push(...coupons.map((coupon) => coupon.id));

  const [customer] = await db.insert(customersTable).values({
    phone: `+9665${String(suffix).slice(-8)}`,
    name: "Campaign Report Customer",
    phoneVerified: true,
  }).returning();
  customerId = customer.id;
});

afterAll(async () => {
  if (orderIds.length) await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  if (campaignIds.length) {
    await db.delete(campaignCouponsTable).where(inArray(campaignCouponsTable.campaignId, campaignIds));
    await db.delete(campaignsTable).where(inArray(campaignsTable.id, campaignIds));
  }
  if (couponIds.length) await db.delete(couponsTable).where(inArray(couponsTable.id, couponIds));
  if (customerId) await db.delete(customersTable).where(eq(customersTable.id, customerId));
  if (userIds.length) {
    await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId, userIds));
    await db.delete(adminUserPermissionsTable).where(inArray(adminUserPermissionsTable.adminUserId, userIds));
    await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, userIds));
  }
});

describe("admin campaigns and coupon safety", () => {
  it("creates and updates campaigns with available coupons", async () => {
    const created = await request(app).post("/api/admin/campaigns").set(auth(editorToken)).send({
      name: `Launch Campaign ${suffix}`,
      channel: "instagram",
      status: "draft",
      startsAt: "2027-01-01T00:00:00.000Z",
      endsAt: "2027-01-31T23:59:59.000Z",
      couponIds: [couponIds[0]],
    }).expect(201);
    campaignIds.push(created.body.id);

    const updated = await request(app).patch(`/api/admin/campaigns/${created.body.id}`)
      .set(auth(editorToken))
      .send({ status: "active", couponIds: [couponIds[0], couponIds[1]] })
      .expect(200);
    expect(updated.body.status).toBe("active");
    expect(updated.body.coupons.map((coupon: { id: number }) => coupon.id).sort())
      .toEqual([couponIds[0], couponIds[1]].sort());
  });

  it("rejects invalid campaign dates, unavailable coupons, and empty updates", async () => {
    await request(app).post("/api/admin/campaigns").set(auth(editorToken)).send({
      name: "Invalid Campaign",
      channel: "email",
      status: "draft",
      startsAt: "2027-02-10T00:00:00.000Z",
      endsAt: "2027-02-01T00:00:00.000Z",
      couponIds: [],
    }).expect(400);

    await request(app).post("/api/admin/campaigns").set(auth(editorToken)).send({
      name: "Inactive Coupon Campaign",
      channel: "email",
      status: "draft",
      startsAt: "2027-02-01T00:00:00.000Z",
      endsAt: "2027-02-10T00:00:00.000Z",
      couponIds: [couponIds[3]],
    }).expect(400);

    await request(app).patch(`/api/admin/campaigns/${campaignIds[0]}`)
      .set(auth(editorToken)).send({}).expect(400);
  });

  it("reports paid, non-cancelled campaign orders within the requested period", async () => {
    const common = {
      userId: customerId,
      subtotal: 100,
      shippingCost: 0,
      discount: 0,
      tax: 0,
      address: "{}",
      shippingMethod: "standard",
      paymentMethod: "card",
      couponCode: `CAMPAIGN-B-${suffix}`,
    };
    const orders = await db.insert(ordersTable).values([
      { ...common, orderNumber: `CAMPAIGN-PAID-${suffix}`, total: 120, paymentStatus: "paid", status: "new", createdAt: new Date("2027-01-15T12:00:00.000Z") },
      { ...common, orderNumber: `CAMPAIGN-CANCELLED-${suffix}`, total: 80, paymentStatus: "paid", status: "cancelled", createdAt: new Date("2027-01-16T12:00:00.000Z") },
      { ...common, orderNumber: `CAMPAIGN-PENDING-${suffix}`, total: 40, paymentStatus: "pending", status: "new", createdAt: new Date("2027-01-17T12:00:00.000Z") },
    ]).returning();
    orderIds.push(...orders.map((order) => order.id));

    const result = await request(app).get("/api/admin/campaigns/results")
      .query({ from: "2027-01-10T00:00:00.000Z", to: "2027-01-20T23:59:59.000Z", channel: "instagram" })
      .set(auth(viewerToken)).expect(200);
    const launch = result.body.campaigns.find((campaign: { id: number }) => campaign.id === campaignIds[0]);
    expect(launch).toMatchObject({ orders: 1, couponUses: 1, revenue: 120 });
    expect(result.body.byChannel).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "instagram", orders: 1, revenue: 120 }),
    ]));
  });

  it("returns affected campaigns and requires explicit confirmation before disabling", async () => {
    const campaignName = `Protected Campaign ${suffix}`;
    const created = await request(app).post("/api/admin/campaigns").set(auth(editorToken)).send({
      name: campaignName,
      channel: "email",
      status: "active",
      startsAt: "2027-02-01T00:00:00.000Z",
      endsAt: "2027-02-28T23:59:59.000Z",
      couponIds: [couponIds[0]],
    }).expect(201);
    campaignIds.push(created.body.id);

    const conflict = await request(app).delete(`/api/admin/coupons/${couponIds[0]}`)
      .set(auth(editorToken)).expect(409);
    expect(conflict.body).toEqual({
      error: "Coupon is used by active campaigns. Explicit confirmation is required.",
      affectedCampaigns: expect.arrayContaining([{ id: created.body.id, name: campaignName }]),
    });

    const [stillActive] = await db.select({ isActive: couponsTable.isActive })
      .from(couponsTable).where(eq(couponsTable.id, couponIds[0]));
    expect(stillActive.isActive).toBe(true);

    await request(app).delete(`/api/admin/coupons/${couponIds[0]}`)
      .set(auth(editorToken)).send({ confirm: true }).expect(204);
    const [disabled] = await db.select({ isActive: couponsTable.isActive })
      .from(couponsTable).where(eq(couponsTable.id, couponIds[0]));
    expect(disabled.isActive).toBe(false);
  });

  it("disables a coupon unused by active campaigns without a second confirmation", async () => {
    await request(app).delete(`/api/admin/coupons/${couponIds[2]}`)
      .set(auth(editorToken)).expect(204);
    const [disabled] = await db.select({ isActive: couponsTable.isActive })
      .from(couponsTable).where(eq(couponsTable.id, couponIds[2]));
    expect(disabled.isActive).toBe(false);
  });

  it("enforces campaign permissions", async () => {
    await request(app).get("/api/admin/campaigns").set(auth(viewerToken)).expect(200);
    await request(app).patch(`/api/admin/campaigns/${campaignIds[0]}`)
      .set(auth(viewerToken)).send({ name: "Forbidden" }).expect(403);
    await request(app).get("/api/admin/campaigns").set(auth(outsiderToken)).expect(403);
    await request(app).get("/api/admin/campaigns/results").set(auth(outsiderToken)).expect(403);
  });
});