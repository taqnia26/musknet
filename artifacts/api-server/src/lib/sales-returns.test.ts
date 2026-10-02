import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  adminUsersTable, adminPermissionsTable, adminUserPermissionsTable, categoriesTable, companyOrderItemsTable,
  companyOrdersTable, customersTable, db, inventoryBalancesTable, inventoryLocationsTable, inventoryMovementsTable,
  invoicesTable, journalEntryAuditTable, journalEntriesTable, journalEntryLinesTable, operationEventsTable,
  orderItemsTable, ordersTable, productsTable, salesReturnLinesTable, salesReturnsTable, wholesaleDistributorsTable,
} from "@workspace/db";
import app from "../app";
import * as accounting from "./accounting";
import { createAdminSession, ensureAdminSeeded, hashAdminPassword } from "./admin-auth";
import { cancelCompanyInvoice, updateOrderAndIssueInvoice } from "./invoices";
import {
  cancelSalesReturn, completeSalesReturn, createSalesReturn, getReturnSource, getSalesReturn,
  updateSalesReturn, type ReturnInput,
} from "./sales-returns";
import { ensureDefaultInventoryLocation } from "./operations";

const stamp = Date.now();
const base = 1_650_000_000 + stamp % 40_000_000;
let actorId: number, actorToken: string, viewerId: number, viewerToken: string, categoryId: number, customerId: number;
let defaultLocationId: number, distributorId: number, companyOrderId: number, companyItemId: number, companyInvoiceId: number;
const productIds: number[] = [], orderIds: number[] = [], itemIds: number[][] = [], returnIds: number[] = [];
let originalDraft: Awaited<ReturnType<typeof createSalesReturn>>;
const input = (order = 0, quantity = 1): ReturnInput => ({
  sourceType: "individual", sourceId: orderIds[order], lines: [{ itemId: itemIds[order][0], quantity, condition: "new" }],
});
async function create(inputValue: ReturnInput) {
  const value = await createSalesReturn(inputValue, actorId);
  returnIds.push(value.id);
  return value;
}
async function productStock(id: number) {
  const [row] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  return row;
}

