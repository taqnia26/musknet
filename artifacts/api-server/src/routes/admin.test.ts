import request from "supertest";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  adminPermissionsTable,
  adminIntegrationsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  accountingAccountsTable,
  categoriesTable,
  customersTable,
  addressesTable,
  db,
  inventoryBalancesTable,
  inventoryMovementsTable,
  invoiceEmailDeliveriesTable,
  invoiceItemsTable,
  journalEntriesTable,
  journalEntryLinesTable,
  journalEntryAuditTable,
  invoicesTable,
  orderAddressesTable,
  orderItemsTable,
  ordersTable,
  productsTable,
  shipmentEventsTable,
  shipmentsTable,
  uploadedContractFilesTable,
  wholesaleDistributorsTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";
import * as accounting from "../lib/accounting";
import * as invoiceEmail from "../lib/invoice-email";
import * as Api from "@workspace/api-zod";
import { LocalContractStorage } from "../lib/local-contract-storage";
import { addAddress, deleteAddress } from "../lib/storefront";

const seedEmail = `route-super-${Date.now()}@example.com`;
const createdIds: number[] = [];
const temporarilyDisabledSuperIds: number[] = [];
let superId: number;
let superToken: string;
let viewerToken: string;
let categoryId: number;
let productId: number;
let customerId: number;
let manualCustomerId: number;
const intakeSaudi = {
  country: "SA", city: "Riyadh", nationalAddressShortCode: "RYDH1234",
  district: "Olaya", street: "King Road", buildingNo: "24",
  postalCode: "12345", additionalNumber: "6789",
};
const intakeInternational = { country: "AE", city: "Dubai", additionalInfo: "Office 5, Marina Tower, Dubai" };
let orderId: number;
let createdAdminOrderId: number;
let inventoryCreatedProductId: number;
let shippingShipmentId: number;
let previousSmsaIntegration: typeof adminIntegrationsTable.$inferSelect | undefined;

