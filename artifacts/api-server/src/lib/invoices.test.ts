import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { customersTable, db, invoicesTable, ordersTable } from "@workspace/db";
import { updateOrderAndIssueInvoice } from "./invoices";

const base = 1_700_000_000 + (Date.now() % 100_000_000);
const customerId = base;
const orderIds = [base + 1, base + 2, base + 3];

const order = (id: number) => ({
  id,
  userId: customerId,
  orderNumber: `INVOICE-TEST-${id}`,
  subtotal: 100,
  shippingCost: 15,
  discount: 0,
  tax: 15,
  total: 115,
  address: "{}",
  shippingMethod: "standard",
  paymentMethod: "card",
});

beforeAll(async () => {
  await db.insert(customersTable).values({ id: customerId, phone: `9665${String(base).slice(-8)}`, name: "Invoice Test" });
  await db.insert(ordersTable).values(orderIds.map(order));
});

afterAll(async () => {
  await db.delete(invoicesTable).where(inArray(invoicesTable.orderId, orderIds));
  await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  await db.delete(customersTable).where(eq(customersTable.id, customerId));
});

describe.sequential("atomic invoice issuance", () => {
  it("rolls payment back when VAT configuration is missing", async () => {
    await expect(updateOrderAndIssueInvoice(
      orderIds[0],
      { paymentStatus: "paid" },
      {},
    ))
      .rejects.toThrow(/VAT_REGISTRATION_NUMBER/);
    const [unchanged] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderIds[0]));
    const invoice = await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, orderIds[0]));
    expect(unchanged.paymentStatus).toBe("pending");
    expect(invoice).toHaveLength(0);
  });

  it("is idempotent under concurrent calls and allocates consecutive successful numbers", async () => {
    const env = { VAT_REGISTRATION_NUMBER: "300000000000003" };
    await Promise.all([
      updateOrderAndIssueInvoice(orderIds[0], { paymentStatus: "paid" }, env),
      updateOrderAndIssueInvoice(orderIds[0], { paymentStatus: "paid" }, env),
      updateOrderAndIssueInvoice(orderIds[1], { paymentStatus: "paid" }, env),
      updateOrderAndIssueInvoice(orderIds[2], { paymentStatus: "paid" }, env),
    ]);
    const rows = await db.select().from(invoicesTable)
      .where(inArray(invoicesTable.orderId, orderIds));
    expect(rows).toHaveLength(3);
    const sequences = rows.map((row) => row.sequenceNumber).sort((a, b) => a - b);
    expect(sequences).toEqual([sequences[0], sequences[0] + 1, sequences[0] + 2]);
    expect(new Set(rows.map((row) => row.invoiceNumber)).size).toBe(3);
  });
});