beforeAll(async () => {
  await ensureAdminSeeded();
  await accounting.ensureStandardAccountingChart();
  const [actor] = await db.insert(adminUsersTable).values({
    name: "Sales return test", email: `return-${stamp}@example.com`, passwordHash: await hashAdminPassword("fixture-password"),
    isSuperAdmin: true,
  }).returning();
  actorId = actor.id; actorToken = await createAdminSession(actorId);
  const [viewer] = await db.insert(adminUsersTable).values({
    name: "Return viewer", email: `return-view-${stamp}@example.com`, passwordHash: await hashAdminPassword("fixture-password"),
  }).returning();
  viewerId = viewer.id; viewerToken = await createAdminSession(viewerId);
  const permissions = await db.select().from(adminPermissionsTable).where(and(
    inArray(adminPermissionsTable.module, ["inventory", "orders"]), eq(adminPermissionsTable.action, "view"),
  ));
  await db.insert(adminUserPermissionsTable).values(permissions.map((p) => ({ adminUserId: viewerId, permissionId: p.id })));
  defaultLocationId = (await ensureDefaultInventoryLocation()).id;
  const [category] = await db.insert(categoriesTable).values({ id: base, nameAr: "اختبار المرتجعات", nameEn: "Return test", slug: `return-test-${stamp}` }).returning();
  categoryId = category.id;
  for (let i = 0; i < 2; i++) {
    const [product] = await db.insert(productsTable).values({
      id: base + 1 + i, nameAr: `منتج مرتجع ${i}`, nameEn: `Return product ${i}`, slug: `return-product-${stamp}-${i}`,
      price: 100, categoryId, stockQuantity: 10, averageCost: "20.0000",
    }).returning();
    productIds.push(product.id);
    await db.insert(inventoryBalancesTable).values({ productId: product.id, locationId: defaultLocationId, available: 10, averageCost: "20.0000" });
  }
  const [customer] = await db.insert(customersTable).values({ id: base + 3, phone: `9668${stamp}`, name: "Return fixture customer" }).returning();
  customerId = customer.id;
  for (let i = 0; i < 4; i++) {
    const [order] = await db.insert(ordersTable).values({
      id: base + 10 + i, userId: customerId, orderNumber: `RETURN-${stamp}-${i}`, status: "delivered",
      orderSource: "admin", subtotal: 800, shippingCost: 0, discount: 0, tax: 0, total: 800,
      address: "{}", shippingMethod: "fixture", paymentMethod: "cash",
    }).returning();
    orderIds.push(order.id); itemIds.push([]);
    for (let p = 0; p < 2; p++) {
      const cost = p === 0 ? "7.5000" : "11.2500";
      const [item] = await db.insert(orderItemsTable).values({
        orderId: order.id, productId: productIds[p], productName: `Source product ${p}`, quantity: 4,
        unitPrice: 100, totalPrice: 400, costSnapshot: cost,
      }).returning();
      itemIds[i].push(item.id);
      if (i !== 3) await db.insert(inventoryMovementsTable).values({
        productId: productIds[p], movementType: "decrease", quantityChange: -4, quantityBefore: 14, quantityAfter: 10,
        unitCost: cost, totalCost: (Number(cost) * 4).toFixed(4), sourceType: "order", sourceId: String(order.id),
        eventKey: `return-fixture:${order.id}:${p}`, performedBy: actorId,
      });
    }
    if (i !== 3) await accounting.postJournalEntry({
      entryDate: "2026-10-02", description: "Return fixture original COGS", createdBy: actorId,
      sourceType: "sale_cogs", sourceId: String(order.id),
      lines: [{ accountCode: "5100", debit: 75 }, { accountCode: "1140", credit: 75 }],
    });
  }
  const [distributor] = await db.insert(wholesaleDistributorsTable).values({
    companyName: `Return company ${stamp}`, commercialRegistrationNumber: "1010123456", taxNumber: "300000000000003",
    contactName: "Fixture", phone: `9669${stamp}`, email: `return-company-${stamp}@example.com`, address: "Fixture address",
  }).returning();
  distributorId = distributor.id;
  const [invoice] = await db.insert(invoicesTable).values({
    distributorId, sequenceNumber: 0, invoiceNumber: `RETURN-INV-${stamp}`, sellerName: "Fixture seller", issueDatetime: new Date(),
    sellerVatNumber: "300000000000003", subtotal: 400, vatAmount: 0, totalAmount: 400, qrCodeData: "fixture",
  }).returning();
  companyInvoiceId = invoice.id;
  const [companyOrder] = await db.insert(companyOrdersTable).values({
    distributorId, orderNumber: `RETURN-CO-${stamp}`, status: "approved", idempotencyKey: `return-company-${stamp}`,
    snapshotTerms: {}, snapshotTotals: {}, snapshotFingerprint: `return-company-${stamp}`, invoiceId: invoice.id,
  }).returning();
  companyOrderId = companyOrder.id;
  const [companyItem] = await db.insert(companyOrderItemsTable).values({
    companyOrderId, productId: productIds[1], productName: "Company source", productNameEn: "Company source",
    quantity: 4, unitPrice: "100", subtotal: "400", vatAmount: "0", totalAmount: "400",
  }).returning();
  companyItemId = companyItem.id;
  await db.insert(inventoryMovementsTable).values({
    productId: productIds[1], movementType: "decrease", quantityChange: -4, quantityBefore: 14, quantityAfter: 10,
    unitCost: "11.2500", totalCost: "45.0000", sourceType: "distributor_invoice", sourceId: String(invoice.id),
    eventKey: `return-company-fixture:${stamp}`, performedBy: actorId,
  });
  await accounting.postJournalEntry({ entryDate: "2026-10-02", description: "Company original COGS", createdBy: actorId,
    sourceType: "distributor_invoice_cogs", sourceId: String(invoice.id),
    lines: [{ accountCode: "5100", debit: 45 }, { accountCode: "1140", credit: 45 }],
  });
});

