import { and, eq, sql } from "drizzle-orm";
import { db, adminUsersTable, invoicesTable, journalEntriesTable, ordersTable, orderItemsTable, productsTable, operationEventsTable, inventoryMovementsTable } from "@workspace/db";
import { AccountingConflictError, ensureStandardAccountingChart, postJournalEntry, postSalesJournal } from "./accounting";
import { zatcaPhaseOneBase64, zatcaSellerConfiguration } from "./zatca";

const INVOICE_NUMBER_LOCK = 7_521_010_001;

const money = (value: number) => value.toFixed(2);

export async function postFulfillmentCogs(tx: any, orderId: number, actorId: number | null, orderNumber: string, entryDate: string) {
  if (actorId === null) {
    const [systemActor] = await tx.select({ id: adminUsersTable.id }).from(adminUsersTable).limit(1);
    actorId = systemActor?.id ?? null;
  }
  if (actorId === null) throw new Error("No accounting actor is configured for fulfillment COGS");
  const items = await tx.select({ quantity: orderItemsTable.quantity, costSnapshot: orderItemsTable.costSnapshot })
    .from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  const cogs = items.reduce((sum: number, item: { quantity: number; costSnapshot: string }) => sum + Number(item.costSnapshot) * item.quantity, 0);
  const [event] = await tx.insert(operationEventsTable).values({
    eventKey: `sale-cogs:${orderId}`, kind: "sale_fulfillment", status: "pending", sourceType: "order", sourceId: String(orderId),
    actorId, payload: { orderNumber, valuationMethod: "order_item_cost_snapshot", cogs },
  }).onConflictDoNothing({ target: operationEventsTable.eventKey }).returning();
  if (!event) return;
  if (cogs > 0) await postJournalEntry({
    entryDate, description: `Cost of goods sold ${orderNumber}`, createdBy: actorId,
    sourceType: "sale_cogs", sourceId: String(orderId),
    lines: [{ accountCode: "5100", debit: cogs }, { accountCode: "1140", credit: cogs }],
  }, tx);
  await tx.update(operationEventsTable).set({ status: "posted" }).where(eq(operationEventsTable.id, event.id));
}

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
    const cancelling = values.status === "cancelled" && order.status !== "cancelled";
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
    if (cancelling && actorId !== undefined) {
      const items = await tx.select({ productId: orderItemsTable.productId, quantity: orderItemsTable.quantity, costSnapshot: orderItemsTable.costSnapshot })
        .from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
      const fulfillmentMovements = await tx.select({ productId: inventoryMovementsTable.productId })
        .from(inventoryMovementsTable).where(and(eq(inventoryMovementsTable.sourceType, "order"), eq(inventoryMovementsTable.sourceId, String(order.id))));
      if (!fulfillmentMovements.length) return updated;
      const productIds = [...new Set(items.map((item) => item.productId))].sort((a, b) => a - b);
      for (const productId of productIds) await tx.execute(sql`select id from ${productsTable} where id = ${productId} for update`);
      const eventKey = `sale-cancellation:${order.id}`;
      const [event] = await tx.insert(operationEventsTable).values({
        eventKey, kind: "sale_fulfillment", status: "pending", sourceType: "order_cancellation",
        sourceId: String(order.id), actorId, payload: { orderNumber: order.orderNumber },
      }).onConflictDoNothing({ target: operationEventsTable.eventKey }).returning();
      if (event) {
        let reversalCost = 0;
        for (const item of items) {
          const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, item.productId)).limit(1);
          if (!product) throw new Error(`Product ${item.productId} not found`);
          const quantityAfter = product.stockQuantity + item.quantity;
          const totalCost = Number(item.costSnapshot) * item.quantity;
          reversalCost += totalCost;
          const averageCost = quantityAfter > 0
            ? ((product.stockQuantity * Number(product.averageCost)) + totalCost) / quantityAfter
            : 0;
          await tx.update(productsTable).set({ stockQuantity: quantityAfter, averageCost: averageCost.toFixed(4) }).where(eq(productsTable.id, product.id));
          await tx.insert(inventoryMovementsTable).values({
            productId: product.id, movementType: "increase", quantityChange: item.quantity,
            quantityBefore: product.stockQuantity, quantityAfter, reason: `Cancellation ${order.orderNumber}`,
            unitCost: item.costSnapshot, totalCost: totalCost.toFixed(4), sourceType: "order_cancellation",
            sourceId: String(order.id), eventKey: `${eventKey}:${product.id}`, performedBy: actorId,
          });
        }
        const [cogsJournal] = await tx.select({ id: journalEntriesTable.id }).from(journalEntriesTable)
          .where(and(eq(journalEntriesTable.sourceType, "sale_cogs"), eq(journalEntriesTable.sourceId, String(order.id)))).limit(1);
        if (reversalCost > 0 && cogsJournal) await postJournalEntry({
          entryDate: new Date().toISOString().slice(0, 10), description: `Reverse COGS ${order.orderNumber}`,
          createdBy: actorId, sourceType: "sale_cogs_reversal", sourceId: String(order.id),
          lines: [{ accountCode: "1140", debit: reversalCost }, { accountCode: "5100", credit: reversalCost }],
        }, tx);
        if (order.paymentStatus === "paid") {
          const [saleJournal] = await tx.select({ id: journalEntriesTable.id }).from(journalEntriesTable)
            .where(and(eq(journalEntriesTable.sourceType, "order"), eq(journalEntriesTable.sourceId, String(order.id)))).limit(1);
          if (saleJournal) await postJournalEntry({
            entryDate: new Date().toISOString().slice(0, 10), description: `Reverse sale ${order.orderNumber}`,
            createdBy: actorId, sourceType: "sale_revenue_reversal", sourceId: String(order.id),
            lines: [
              { accountCode: "1120", credit: order.total },
              ...(order.subtotal > 0 ? [{ accountCode: "4100", debit: order.subtotal }] : []),
              ...(order.shippingCost > 0 ? [{ accountCode: "4110", debit: order.shippingCost }] : []),
              ...(order.discount > 0 ? [{ accountCode: "4190", credit: order.discount }] : []),
              ...(order.tax > 0 ? [{ accountCode: "2120", debit: order.tax }] : []),
            ],
          }, tx);
        }
        await tx.update(operationEventsTable).set({ status: "posted" }).where(eq(operationEventsTable.id, event.id));
      }
    }
    if (willBePaid && actorId !== undefined) {
      await postSalesJournal(updated, actorId, tx);
    }
    return updated;
  });
}