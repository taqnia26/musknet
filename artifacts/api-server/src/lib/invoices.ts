import { and, eq, sql } from "drizzle-orm";
import { db, adminUsersTable, invoiceItemsTable, invoicesTable, journalEntriesTable, ordersTable, orderItemsTable, productsTable, operationEventsTable, inventoryMovementsTable, wholesaleDistributorsTable, shipmentsTable } from "@workspace/db";
import { AccountingConflictError, ensureStandardAccountingChart, postJournalEntry, postSalesJournal } from "./accounting";
import { zatcaPhaseOneBase64, zatcaSellerConfiguration } from "./zatca";
import { db, adminUsersTable, invoiceItemsTable, invoicesTable, journalEntriesTable, ordersTable, orderItemsTable, productsTable, operationEventsTable, inventoryMovementsTable, receivablePaymentsTable, wholesaleDistributorsTable } from "@workspace/db";

const INVOICE_NUMBER_LOCK = 7_521_010_001;

const money = (value: number) => value.toFixed(2);
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const fromCents = (value: number) => value / 100;

const dateOnly = (value: string | Date) => value instanceof Date ? value.toISOString().slice(0, 10) : value;
export class DistributorInvoiceValidationError extends Error {}
export class DistributorInvoiceConflictError extends Error {}

