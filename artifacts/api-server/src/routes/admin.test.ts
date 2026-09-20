import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  categoriesTable,
  customersTable,
  db,
  inventoryMovementsTable,
  invoicesTable,
  orderAddressesTable,
  orderItemsTable,
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
let createdAdminOrderId: number;
let inventoryCreatedProductId: number;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = seedEmail;
  process.env.ADMIN_PASSWORD = "route-test-password";
  process.env.VAT_REGISTRATION_NUMBER = "300000000000003";
  process.env.VAT_SELLER_LEGAL_NAME = "مؤسسة مسك اللولو للتجارة";

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
    couponCode: "ADMIN10",
    couponDiscountType: "percentage",
    couponDiscountValue: 10,
    tax: 0,
    total: 100,
    address: "{}",
    shippingMethod: "standard",
    paymentMethod: "cod",
  }).returning();
  orderId = order.id;
  await db.insert(orderAddressesTable).values({
    id: testIdBase + 4,
    orderId,
    label: "Home",
    city: "Riyadh",
    district: "Olaya",
    street: "King Fahd Road",
    buildingNo: "10",
    additionalInfo: "Floor 2",
    isDefault: true,
  });
  await db.insert(orderItemsTable).values({
    id: testIdBase + 5,
    orderId,
    productId,
    productName: "منتج اختبار الإدارة",
    quantity: 1,
    unitPrice: 100,
    totalPrice: 100,
    imageUrl: "https://example.com/product.jpg",
  });
  const activeSuperAdmins = await db.select({ id: adminUsersTable.id }).from(adminUsersTable)
    .where(and(eq(adminUsersTable.isSuperAdmin, true), eq(adminUsersTable.isActive, true)));
  temporarilyDisabledSuperIds.push(...activeSuperAdmins.filter((user) => user.id !== superId).map((user) => user.id));
  if (temporarilyDisabledSuperIds.length) {
    await db.update(adminUsersTable).set({ isActive: false })
      .where(inArray(adminUsersTable.id, temporarilyDisabledSuperIds));
  }
});

