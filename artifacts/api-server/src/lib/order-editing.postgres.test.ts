import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool, adminUsersTable, customersTable, categoriesTable, productsTable, ordersTable, orderItemsTable, orderEditAuditsTable } from "@workspace/db";
import { ensureStandardAccountingChart } from "./accounting";
import { postFulfillmentCogs, updateOrderAndIssueInvoice } from "./invoices";
import { getOrderEditor, saveOrderEditor } from "./order-editing";
import * as Api from "@workspace/api-zod";
import { companyOrdersTable, companyOrderItemsTable, wholesaleDistributorsTable, journalEntriesTable, inventoryMovementsTable, shipmentsTable, invoicesTable } from "@workspace/db";
import { getCompanyOrderEditor, saveCompanyOrderEditor } from "./company-order-editing";
import { createReviewSnapshot } from "./distributor-portal";
import { getReturnSource, createSalesReturn, completeSalesReturn } from "./sales-returns";

describe.runIf(process.env.INDIVIDUAL_INVOICE_POSTGRES_E2E === "true")("order editor isolated database", () => {
  let actorId: number, productId: number, orderId: number;
  beforeAll(async () => {
    const identity = await pool.query("select current_database() as name, current_setting('data_directory') as dir");
    expect(identity.rows[0].name).toBe(process.env.INDIVIDUAL_INVOICE_E2E_DATABASE);
    expect(identity.rows[0].dir).toBe(process.env.INDIVIDUAL_INVOICE_E2E_CLUSTER_DIR);
    expect(identity.rows[0].name).toMatch(/^individual_invoice_e2e_/);
    const key = randomUUID();
    const [actor] = await db.insert(adminUsersTable).values({ name: "Editor test", email: `${key}@test.invalid`, passwordHash: "not-a-login", isSuperAdmin: true }).returning();
    actorId = actor.id;
    const [customer] = await db.insert(customersTable).values({ name: "Original", phone: "+966500000001" }).returning();
    const [category] = await db.insert(categoriesTable).values({ nameAr: "اختبار", nameEn: "Test", slug: key }).returning();
    const [product] = await db.insert(productsTable).values({ nameAr: "اختبار", nameEn: "Test", slug: key, categoryId: category.id, price: 115, stockQuantity: 8, averageCost: "4.0000" }).returning();
    productId = product.id;
    const [order] = await db.insert(ordersTable).values({ userId: customer.id, orderNumber: "L-TEST", orderSource: "phone",
      fulfillmentMethod: "delivery", subtotal: 230, total: 250, tax: 32.61, discount: 0, shippingCost: 20,
      shippingMethod: "admin-standard", paymentMethod: "cash", address: JSON.stringify({ country: "SA", nationalAddressShortCode: "ABCD1234" }) }).returning();
    orderId = order.id;
    await db.insert(orderItemsTable).values({ orderId, productId, productName: "Test", quantity: 2, unitPrice: 115, totalPrice: 230, costSnapshot: "4.0000" });
    await ensureStandardAccountingChart();
    await db.transaction(tx => postFulfillmentCogs(tx, orderId, actorId, order.orderNumber, "2026-10-03"));
  });
  afterAll(async () => { await pool.end(); });
  async function freshOrder(originalCost = "4.0000") {
    const [baseOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    const [baseProduct] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    const [p] = await db.insert(productsTable).values({ categoryId: baseProduct.categoryId,
      nameAr: "Lifecycle test", nameEn: "Lifecycle test", slug: randomUUID(), price: 115, stockQuantity: 8, averageCost: "10.0000" }).returning();
    const [o] = await db.insert(ordersTable).values({ userId: baseOrder.userId, orderNumber: `L-${randomUUID()}`,
      orderSource: "phone", fulfillmentMethod: "delivery", subtotal: 230, total: 250, tax: 32.61, discount: 0,
      shippingCost: 20, shippingMethod: "admin-standard", paymentMethod: "cash",
      address: JSON.stringify({ country: "SA", nationalAddressShortCode: "ABCD1234", taxTreatment: "domestic" }) }).returning();
    await db.insert(orderItemsTable).values({ orderId: o.id, productId: p.id, productName: p.nameAr, quantity: 2, unitPrice: 115, totalPrice: 230, costSnapshot: originalCost });
    await db.insert(inventoryMovementsTable).values({ productId: p.id, movementType: "decrease", quantityChange: -2,
      quantityBefore: 10, quantityAfter: 8, unitCost: originalCost, totalCost: (2 * Number(originalCost)).toFixed(4), sourceType: "order",
      sourceId: String(o.id), eventKey: `sale-fulfillment:${o.id}:${p.id}`, performedBy: actorId });
    await db.insert(shipmentsTable).values({ channel: "online", orderId: o.id, destinationCity: "", status: "pending" });
    await db.transaction(tx => postFulfillmentCogs(tx, o.id, actorId, o.orderNumber, "2026-10-03"));
    return { order: o, product: p };
  }
  const seller = { VAT_SELLER_LEGAL_NAME: "Test seller", VAT_REGISTRATION_NUMBER: "300000000000003" };
  it("can edit again after a zero-cost original order acquires audited positive costs", async () => {
    const { order, product } = await freshOrder("0.0000");
    const state = await getOrderEditor(order.id);
    await saveOrderEditor(order.id, Api.AdminSaveOrderEditorBody.parse({ ...state.values, requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: 4, unitPrice: 115 }] }), actorId);
    const revised = await getOrderEditor(order.id);
    await saveOrderEditor(order.id, Api.AdminSaveOrderEditorBody.parse({ ...revised.values, requestKey: randomUUID(), adminNotes: "Subsequent edit" }), actorId);
    await updateOrderAndIssueInvoice(order.id, { status: "cancelled" }, seller, actorId);
    expect((await db.select().from(productsTable).where(eq(productsTable.id, product.id)))[0].stockQuantity).toBe(10);
  });
  it("delivery to foreign-address pickup remains domestic VAT and can be cancelled locally", async () => {
    const { order } = await freshOrder();
    const state = await getOrderEditor(order.id);
    await saveOrderEditor(order.id, Api.AdminSaveOrderEditorBody.parse({ ...state.values, requestKey: randomUUID(),
      fulfillmentMethod: "pickup", shippingCost: 25,
      orderAddress: { country: "AE", city: "Dubai", district: "District", street: "Street", buildingNo: "1" } }), actorId);
    const [edited] = await db.select().from(ordersTable).where(eq(ordersTable.id, order.id));
    expect(JSON.parse(edited.address).taxTreatment).toBe("domestic");
    expect(edited.tax).toBeGreaterThan(0);
    await updateOrderAndIssueInvoice(order.id, { status: "cancelled" }, seller, actorId);
    expect((await getOrderEditor(order.id)).eligible).toBe(false);
  });
  it("edited blended/new products survive delivery, foreign pickup invoicing and multi-line return", async () => {
    const { order, product } = await freshOrder();
    const [added] = await db.insert(productsTable).values({ categoryId: product.categoryId,
      nameAr: "Added", nameEn: "Added", slug: randomUUID(), price: 50, stockQuantity: 5, averageCost: "5.0000" }).returning();
    let state = await getOrderEditor(order.id);
    await saveOrderEditor(order.id, Api.AdminSaveOrderEditorBody.parse({ ...state.values, requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: 4, unitPrice: 115 }, { productId: added.id, quantity: 1, unitPrice: 50 }],
      fulfillmentMethod: "pickup", shippingCost: 25,
      orderAddress: { country: "AE", city: "Dubai", district: "District", street: "Street", buildingNo: "1" } }), actorId);
    state = await getOrderEditor(order.id);
    await saveOrderEditor(order.id, Api.AdminSaveOrderEditorBody.parse({ ...state.values, requestKey: randomUUID(),
      items: [{ productId: product.id, quantity: 3, unitPrice: 115 }, { productId: added.id, quantity: 2, unitPrice: 50 }] }), actorId);
    for (const status of ["preparing", "out_for_delivery", "delivered"] as const)
      await updateOrderAndIssueInvoice(order.id, { status }, seller, actorId);
    const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, order.id));
    expect(invoice.taxTreatment).toBe("domestic");
    expect(Number(invoice.vatRate)).toBe(15);
    const source = await getReturnSource(db, "individual", order.id);
    expect(source.items.map(i => i.unitCost)).toEqual(["7.0000", "5.0000"]);
    const returned = await createSalesReturn({ sourceType: "individual", sourceId: order.id,
      lines: source.items.map(i => ({ itemId: i.id, quantity: i.quantity, condition: "new" })) }, actorId);
    await completeSalesReturn(returned.id, returned.updatedAt, actorId);
    expect((await db.select().from(productsTable).where(eq(productsTable.id, product.id)))[0].stockQuantity).toBe(10);
    expect((await db.select().from(productsTable).where(eq(productsTable.id, added.id)))[0].stockQuantity).toBe(5);
  });
  it("retains company price overrides in approval review without stock or journal effects", async () => {
    await db.update(productsTable).set({ showOnDistributors: true }).where(eq(productsTable.id, productId));
    const [company] = await db.insert(wholesaleDistributorsTable).values({ companyName: "Company test", contactName: "Contact", phone: "+966500000002", countryCode: "SA", nationalAddressShortCode: "ABCD1234" }).returning();
    const [order] = await db.insert(companyOrdersTable).values({
      orderNumber: "CO-TEST", distributorId: company.id, idempotencyKey: randomUUID(),
      snapshotTerms: {}, snapshotTotals: {}, snapshotFingerprint: "original",
    }).returning();
    await db.insert(companyOrderItemsTable).values({ companyOrderId: order.id, productId, productName: "Test", productNameEn: "Test",
      quantity: 1, unitPrice: "115", subtotal: "100", vatAmount: "15", totalAmount: "115" });
    const beforeStock = (await db.select().from(productsTable).where(eq(productsTable.id, productId)))[0].stockQuantity;
    const journalsBefore = (await db.select().from(journalEntriesTable)).length;
    const state = await getCompanyOrderEditor(order.id);
    const input = Api.AdminSaveCompanyOrderEditorBody.parse({ ...state.values, requestKey: randomUUID(),
      items: [{ productId, quantity: 2, unitPrice: 80 }], discountOverride: { percent: 10, reason: "Approved test discount" } });
    const result = await saveCompanyOrderEditor(order.id, input, actorId);
    expect(result.history).toHaveLength(1);
    await saveCompanyOrderEditor(order.id, input, actorId);
    const [edited] = await db.select().from(companyOrdersTable).where(eq(companyOrdersTable.id, order.id));
    const review = await createReviewSnapshot(db, edited, company);
    expect(review.currentItems[0].unitPrice).toBe(80);
    expect(review.currentTerms.discountPercent).toBe(10);
    expect((await db.select().from(productsTable).where(eq(productsTable.id, productId)))[0].stockQuantity).toBe(beforeStock);
    expect((await db.select().from(journalEntriesTable)).length).toBe(journalsBefore);
  });
  it("edits atomically, retries once, protects stale saves, and cancels all revised costs", async () => {
    const state = await getOrderEditor(orderId);
    const input = Api.AdminSaveOrderEditorBody.parse({ ...state.values, customerName: "Edited", items: [{ productId, quantity: 4, unitPrice: 100 }], requestKey: randomUUID() });
    const [result] = await Promise.all([
      saveOrderEditor(orderId, input, actorId), saveOrderEditor(orderId, input, actorId),
    ]);
    expect(result.values.customerName).toBe("Edited");
    expect(result.values.items[0].quantity).toBe(4);
    expect(result.history).toHaveLength(1);
    await saveOrderEditor(orderId, input, actorId);
    expect((await getOrderEditor(orderId)).history).toHaveLength(1);
    await expect(saveOrderEditor(orderId, { ...input, requestKey: randomUUID() }, actorId)).rejects.toThrow(/تغير الطلب/);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    expect(product.stockQuantity).toBe(6);
    const next = Api.AdminSaveOrderEditorBody.parse({ ...(await getOrderEditor(orderId)).values, requestKey: randomUUID(), items: [{ productId, quantity: 1000, unitPrice: 100 }] });
    await expect(saveOrderEditor(orderId, next, actorId)).rejects.toThrow(/المخزون/);
    expect(await db.select().from(orderEditAuditsTable).where(eq(orderEditAuditsTable.orderId, orderId))).toHaveLength(1);
    await db.update(ordersTable).set({ paymentStatus: "paid" }).where(eq(ordersTable.id, orderId));
    expect((await getOrderEditor(orderId)).eligible).toBe(false);
    await expect(saveOrderEditor(orderId, { ...next, requestKey: randomUUID() }, actorId)).rejects.toThrow(/تحصيل/);
    await db.update(ordersTable).set({ paymentStatus: "pending" }).where(eq(ordersTable.id, orderId));
    await updateOrderAndIssueInvoice(orderId, { status: "cancelled" }, process.env, actorId);
    expect((await db.select().from(productsTable).where(eq(productsTable.id, productId)))[0].stockQuantity).toBe(10);
    const balance = await db.execute(sql`select coalesce(sum(l.debit-l.credit),0) as balance from journal_entry_lines l join accounting_accounts a on a.id=l.account_id where a.code='5100'`);
    expect(Number(balance.rows[0].balance)).toBe(0);
    expect((await getOrderEditor(orderId)).eligible).toBe(false);
  });
});