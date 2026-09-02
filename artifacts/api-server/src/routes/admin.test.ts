import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  categoriesTable,
  customersTable,
  db,
  ordersTable,
  productsTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

const seedEmail = `route-super-${Date.now()}@example.com`;
const createdIds: number[] = [];
const temporarilyDisabledSuperIds: number[] = [];
let superId: number;
let superToken: string;
let viewerToken: string;
let categoryId: number;
let productId: number;
let customerId: number;
let orderId: number;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = seedEmail;
  process.env.ADMIN_PASSWORD = "route-test-password";

  // The first request initializes the environment-backed super administrator.
  await request(app).get("/api/admin/dashboard").expect(401);
  const [superAdmin] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, seedEmail));
  superId = superAdmin.id;
  createdIds.push(superId);
  superToken = await createAdminSession(superId);
  const suffix = Date.now();
  const testIdBase = 1_500_000_000 + (suffix % 100_000_000);
  const [category] = await db.insert(categoriesTable).values({
    id: testIdBase,
    nameAr: "تصنيف اختبار الإدارة",
    nameEn: "Admin test category",
    slug: `admin-test-category-${suffix}`,
  }).returning();
  categoryId = category.id;
  const [product] = await db.insert(productsTable).values({
    id: testIdBase + 1,
    nameAr: "منتج اختبار الإدارة",
    nameEn: "Admin test product",
    slug: `admin-test-product-${suffix}`,
    price: 100,
    categoryId,
    stockQuantity: 5,
  }).returning();
  productId = product.id;
  const [customer] = await db.insert(customersTable).values({
    id: testIdBase + 2,
    phone: `9665${String(suffix).slice(-8)}`,
    name: "Admin Route Test Customer",
  }).returning();
  customerId = customer.id;
  const [order] = await db.insert(ordersTable).values({
    id: testIdBase + 3,
    userId: customerId,
    orderNumber: `ADMIN-TEST-${suffix}`,
    subtotal: 100,
    shippingCost: 0,
    discount: 0,
    tax: 0,
    total: 100,
    address: "{}",
    shippingMethod: "standard",
    paymentMethod: "cod",
  }).returning();
  orderId = order.id;
  const activeSuperAdmins = await db.select({ id: adminUsersTable.id }).from(adminUsersTable)
    .where(and(eq(adminUsersTable.isSuperAdmin, true), eq(adminUsersTable.isActive, true)));
  temporarilyDisabledSuperIds.push(...activeSuperAdmins.filter((user) => user.id !== superId).map((user) => user.id));
  if (temporarilyDisabledSuperIds.length) {
    await db.update(adminUsersTable).set({ isActive: false })
      .where(inArray(adminUsersTable.id, temporarilyDisabledSuperIds));
  }
});

afterAll(async () => {
  if (orderId) await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
  if (productId) await db.delete(productsTable).where(eq(productsTable.id, productId));
  if (categoryId) await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  if (customerId) await db.delete(customersTable).where(eq(customersTable.id, customerId));
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
    viewerToken = await createAdminSession(viewer.id);

    await request(app).get("/api/admin/products").set("Authorization", `Bearer ${viewerToken}`).expect(200);
    const denied = await request(app)
      .patch(`/api/admin/products/${productId}`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ nameEn: "Forbidden edit" })
      .expect(403);
    expect(denied.body.error).toMatch(/permission/i);
  });

  it("updates a product with a single field", async () => {
    const response = await request(app)
      .patch(`/api/admin/products/${productId}`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ nameEn: "Partially updated product" })
      .expect(200);
    expect(response.body.nameEn).toBe("Partially updated product");
    expect(response.body.nameAr).toBe("منتج اختبار الإدارة");
    expect(response.body.categoryId).toBe(categoryId);
  });

  it("rejects a product update with a missing category", async () => {
    const response = await request(app)
      .patch(`/api/admin/products/${productId}`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ categoryId: 2_000_000_000 })
      .expect(400);
    expect(response.body.error).toMatch(/category not found/i);
  });

  it("updates an order with valid statuses", async () => {
    const response = await request(app)
      .patch(`/api/admin/orders/${orderId}`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ status: "shipped", paymentStatus: "paid" })
      .expect(200);
    expect(response.body.status).toBe("shipped");
    expect(response.body.paymentStatus).toBe("paid");
    expect(response.body.trackingNumber).toBeNull();
  });

  it("rejects an invalid order status", async () => {
    await request(app)
      .patch(`/api/admin/orders/${orderId}`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ status: "invalid_status" })
      .expect(400);
  });

  it("returns 403 when staff lacks orders edit permission", async () => {
    const response = await request(app)
      .patch(`/api/admin/orders/${orderId}`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ status: "processing" })
      .expect(403);
    expect(response.body.error).toMatch(/permission/i);
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