import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  adminPermissionsTable, adminSessionsTable, adminUserPermissionsTable, adminUsersTable,
  attendanceRecordsTable, categoriesTable, customersTable, db, employeesTable,
  exhibitionProductsTable, exhibitionsTable, expensesTable, manufacturingBatchesTable,
  ordersTable, payrollRecordsTable, productsTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

const suffix = Date.now();
const base = 1_700_000_000 + (suffix % 50_000_000);
let superId: number;
let viewerId: number;
let superToken: string;
let viewerToken: string;
let employeeId: number;
let productId: number;
let exhibitionId: number;
let expenseId: number;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `business-super-${suffix}@example.com`;
  process.env.ADMIN_PASSWORD = "business-test-password";
  await db.insert(adminPermissionsTable).values(
    ["hr", "finance", "manufacturing", "exhibitions"].flatMap((module) =>
      ["view", "edit", "delete"].map((action) => ({ module, action }))),
  ).onConflictDoNothing();
  [({ id: superId } = (await db.insert(adminUsersTable).values({
    id: base, email: `business-super-${suffix}@example.com`, name: "Business Super",
    passwordHash: await hashAdminPassword("business-test-password"),
  }).returning())[0])];
  [({ id: viewerId } = (await db.insert(adminUsersTable).values({
    id: base + 1, email: `business-viewer-${suffix}@example.com`, name: "Business Viewer",
    passwordHash: await hashAdminPassword("business-test-password"),
  }).returning())[0])];
  const viewPermissions = await db.select().from(adminPermissionsTable)
    .where(inArray(adminPermissionsTable.module, ["hr", "finance", "manufacturing", "exhibitions"]));
  await db.insert(adminUserPermissionsTable).values(viewPermissions
    .map((permission) => ({ adminUserId: superId, permissionId: permission.id })));
  await db.insert(adminUserPermissionsTable).values(viewPermissions
    .filter((permission) => permission.action === "view")
    .map((permission) => ({ adminUserId: viewerId, permissionId: permission.id })));
  superToken = await createAdminSession(superId);
  viewerToken = await createAdminSession(viewerId);
  await db.insert(categoriesTable).values({
    id: base + 2, nameAr: "تصنيف أعمال", nameEn: "Business category", slug: `business-category-${suffix}`,
  });
  const [product] = await db.insert(productsTable).values({
    id: base + 3, nameAr: "منتج أعمال", nameEn: "Business product", slug: `business-product-${suffix}`,
    price: 250, categoryId: base + 2,
  }).returning();
  productId = product.id;
});

afterAll(async () => {
  if (exhibitionId) await db.delete(exhibitionProductsTable).where(eq(exhibitionProductsTable.exhibitionId, exhibitionId));
  if (exhibitionId) await db.delete(exhibitionsTable).where(eq(exhibitionsTable.id, exhibitionId));
  await db.delete(manufacturingBatchesTable).where(eq(manufacturingBatchesTable.productId, productId));
  if (employeeId) {
    await db.delete(attendanceRecordsTable).where(eq(attendanceRecordsTable.employeeId, employeeId));
    await db.delete(payrollRecordsTable).where(eq(payrollRecordsTable.employeeId, employeeId));
    await db.delete(employeesTable).where(eq(employeesTable.id, employeeId));
  }
  if (expenseId) await db.delete(expensesTable).where(eq(expensesTable.id, expenseId));
  await db.delete(ordersTable).where(eq(ordersTable.id, base + 5));
  await db.delete(customersTable).where(eq(customersTable.id, base + 4));
  await db.delete(productsTable).where(eq(productsTable.id, productId));
  await db.delete(categoriesTable).where(eq(categoriesTable.id, base + 2));
  await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId, [superId, viewerId]));
  await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, [superId, viewerId]));
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
});

