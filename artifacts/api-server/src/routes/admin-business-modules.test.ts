import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  adminPermissionsTable, adminSessionsTable, adminUserPermissionsTable, adminUsersTable,
  attendanceRecordsTable, categoriesTable, customersTable, db, employeesTable,
  exhibitionProductsTable, exhibitionsTable, expensesTable, manufacturingBatchesTable,
  invoicesTable, invoiceItemsTable, inventoryBalancesTable, inventoryMovementsTable,
  journalEntriesTable, journalEntryLinesTable, journalEntryAuditTable, operationEventsTable, receivablePaymentsTable,
  ordersTable, payrollRecordsTable, productsTable,
} from "@workspace/db";
import app from "../app";
import { createAdminSession, hashAdminPassword } from "../lib/admin-auth";

const suffix = Date.now();
const base = 1_700_000_000 + (suffix % 50_000_000);
let superId: number;
let viewerId: number;
let invoiceEditorId: number;
let superToken: string;
let viewerToken: string;
let invoiceEditorToken: string;
let employeeId: number;
let productId: number;
let exhibitionId: number;
let exhibitionInvoiceId: number;
const exhibitionInvoiceIds: number[] = [];
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
  [({ id: invoiceEditorId } = (await db.insert(adminUsersTable).values({
    id: base + 6, email: `exhibition-invoice-editor-${suffix}@example.com`, name: "Invoice Editor",
    passwordHash: await hashAdminPassword("business-test-password"),
  }).returning())[0])];
  await db.insert(adminPermissionsTable).values(["view", "edit"].map(action => ({ module: "invoices", action }))).onConflictDoNothing();
  const invoicePermissions = await db.select().from(adminPermissionsTable).where(eq(adminPermissionsTable.module, "invoices"));
  await db.insert(adminUserPermissionsTable).values(invoicePermissions.filter(permission => permission.action === "view" || permission.action === "edit")
    .map(permission => ({ adminUserId: invoiceEditorId, permissionId: permission.id })));
  const viewPermissions = await db.select().from(adminPermissionsTable)
    .where(inArray(adminPermissionsTable.module, ["hr", "finance", "manufacturing", "exhibitions"]));
  await db.insert(adminUserPermissionsTable).values(viewPermissions
    .map((permission) => ({ adminUserId: superId, permissionId: permission.id })));
  await db.insert(adminUserPermissionsTable).values(viewPermissions
    .filter((permission) => permission.action === "view")
    .map((permission) => ({ adminUserId: viewerId, permissionId: permission.id })));
  superToken = await createAdminSession(superId);
  viewerToken = await createAdminSession(viewerId);
  invoiceEditorToken = await createAdminSession(invoiceEditorId);
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
  if (exhibitionInvoiceIds.length) {
    const entries = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable)
      .where(and(inArray(journalEntriesTable.sourceType, ["exhibition_invoice", "exhibition_invoice_cogs"]),
        inArray(journalEntriesTable.sourceId, exhibitionInvoiceIds.map(String))));
    if (entries.length) {
      const ids = entries.map(entry => entry.id);
      await db.execute(sql`alter table journal_entry_lines disable trigger journal_entry_lines_immutable`);
      await db.execute(sql`alter table journal_entries disable trigger journal_entries_immutable`);
      try {
        await db.transaction(async tx => {
          await tx.delete(journalEntryAuditTable).where(inArray(journalEntryAuditTable.journalEntryId, ids));
          await tx.delete(journalEntryLinesTable).where(inArray(journalEntryLinesTable.journalEntryId, ids));
          await tx.delete(journalEntriesTable).where(inArray(journalEntriesTable.id, ids));
        });
      } finally {
        await db.execute(sql`alter table journal_entry_lines enable trigger journal_entry_lines_immutable`);
        await db.execute(sql`alter table journal_entries enable trigger journal_entries_immutable`);
      }
    }
  }
  for (const id of exhibitionInvoiceIds) {
    await db.delete(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, id));
    await db.delete(operationEventsTable).where(and(eq(operationEventsTable.sourceType, "exhibition_invoice"), eq(operationEventsTable.sourceId, String(id))));
    await db.delete(inventoryMovementsTable).where(and(eq(inventoryMovementsTable.sourceType, "exhibition_invoice"), eq(inventoryMovementsTable.sourceId, String(id))));
    await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));
    await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
  }
  if (exhibitionId) await db.delete(exhibitionProductsTable).where(eq(exhibitionProductsTable.exhibitionId, exhibitionId));
  if (exhibitionId) await db.delete(exhibitionsTable).where(eq(exhibitionsTable.id, exhibitionId));
  await db.delete(manufacturingBatchesTable).where(eq(manufacturingBatchesTable.productId, productId));
  if (employeeId) {
    await db.delete(attendanceRecordsTable).where(eq(attendanceRecordsTable.employeeId, employeeId));
    await db.delete(payrollRecordsTable).where(eq(payrollRecordsTable.employeeId, employeeId));
    await db.delete(employeesTable).where(eq(employeesTable.id, employeeId));
  }
  if (expenseId) await db.delete(expensesTable).where(eq(expensesTable.id, expenseId));
  await db.delete(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, productId));
  await db.delete(ordersTable).where(eq(ordersTable.id, base + 5));
  await db.delete(customersTable).where(eq(customersTable.id, base + 4));
  await db.delete(productsTable).where(eq(productsTable.id, productId));
  await db.delete(categoriesTable).where(eq(categoriesTable.id, base + 2));
  await db.delete(adminSessionsTable).where(inArray(adminSessionsTable.adminUserId, [superId, viewerId, invoiceEditorId]));
  // The super-admin remains as immutable accounting audit attribution for the
  // expense posted by this suite; the read-only viewer has no such references.
  await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, [viewerId, invoiceEditorId]));
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

  it("rejects non-positive employee salaries on create and patch", async () => {
    for (const salary of [0, -1]) {
      const response = await request(app).post("/api/admin/hr/employees").set(auth(superToken)).send({
        name: "Invalid Salary Employee", nationalId: `N-${suffix}-${salary}`, phone: "0500000000",
        position: "Maker", department: "Production", salary, hireDate: "2025-01-01",
      }).expect(400);
      expect(response.body.error).toContain("greater than zero");
    }

    await request(app).patch(`/api/admin/hr/employees/${employeeId}`).set(auth(superToken))
      .send({ salary: 0 }).expect(400);
    const validPatch = await request(app).patch(`/api/admin/hr/employees/${employeeId}`).set(auth(superToken))
      .send({ salary: 5001 }).expect(200);
    expect(validPatch.body.salary).toBe(5001);
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
    expect(allocation.body).toMatchObject({ productId, productNameEn: "Business product", productPrice: 250, quantitySold: 2 });
    await request(app).post("/api/admin/exhibitions").set(auth(superToken))
      .send({ name: "Bad", location: "X", startDate: "2025-01-01", endDate: "2025-01-02", budget: 0, status: "invalid" }).expect(400);
    await request(app).post("/api/admin/exhibitions").set(auth(viewerToken)).send({}).expect(403);
  });

  it("issues exhibition invoices exactly once, excluding previously sold quantities and other channels", async () => {
    await db.update(productsTable).set({ stockQuantity: 8, averageCost: "20.0000" }).where(eq(productsTable.id, productId));
    const payload = {
      creationKey: `exhibition-${suffix}-once`, exhibitionId, saleDate: "2025-05-02",
      buyerName: "Visitor", buyerAddress: "Riyadh", paymentMethod: "cash",
      items: [{ productId, quantity: 2, unitPrice: 100 }],
    };
    const endpoint = "/api/admin/invoices/exhibitions";
    await request(app).get("/api/admin/exhibitions").set(auth(invoiceEditorToken)).expect(200);
    const options = await request(app).get(`/api/admin/exhibitions/${exhibitionId}/products`).set(auth(invoiceEditorToken)).expect(200);
    expect(options.body[0].productPrice).toBe(250);
    await request(app).patch(`/api/admin/exhibitions/${exhibitionId}`).set(auth(invoiceEditorToken)).send({ name: "Not allowed" }).expect(403);
    await request(app).post(endpoint).send(payload).expect(401);
    await request(app).post(endpoint).set(auth(viewerToken)).send(payload).expect(403);
    await request(app).get("/api/admin/invoices?channel=exhibitions").set(auth(viewerToken)).expect(403);
    await request(app).post(endpoint).set(auth(superToken)).send({ ...payload, items: [{ ...payload.items[0], quantity: 4 }] }).expect(409);
    const created = await request(app).post(endpoint).set(auth(superToken)).send(payload).expect(201);
    exhibitionInvoiceId = created.body.id;
    exhibitionInvoiceIds.push(exhibitionInvoiceId);
    expect(created.body).toMatchObject({ exhibitionId, exhibitionName: "Test Exhibition", distributorId: null, orderId: null,
      subtotal: 200, vatAmount: 30, totalAmount: 230, paidAmount: 230, outstandingAmount: 0, paymentStatus: "paid" });
    expect(created.body.qrCodeData).toBeTruthy();
    expect(created.body.items).toHaveLength(1);
    const again = await request(app).post(endpoint).set(auth(superToken)).send(payload).expect(201);
    expect(again.body.id).toBe(exhibitionInvoiceId);
    await request(app).post(endpoint).set(auth(superToken)).send({ ...payload, buyerName: "Another buyer" }).expect(409);
    await request(app).post(endpoint).set(auth(superToken)).send({ ...payload, creationKey: `${payload.creationKey}-excess`, items: [{ productId, quantity: 2, unitPrice: 100 }] }).expect(409);
    await request(app).post(endpoint).set(auth(superToken)).send({ ...payload, creationKey: `${payload.creationKey}-stock`, items: [{ productId, quantity: 1, unitPrice: 0 }] }).expect(400);
    const exhibitionList = await request(app).get("/api/admin/invoices?channel=exhibitions&search=Test%20Exhibition").set(auth(superToken)).expect(200);
    expect(exhibitionList.body.some((i: { id: number }) => i.id === exhibitionInvoiceId)).toBe(true);
    for (const channel of ["companies", "online"]) {
      const list = await request(app).get(`/api/admin/invoices?channel=${channel}`).set(auth(superToken)).expect(200);
      expect(list.body.some((i: { id: number }) => i.id === exhibitionInvoiceId)).toBe(false);
    }
    await request(app).get(`/api/admin/invoices/${exhibitionInvoiceId}/qr`).set(auth(superToken)).expect(200);
    await request(app).delete(`/api/admin/exhibitions/${exhibitionId}`).set(auth(superToken)).expect(409);
    const [allocation] = await db.select().from(exhibitionProductsTable).where(eq(exhibitionProductsTable.exhibitionId, exhibitionId));
    expect(allocation.quantitySold).toBe(4); // Two legacy sales remain un-invoiced.
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    expect(product.stockQuantity).toBe(6);
    const balances = await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, productId));
    expect(balances.reduce((sum, row) => sum + row.available + row.reserved + row.incoming, 0)).toBe(6);
    const movements = await db.select().from(inventoryMovementsTable).where(and(eq(inventoryMovementsTable.sourceType, "exhibition_invoice"), eq(inventoryMovementsTable.sourceId, String(exhibitionInvoiceId))));
    expect(movements).toHaveLength(1);
    expect(movements[0].quantityChange).toBe(-2);
    const entries = await db.select().from(journalEntriesTable).where(inArray(journalEntriesTable.sourceType, ["exhibition_invoice", "exhibition_invoice_cogs"]));
    const ownEntries = entries.filter(e => e.sourceId === String(exhibitionInvoiceId));
    expect(ownEntries).toHaveLength(2);
    const journalLines = await db.select().from(journalEntryLinesTable).where(inArray(journalEntryLinesTable.journalEntryId, ownEntries.map(e => e.id)));
    expect(journalLines.reduce((sum, row) => sum + Number(row.debit) - Number(row.credit), 0)).toBeCloseTo(0);
    expect(journalLines.reduce((sum, row) => sum + Number(row.debit), 0)).toBeCloseTo(270);
    await db.update(productsTable).set({ stockQuantity: 0 }).where(eq(productsTable.id, productId));
    await request(app).post(endpoint).set(auth(superToken))
      .send({ ...payload, creationKey: `${payload.creationKey}-no-stock`, items: [{ productId, quantity: 1, unitPrice: 100 }] }).expect(409);
    await db.update(productsTable).set({ stockQuantity: 6 }).where(eq(productsTable.id, productId));
    const bankInvoice = await request(app).post(endpoint).set(auth(superToken))
      .send({ ...payload, creationKey: `${payload.creationKey}-bank`, paymentMethod: "bank_transfer",
        items: [{ productId, quantity: 1, unitPrice: 100 }] }).expect(201);
    exhibitionInvoiceIds.push(bankInvoice.body.id);
    expect(bankInvoice.body.payments[0].paymentMethod).toBe("bank_transfer");
    const [bankJournal] = await db.select().from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.sourceType, "exhibition_invoice"), eq(journalEntriesTable.sourceId, String(bankInvoice.body.id))));
    const bankLines = await db.select().from(journalEntryLinesTable).where(eq(journalEntryLinesTable.journalEntryId, bankJournal.id));
    expect(bankLines.reduce((sum, row) => sum + Number(row.debit) - Number(row.credit), 0)).toBeCloseTo(0);
    expect(bankLines.find(row => Number(row.debit) === 115)).toBeTruthy();
  });
});