describe("admin validation contracts", () => {
  it("accepts practical phone formats but rejects alphabetic or implausible values", () => {
    const valid = { companyName: "شركة اختبار", contactName: "مسؤول", phone: "+966 (50) 123-4567",
      email: "company@example.com", countryCode: "SA", city: "Riyadh", taxNumber: "300012345678901",
      commercialRegistrationNumber: "1010123456" };
    expect(Api.AdminCreateDistributorBody.safeParse(valid).success).toBe(true);
    expect(Api.AdminCreateDistributorBody.safeParse({ ...valid, countryCode: "AE" }).success).toBe(true);
    expect(Api.AdminCreateDistributorBody.safeParse({ ...valid, countryCode: null }).success).toBe(true);
    expect(Api.AdminCreateDistributorBody.safeParse({ ...valid, countryCode: "ARE" }).success).toBe(false);
    expect(Api.AdminCreateDistributorBody.safeParse({ ...valid, phone: "0550ABC123" }).success).toBe(false);
    expect(Api.AdminCreateDistributorBody.safeParse({ ...valid, phone: "123" }).success).toBe(false);
    expect(Api.AdminCreateDistributorBody.safeParse({ ...valid, phone: "1234567890123456" }).success).toBe(false);
  });
});

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
  delete process.env.SMSA_API_KEY;
  delete process.env.SMSA_WEBHOOK_SECRET;
  if (previousSmsaIntegration) {
    await db.insert(adminIntegrationsTable).values(previousSmsaIntegration).onConflictDoUpdate({
      target: adminIntegrationsTable.providerId,
      set: previousSmsaIntegration,
    });
  } else {
    await db.delete(adminIntegrationsTable).where(eq(adminIntegrationsTable.providerId, "smsa"));
  }
  if (createdAdminOrderId) await db.delete(ordersTable).where(eq(ordersTable.id, createdAdminOrderId));
  if (inventoryCreatedProductId) {
    const entries = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.sourceType, "product_creation"), eq(journalEntriesTable.sourceId, String(inventoryCreatedProductId))));
    if (entries.length) {
      await db.execute(sql`alter table journal_entry_lines disable trigger journal_entry_lines_immutable`);
      await db.execute(sql`alter table journal_entries disable trigger journal_entries_immutable`);
      await db.transaction(async (tx) => {
        await tx.delete(journalEntryAuditTable).where(eq(journalEntryAuditTable.journalEntryId, entries[0].id));
        await tx.delete(journalEntryLinesTable).where(eq(journalEntryLinesTable.journalEntryId, entries[0].id));
        await tx.delete(journalEntriesTable).where(eq(journalEntriesTable.id, entries[0].id));
      });
      await db.execute(sql`alter table journal_entry_lines enable trigger journal_entry_lines_immutable`);
      await db.execute(sql`alter table journal_entries enable trigger journal_entries_immutable`);
    }
    await db.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.productId, inventoryCreatedProductId));
  }
  if (inventoryCreatedProductId) await db.delete(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, inventoryCreatedProductId));
  if (inventoryCreatedProductId) await db.delete(productsTable).where(eq(productsTable.id, inventoryCreatedProductId));
  if (orderId) {
    const invoiceRows = await db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.orderId, orderId));
    if (invoiceRows.length) await db.delete(invoiceEmailDeliveriesTable).where(eq(invoiceEmailDeliveriesTable.invoiceId, invoiceRows[0].id));
    await db.delete(invoicesTable).where(eq(invoicesTable.orderId, orderId));
  }
  if (orderId) await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
  if (productId) await db.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.productId, productId));
  if (productId) await db.delete(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, productId));
  if (productId) await db.delete(productsTable).where(eq(productsTable.id, productId));
  if (categoryId) await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  if (customerId) await db.delete(customersTable).where(eq(customersTable.id, customerId));
  if (manualCustomerId) await db.delete(customersTable).where(eq(customersTable.id, manualCustomerId));
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

  it("saves and clears extended product details without changing stock", async () => {
    const auth = { Authorization: `Bearer ${superToken}` };
    const details = {
      descriptionAr: "وصف قابل للبحث للمنتج",
      barcode: "6287020840098",
      mpn: "MANUFACTURER-123",
      brand: "مسك اللولو",
      weightKg: 0.5,
      costPrice: 47.5,
      discountPrice: 80,
      discountEndsOn: "2026-12-31",
      subtitleAr: "عنوان فرعي",
      promotionalTitleAr: "عرض خاص",
      maxPerCustomer: 2,
      requiresShipping: false,
      allowOrderAttachment: true,
      allowCustomerNote: true,
      taxable: false,
      registrationNumber: "CN-2025-136459",
      tags: ["مسك", "عطر"],
      seoTitleAr: "عنوان الصفحة",
      seoDescriptionAr: "وصف الصفحة",
    };
    const saved = await request(app).patch(`/api/admin/products/${productId}`)
      .set(auth).send(details).expect(200);
    expect(saved.body).toMatchObject({ ...details, stockQuantity: 5, price: 100 });
    const persisted = await request(app).get(`/api/admin/products/${productId}`).set(auth).expect(200);
    expect(persisted.body).toMatchObject(details);

    const search = await request(app).get("/api/admin/products")
      .query({ search: "وصف قابل للبحث" }).set(auth).expect(200);
    expect(search.body.some((product: { id: number }) => product.id === productId)).toBe(true);
    const byCategory = await request(app).get("/api/admin/products")
      .query({ search: "تصنيف اختبار الإدارة" }).set(auth).expect(200);
    expect(byCategory.body.some((product: { id: number }) => product.id === productId)).toBe(true);

    await request(app).patch(`/api/admin/products/${productId}`)
      .set(auth).send({ discountPrice: 101 }).expect(400);
    const cleared = await request(app).patch(`/api/admin/products/${productId}`)
      .set(auth).send({
        descriptionAr: "",
        barcode: null,
        discountPrice: null,
        discountEndsOn: null,
        subtitleAr: null,
        tags: [],
      }).expect(200);
    expect(cleared.body).toMatchObject({
      descriptionAr: "", barcode: null, discountPrice: null,
      discountEndsOn: null, subtitleAr: null, tags: [], stockQuantity: 5,
    });
  });

  it("creates a product with extended catalog details and safe defaults", async () => {
    const slug = `admin-catalog-fields-${Date.now()}`;
    const created = await request(app).post("/api/admin/products")
      .set("Authorization", `Bearer ${superToken}`)
      .send({
        nameAr: "منتج ببيانات تفصيلية",
        nameEn: "Product with catalog details",
        displayNameAr: "منتج للمتجر",
        displayNameEn: "Store product",
        invoiceNameAr: "منتج الفاتورة",
        invoiceNameEn: "Invoice product",
        slug,
        price: 209,
        categoryId,
        stockQuantity: 0,
        weightKg: 0.5,
        costPrice: 100,
        barcode: "6287020840098",
        mpn: "MPN-CATALOG-1",
        maxPerCustomer: 2,
        tags: ["عطر", "مسك"],
        seoTitleAr: "عنوان فهرسة المنتج",
        allowCustomerNote: true,
      }).expect(201);
    try {
      expect(created.body).toMatchObject({
        slug, price: 209, stockQuantity: 0, weightKg: 0.5, costPrice: 100,
        displayNameAr: "منتج للمتجر", displayNameEn: "Store product",
        invoiceNameAr: "منتج الفاتورة", invoiceNameEn: "Invoice product",
        barcode: "6287020840098", mpn: "MPN-CATALOG-1",
        maxPerCustomer: 2, tags: ["عطر", "مسك"],
        seoTitleAr: "عنوان فهرسة المنتج", allowCustomerNote: true,
        requiresShipping: true, taxable: true, allowOrderAttachment: false,
      });
      const persisted = await db.select().from(productsTable).where(eq(productsTable.id, created.body.id));
      expect(persisted[0].stockQuantity).toBe(0);
      expect(persisted[0].averageCost).toBe("0.0000");
      expect(persisted[0].tags).toEqual(["عطر", "مسك"]);
      const publicProduct = await request(app).get(`/api/products/${slug}`).expect(200);
      expect(publicProduct.body.nameAr).toBe("منتج للمتجر");
      expect(publicProduct.body.nameEn).toBe("Store product");
    } finally {
      await db.delete(productsTable).where(eq(productsTable.id, created.body.id));
    }
  });

  it("deletes only unreferenced categories and offers deactivation for retained products", async () => {
    const auth = { Authorization: `Bearer ${superToken}` };
    const created = await request(app).post("/api/admin/categories").set(auth)
      .send({ nameAr: "قسم مؤقت", nameEn: "Temporary category", slug: `temporary-category-${Date.now()}` }).expect(201);
    const category = created.body.id as number;
    try {
      await db.update(productsTable).set({ categoryId: category, isActive: false }).where(eq(productsTable.id, productId));
      const blocked = await request(app).delete(`/api/admin/categories/${category}`).set(auth).expect(409);
      expect(blocked.body.error).toMatch(/deactivate|reclassify/i);
      expect(blocked.body.references.inactiveProducts).toBeGreaterThan(0);
      await request(app).patch(`/api/admin/categories/${category}`).set(auth).send({ isActive: false }).expect(200);
      await db.update(productsTable).set({ categoryId, isActive: true }).where(eq(productsTable.id, productId));
      await request(app).delete(`/api/admin/categories/${category}`).set(auth).expect(204);
    } finally {
      await db.update(productsTable).set({ categoryId, isActive: true }).where(eq(productsTable.id, productId));
      await db.delete(categoriesTable).where(eq(categoriesTable.id, category));
    }
  });

  it("creates an unverified customer only with edit permission, without duplicating a phone", async () => {
    if (!viewerToken) {
      const [viewer] = await db.insert(adminUsersTable).values({
        email: `customer-viewer-${Date.now()}@example.com`,
        name: "Customer view-only",
        passwordHash: await hashAdminPassword("viewer-test-password"),
      }).returning();
      createdIds.push(viewer.id);
      viewerToken = await createAdminSession(viewer.id);
    }
    const url = "/api/admin/customers";
    const uniquePhone = `9665${String(Date.now()).slice(-8)}`;
    const payload = { name: "  عميل جديد  ", phone: `+${uniquePhone.slice(0, 3)} ${uniquePhone.slice(3, 5)} ${uniquePhone.slice(5)}`, email: "new@example.com", profileAddress: intakeSaudi };
    await request(app).post(url).send(payload).expect(401);
    await request(app).post(url).set("Authorization", `Bearer ${viewerToken}`).send(payload).expect(403);
    const admin = { Authorization: `Bearer ${superToken}` };
    for (const invalid of [
      { ...payload, name: "   " },
      { ...payload, phone: "123" },
      { ...payload, phone: "9665ABC123" },
      { ...payload, email: "invalid" },
      { ...payload, email: "" },
      { ...payload, profileAddress: { ...intakeSaudi, postalCode: "" } },
      { ...payload, profileAddress: { ...intakeSaudi, additionalInfo: "mixed branch" } },
      { ...payload, profileAddress: { ...intakeInternational, district: "mixed" } },
      { ...payload, profileAddress: { ...intakeInternational, country: "XX" } },
      { ...payload, phoneVerified: true },
    ]) await request(app).post(url).set(admin).send(invalid).expect(400);

    const created = await request(app).post(url).set(admin).send(payload).expect(201);
    manualCustomerId = created.body.id;
    expect(created.body).toMatchObject({ name: "عميل جديد", phone: uniquePhone, email: "new@example.com", phoneVerified: false, isActive: true });
    const [stored] = await db.select().from(customersTable).where(eq(customersTable.id, manualCustomerId));
    expect(stored.phoneVerified).toBe(false);
    const [profile] = await db.select().from(addressesTable).where(eq(addressesTable.userId, manualCustomerId));
    expect(profile).toMatchObject({ ...intakeSaudi, isDefault: true, isProfile: true });
    expect((await request(app).get(`${url}/${manualCustomerId}`).set(admin).expect(200)).body.profileAddress).toMatchObject(intakeSaudi);
    const shippingAddress = await addAddress(manualCustomerId, {
      label: "Shipping", city: "Jeddah", district: "Port", street: "Harbor Road",
      buildingNo: "9", additionalInfo: null, isDefault: true,
    });
    try {
      expect(await deleteAddress(manualCustomerId, profile.id)).toBe(false);
      expect((await request(app).get(`${url}/${manualCustomerId}`).set(admin).expect(200)).body.profileAddress).toMatchObject(intakeSaudi);
      const listedAddresses = await request(app).get(url).set(admin).expect(200);
      expect(listedAddresses.body.find((customer: { id: number }) => customer.id === manualCustomerId).profileAddress.city).toBe("Riyadh");
    } finally {
      expect(await deleteAddress(manualCustomerId, shippingAddress.id)).toBe(true);
    }
    const duplicate = await request(app).post(url).set(admin)
      .send({ ...payload, name: "Overwrite attempt", phone: uniquePhone }).expect(409);
    expect(duplicate.body.error).toMatch(/phone/i);
    await request(app).post(url).set(admin)
      .send({ ...payload, name: "Formatted duplicate", phone: `+${uniquePhone}` }).expect(409);
    const [existingCustomer] = await db.select({ phone: customersTable.phone }).from(customersTable)
      .where(eq(customersTable.id, customerId));
    await request(app).post(url).set(admin)
      .send({ ...payload, name: "Existing customer duplicate", phone: `+${existingCustomer.phone}` }).expect(409);
    const listed = await request(app).get(`${url}?search=${uniquePhone}`).set(admin).expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].id).toBe(manualCustomerId);
    const edited = await request(app).patch(`${url}/${manualCustomerId}`).set(admin)
      .send({ name: "Updated individual" }).expect(200);
    expect(edited.body).toMatchObject({ name: "Updated individual", phone: uniquePhone, phoneVerified: false });
  });

  it("creates international customers and both distributor address branches, rejects invalid inputs", async () => {
    const auth = { Authorization: `Bearer ${superToken}` };
    const unique = String(Date.now()).slice(-9);
    const customer = { name: "International customer", phone: `971${unique}`, email: "global@example.com", profileAddress: intakeInternational };
    const created = await request(app).post("/api/admin/customers").set(auth).send(customer).expect(201);
    try {
      expect(created.body.profileAddress).toMatchObject(intakeInternational);
      expect((await request(app).get(`/api/admin/customers/${created.body.id}`).set(auth).expect(200)).body.profileAddress).toMatchObject(intakeInternational);
    } finally { await db.delete(customersTable).where(eq(customersTable.id, created.body.id)); }

    const base = { companyName: "Test Company", commercialRegistrationNumber: "1010123456", taxNumber: "300012345678901",
      contactName: "Contact", phone: `966${unique}`, email: "office@example.com" };
    const saudi = { ...base, countryCode: "SA", ...intakeSaudi, country: undefined };
    const international = { ...base, phone: `971${unique}`, countryCode: "AE",
      city: "Dubai", address: intakeInternational.additionalInfo };
    await request(app).post("/api/admin/distributors").send(saudi).expect(401);
    await request(app).post("/api/admin/distributors").set("Authorization", `Bearer ${viewerToken}`).send(saudi).expect(403);
    for (const invalid of [
      { ...saudi, postalCode: "" }, { ...saudi, email: "not-an-email" },
      { ...saudi, taxNumber: "" }, { ...saudi, address: "mixed" },
      { ...international, nationalAddressShortCode: "RYDH1234" }, { ...international, address: "" },
    ]) await request(app).post("/api/admin/distributors").set(auth).send(invalid).expect(400);
    for (const payload of [saudi, international]) {
      const result = await request(app).post("/api/admin/distributors").set(auth).send(payload).expect(201);
      try {
        expect(result.body.address).toBeTruthy();
        expect(result.body.countryCode).toBe(payload.countryCode);
        expect(result.body.postalCode).toBe(payload.countryCode === "SA" ? "12345" : null);
        const listing = await request(app).get("/api/admin/distributors").set(auth).expect(200);
        expect(listing.body.find((row: { id: number }) => row.id === result.body.id)).toMatchObject(result.body);
        await request(app).patch(`/api/admin/distributors/${result.body.id}`).set(auth).send({ phone: "123" }).expect(400);
        await request(app).patch(`/api/admin/distributors/${result.body.id}`).set(auth).send({ phone: "invalidABC123" }).expect(400);
        expect((await db.select().from(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, result.body.id)))[0].phone).toBe(payload.phone);
        await request(app).patch(`/api/admin/distributors/${result.body.id}`).set(auth)
          .send({ phone: "+966 50 123 4567" }).expect(200);
      } finally { await db.delete(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, result.body.id)); }
    }
  });

  it("rolls back the customer when its profile address cannot be written", async () => {
    const phone = `9667${String(Date.now()).slice(-8)}`;
    const auth = { Authorization: `Bearer ${superToken}` };
    await db.execute(sql`create function intake_test_reject_profile() returns trigger language plpgsql as $$
      begin if new.label = 'Profile' and new.city = 'AtomicityProbe' then
        raise exception 'forced profile insert failure';
      end if; return new; end $$`);
    await db.execute(sql`create trigger intake_test_reject_profile before insert on storefront_addresses
      for each row execute function intake_test_reject_profile()`);
    try {
      await request(app).post("/api/admin/customers").set(auth).send({
        name: "Atomicity check", phone, email: "atomic@example.com",
        profileAddress: { ...intakeSaudi, city: "AtomicityProbe" },
      }).expect(500);
      const rows = await db.select().from(customersTable).where(eq(customersTable.phone, phone));
      expect(rows).toHaveLength(0);
    } finally {
      await db.execute(sql`drop trigger intake_test_reject_profile on storefront_addresses`);
      await db.execute(sql`drop function intake_test_reject_profile()`);
    }
  });

  it("stores private contracts locally across service instances, validates uploads, and reports configuration errors", async () => {
    const previousLocal = process.env.LOCAL_CONTRACT_STORAGE_DIR;
    const previousReplit = process.env.PRIVATE_OBJECT_DIR;
    const dir = await mkdtemp(path.join(os.tmpdir(), "contract-storage-"));
    const pdf = Buffer.from("%PDF-1.7\ncontract content\n%%EOF");
    const headers = { Authorization: `Bearer ${superToken}` };
    const [contractViewer] = await db.insert(adminUsersTable).values({
      email: `contract-viewer-${Date.now()}@example.com`,
      name: "Contract test viewer",
      passwordHash: await hashAdminPassword("viewer-test-password"),
    }).returning();
    createdIds.push(contractViewer.id);
    const contractViewerToken = await createAdminSession(contractViewer.id);
    const payload = {
      ownerType: "customer", ownerId: customerId, fileName: "agreement.pdf",
      mimeType: "application/pdf", sizeBytes: pdf.length,
    };
    let recordId: number | undefined;
    try {
      delete process.env.PRIVATE_OBJECT_DIR;
      delete process.env.LOCAL_CONTRACT_STORAGE_DIR;
      const missing = await request(app).post("/api/admin/contract-files/upload-url")
        .set(headers).send(payload).expect(503);
      expect(missing.body.error).toContain("LOCAL_CONTRACT_STORAGE_DIR");
      process.env.LOCAL_CONTRACT_STORAGE_DIR = path.join(dir, "missing");
      await request(app).post("/api/admin/contract-files/upload-url").set(headers).send(payload).expect(503);
      process.env.LOCAL_CONTRACT_STORAGE_DIR = dir;
      await chmod(dir, 0o500);
      await request(app).post("/api/admin/contract-files/upload-url").set(headers).send(payload).expect(503);
      await chmod(dir, 0o700);

      await request(app).post("/api/admin/contract-files/upload-url").send(payload).expect(401);
      await request(app).post("/api/admin/contract-files/upload-url")
        .set("Authorization", `Bearer ${contractViewerToken}`).send(payload).expect(403);
      const prepared = await request(app).post("/api/admin/contract-files/upload-url")
        .set(headers).send(payload).expect(200);
      const { uploadUrl, objectPath } = prepared.body;
      expect(objectPath).toMatch(/^\/objects\/local\/contracts\//);
      await request(app).put(uploadUrl).set("Content-Type", "application/pdf").send(pdf).expect(401);
      await request(app).put(uploadUrl).set("Authorization", `Bearer ${contractViewerToken}`)
        .set("Content-Type", "application/pdf").send(pdf).expect(403);
      await request(app).put(uploadUrl).set(headers).set("Content-Type", "application/msword")
        .send(pdf).expect(400);
      await request(app).put(uploadUrl).set(headers).set("Content-Type", "application/pdf")
        .send(Buffer.alloc(pdf.length, 65)).expect(400);
      await request(app).post("/api/admin/contract-files").set(headers)
        .send({ ...payload, objectPath }).expect(404);
      await request(app).put(uploadUrl).set(headers).set("Content-Type", "application/pdf")
        .send(pdf).expect(204);
      await request(app).get(`/api/storage${objectPath}`).expect(404);
      await request(app).get("/api/storage/objects/uploads/contracts/files/legacy").expect(404);
      const storageAfterRestart = new LocalContractStorage();
      expect(await storageAfterRestart.getMetadata(objectPath)).toMatchObject({ contentType: "application/pdf", size: pdf.length });
      await expect(storageAfterRestart.getMetadata("/objects/local/contracts/../../etc/passwd")).rejects.toThrow();
      await request(app).post("/api/admin/contract-files").set(headers)
        .send({ ...payload, objectPath: "/objects/local/contracts/../../etc/passwd" }).expect(400);
      const saved = await request(app).post("/api/admin/contract-files").set(headers)
        .send({ ...payload, objectPath }).expect(201);
      recordId = saved.body.id;
      await request(app).get(`/api/admin/contract-files/${recordId}/download`).expect(401);
      await request(app).get(`/api/admin/contract-files/${recordId}/download`)
        .set("Authorization", `Bearer ${contractViewerToken}`).expect(403);
      const download = await request(app).get(`/api/admin/contract-files/${recordId}/download`)
        .set(headers).expect(200);
      expect(download.body).toEqual(pdf);
      await request(app).delete(`/api/admin/contract-files/${recordId}`).set(headers).expect(204);
      recordId = undefined;
      await expect(storageAfterRestart.getMetadata(objectPath)).rejects.toThrow();

      for (const [extension, mimeType, bytes] of [
        ["doc", "application/msword", Buffer.from("d0cf11e0a1b11ae1", "hex")],
        ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          Buffer.concat([Buffer.from("504b0304", "hex"), Buffer.from("word/document.xml")])],
      ] as const) {
        const upload = await request(app).post("/api/admin/contract-files/upload-url").set(headers)
          .send({ fileName: `agreement.${extension}`, mimeType, sizeBytes: bytes.length }).expect(200);
        await request(app).put(upload.body.uploadUrl).set(headers).set("Content-Type", mimeType).send(bytes).expect(204);
        expect((await new LocalContractStorage().getMetadata(upload.body.objectPath)).contentType).toBe(mimeType);
      }
      await request(app).post("/api/admin/contract-files/upload-url").set(headers)
        .send({ ...payload, fileName: "wrong.doc" }).expect(400);

      delete process.env.LOCAL_CONTRACT_STORAGE_DIR;
      process.env.PRIVATE_OBJECT_DIR = "/test-bucket/private";
      const sign = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ signed_url: "https://storage.example.test/upload" }), { status: 200 }),
      );
      try {
        const replit = await request(app).post("/api/admin/contract-files/upload-url")
          .set(headers).send(payload).expect(200);
        expect(replit.body).toMatchObject({ uploadUrl: "https://storage.example.test/upload" });
        expect(replit.body.objectPath).toMatch(/^\/objects\/uploads\/contracts\/files\//);
        expect(sign).toHaveBeenCalledTimes(1);
      } finally {
        sign.mockRestore();
      }
    } finally {
      if (recordId) await db.delete(uploadedContractFilesTable).where(eq(uploadedContractFilesTable.id, recordId));
      await chmod(dir, 0o700);
      await rm(dir, { recursive: true, force: true });
      if (previousLocal === undefined) delete process.env.LOCAL_CONTRACT_STORAGE_DIR;
      else process.env.LOCAL_CONTRACT_STORAGE_DIR = previousLocal;
      if (previousReplit === undefined) delete process.env.PRIVATE_OBJECT_DIR;
      else process.env.PRIVATE_OBJECT_DIR = previousReplit;
    }
  });

  it("confirms reviewed terms once and only for an active distributor", async () => {
    const suffix = Date.now();
    const [distributor] = await db.insert(wholesaleDistributorsTable).values({
      companyName: `Terms confirmation ${suffix}`,
      contactName: "Contract reviewer test",
      phone: `052${String(suffix).slice(-7)}`,
    }).returning();
    const [file] = await db.insert(uploadedContractFilesTable).values({
      ownerType: "distributor",
      ownerId: distributor.id,
      ownerName: distributor.companyName,
      fileName: `reviewed-${suffix}.pdf`,
      objectPath: `/objects/uploads/contracts/files/reviewed-${suffix}`,
      mimeType: "application/pdf",
      sizeBytes: 100,
      uploadedBy: superId,
    }).returning();
    const headers = { Authorization: `Bearer ${superToken}` };
    const terms = {
      contractType: "Saudi distributor agreement",
      discountPercent: 5,
      paymentTerm: "net_days",
      paymentDays: 30,
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      signedDate: "2025-12-30",
    };
    try {
      await db.update(wholesaleDistributorsTable).set({ isActive: false })
        .where(eq(wholesaleDistributorsTable.id, distributor.id));
      await request(app).post(`/api/admin/contract-files/${file.id}/terms`).set(headers)
        .send(terms).expect(409);
      const [unchanged] = await db.select().from(uploadedContractFilesTable)
        .where(eq(uploadedContractFilesTable.id, file.id));
      expect(unchanged.termsConfirmedAt).toBeNull();
      await db.update(wholesaleDistributorsTable).set({ isActive: true })
        .where(eq(wholesaleDistributorsTable.id, distributor.id));
      const confirmed = await request(app).post(`/api/admin/contract-files/${file.id}/terms`)
        .set(headers).send(terms).expect(200);
      expect(confirmed.body).toMatchObject({
        id: file.id,
        contractType: terms.contractType,
        discountPercent: 5,
        paymentTerm: terms.paymentTerm,
        paymentDays: terms.paymentDays,
        startDate: `${terms.startDate}T00:00:00.000Z`,
        endDate: `${terms.endDate}T00:00:00.000Z`,
        signedDate: `${terms.signedDate}T00:00:00.000Z`,
        termsConfirmedBy: superId,
      });
      expect(confirmed.body.termsConfirmedAt).toBeTruthy();
      await request(app).post(`/api/admin/contract-files/${file.id}/terms`)
        .set(headers).send(terms).expect(409);
      await request(app).put(`/api/admin/contract-files/${file.id}/terms`)
        .set("Authorization", `Bearer ${viewerToken}`).send(terms).expect(403);
      const updated = await request(app).put(`/api/admin/contract-files/${file.id}/terms`)
        .set(headers).send({ ...terms, discountPercent: 9, signedDate: null, paymentTerm: "due_on_issue", paymentDays: undefined }).expect(200);
      expect(updated.body).toMatchObject({ discountPercent: 9, signedDate: null, paymentTerm: "due_on_issue", paymentDays: null, termsConfirmedBy: superId });
      expect(updated.body.termsConfirmedAt).toEqual(confirmed.body.termsConfirmedAt);
      const listed = await request(app).get("/api/admin/contract-files").set(headers).expect(200);
      expect(listed.body.find((item: { id: number }) => item.id === file.id)).toMatchObject({ discountPercent: 9, signedDate: null });
    } finally {
      await db.delete(uploadedContractFilesTable).where(eq(uploadedContractFilesTable.id, file.id));
      await db.delete(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, distributor.id));
    }
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
    await db.update(productsTable).set({ price: 199 }).where(eq(productsTable.id, productId));
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
    expect(response.body.orderNumber).toMatch(/^L-[0-9]+$/);
    const listedOrder = await request(app).get("/api/admin/orders")
      .query({ search: response.body.orderNumber })
      .set("Authorization", `Bearer ${superToken}`).expect(200);
    expect(listedOrder.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: createdAdminOrderId, orderNumber: response.body.orderNumber }),
    ]));
    const legacyOrder = await request(app).get("/api/admin/orders")
      .query({ search: "ADMIN-TEST-" })
      .set("Authorization", `Bearer ${superToken}`).expect(200);
    expect(legacyOrder.body.some((row: { id: number }) => row.id === orderId)).toBe(true);
    expect(response.body).toMatchObject({
      userId: customerId,
      subtotal: 398,
      shippingCost: 20,
      tax: 54.52,
      total: 418,
      paymentStatus: "pending",
    });

    const [product] = await db.select({ stockQuantity: productsTable.stockQuantity })
      .from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    expect(product.stockQuantity).toBe(3);
    const locationBalances = await db.select().from(inventoryBalancesTable)
      .where(eq(inventoryBalancesTable.productId, productId));
    expect(locationBalances.reduce((sum, balance) => sum + balance.available, 0)).toBe(3);
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
    await db.update(productsTable).set({ stockQuantity: 5, price: 100 }).where(eq(productsTable.id, productId));
    await db.update(inventoryBalancesTable).set({ available: 5 })
      .where(eq(inventoryBalancesTable.productId, productId));
  });

  it("requires the right address fields per country and retrieves clean order and shipment addresses", async () => {
    const auth = { Authorization: `Bearer ${superToken}` };
    const address = {
      label: "Home", city: "جدة", country: "SA", nationalAddressShortCode: "JEDH1234",
      district: "stale district", street: "stale street", buildingNo: "99",
      additionalInfo: "stale notes", isDefault: false,
    };
    const payload = (orderAddress: typeof address) => ({
      userId: customerId, items: [{ productId, quantity: 1 }],
      orderAddress, shippingMethod: "admin-standard", paymentMethod: "cash",
    });
    const url = "/api/admin/orders";
    await request(app).post(url).set(auth).send(payload({ ...address, nationalAddressShortCode: "" })).expect(400);
    await request(app).post(url).set(auth).send(payload({
      ...address, country: "AE", nationalAddressShortCode: "", district: "",
    })).expect(400);
    await request(app).post(url).set(auth).send(payload({
      ...address, country: "AE", nationalAddressShortCode: "JEDH1234",
    })).expect(400);

    const created: number[] = [];
    try {
      const sa = await request(app).post(url).set(auth).send(payload(address)).expect(201);
      created.push(sa.body.id);
      expect(sa.body).toMatchObject({ subtotal: 100, shippingCost: 30, tax: 16.96, total: 130 });
      const saDetail = await request(app).get(`${url}/${sa.body.id}`).set(auth).expect(200);
      expect(saDetail.body.orderAddress).toMatchObject({
        city: "جدة", country: "SA", nationalAddressShortCode: "JEDH1234",
        district: "", street: "", buildingNo: "", additionalInfo: null,
      });
      const [saShipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.orderId, sa.body.id));
      expect(saShipment).toMatchObject({
        shippingScope: "domestic", destinationCountry: "SA", destinationCity: "جدة",
        nationalAddressShortCode: "JEDH1234", destinationDistrict: null,
        destinationStreet: null, destinationBuildingNumber: null,
      });

      const intl = await request(app).post(url).set(auth).send(payload({
        ...address, country: "AE", city: "Dubai", nationalAddressShortCode: "",
        district: "Deira", street: "Al Maktoum", buildingNo: "25", additionalInfo: "Unit 7",
      })).expect(201);
      created.push(intl.body.id);
      expect(intl.body).toMatchObject({ subtotal: 100, shippingCost: 30, tax: 0, total: 130 });
      const intlDetail = await request(app).get(`${url}/${intl.body.id}`).set(auth).expect(200);
      expect(intlDetail.body.orderAddress).toMatchObject({
        country: "AE", city: "Dubai", nationalAddressShortCode: null,
        district: "Deira", street: "Al Maktoum", buildingNo: "25", additionalInfo: "Unit 7",
      });
      const [intlShipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.orderId, intl.body.id));
      expect(intlShipment).toMatchObject({
        shippingScope: "international", destinationCountry: "AE", destinationCity: "Dubai",
        nationalAddressShortCode: null, destinationDistrict: "Deira",
        destinationStreet: "Al Maktoum", destinationBuildingNumber: "25",
        destinationAdditionalDetails: "Unit 7",
      });
      const old = await request(app).get(`${url}/${orderId}`).set(auth).expect(200);
      expect(old.body.orderAddress).toMatchObject({ country: null, nationalAddressShortCode: null, district: "Olaya" });
    } finally {
      for (const id of created) {
        await db.delete(ordersTable).where(eq(ordersTable.id, id));
        await db.delete(inventoryMovementsTable).where(and(
          eq(inventoryMovementsTable.sourceType, "order"), eq(inventoryMovementsTable.sourceId, String(id)),
        ));
      }
      await db.update(productsTable).set({ stockQuantity: 5 }).where(eq(productsTable.id, productId));
      await db.update(inventoryBalancesTable).set({ available: 5 }).where(eq(inventoryBalancesTable.productId, productId));
    }
  });

  it("creates a carrier label and persists tracking without changing collected shipping", async () => {
    [previousSmsaIntegration] = await db.select().from(adminIntegrationsTable)
      .where(eq(adminIntegrationsTable.providerId, "smsa")).limit(1);
    await db.insert(adminIntegrationsTable).values({
      providerId: "smsa",
      status: "configured",
      apiBaseUrl: "https://smsa.test",
      configuredBy: superId,
    }).onConflictDoUpdate({
      target: adminIntegrationsTable.providerId,
      set: { apiBaseUrl: "https://smsa.test", configuredBy: superId },
    });
    process.env.SMSA_API_KEY = "test-key";
    const [shipmentBefore] = await db.select().from(shipmentsTable)
      .where(eq(shipmentsTable.orderId, createdAdminOrderId)).limit(1);
    shippingShipmentId = shipmentBefore.id;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      shipmentId: "smsa-shipment-1",
      trackingNumber: "SMSA-TRACK-1",
      labelUrl: "https://smsa.test/labels/1",
      actualCost: 17.5,
    }), { status: 201, headers: { "content-type": "application/json" } }));

    try {
      const response = await request(app)
        .post(`/api/admin/shipping/${shippingShipmentId}/label`)
        .set("Authorization", `Bearer ${superToken}`)
        .send({ carrier: "smsa", serviceMethod: "standard" })
        .expect(201);
      expect(response.body).toMatchObject({
        trackingNumber: "SMSA-TRACK-1",
        actualCost: 17.5,
        collectedCost: 20,
        integrationStatus: "active",
      });
      expect(response.body.events[0]).toMatchObject({ eventType: "label_created", outcome: "success" });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("authenticates and deduplicates carrier tracking webhooks", async () => {
    process.env.SMSA_WEBHOOK_SECRET = "webhook-test-secret";
    const payload = {
      eventId: "smsa-event-1",
      trackingNumber: "SMSA-TRACK-1",
      status: "delivered",
      occurredAt: new Date().toISOString(),
      actualCost: 19,
    };
    await request(app).post("/api/shipping/webhooks/smsa")
      .set("x-webhook-secret", "wrong-secret").send(payload).expect(401);
    const first = await request(app).post("/api/shipping/webhooks/smsa")
      .set("x-webhook-secret", "webhook-test-secret").send(payload).expect(200);
    expect(first.body).toEqual({ accepted: true, duplicate: false });
    const duplicate = await request(app).post("/api/shipping/webhooks/smsa")
      .set("x-webhook-secret", "webhook-test-secret").send(payload).expect(200);
    expect(duplicate.body).toEqual({ accepted: true, duplicate: true });

    const [shipment] = await db.select().from(shipmentsTable)
      .where(eq(shipmentsTable.id, shippingShipmentId)).limit(1);
    const events = await db.select().from(shipmentEventsTable)
      .where(and(
        eq(shipmentEventsTable.shipmentId, shippingShipmentId),
        eq(shipmentEventsTable.carrierEventId, payload.eventId),
      ));
    const [order] = await db.select().from(ordersTable)
      .where(eq(ordersTable.id, createdAdminOrderId)).limit(1);
    expect(shipment).toMatchObject({ status: "delivered", actualCost: 19, collectedCost: 20 });
    expect(order.status).toBe("delivered");
    expect(events).toHaveLength(1);
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

      expect(response.body).toEqual({ error: "تخزين الملفات غير مهيأ على الخادم. يرجى التأكد من إعداد App Storage في بيئة التشغيل." });
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
      .send({ status: "out_for_delivery", paymentStatus: "paid" })
      .expect(200);
    expect(response.body.status).toBe("out_for_delivery");
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

    const companySales = await request(app)
      .get("/api/admin/invoices?channel=companies")
      .set("Authorization", `Bearer ${superToken}`)
      .expect(200);
    expect(companySales.body.some((item: { orderId: number }) => item.orderId === orderId)).toBe(false);
    expect(companySales.body.every((item: { distributorId: number | null }) => item.distributorId !== null)).toBe(true);

    const qr = await request(app)
      .get(`/api/admin/invoices/${invoice.id}/qr`)
      .set("Authorization", `Bearer ${superToken}`)
      .expect("Content-Type", /image\/png/)
      .expect(200);
    expect(Buffer.from(qr.body).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    const downloadedPdf = await request(app)
      .get(`/api/admin/invoices/${invoice.id}/pdf/en`)
      .set("Authorization", `Bearer ${superToken}`)
      .expect("Content-Type", /application\/pdf/)
      .expect(200);
    expect(downloadedPdf.headers["content-disposition"]).toContain("attachment;");
    expect(downloadedPdf.headers["cache-control"]).toBe("no-store");

    await request(app).get(`/api/admin/invoices/${invoice.id}/pdf/fr`)
      .set("Authorization", `Bearer ${superToken}`).expect(400);

    await request(app).get("/api/admin/invoices")
      .set("Authorization", `Bearer ${viewerToken}`).expect(403);
    await request(app).get(`/api/admin/invoices/${invoice.id}/qr`)
      .set("Authorization", `Bearer ${viewerToken}`).expect(403);
  });

  it("persists successful and failed invoice email attempts and returns their history", async () => {
    const [invoice] = await db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.orderId, orderId));
    const pdf = vi.spyOn(invoiceEmail, "createInvoicePdf").mockResolvedValue(Buffer.from("%PDF-test"));
    const send = vi.spyOn(invoiceEmail, "sendInvoiceEmail")
      .mockResolvedValueOnce("provider-message-1")
      .mockRejectedValueOnce(new Error("provider unavailable"));

    await request(app).post(`/api/admin/invoices/${invoice.id}/email`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ recipient: "client-success@example.com", language: "en" })
      .expect(201);
    await request(app).post(`/api/admin/invoices/${invoice.id}/email`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ recipient: "client-retry@example.com" })
      .expect(502);

    const history = await request(app).get(`/api/admin/invoices/${invoice.id}/email-deliveries`)
      .set("Authorization", `Bearer ${superToken}`)
      .expect(200);
    expect(history.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ recipient: "client-success@example.com", status: "sent", sentByAdminId: superId }),
      expect.objectContaining({ recipient: "client-retry@example.com", status: "failed", errorMessage: "provider unavailable", sentByAdminId: superId }),
    ]));
    expect(pdf).toHaveBeenCalledTimes(2);
    expect(pdf.mock.calls.map((call) => call[1])).toEqual(["en", "ar"]);
    expect(send).toHaveBeenCalledTimes(2);
    pdf.mockRestore();
    send.mockRestore();
  });

  it("uses the uploaded-contract discount snapshot in distributor invoice email PDF data", async () => {
    const suffix = Date.now();
    const [distributor] = await db.insert(wholesaleDistributorsTable).values({
      companyName: `Email contract distributor ${suffix}`,
      contactName: "Invoice email test",
      phone: `053${String(suffix).slice(-7)}`,
    }).returning();
    const [contractFile] = await db.insert(uploadedContractFilesTable).values({
      ownerType: "distributor",
      ownerId: distributor.id,
      ownerName: distributor.companyName,
      fileName: `email-contract-${suffix}.pdf`,
      objectPath: `/objects/uploads/contracts/files/email-contract-${suffix}`,
      mimeType: "application/pdf",
      sizeBytes: 100,
      contractType: "Saudi distributor agreement",
      discountPercent: "5.00",
      paymentTerm: "due_on_issue",
      termsConfirmedAt: new Date(),
      termsConfirmedBy: superId,
      uploadedBy: superId,
    }).returning();
    const [{ next }] = await db.select({
      next: sql<number>`coalesce(max(${invoicesTable.sequenceNumber}), 0) + 1`,
    }).from(invoicesTable);
    const [invoice] = await db.insert(invoicesTable).values({
      distributorId: distributor.id,
      uploadedContractFileId: contractFile.id,
      contractNumber: contractFile.fileName,
      contractType: contractFile.contractType,
      contractDiscountPercent: "5.00",
      paymentTerm: "due_on_issue",
      taxTreatment: "domestic",
      vatRate: "15",
      sequenceNumber: Number(next),
      invoiceNumber: `LC-EMAIL-${suffix}`,
      sellerName: "Musk Ellolo",
      issueDatetime: new Date("2026-03-31T21:30:00.000Z"),
      dueDate: "2026-04-01",
      sellerVatNumber: "300000000000003",
      buyerName: distributor.companyName,
      subtotal: 16.52,
      discountAmount: 1,
      vatAmount: 2.48,
      totalAmount: 19,
      qrCodeData: "invoice-email-test",
    }).returning();
    await db.insert(invoiceItemsTable).values({
      invoiceId: invoice.id,
      productId,
      productName: "Invoice email test product",
      quantity: 1,
      unitPrice: 20,
      subtotal: 16.52,
      vatAmount: 2.48,
      totalAmount: 19,
    });
    let pdfInvoice: Parameters<typeof invoiceEmail.createInvoicePdf>[0] | undefined;
    const pdf = vi.spyOn(invoiceEmail, "createInvoicePdf").mockImplementation(async (data) => {
      pdfInvoice = data;
      return Buffer.from("%PDF-uploaded-contract");
    });
    const send = vi.spyOn(invoiceEmail, "sendInvoiceEmail").mockResolvedValue("uploaded-contract-email");
    try {
      await request(app).post(`/api/admin/invoices/${invoice.id}/email`)
        .set("Authorization", `Bearer ${superToken}`)
        .send({ recipient: "distributor@example.com" })
        .expect(201);
      expect(pdfInvoice?.discountAmount).toBe(1);
      expect(invoiceEmail.getInvoiceTotalRows(pdfInvoice!)).toContainEqual(["Contract discount (5%)", -1]);
    } finally {
      pdf.mockRestore();
      send.mockRestore();
      await db.delete(invoiceEmailDeliveriesTable).where(eq(invoiceEmailDeliveriesTable.invoiceId, invoice.id));
      await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoice.id));
      await db.delete(invoicesTable).where(eq(invoicesTable.id, invoice.id));
      await db.delete(uploadedContractFilesTable).where(eq(uploadedContractFilesTable.id, contractFile.id));
      await db.delete(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, distributor.id));
    }
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
      .send({ status: "preparing" })
      .expect(403);
    expect(response.body.error).toMatch(/permission/i);
  });

  it("creates an auditable inventory adjustment and exposes its movement", async () => {
    const response = await request(app)
      .post(`/api/admin/inventory/${productId}/adjust`)
      .set("Authorization", `Bearer ${superToken}`)
      .send({ operation: "increase", quantity: 7, unitCost: 24, reason: "Cycle count correction", idempotencyKey: "cycle-count-0001" })
      .expect(200);
    expect(response.body.item.stockQuantity).toBe(12);
    expect(response.body.item.averageCost).toBe(14);
    expect(response.body.item.inventoryValue).toBe(168);
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
        displayNameAr: "منتج مخزون جديد", displayNameEn: "New inventory product",
        invoiceNameAr: "منتج مخزون جديد", invoiceNameEn: "New inventory product",
        categoryId, price: 75, openingQuantity: 9, openingUnitCost: 30, reorderPoint: 4, targetStockQuantity: 18,
      })
      .expect(201);
    inventoryCreatedProductId = response.body.id;
    expect(response.body).toMatchObject({
      stockQuantity: 9, averageCost: 30, inventoryValue: 270,
      reorderPoint: 4, targetStockQuantity: 18, stockStatus: "in_stock",
    });
    const [movement] = await db.select().from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.productId, inventoryCreatedProductId)).limit(1);
    expect(movement).toMatchObject({
      movementType: "increase", quantityBefore: 0, quantityAfter: 9,
      sourceType: "product_creation", performedBy: superId,
    });
    const [entry] = await db.select().from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.sourceType, "product_creation"), eq(journalEntriesTable.sourceId, String(inventoryCreatedProductId))));
    expect(entry).toBeDefined();
    const lines = await db.select({
      code: accountingAccountsTable.code, debit: journalEntryLinesTable.debit, credit: journalEntryLinesTable.credit,
    }).from(journalEntryLinesTable)
      .innerJoin(accountingAccountsTable, eq(accountingAccountsTable.id, journalEntryLinesTable.accountId))
      .where(eq(journalEntryLinesTable.journalEntryId, entry.id));
    expect(lines).toEqual(expect.arrayContaining([
      { code: "1140", debit: "270.0000", credit: "0.0000" },
      { code: "3100", debit: "0.0000", credit: "270.0000" },
    ]));
  });

  it("does not post an opening journal for zero opening quantity", async () => {
    const sku = `INV-ZERO-${Date.now()}`;
    const response = await request(app).post("/api/admin/inventory")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ nameAr: "صفر", nameEn: "Zero", displayNameAr: "صفر", displayNameEn: "Zero", invoiceNameAr: "صفر", invoiceNameEn: "Zero", sku, categoryId, price: 10, openingQuantity: 0, openingUnitCost: 30, reorderPoint: 0, targetStockQuantity: 0 })
      .expect(201);
    const entries = await db.select().from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.sourceType, "product_creation"), eq(journalEntriesTable.sourceId, String(response.body.id))));
    expect(entries).toHaveLength(0);
    await db.delete(productsTable).where(eq(productsTable.id, response.body.id));
  });

  it("rolls back product creation when opening journal posting fails", async () => {
    const sku = `INV-ROLLBACK-${Date.now()}`;
    const beforeProducts = await db.select({ id: productsTable.id }).from(productsTable);
    const beforeBalances = await db.select({ id: inventoryBalancesTable.id }).from(inventoryBalancesTable);
    const beforeMovements = await db.select({ id: inventoryMovementsTable.id }).from(inventoryMovementsTable);
    const failure = vi.spyOn(accounting, "postJournalEntry").mockRejectedValueOnce(new Error("forced journal failure"));
    await request(app).post("/api/admin/inventory")
      .set("Authorization", `Bearer ${superToken}`)
      .send({ nameAr: "فشل", nameEn: "Rollback", displayNameAr: "فشل", displayNameEn: "Rollback", invoiceNameAr: "فشل", invoiceNameEn: "Rollback", sku, categoryId, price: 10, openingQuantity: 3, openingUnitCost: 30, reorderPoint: 0, targetStockQuantity: 0 })
      .expect(500);
    failure.mockRestore();
    expect(await db.select({ id: productsTable.id }).from(productsTable)).toHaveLength(beforeProducts.length);
    expect(await db.select({ id: inventoryBalancesTable.id }).from(inventoryBalancesTable)).toHaveLength(beforeBalances.length);
    expect(await db.select({ id: inventoryMovementsTable.id }).from(inventoryMovementsTable)).toHaveLength(beforeMovements.length);
    expect(await db.select().from(productsTable).where(eq(productsTable.sku, sku))).toHaveLength(0);
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