afterAll(async () => {
  if (createdAdminOrderId) await db.delete(ordersTable).where(eq(ordersTable.id, createdAdminOrderId));
  if (inventoryCreatedProductId) await db.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.productId, inventoryCreatedProductId));
  if (inventoryCreatedProductId) await db.delete(productsTable).where(eq(productsTable.id, inventoryCreatedProductId));
  if (orderId) await db.delete(invoicesTable).where(eq(invoicesTable.orderId, orderId));
  if (orderId) await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
  if (productId) await db.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.productId, productId));
  if (productId) await db.delete(productsTable).where(eq(productsTable.id, productId));
  if (categoryId) await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  if (customerId) await db.delete(customersTable).where(eq(customersTable.id, customerId));
  if (temporarilyDisabledSuperIds.length) {
    await db.update(adminUsersTable).set({ isActive: true })
      .where(inArray(adminUsersTable.id, temporarilyDisabledSuperIds));
  }
  if (createdIds.length) {
    // The super-admin remains as immutable accounting audit attribution for the
    // paid-order journal created by this suite. Other temporary admins are safe
    // to remove because they never post accounting entries.
    await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, createdIds.filter((id) => id !== superId)));
  }
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.VAT_REGISTRATION_NUMBER;
  delete process.env.VAT_SELLER_LEGAL_NAME;
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
    const permissions = await db.select().from(adminPermissionsTable)
      .where(inArray(adminPermissionsTable.module, ["products", "inventory"]));
    const productView = permissions.find((permission) => permission.module === "products" && permission.action === "view");
    const inventoryView = permissions.find((permission) => permission.module === "inventory" && permission.action === "view");
    if (!productView || !inventoryView) throw new Error("Required view permissions were not seeded");
    await db.insert(adminUserPermissionsTable).values([
      { adminUserId: viewer.id, permissionId: productView.id },
      { adminUserId: viewer.id, permissionId: inventoryView.id },
    ]);
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

  it("does not allow the product edit route to change inventory", async () => {
    const response = await request(app)
      .patch(`/api/admin/products/${productId}`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ stockQuantity: 1 })
      .expect(200);
    expect(response.body.stockQuantity).toBe(5);
  });

  it("creates an admin order and records the inventory decrease", async () => {
    const response = await request(app)
      .post("/api/admin/orders")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        userId: customerId,
        items: [{ productId, quantity: 2 }],
        orderAddress: {
          label: "Office",
          city: "Riyadh",
          district: "Olaya",
          street: "King Fahd Road",
          buildingNo: "20",
          additionalInfo: null,
          isDefault: false,
        },
        shippingMethod: "admin-standard",
        paymentMethod: "cash",
      })
      .expect(201);

    createdAdminOrderId = response.body.id;
    expect(response.body).toMatchObject({
      userId: customerId,
      subtotal: 200,
      shippingCost: 20,
      tax: 30,
      total: 250,
      paymentStatus: "pending",
    });

    const [product] = await db.select({ stockQuantity: productsTable.stockQuantity })
      .from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    expect(product.stockQuantity).toBe(3);
    const [movement] = await db.select().from(inventoryMovementsTable)
      .where(and(
        eq(inventoryMovementsTable.productId, productId),
        eq(inventoryMovementsTable.reason, `Admin order ${response.body.orderNumber}`),
      ))
      .limit(1);
    expect(movement).toMatchObject({
      quantityChange: -2,
      quantityBefore: 5,
      quantityAfter: 3,
      performedBy: superId,
    });
    // Keep this test isolated from the inventory-adjustment cases below.
    await db.update(productsTable).set({ stockQuantity: 5 }).where(eq(productsTable.id, productId));
  });

  it("returns a clear error without contacting storage when image storage is not configured", async () => {
    const previousPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
    delete process.env.PRIVATE_OBJECT_DIR;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      const response = await request(app)
        .post("/api/admin/products/images/upload-url")
        .set("Authorization", `Bearer ${superToken}`)
        .send({ name: "product.jpg", contentType: "image/jpeg", size: 1024 })
        .expect(503);

      expect(response.body).toEqual({ error: "Product image storage is not configured" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      if (previousPrivateObjectDir === undefined) {
        delete process.env.PRIVATE_OBJECT_DIR;
      } else {
        process.env.PRIVATE_OBJECT_DIR = previousPrivateObjectDir;
      }
    }
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

  it("returns complete order detail with address, items, customer, and coupon snapshot", async () => {
    const response = await request(app)
      .get(`/api/admin/orders/${orderId}`)
      .set("Authorization", `Bearer ${superToken}`)
      .expect(200);
    expect(response.body.customer).toMatchObject({ name: "Admin Route Test Customer", phone: expect.any(String), email: null });
    expect(response.body.orderAddress).toMatchObject({ city: "Riyadh", buildingNo: "10", additionalInfo: "Floor 2" });
    expect(response.body.items).toEqual([expect.objectContaining({ productId, quantity: 1, totalPrice: 100 })]);
    expect(response.body.coupon).toEqual({ code: "ADMIN10", discountType: "percentage", discountValue: 10 });
  });

  it("lists searchable invoices, renders trusted QR SVG, and enforces invoices:view", async () => {
    const list = await request(app)
      .get("/api/admin/invoices?search=INV-")
      .set("Authorization", `Bearer ${superToken}`)
      .expect(200);
    const invoice = list.body.find((item: { orderId: number }) => item.orderId === orderId);
    expect(invoice).toMatchObject({
      orderNumber: expect.stringMatching(/^ADMIN-TEST-/),
      sellerName: "مؤسسة مسك اللولو للتجارة",
      sellerVatNumber: "300000000000003",
      totalAmount: 100,
      vatAmount: 0,
    });
    expect(Buffer.from(invoice.qrCodeData, "base64")[0]).toBe(1);

    const qr = await request(app)
      .get(`/api/admin/invoices/${invoice.id}/qr`)
      .set("Authorization", `Bearer ${superToken}`)
      .expect("Content-Type", /image\/png/)
      .expect(200);
    expect(Buffer.from(qr.body).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    await request(app).get("/api/admin/invoices")
      .set("Authorization", `Bearer ${viewerToken}`).expect(403);
    await request(app).get(`/api/admin/invoices/${invoice.id}/qr`)
      .set("Authorization", `Bearer ${viewerToken}`).expect(403);
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

  it("creates an auditable inventory adjustment and exposes its movement", async () => {
    const response = await request(app)
      .post(`/api/admin/inventory/${productId}/adjust`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ operation: "increase", quantity: 7, reason: "Cycle count correction", idempotencyKey: "cycle-count-0001" })
      .expect(200);
    expect(response.body.item.stockQuantity).toBe(12);
    expect(response.body.movement).toMatchObject({
      productId,
      movementType: "increase",
      quantityBefore: 5,
      quantityAfter: 12,
      quantityChange: 7,
      reason: "Cycle count correction",
      performedBy: superId,
    });
    const movements = await request(app)
      .get(`/api/admin/inventory/${productId}/movements`)
      .set("Authorization", `Bearer ${superToken}`)
      .expect(200);
    expect(movements.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: response.body.movement.id })]));
  });

  it("creates a product with saved thresholds and an audited opening balance", async () => {
    const response = await request(app)
      .post("/api/admin/inventory")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        nameAr: "منتج مخزون جديد", nameEn: "New inventory product", sku: `INV-${Date.now()}`,
        categoryId, price: 75, openingQuantity: 9, reorderPoint: 4, targetStockQuantity: 18,
      })
      .expect(201);
    inventoryCreatedProductId = response.body.id;
    expect(response.body).toMatchObject({
      stockQuantity: 9, reorderPoint: 4, targetStockQuantity: 18, stockStatus: "in_stock",
    });
    const [movement] = await db.select().from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.productId, inventoryCreatedProductId)).limit(1);
    expect(movement).toMatchObject({
      movementType: "increase", quantityBefore: 0, quantityAfter: 9,
      sourceType: "product_creation", performedBy: superId,
    });
  });

  it("filters inventory using saved thresholds and returns a real summary", async () => {
    const response = await request(app)
      .get(`/api/admin/inventory?categoryId=${categoryId}&stockStatus=low&sort=quantity_asc`)
      .set("Authorization", `Bearer ${superToken}`)
      .expect(200);
    expect(response.body.summary).toEqual(expect.objectContaining({
      totalUnits: expect.any(Number), totalValue: expect.any(Number),
      lowStockProducts: expect.any(Number), outOfStockProducts: expect.any(Number),
    }));
    expect(response.body.items.every((item: { stockStatus: string }) => item.stockStatus === "low")).toBe(true);
  });

  it("prevents negative stock and deduplicates retried adjustments", async () => {
    await request(app)
      .post(`/api/admin/inventory/${productId}/adjust`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ operation: "decrease", quantity: 99, reason: "Invalid issue", idempotencyKey: "negative-check-0001" })
      .expect(409);
    const input = { operation: "increase", quantity: 2, reason: "Retry-safe receipt", idempotencyKey: "retry-safe-0001" };
    const [first, second] = await Promise.all([
      request(app).post(`/api/admin/inventory/${productId}/adjust`)
        .set("Authorization", `Bearer ${superToken}`).send(input).expect(200),
      request(app).post(`/api/admin/inventory/${productId}/adjust`)
        .set("Authorization", `Bearer ${superToken}`).send(input).expect(200),
    ]);
    expect(second.body.movement.id).toBe(first.body.movement.id);
    expect(second.body.item.stockQuantity).toBe(first.body.item.stockQuantity);
  });

  it("allows inventory viewers to read but rejects adjustments", async () => {
    await request(app).get(`/api/admin/inventory/${productId}/movements`)
      .set("Authorization", `Bearer ${viewerToken}`).expect(200);
    const response = await request(app)
      .post(`/api/admin/inventory/${productId}/adjust`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ operation: "adjustment", quantity: 0, reason: "Forbidden", idempotencyKey: "forbidden-0001" })
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