describe.sequential("admin business modules", () => {
  it("creates HR records and computes payroll net salary", async () => {
    const employee = await request(app).post("/api/admin/hr/employees").set(auth(superToken)).send({
      name: "Test Employee", nationalId: `N-${suffix}`, phone: "0500000000", position: "Maker",
      department: "Production", salary: 5000, hireDate: "2025-01-01",
    }).expect(201);
    employeeId = employee.body.id;
    await request(app).post("/api/admin/hr/attendance").set(auth(superToken)).send({
      employeeId, date: "2025-02-01", status: "present", checkInTime: "08:00",
    }).expect(201);
    const payroll = await request(app).post("/api/admin/hr/payroll").set(auth(superToken)).send({
      employeeId, month: 2, year: 2025, baseSalary: 5000, deductions: 250, bonuses: 400,
      paymentStatus: "pending",
    }).expect(201);
    expect(payroll.body.netSalary).toBe(5150);
  });

  it("enforces HR enum validation and edit permission", async () => {
    await request(app).post("/api/admin/hr/attendance").set(auth(superToken))
      .send({ employeeId, date: "2025-02-02", status: "unknown" }).expect(400);
    await request(app).post("/api/admin/hr/employees").set(auth(viewerToken))
      .send({}).expect(403);
  });

  it("creates expenses and summarizes paid order revenue inclusively", async () => {
    await db.insert(customersTable).values({ id: base + 4, phone: `966${String(suffix).slice(-9)}`, name: "Finance Customer" });
    await db.insert(ordersTable).values({
      id: base + 5, userId: base + 4, orderNumber: `BUSINESS-${suffix}`, subtotal: 300,
      shippingCost: 0, discount: 0, tax: 0, total: 300, paymentStatus: "paid",
      address: "{}", shippingMethod: "standard", paymentMethod: "cod",
      createdAt: new Date("2199-03-15T10:00:00.000Z"),
    });
    const expense = await request(app).post("/api/admin/finance/expenses").set(auth(superToken)).send({
      category: "utilities", amount: 80, description: "Test utility", expenseDate: "2199-03-15",
    }).expect(201);
    expenseId = expense.body.id;
    expect(expense.body.createdBy).toBe(superId);
    const summary = await request(app).get("/api/admin/finance/reports/summary?from=2199-03-15&to=2199-03-15")
      .set(auth(superToken)).expect(200);
    expect(summary.body).toMatchObject({ revenue: 300, expenses: 80, netProfit: 220, paidOrderCount: 1, averageOrderValue: 300 });
  });

  it("enforces finance enum validation and edit permission", async () => {
    await request(app).post("/api/admin/finance/expenses").set(auth(superToken))
      .send({ category: "invalid", amount: 1, description: "x", expenseDate: "2025-01-01" }).expect(400);
    await request(app).post("/api/admin/finance/expenses").set(auth(viewerToken)).send({}).expect(403);
  });

  it("creates and validates manufacturing batches", async () => {
    const batch = await request(app).post("/api/admin/manufacturing/batches").set(auth(superToken)).send({
      batchNumber: `BATCH-${suffix}`, productId, quantityProduced: 10, productionDate: "2025-04-01",
      expiryDate: "2026-04-01", costPerUnit: 20, status: "quality_check",
    }).expect(201);
    expect(batch.body.productId).toBe(productId);
    await request(app).post("/api/admin/manufacturing/batches").set(auth(superToken))
      .send({ ...batch.body, id: undefined, batchNumber: `BAD-${suffix}`, status: "invalid" }).expect(400);
    await request(app).post("/api/admin/manufacturing/batches").set(auth(viewerToken)).send({}).expect(403);
  });

  it("creates exhibitions and validates allocations", async () => {
    const exhibition = await request(app).post("/api/admin/exhibitions").set(auth(superToken)).send({
      name: "Test Exhibition", location: "Riyadh", startDate: "2025-05-01", endDate: "2025-05-03",
      budget: 1000, status: "planned",
    }).expect(201);
    exhibitionId = exhibition.body.id;
    await request(app).post(`/api/admin/exhibitions/${exhibitionId}/products`).set(auth(superToken))
      .send({ productId, quantityAllocated: 5, quantitySold: 6 }).expect(400);
    const allocation = await request(app).post(`/api/admin/exhibitions/${exhibitionId}/products`).set(auth(superToken))
      .send({ productId, quantityAllocated: 5, quantitySold: 2 }).expect(201);
    expect(allocation.body).toMatchObject({ productId, productNameEn: "Business product", quantitySold: 2 });
    await request(app).post("/api/admin/exhibitions").set(auth(superToken))
      .send({ name: "Bad", location: "X", startDate: "2025-01-01", endDate: "2025-01-02", budget: 0, status: "invalid" }).expect(400);
    await request(app).post("/api/admin/exhibitions").set(auth(viewerToken)).send({}).expect(403);
  });
});