export class ReceivablePaymentNotFoundError extends Error {}
export async function createDistributorInvoice(
  input: { creationKey: string; distributorId: number; dueDate?: string | Date; items: Array<{ productId: number; quantity: number; unitPrice: number }> },
  actorId: number,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!input.items.length) throw new DistributorInvoiceValidationError("At least one invoice item is required");
  if (input.creationKey.trim().length < 16) throw new DistributorInvoiceValidationError("A valid creation key is required");
  const productIds = input.items.map((item) => item.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new DistributorInvoiceValidationError("Each product may only appear once");
  }
  if (input.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0)) {
    throw new DistributorInvoiceValidationError("Each item requires a valid quantity and price");
  }

  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    const [previous] = await tx.select().from(invoicesTable).where(eq(invoicesTable.creationKey, input.creationKey)).limit(1);
    if (previous) {
      const previousItems = await tx.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, previous.id)).orderBy(invoiceItemsTable.id);
      const payments = await tx.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, previous.id)).orderBy(receivablePaymentsTable.paymentDate);
      const paidAmount = fromCents(payments.reduce((sum, payment) => sum + cents(payment.amount), 0));
      return { ...previous, orderNumber: null, distributorName: previous.buyerName, paidAmount, outstandingAmount: fromCents(cents(previous.totalAmount) - cents(paidAmount)), paymentStatus: paidAmount > 0 ? "partial" as const : "unpaid" as const, payments, items: previousItems };
    }
    const [distributor] = await tx.select().from(wholesaleDistributorsTable)
      .where(eq(wholesaleDistributorsTable.id, input.distributorId)).limit(1);
    if (!distributor) throw new DistributorInvoiceValidationError("Distributor not found");
    if (!distributor.isActive) throw new DistributorInvoiceConflictError("Distributor is inactive");

    const sortedProductIds = [...productIds].sort((a, b) => a - b);
    for (const productId of sortedProductIds) {
      await tx.execute(sql`select id from ${productsTable} where ${productsTable.id} = ${productId} for update`);
    }
    const products: Array<{ id: number; nameAr: string; nameEn: string; sku: string | null; isActive: boolean; stockQuantity: number; averageCost: string }> = [];
    for (const item of input.items) {
      const [product] = await tx.select({
        id: productsTable.id, nameAr: productsTable.nameAr, nameEn: productsTable.nameEn,
        sku: productsTable.sku, isActive: productsTable.isActive,
        stockQuantity: productsTable.stockQuantity, averageCost: productsTable.averageCost,
      }).from(productsTable).where(eq(productsTable.id, item.productId)).limit(1);
      if (!product) throw new DistributorInvoiceValidationError(`Product ${item.productId} not found`);
      if (!product.isActive) throw new DistributorInvoiceConflictError(`Product ${item.productId} is inactive`);
      if (product.stockQuantity < item.quantity) {
        throw new DistributorInvoiceConflictError(`Insufficient stock for ${product.nameAr}. Available: ${product.stockQuantity}`);
      }
      products.push(product);
    }

    const lines = input.items.map((item, index) => {
      const subtotalCents = cents(item.unitPrice) * item.quantity;
      const vatCents = Math.round(subtotalCents * 0.15);
      return {
        productId: item.productId,
        productName: products[index].nameAr || products[index].nameEn,
        sku: products[index].sku,
        quantity: item.quantity,
        unitPrice: fromCents(cents(item.unitPrice)),
        subtotal: fromCents(subtotalCents),
        vatAmount: fromCents(vatCents),
        totalAmount: fromCents(subtotalCents + vatCents),
      };
    });
    const subtotal = fromCents(lines.reduce((sum, line) => sum + cents(line.subtotal), 0));
    const vatAmount = fromCents(lines.reduce((sum, line) => sum + cents(line.vatAmount), 0));
    const totalAmount = fromCents(cents(subtotal) + cents(vatAmount));

    await tx.execute(sql`select pg_advisory_xact_lock(${INVOICE_NUMBER_LOCK})`);
    const [afterLock] = await tx.select().from(invoicesTable).where(eq(invoicesTable.creationKey, input.creationKey)).limit(1);
    if (afterLock) {
      const afterLockItems = await tx.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, afterLock.id)).orderBy(invoiceItemsTable.id);
      const payments = await tx.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, afterLock.id)).orderBy(receivablePaymentsTable.paymentDate);
      const paidAmount = fromCents(payments.reduce((sum, payment) => sum + cents(payment.amount), 0));
      return { ...afterLock, orderNumber: null, distributorName: afterLock.buyerName, paidAmount, outstandingAmount: fromCents(cents(afterLock.totalAmount) - cents(paidAmount)), paymentStatus: paidAmount > 0 ? "partial" as const : "unpaid" as const, payments, items: afterLockItems };
    }
    const configuration = zatcaSellerConfiguration(environment);
    const issueDatetime = new Date();
    const [{ next }] = await tx.select({
      next: sql<number>`coalesce(max(${invoicesTable.sequenceNumber}), 0) + 1`,
    }).from(invoicesTable);
    const sequenceNumber = Number(next);
    const invoiceNumber = `INV-${String(sequenceNumber).padStart(6, "0")}`;
    const qrCodeData = zatcaPhaseOneBase64({
      ...configuration,
      timestamp: issueDatetime.toISOString(),
      invoiceTotal: money(totalAmount),
      vatTotal: money(vatAmount),
    });
    const [invoice] = await tx.insert(invoicesTable).values({
      distributorId: distributor.id,
      creationKey: input.creationKey,
      sequenceNumber,
      invoiceNumber,
      sellerName: configuration.sellerName,
      issueDatetime,
      dueDate: input.dueDate ? dateOnly(input.dueDate) : defaultDueDate(),
      sellerVatNumber: configuration.vatRegistrationNumber,
      buyerName: distributor.companyName,
      buyerTaxNumber: distributor.taxNumber,
      buyerCommercialRegistrationNumber: distributor.commercialRegistrationNumber,
      buyerAddress: [distributor.address, distributor.city].filter(Boolean).join(", ") || null,
      subtotal,
      vatAmount,
      totalAmount,
      qrCodeData,
    }).returning();
    await tx.insert(shipmentsTable).values({
      channel: "b2b",
      invoiceId: invoice.id,
      destinationCity: distributor.city?.trim() || "Unknown",
      destinationAddress: distributor.address,
      status: "pending",
    });
    const createdItems = await tx.insert(invoiceItemsTable).values(
      lines.map((line) => ({ ...line, invoiceId: invoice.id })),
    ).returning();
    let totalCost = 0;
    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index];
      const product = products[index];
      const quantityAfter = product.stockQuantity - item.quantity;
      await tx.update(productsTable).set({ stockQuantity: quantityAfter }).where(eq(productsTable.id, product.id));
      const lineCost = Number(product.averageCost) * item.quantity;
      totalCost += lineCost;
      await tx.insert(inventoryMovementsTable).values({
        productId: product.id,
        movementType: "decrease",
        quantityChange: -item.quantity,
        quantityBefore: product.stockQuantity,
        quantityAfter,
        reason: `Distributor invoice ${invoiceNumber}`,
        unitCost: product.averageCost,
        totalCost: lineCost.toFixed(4),
        sourceType: "distributor_invoice",
        sourceId: String(invoice.id),
        eventKey: `distributor-invoice:${invoice.id}:${product.id}`,
        performedBy: actorId,
      });
    }
    await postJournalEntry({
      entryDate: issueDatetime.toISOString().slice(0, 10),
      description: `Distributor sale ${invoiceNumber}`,
      createdBy: actorId,
      sourceType: "distributor_invoice",
      sourceId: String(invoice.id),
      lines: [
        { accountCode: "1130", debit: totalAmount },
        { accountCode: "4100", credit: subtotal },
        { accountCode: "2120", credit: vatAmount },
      ],
    }, tx);
    if (totalCost > 0) {
      await postJournalEntry({
        entryDate: issueDatetime.toISOString().slice(0, 10),
        description: `Cost of distributor sale ${invoiceNumber}`,
        createdBy: actorId,
        sourceType: "distributor_invoice_cogs",
        sourceId: String(invoice.id),
        lines: [
          { accountCode: "5100", debit: totalCost },
          { accountCode: "1140", credit: totalCost },
        ],
      }, tx);
    }
    return { ...invoice, orderNumber: null, distributorName: distributor.companyName, paidAmount: 0, outstandingAmount: invoice.totalAmount, paymentStatus: "unpaid" as const, payments: [], items: createdItems };
  });
}

