import ExcelJS from "exceljs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
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
const orderIds: number[] = [];
let campaignId: number;
let couponId: number;
let customerId: number;
let viewerToken: string;
let outsiderToken: string;

beforeAll(async () => {
  await db.insert(adminPermissionsTable).values({ module: "campaigns", action: "view" }).onConflictDoNothing();
  const [viewPermission] = await db.select().from(adminPermissionsTable)
    .where(and(eq(adminPermissionsTable.module, "campaigns"), eq(adminPermissionsTable.action, "view")));
  if (!viewPermission) throw new Error("Campaign view permission is missing");

  const passwordHash = await hashAdminPassword("campaign-export-test-password");
  const users = await db.insert(adminUsersTable).values([
    { email: `campaign-export-viewer-${suffix}@example.com`, name: "Export Viewer", passwordHash },
    { email: `campaign-export-outsider-${suffix}@example.com`, name: "Export Outsider", passwordHash },
  ]).returning();
  userIds.push(...users.map((user) => user.id));
  await db.insert(adminUserPermissionsTable).values({
    adminUserId: users[0].id,
    permissionId: viewPermission.id,
  });
  [viewerToken, outsiderToken] = await Promise.all(users.map((user) => createAdminSession(user.id)));

  const [coupon] = await db.insert(couponsTable).values({
    code: `EXPORT-${suffix}`,
    discountType: "percentage",
    discountValue: 10,
  }).returning();
  couponId = coupon.id;
  const [campaign] = await db.insert(campaignsTable).values({
    name: `Export Campaign ${suffix}`,
    channel: "email",
    status: "active",
    startsAt: new Date("2027-04-01T00:00:00.000Z"),
    endsAt: new Date("2027-04-30T23:59:59.999Z"),
  }).returning();
  campaignId = campaign.id;
  await db.insert(campaignCouponsTable).values({ campaignId, couponId });

  const [customer] = await db.insert(customersTable).values({
    phone: `+9665${String(suffix).slice(-8)}`,
    name: "Campaign Export Customer",
    phoneVerified: true,
  }).returning();
  customerId = customer.id;
  const orders = await db.insert(ordersTable).values([
    {
      orderNumber: `EXPORT-IN-${suffix}`,
      userId: customerId,
      subtotal: 150,
      shippingCost: 0,
      discount: 0,
      tax: 0,
      total: 150,
      address: "{}",
      shippingMethod: "standard",
      paymentMethod: "card",
      paymentStatus: "paid",
      status: "pending_review",
      couponCode: coupon.code,
      createdAt: new Date("2027-04-15T12:00:00.000Z"),
    },
    {
      orderNumber: `EXPORT-OUT-${suffix}`,
      userId: customerId,
      subtotal: 90,
      shippingCost: 0,
      discount: 0,
      tax: 0,
      total: 90,
      address: "{}",
      shippingMethod: "standard",
      paymentMethod: "card",
      paymentStatus: "paid",
      status: "pending_review",
      couponCode: coupon.code,
      createdAt: new Date("2027-05-05T12:00:00.000Z"),
    },
  ]).returning();
  orderIds.push(...orders.map((order) => order.id));
});

afterAll(async () => {
  if (orderIds.length) await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  if (campaignId) await db.delete(campaignsTable).where(eq(campaignsTable.id, campaignId));
  if (couponId) await db.delete(couponsTable).where(eq(couponsTable.id, couponId));
  if (customerId) await db.delete(customersTable).where(eq(customersTable.id, customerId));
  if (userIds.length) {
    await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId, userIds));
    await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, userIds));
  }
});

describe("campaign result exports", () => {
  const filters = {
    from: "2027-04-10T00:00:00.000Z",
    to: "2027-04-20T23:59:59.999Z",
    channel: "email",
  };

  it("exports filtered channel, campaign, and coupon rows as CSV", async () => {
    const response = await request(app)
      .get("/api/admin/campaigns/results/export")
      .query({ ...filters, format: "csv" })
      .set(auth(viewerToken))
      .expect(200);

    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain(".csv");
    expect(response.text).toContain("channel,email");
    expect(response.text).toContain(`campaign,email,${campaignId}`);
    expect(response.text).toContain(`coupon,email,${campaignId}`);
    expect(response.text).toContain(",1,1,150");
    expect(response.text).not.toContain("240");
  });

  it("exports three filtered worksheets as Excel", async () => {
    const response = await request(app)
      .get("/api/admin/campaigns/results/export")
      .query({ ...filters, format: "xlsx" })
      .set(auth(viewerToken))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Channels", "Campaigns", "Coupons"]);
    expect(workbook.getWorksheet("Channels")?.getRow(2).getCell(1).value).toBe("email");
    expect(workbook.getWorksheet("Campaigns")?.getRow(2).getCell(9).value).toBe(150);
    expect(workbook.getWorksheet("Coupons")?.getRow(2).getCell(8).value).toBe(150);
  });

  it("requires campaign view permission", async () => {
    await request(app)
      .get("/api/admin/campaigns/results/export")
      .query({ format: "csv" })
      .set(auth(outsiderToken))
      .expect(403);
  });
});