afterAll(async () => {
  vi.restoreAllMocks();
  if (returnIds.length) {
    await db.delete(salesReturnLinesTable).where(inArray(salesReturnLinesTable.returnId, returnIds));
    await db.delete(salesReturnsTable).where(inArray(salesReturnsTable.id, returnIds));
    await db.delete(operationEventsTable).where(and(eq(operationEventsTable.sourceType, "sales_return"),
      inArray(operationEventsTable.sourceId, returnIds.map(String))));
  }
  const journalSources = [
    ...(orderIds.length ? [and(eq(journalEntriesTable.sourceType, "sale_cogs"), inArray(journalEntriesTable.sourceId, orderIds.map(String)))] : []),
    ...(returnIds.length ? [and(eq(journalEntriesTable.sourceType, "sales_return"), inArray(journalEntriesTable.sourceId, returnIds.map(String)))] : []),
    ...(companyInvoiceId ? [and(eq(journalEntriesTable.sourceType, "distributor_invoice_cogs"), eq(journalEntriesTable.sourceId, String(companyInvoiceId)))] : []),
  ];
  if (journalSources.length) {
    const entries = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(or(...journalSources));
    if (entries.length) {
      await db.execute(sql`alter table journal_entry_lines disable trigger journal_entry_lines_immutable`);
      await db.execute(sql`alter table journal_entries disable trigger journal_entries_immutable`);
      try {
        await db.transaction(async (tx) => {
          const ids = entries.map((e) => e.id);
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
  if (companyOrderId) await db.delete(companyOrdersTable).where(eq(companyOrdersTable.id, companyOrderId));
  if (companyInvoiceId) await db.delete(invoicesTable).where(eq(invoicesTable.id, companyInvoiceId));
  if (distributorId) await db.delete(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, distributorId));
  if (orderIds.length) await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  if (customerId) await db.delete(customersTable).where(eq(customersTable.id, customerId));
  if (productIds.length) {
    await db.delete(inventoryMovementsTable).where(inArray(inventoryMovementsTable.productId, productIds));
    await db.delete(inventoryBalancesTable).where(inArray(inventoryBalancesTable.productId, productIds));
    await db.delete(productsTable).where(inArray(productsTable.id, productIds));
  }
  if (categoryId) await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
  if (actorId && viewerId) await db.delete(adminUsersTable).where(inArray(adminUsersTable.id, [actorId, viewerId]));
});

describe.sequential("sales returns preserve source costs and all-or-nothing effects", () => {
  it("creates and edits ONE multi-product draft without changing stock, rejects duplicates and stale edits", async () => {
    originalDraft = await create(input());
    const edited = await updateSalesReturn(originalDraft.id, { ...input(), reason: "Mixed conditions", lines: [
      { itemId: itemIds[0][0], quantity: 1, condition: "new" },
      { itemId: itemIds[0][0], quantity: 1, condition: "opened" },
      { itemId: itemIds[0][0], quantity: 1, condition: "damaged" },
      { itemId: itemIds[0][1], quantity: 2, condition: "new" },
    ] }, originalDraft.updatedAt);
    expect(edited.id).toBe(originalDraft.id); expect(edited.lines).toHaveLength(4);
    expect(edited.lines.map((l) => l.unitCost)).toEqual(["7.5000", "7.5000", "7.5000", "11.2500"]);
    await expect(updateSalesReturn(edited.id, input(), originalDraft.updatedAt)).rejects.toThrow(/تغير سجل/);
    await expect(create({ ...input(), lines: [{ ...input().lines[0] }, { ...input().lines[0] }] })).rejects.toThrow(/بند واحد/);
    await expect(create({ ...input(), lines: [{ ...input().lines[0], itemId: itemIds[1][0] }] })).rejects.toThrow(/لا ينتمي/);
    expect((await productStock(productIds[0])).stockQuantity).toBe(10);
    expect(await db.select().from(inventoryMovementsTable).where(and(
      eq(inventoryMovementsTable.sourceType, "sales_return_new"), eq(inventoryMovementsTable.sourceId, String(edited.id)),
    ))).toHaveLength(0);
    originalDraft = edited;
  });
  it("replays concurrent completion once, carries original costs, separates tester and damaged quantities, and retains invoice timing", async () => {
    const results = await Promise.all([
      completeSalesReturn(originalDraft.id, originalDraft.updatedAt, actorId),
      completeSalesReturn(originalDraft.id, originalDraft.updatedAt, actorId),
    ]);
    expect(results.every((r) => r.status === "completed")).toBe(true);
    expect((await productStock(productIds[0])).stockQuantity).toBe(11);
    expect((await productStock(productIds[0])).averageCost).toBe("18.8636");
    expect((await productStock(productIds[1])).stockQuantity).toBe(12);
    const [openedLocation] = await db.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.code, "B2B_USED_RETURN"));
    const [tester] = await db.select().from(inventoryBalancesTable).where(and(
      eq(inventoryBalancesTable.productId, productIds[0]), eq(inventoryBalancesTable.locationId, openedLocation.id),
    ));
    expect(tester.available).toBe(1); expect(tester.averageCost).toBe("7.5000");
    const movements = await db.select().from(inventoryMovementsTable).where(and(
      eq(inventoryMovementsTable.sourceId, String(originalDraft.id)), sql`${inventoryMovementsTable.sourceType} like 'sales_return_%'`,
    ));
    expect(movements).toHaveLength(4);
    expect(movements.find((m) => m.sourceType === "sales_return_damaged")?.quantityChange).toBe(0);
    const entries = await db.select().from(journalEntriesTable).where(and(eq(journalEntriesTable.sourceType, "sales_return"), eq(journalEntriesTable.sourceId, String(originalDraft.id))));
    expect(entries).toHaveLength(1);
    const journalLines = await db.select().from(journalEntryLinesTable).where(eq(journalEntryLinesTable.journalEntryId, entries[0].id));
    expect(journalLines.reduce((sum, l) => sum + Number(l.debit), 0)).toBe(37.5);
    expect(await db.select().from(operationEventsTable).where(eq(operationEventsTable.eventKey, `sales-return:${originalDraft.id}`))).toHaveLength(1);
    expect(await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, orderIds[0]))).toHaveLength(0);
    await expect(updateSalesReturn(originalDraft.id, input(), results[0].updatedAt)).rejects.toThrow(/لا يمكن تعديل/);
    await expect(cancelSalesReturn(originalDraft.id, results[0].updatedAt)).rejects.toThrow(/لا يمكن إلغاء/);
    await expect(updateOrderAndIssueInvoice(orderIds[0], { status: "cancelled" }, {}, actorId)).rejects.toThrow(/completed returns/);
    await expect(completeSalesReturn(originalDraft.id, results[0].updatedAt, actorId)).rejects.toThrow(/لا تطابق/);
  });
  it("serializes DIFFERENT partial returns by original order, so their combined quantity cannot exceed sale", async () => {
    const first = await create(input(1, 3)), second = await create(input(1, 3));
    const results = await Promise.allSettled([
      completeSalesReturn(first.id, first.updatedAt, actorId), completeSalesReturn(second.id, second.updatedAt, actorId),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const source = await getReturnSource(db, "individual", orderIds[1]);
    expect(source.items[0].returnedQuantity).toBe(3); expect(source.items[0].remainingQuantity).toBe(1);
  });
  it("rolls every stock and journal effect back when posting fails, and cancels only a retained draft", async () => {
    const draft = await create(input(2));
    const before = await productStock(productIds[0]);
    const spy = vi.spyOn(accounting, "postJournalEntry").mockRejectedValueOnce(new Error("forced ledger failure"));
    await expect(completeSalesReturn(draft.id, draft.updatedAt, actorId)).rejects.toThrow("forced ledger failure");
    spy.mockRestore();
    expect((await getSalesReturn(draft.id)).status).toBe("draft");
    expect((await productStock(productIds[0])).stockQuantity).toBe(before.stockQuantity);
    expect(await db.select().from(operationEventsTable).where(eq(operationEventsTable.eventKey, `sales-return:${draft.id}`))).toHaveLength(0);
    const cancelled = await cancelSalesReturn(draft.id, draft.updatedAt);
    expect(cancelled.status).toBe("cancelled"); expect(cancelled.lines).toHaveLength(1);
    await expect(completeSalesReturn(draft.id, cancelled.updatedAt, actorId)).rejects.toThrow(/لا يمكن اعتماد/);
  });
  it("refuses historical costs without exit evidence instead of using the current average", async () => {
    const source = await getReturnSource(db, "individual", orderIds[3]);
    expect(source.eligible).toBe(false); expect(source.items.every((l) => l.unitCost === null)).toBe(true);
    await expect(create(input(3))).rejects.toThrow(/غير موثقة/);
    // Missing provenance on an unselected line must not block a documented partial return.
    await db.insert(inventoryMovementsTable).values({
      productId: productIds[0], movementType: "decrease", quantityChange: -4, quantityBefore: 14, quantityAfter: 10,
      unitCost: "7.5000", totalCost: "30.0000", sourceType: "order", sourceId: String(orderIds[3]),
      eventKey: `return-partial-proof:${stamp}`, performedBy: actorId,
    });
    await accounting.postJournalEntry({
      entryDate: "2026-10-02", description: "Partial source documented original COGS", createdBy: actorId,
      sourceType: "sale_cogs", sourceId: String(orderIds[3]),
      lines: [{ accountCode: "5100", debit: 30 }, { accountCode: "1140", credit: 30 }],
    });
    const knownOnly = await create(input(3));
    expect(knownOnly.lines).toHaveLength(1); expect(knownOnly.lines[0].unitCost).toBe("7.5000");
    await expect(create({ ...input(3), lines: [{ itemId: itemIds[3][1], quantity: 1, condition: "new" }] })).rejects.toThrow(/غير موثقة/);
  });
  it("returns a company source into the SAME tester pool with original invoice cost, and prevents whole-invoice cancellation", async () => {
    const draft = await create({ sourceType: "company", sourceId: companyOrderId, lines: [{ itemId: companyItemId, quantity: 2, condition: "opened" }] });
    const before = await productStock(productIds[1]);
    const result = await completeSalesReturn(draft.id, draft.updatedAt, actorId);
    expect(result.lines[0].unitCost).toBe("11.2500");
    expect((await productStock(productIds[1])).stockQuantity).toBe(before.stockQuantity);
    expect(await db.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.code, "B2B_USED_RETURN"))).toHaveLength(1);
    await expect(cancelCompanyInvoice(companyInvoiceId, "Fixture cancellation explanation", actorId)).rejects.toThrow(/completed returns/);
  });
  it("validates API envelopes/revisions and enforces view versus edit and source permissions", async () => {
    const auth = { Authorization: `Bearer ${actorToken}` }, view = { Authorization: `Bearer ${viewerToken}` };
    const url = "/api/admin/sales-returns";
    await request(app).get(url).expect(401);
    await request(app).get(url).set(view).expect(200);
    const exactSource = await request(app).get(`${url}/sources`).query({ sourceType: "individual", sourceId: orderIds[2] }).set(view).expect(200);
    expect(exactSource.body).toHaveLength(1); expect(exactSource.body[0].sourceId).toBe(orderIds[2]);
    await request(app).get(`${url}/sources`).query({ sourceType: "company" }).set(view).expect(403);
    await request(app).post(url).set(view).send(input(2)).expect(403);
    const created = await request(app).post(url).set(auth).send(input(2)).expect(201);
    returnIds.push(created.body.id);
    expect(created.body.lines[0]).toMatchObject({ itemId: itemIds[2][0], condition: "new", unitCost: "7.5000" });
    const changed = await request(app).put(`${url}/${created.body.id}`).set(auth)
      .send({ ...input(2), expectedUpdatedAt: created.body.updatedAt, reason: "API edited draft" }).expect(200);
    expect(changed.body.id).toBe(created.body.id);
    await request(app).put(`${url}/${created.body.id}`).set(auth)
      .send({ ...input(2), expectedUpdatedAt: created.body.updatedAt }).expect(409);
    await request(app).post(`${url}/${created.body.id}/complete`).set(view)
      .send({ expectedUpdatedAt: changed.body.updatedAt }).expect(403);
    const completed = await request(app).post(`${url}/${created.body.id}/complete`).set(auth)
      .send({ expectedUpdatedAt: changed.body.updatedAt }).expect(200);
    expect(completed.body.status).toBe("completed");
    const read = await request(app).get(`${url}/${created.body.id}`).set(view).expect(200);
    expect(read.body.lines[0].quantity).toBe(1);
    await request(app).post(url).set(auth).send({ ...input(2), lines: [{ ...input(2).lines[0], quantity: 0 }] }).expect(400);
  });
});