export async function createReceivablePayment(
  invoiceId: number,
  input: { paymentKey: string; paymentDate: string | Date; amount: number; paymentMethod: "cash" | "bank_transfer"; reference?: string | null },
  actorId: number,
) {
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    const [previous] = await tx.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.paymentKey, input.paymentKey)).limit(1);
    if (previous) {
      if (previous.invoiceId !== invoiceId) throw new DistributorInvoiceConflictError("Payment key is already used");
      return previous;
    }
    await tx.execute(sql`select id from ${invoicesTable} where ${invoicesTable.id} = ${invoiceId} for update`);
    const [invoice] = await tx.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
    if (!invoice || invoice.distributorId === null) throw new ReceivablePaymentNotFoundError("Company invoice not found");
    const payments = await tx.select({ amount: receivablePaymentsTable.amount })
      .from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, invoiceId));
    const outstandingCents = cents(invoice.totalAmount) - payments.reduce((sum, payment) => sum + cents(payment.amount), 0);
    const amountCents = cents(input.amount);
    if (amountCents <= 0) throw new DistributorInvoiceValidationError("Payment amount must be positive");
    if (amountCents > outstandingCents) throw new DistributorInvoiceConflictError("Payment exceeds the outstanding balance");
    const [payment] = await tx.insert(receivablePaymentsTable).values({
      invoiceId,
      paymentKey: input.paymentKey,
      paymentDate: dateOnly(input.paymentDate),
      amount: fromCents(amountCents),
      paymentMethod: input.paymentMethod,
      reference: input.reference?.trim() || null,
      createdBy: actorId,
    }).returning();
    await postJournalEntry({
      entryDate: dateOnly(input.paymentDate),
      description: `Collection for ${invoice.invoiceNumber}${payment.reference ? ` (${payment.reference})` : ""}`,
      createdBy: actorId,
      sourceType: "receivable_payment",
      sourceId: String(payment.id),
      lines: [
        { accountCode: payment.paymentMethod === "cash" ? "1110" : "1120", debit: payment.amount },
        { accountCode: "1130", credit: payment.amount },
      ],
    }, tx);
    const [event] = await tx.insert(operationEventsTable).values({
      eventKey: `receivable-payment:${payment.id}`,
      kind: "payment",
      status: "pending",
      sourceType: "receivable_payment",
      sourceId: String(payment.id),
      occurredAt: new Date(`${dateOnly(input.paymentDate)}T12:00:00.000Z`),
      actorId,
      payload: { invoiceId, invoiceNumber: invoice.invoiceNumber, amount: payment.amount, paymentMethod: payment.paymentMethod, reference: payment.reference },
    }).returning();
    await tx.update(operationEventsTable).set({ status: "posted" }).where(eq(operationEventsTable.id, event.id));
    return payment;
  });
}
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

const defaultDueDate = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
};
