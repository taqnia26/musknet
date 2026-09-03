import { eq, sql } from "drizzle-orm";
import { db, invoicesTable, ordersTable } from "@workspace/db";
import { AccountingConflictError, ensureStandardAccountingChart, postSalesJournal } from "./accounting";
import { zatcaPhaseOneBase64, zatcaSellerConfiguration } from "./zatca";

const INVOICE_NUMBER_LOCK = 7_521_010_001;

const money = (value: number) => value.toFixed(2);

export async function updateOrderAndIssueInvoice(
  orderId: number,
  values: Partial<typeof ordersTable.$inferInsert>,
  environment: NodeJS.ProcessEnv = process.env,
  actorId?: number,
) {
  if (actorId !== undefined) await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${ordersTable} where ${ordersTable.id} = ${orderId} for update`);
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) return null;
    if (order.paymentStatus === "paid") {
      if (values.paymentStatus !== undefined && values.paymentStatus !== "paid") {
        throw new AccountingConflictError("A paid order cannot be changed back to unpaid");
      }
      for (const field of ["subtotal", "shippingCost", "discount", "tax", "total"] as const) {
        if (values[field] !== undefined && values[field] !== order[field]) {
          throw new AccountingConflictError(`A posted paid order's ${field} cannot be changed`);
        }
      }
    }

    const willBePaid = values.paymentStatus === "paid" || (values.paymentStatus === undefined && order.paymentStatus === "paid");
    if (willBePaid) {
      const [existing] = await tx.select().from(invoicesTable)
        .where(eq(invoicesTable.orderId, order.id)).limit(1);
      if (!existing) {
        // A transaction-level lock serializes MAX+1. Because both the number and
        // lock roll back with the transaction, only successful invoices consume numbers.
        await tx.execute(sql`select pg_advisory_xact_lock(${INVOICE_NUMBER_LOCK})`);
        const [afterLock] = await tx.select().from(invoicesTable)
          .where(eq(invoicesTable.orderId, order.id)).limit(1);
        if (!afterLock) {
          const configuration = zatcaSellerConfiguration(environment);
          const issuedAt = new Date();
          const [{ next }] = await tx.select({
            next: sql<number>`coalesce(max(${invoicesTable.sequenceNumber}), 0) + 1`,
          }).from(invoicesTable);
          const sequenceNumber = Number(next);
          const invoiceNumber = `INV-${String(sequenceNumber).padStart(6, "0")}`;
          const total = values.total ?? order.total;
          const vatTotal = values.tax ?? order.tax;
          const qrCodeBase64 = zatcaPhaseOneBase64({
            ...configuration,
            timestamp: issuedAt.toISOString(),
            invoiceTotal: money(total),
            vatTotal: money(vatTotal),
          });
          await tx.insert(invoicesTable).values({
            orderId: order.id,
            sequenceNumber,
            invoiceNumber,
            sellerName: configuration.sellerName,
            issueDatetime: issuedAt,
            sellerVatNumber: configuration.vatRegistrationNumber,
            subtotal: values.subtotal ?? order.subtotal,
            totalAmount: total,
            vatAmount: vatTotal,
            qrCodeData: qrCodeBase64,
          });
        }
      }
    }
    const [updated] = await tx.update(ordersTable).set(values)
      .where(eq(ordersTable.id, order.id)).returning();
    if (willBePaid && actorId !== undefined) await postSalesJournal(updated, actorId, tx);
    return updated;
  });
}