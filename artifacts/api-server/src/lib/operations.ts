import { and, asc, eq, sql } from "drizzle-orm";
import {
  db, inventoryMovementsTable, operationEventsTable, openingBalanceImportsTable,
  openingBalanceLinesTable, productsTable,
  purchaseReceiptsTable, purchaseReceiptLinesTable, purchaseReceiptPaymentsTable, manufacturingBatchesTable, manufacturingInputLinesTable,
} from "@workspace/db";
import { postJournalEntry, ensureStandardAccountingChart } from "./accounting";

type OpeningLine = {
  sourceRow: number; sourceLabel: string; sourceQuantity: string | number;
  openingQuantity: number; fullBatchUnitCost: string | number; productId?: number | null;
  mappingNote?: string | null; provenance: { file: string; sheet: string; row: number; columns?: Record<string, string> };
};

const money = (value: string | number) => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Opening balance money must be a non-negative number");
  return n.toFixed(4);
};

export function weightedAverageCost(existingQuantity: number, existingUnitCost: number, incomingQuantity: number, incomingUnitCost: number) {
  const totalQuantity = existingQuantity + incomingQuantity;
  if (totalQuantity <= 0) return 0;
  return ((existingQuantity * existingUnitCost) + (incomingQuantity * incomingUnitCost)) / totalQuantity;
}

export function manufacturingOutputUnitCost(totalInputCost: number, quantityProduced: number) {
  if (quantityProduced <= 0) throw new Error("Manufacturing quantity must be positive");
  return totalInputCost / quantityProduced;
}

export function allocateReceiptPayment(total: number, paidAmount: number) {
  if (total < 0 || paidAmount < 0 || paidAmount > total) throw new Error("Paid amount must be between zero and the receipt total");
  return { paid: paidAmount, payable: total - paidAmount };
}

export function purchaseReceiptPaymentStatus(total: number, paidAmount: number) {
  if (total < 0 || paidAmount < 0 || paidAmount > total + 0.00005) throw new Error("Payment exceeds the remaining accounts payable balance");
  return paidAmount >= total - 0.00005 ? "paid" as const : "partial" as const;
}

function paymentPayloadMatches(payment: typeof purchaseReceiptPaymentsTable.$inferSelect, input: {
  paymentDate: string; amount: string | number; paymentSource: "company_account" | "owner_account"; paymentReference?: string | null;
}) {
  return payment.paymentDate === input.paymentDate && money(Number(payment.amount)) === money(Number(input.amount)) &&
    payment.paymentSource === input.paymentSource && payment.paymentReference === (input.paymentReference ?? null);
}

export async function createOpeningBalanceImport(input: {
  importKey: string; sourceFileName: string; sourceSheet: string; createdBy: number; lines: OpeningLine[];
}) {
  if (!input.importKey.trim() || !input.sourceFileName.trim() || !input.sourceSheet.trim()) throw new Error("Import provenance is required");
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(openingBalanceImportsTable)
      .where(eq(openingBalanceImportsTable.importKey, input.importKey)).limit(1);
    if (existing) return existing;
    const [created] = await tx.insert(openingBalanceImportsTable).values({
      importKey: input.importKey, sourceFileName: input.sourceFileName, sourceSheet: input.sourceSheet,
      valuationMethod: "weighted_average", status: "draft", createdBy: input.createdBy,
    }).returning();
    if (!created) throw new Error("Opening balance import could not be created");
    await tx.insert(openingBalanceLinesTable).values(input.lines.map((line) => ({
      importId: created.id, sourceRow: line.sourceRow, sourceLabel: line.sourceLabel,
      sourceQuantity: money(line.sourceQuantity), openingQuantity: line.openingQuantity,
      fullBatchUnitCost: money(line.fullBatchUnitCost),
      openingValue: money(Number(line.openingQuantity) * Number(line.fullBatchUnitCost)),
      productId: line.productId ?? null,
      mappingState: (line.productId ? "mapped" : "unmapped") as "mapped" | "unmapped",
      mappingNote: line.mappingNote ?? null, provenance: line.provenance,
    })));
    return created;
  });
}

export async function reviewOpeningBalanceImport(importId: number) {
  const [row] = await db.update(openingBalanceImportsTable)
    .set({ status: "review" }).where(and(eq(openingBalanceImportsTable.id, importId), eq(openingBalanceImportsTable.status, "draft"))).returning();
  return row ?? null;
}

export async function mapOpeningBalanceLine(importId: number, lineId: number, productId: number | null, mappingNote: string | null) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${openingBalanceImportsTable} where id = ${importId} for update`);
    const [imp] = await tx.select({ status: openingBalanceImportsTable.status }).from(openingBalanceImportsTable).where(eq(openingBalanceImportsTable.id, importId));
    if (!imp || (imp.status !== "draft" && imp.status !== "review")) throw new Error("Only draft or review imports can be mapped");
    const [updated] = await tx.update(openingBalanceLinesTable).set({
      productId, mappingState: productId === null ? "unmapped" : "mapped", mappingNote,
    }).where(and(
      eq(openingBalanceLinesTable.id, lineId), eq(openingBalanceLinesTable.importId, importId),
    )).returning();
    return updated ?? null;
  });
}

/** Approves and applies exactly once. No line is silently inferred or posted. */
export async function approveOpeningBalanceImport(importId: number, actorId: number, entryDate: string) {
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('opening-balance-singleton'))`);
    await tx.execute(sql`select id from ${openingBalanceImportsTable} where ${openingBalanceImportsTable.id} = ${importId} for update`);
    const [imp] = await tx.select().from(openingBalanceImportsTable).where(eq(openingBalanceImportsTable.id, importId)).limit(1);
    if (!imp) throw new Error("Opening balance import not found");
    if (imp.status === "approved") return imp;
    if (imp.status !== "review") throw new Error("Opening balance import must be in review before approval");
    const [otherApproved] = await tx.select({ id: openingBalanceImportsTable.id }).from(openingBalanceImportsTable)
      .where(and(eq(openingBalanceImportsTable.status, "approved"), sql`${openingBalanceImportsTable.id} <> ${importId}`)).limit(1);
    if (otherApproved) throw new Error("An opening balance import has already been approved");
    const lines = await tx.select().from(openingBalanceLinesTable).where(eq(openingBalanceLinesTable.importId, importId)).orderBy(asc(openingBalanceLinesTable.sourceRow));
    if (!lines.length || lines.some((line) => line.mappingState !== "mapped" || !line.productId)) {
      throw new Error("Every opening balance line must be explicitly mapped before approval");
    }
    const mappedIds = lines.map((line) => line.productId!);
    if (new Set(mappedIds).size !== mappedIds.length) throw new Error("Opening balance lines must map each product only once");
    const productIds = [...mappedIds].sort((a, b) => a - b);
    for (const productId of productIds) {
      await tx.execute(sql`select id from ${productsTable} where id = ${productId} for update`);
      const [movement] = await tx.select({ id: inventoryMovementsTable.id }).from(inventoryMovementsTable)
        .where(and(eq(inventoryMovementsTable.productId, productId), sql`${inventoryMovementsTable.sourceType} is distinct from 'opening_balance_import'`)).limit(1);
      if (movement) throw new Error(`Opening balance cannot overwrite live inventory for product ${productId}`);
    }
    const total = lines.reduce((sum, line) => sum + Number(line.openingValue), 0);
    const eventKey = `opening-balance:${imp.importKey}`;
    const [event] = await tx.insert(operationEventsTable).values({
      eventKey, kind: "opening_balance", status: "pending", sourceType: "opening_balance_import",
      sourceId: String(imp.id), actorId, occurredAt: new Date(`${entryDate}T00:00:00Z`),
      payload: { sourceFileName: imp.sourceFileName, sourceSheet: imp.sourceSheet, lineCount: lines.length },
    }).onConflictDoNothing({ target: operationEventsTable.eventKey }).returning();
    if (!event) return imp;
    for (const line of lines) {
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, line.productId!)).limit(1);
      if (!product) throw new Error(`Mapped product ${line.productId} no longer exists`);
      const before = product.stockQuantity;
      await tx.update(productsTable).set({
        stockQuantity: line.openingQuantity,
        averageCost: line.fullBatchUnitCost,
      }).where(eq(productsTable.id, product.id));
      await tx.insert(inventoryMovementsTable).values({
        productId: product.id, movementType: "adjustment", quantityChange: line.openingQuantity - before,
        quantityBefore: before, quantityAfter: line.openingQuantity, reason: `Opening balance import ${imp.importKey}`,
        unitCost: line.fullBatchUnitCost, totalCost: line.openingValue,
        sourceType: "opening_balance_import", sourceId: String(imp.id), eventKey: `${eventKey}:line:${line.id}`,
        performedBy: actorId,
      });
    }
    await postJournalEntry({
      entryDate, description: `Opening inventory balance ${imp.importKey}`, createdBy: actorId,
      sourceType: "opening_balance_import", sourceId: String(imp.id),
      lines: [{ accountCode: "1140", debit: total }, { accountCode: "3100", credit: total }],
    }, tx);
    await tx.update(operationEventsTable).set({ status: "posted" }).where(eq(operationEventsTable.id, event.id));
    const [approved] = await tx.update(openingBalanceImportsTable).set({
      status: "approved", approvedBy: actorId, approvedAt: new Date(),
    }).where(eq(openingBalanceImportsTable.id, imp.id)).returning();
    return approved;
  });
}

export async function openingBalanceReconciliation(importId?: number) {
  const imports = await db.select().from(openingBalanceImportsTable)
    .where(importId ? eq(openingBalanceImportsTable.id, importId) : undefined)
    .orderBy(sql`${openingBalanceImportsTable.createdAt} desc`);
  const result = [];
  for (const imp of imports) {
    const lines = await db.select().from(openingBalanceLinesTable).where(eq(openingBalanceLinesTable.importId, imp.id));
    result.push({ ...imp, lineCount: lines.length, mappedCount: lines.filter((line) => line.mappingState === "mapped").length,
      unmappedCount: lines.filter((line) => line.mappingState === "unmapped").length, lines });
  }
  return result;
}

export async function createPurchaseReceipt(input: {
  receiptNumber: string; vendorName: string; vendorReference?: string | null; purchaseId?: number | null;
  receiptDate: string; paymentStatus?: "unpaid" | "paid" | "partial"; paymentSource?: "company_account" | "owner_account";
  paidAmount?: string | number; paymentReference?: string | null;
  createdBy: number; lines: Array<{ productId: number; quantity: number; unitCost: string | number }>;
}) {
  return db.transaction(async (tx) => {
    const total = input.lines.reduce((sum, line) => sum + line.quantity * Number(line.unitCost), 0);
    const paidAmount = input.paidAmount ?? (input.paymentStatus === "paid" ? total : 0);
    const allocation = allocateReceiptPayment(total, Number(paidAmount));
    const derivedStatus = allocation.paid === 0 ? "unpaid" : allocation.payable === 0 ? "paid" : "partial";
    const [receipt] = await tx.insert(purchaseReceiptsTable).values({
      receiptNumber: input.receiptNumber, vendorName: input.vendorName, vendorReference: input.vendorReference ?? null,
      purchaseId: input.purchaseId ?? null, receiptDate: input.receiptDate,
      paymentStatus: derivedStatus, paymentSource: input.paymentSource ?? "company_account",
      amount: money(total), paidAmount: money(paidAmount),
      paymentReference: input.paymentReference ?? null, createdBy: input.createdBy,
    }).returning();
    if (!receipt) throw new Error("Purchase receipt could not be created");
    await tx.insert(purchaseReceiptLinesTable).values(input.lines.map((line) => ({
      receiptId: receipt.id, productId: line.productId, quantity: line.quantity,
      unitCost: money(line.unitCost), totalCost: money(line.quantity * Number(line.unitCost)),
    })));
    return receipt;
  });
}

export async function postPurchaseReceipt(receiptId: number, actorId: number) {
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${purchaseReceiptsTable} where ${purchaseReceiptsTable.id} = ${receiptId} for update`);
    const [receipt] = await tx.select().from(purchaseReceiptsTable).where(eq(purchaseReceiptsTable.id, receiptId)).limit(1);
    if (!receipt) throw new Error("Purchase receipt not found");
    if (receipt.status === "posted") return receipt;
    if (receipt.status !== "draft") throw new Error("Only draft purchase receipts can be posted");
    const lines = await tx.select().from(purchaseReceiptLinesTable).where(eq(purchaseReceiptLinesTable.receiptId, receiptId));
    if (!lines.length) throw new Error("Purchase receipt requires at least one line");
    const total = lines.reduce((sum, line) => sum + Number(line.totalCost), 0);
    for (const productId of [...new Set(lines.map((line) => line.productId))].sort((a, b) => a - b)) {
      await tx.execute(sql`select id from ${productsTable} where id = ${productId} for update`);
    }
    const allocation = allocateReceiptPayment(total, Number(receipt.paidAmount));
    const eventKey = `purchase-receipt:${receipt.id}`;
    const [event] = await tx.insert(operationEventsTable).values({
      eventKey, kind: "purchase_receipt", status: "pending", sourceType: "purchase_receipt", sourceId: String(receipt.id),
      actorId, occurredAt: new Date(`${receipt.receiptDate}T00:00:00Z`),
      payload: { vendorName: receipt.vendorName, receiptNumber: receipt.receiptNumber, total },
    }).onConflictDoNothing({ target: operationEventsTable.eventKey }).returning();
    if (!event) return receipt;
    for (const line of lines.sort((a, b) => a.productId - b.productId)) {
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, line.productId)).limit(1);
      if (!product) throw new Error(`Product ${line.productId} not found`);
      const before = product.stockQuantity;
      const oldValue = before * Number(product.averageCost);
      const addedValue = Number(line.totalCost);
      const after = before + line.quantity;
      const averageCost = weightedAverageCost(before, Number(product.averageCost), line.quantity, Number(line.unitCost));
      await tx.update(productsTable).set({ stockQuantity: after, averageCost: money(averageCost) }).where(eq(productsTable.id, product.id));
      await tx.insert(inventoryMovementsTable).values({
        productId: product.id, movementType: "increase", quantityChange: line.quantity, quantityBefore: before, quantityAfter: after,
        reason: `Purchase receipt ${receipt.receiptNumber}`, unitCost: line.unitCost, totalCost: line.totalCost,
        sourceType: "purchase_receipt", sourceId: String(receipt.id), eventKey: `${eventKey}:line:${line.id}`, performedBy: actorId,
      });
    }
    await postJournalEntry({
      entryDate: receipt.receiptDate, description: `Purchase receipt ${receipt.receiptNumber}`, createdBy: actorId,
      sourceType: "purchase_receipt", sourceId: String(receipt.id),
      lines: [
        { accountCode: "1140", debit: total },
        ...(allocation.paid > 0 ? [{ accountCode: receipt.paymentSource === "owner_account" ? "2140" : "1120", credit: allocation.paid }] : []),
        ...(allocation.payable > 0 ? [{ accountCode: "2110", credit: allocation.payable }] : []),
      ],
    }, tx);
    await tx.update(operationEventsTable).set({ status: "posted" }).where(eq(operationEventsTable.id, event.id));
    const [posted] = await tx.update(purchaseReceiptsTable).set({ status: "posted", postedBy: actorId, postedAt: new Date(), amount: money(total) })
      .where(eq(purchaseReceiptsTable.id, receipt.id)).returning();
    return posted;
  });
}

export async function createPurchaseReceiptPayment(input: {
  receiptId: number; paymentKey: string; paymentDate: string; amount: string | number;
  paymentSource: "company_account" | "owner_account"; paymentReference?: string | null; createdBy: number;
}) {
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    const [existingPayment] = await tx.select().from(purchaseReceiptPaymentsTable)
      .where(and(eq(purchaseReceiptPaymentsTable.receiptId, input.receiptId), eq(purchaseReceiptPaymentsTable.paymentKey, input.paymentKey))).limit(1);
    if (existingPayment) {
      if (!paymentPayloadMatches(existingPayment, input)) {
        throw new Error("Payment idempotency key was already used with a different payload");
      }
      return existingPayment;
    }
    await tx.execute(sql`select id from ${purchaseReceiptsTable} where ${purchaseReceiptsTable.id} = ${input.receiptId} for update`);
    const [racedPayment] = await tx.select().from(purchaseReceiptPaymentsTable)
      .where(and(eq(purchaseReceiptPaymentsTable.receiptId, input.receiptId), eq(purchaseReceiptPaymentsTable.paymentKey, input.paymentKey))).limit(1);
    if (racedPayment) {
      if (!paymentPayloadMatches(racedPayment, input)) throw new Error("Payment idempotency key was already used with a different payload");
      return racedPayment;
    }
    const [receipt] = await tx.select().from(purchaseReceiptsTable).where(eq(purchaseReceiptsTable.id, input.receiptId)).limit(1);
    if (!receipt) throw new Error("Purchase receipt not found");
    if (receipt.status !== "posted") throw new Error("Payments require a posted purchase receipt");
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be positive");
    const remaining = Number(receipt.amount) - Number(receipt.paidAmount);
    if (amount > remaining + 0.00005) throw new Error("Payment exceeds the remaining accounts payable balance");
    const [payment] = await tx.insert(purchaseReceiptPaymentsTable).values({
      receiptId: receipt.id, paymentKey: input.paymentKey, paymentDate: input.paymentDate,
      amount: money(amount), paymentSource: input.paymentSource,
      paymentReference: input.paymentReference ?? null, createdBy: input.createdBy,
    }).returning();
    if (!payment) throw new Error("Purchase receipt payment could not be created");
    const paidAmount = Number(receipt.paidAmount) + amount;
    const status = purchaseReceiptPaymentStatus(Number(receipt.amount), paidAmount);
    await postJournalEntry({
      entryDate: input.paymentDate, description: `Payment for purchase receipt ${receipt.receiptNumber}`,
      createdBy: input.createdBy, sourceType: "purchase_receipt_payment", sourceId: String(payment.id),
      lines: [
        { accountCode: "2110", debit: amount },
        { accountCode: input.paymentSource === "owner_account" ? "2140" : "1120", credit: amount },
      ],
    }, tx);
    const eventKey = `purchase-receipt-payment:${payment.id}`;
    const [event] = await tx.insert(operationEventsTable).values({
      eventKey, kind: "payment", status: "pending",
      sourceType: "purchase_receipt_payment", sourceId: String(payment.id), actorId: input.createdBy,
      occurredAt: new Date(`${input.paymentDate}T00:00:00Z`),
      payload: { receiptId: receipt.id, amount, paymentSource: input.paymentSource },
    }).returning();
    await tx.update(operationEventsTable).set({ status: "posted" }).where(eq(operationEventsTable.id, event.id));
    await tx.update(purchaseReceiptsTable).set({ paidAmount: money(paidAmount), paymentStatus: status })
      .where(eq(purchaseReceiptsTable.id, receipt.id));
    return payment;
  });
}

export async function addManufacturingInputs(batchId: number, lines: Array<{ materialProductId: number; quantity: number }>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${manufacturingBatchesTable} where id = ${batchId} for update`);
    const [batch] = await tx.select().from(manufacturingBatchesTable).where(eq(manufacturingBatchesTable.id, batchId)).limit(1);
    if (!batch) throw new Error("Manufacturing batch not found");
    if (batch.status === "approved") throw new Error("Approved manufacturing batches cannot be edited");
    const result = [];
    for (const line of lines) {
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, line.materialProductId)).limit(1);
      if (!product) throw new Error(`Material product ${line.materialProductId} not found`);
      const [saved] = await tx.insert(manufacturingInputLinesTable).values({
        batchId, materialProductId: line.materialProductId, quantity: line.quantity,
        unitCostSnapshot: product.averageCost, totalCost: money(line.quantity * Number(product.averageCost)),
      }).onConflictDoUpdate({
        target: [manufacturingInputLinesTable.batchId, manufacturingInputLinesTable.materialProductId],
        set: { quantity: line.quantity, unitCostSnapshot: product.averageCost, totalCost: money(line.quantity * Number(product.averageCost)) },
      }).returning();
      result.push(saved);
    }
    return result;
  });
}

export async function approveManufacturingBatch(batchId: number, actorId: number, updates?: Partial<typeof manufacturingBatchesTable.$inferInsert>) {
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${manufacturingBatchesTable} where ${manufacturingBatchesTable.id} = ${batchId} for update`);
    const [batch] = await tx.select().from(manufacturingBatchesTable).where(eq(manufacturingBatchesTable.id, batchId)).limit(1);
    if (!batch) throw new Error("Manufacturing batch not found");
    if (batch.status === "approved") {
      if (updates) throw new Error("Approved manufacturing batches are immutable");
      return batch;
    }
    if (updates) {
      await tx.update(manufacturingBatchesTable).set(updates).where(eq(manufacturingBatchesTable.id, batchId));
      const [refreshed] = await tx.select().from(manufacturingBatchesTable).where(eq(manufacturingBatchesTable.id, batchId)).limit(1);
      if (!refreshed) throw new Error("Manufacturing batch not found");
      Object.assign(batch, refreshed);
    }
    const lines = await tx.select().from(manufacturingInputLinesTable).where(eq(manufacturingInputLinesTable.batchId, batchId));
    if (!lines.length) throw new Error("Manufacturing approval requires explicit material input lines");
    const lockIds = [...new Set([...lines.map((line) => line.materialProductId), batch.productId])].sort((a, b) => a - b);
    for (const productId of lockIds) await tx.execute(sql`select id from ${productsTable} where id = ${productId} for update`);
    const eventKey = `manufacturing:${batch.id}`;
    const [existingEvent] = await tx.select().from(operationEventsTable).where(eq(operationEventsTable.eventKey, eventKey)).limit(1);
    if (existingEvent) return batch;
    const [event] = await tx.insert(operationEventsTable).values({
      eventKey, kind: "manufacturing_output", status: "pending", sourceType: "manufacturing_posting", sourceId: String(batch.id),
      actorId, payload: { batchNumber: batch.batchNumber, inputCount: lines.length },
    }).returning();
    let total = 0;
    for (const line of lines.sort((a, b) => a.materialProductId - b.materialProductId)) {
      const [material] = await tx.select().from(productsTable).where(eq(productsTable.id, line.materialProductId)).limit(1);
      if (!material || material.stockQuantity < line.quantity) throw new Error(`Insufficient material stock for product ${line.materialProductId}`);
      const cost = line.quantity * Number(material.averageCost);
      total += cost;
      await tx.update(productsTable).set({ stockQuantity: material.stockQuantity - line.quantity }).where(eq(productsTable.id, material.id));
      await tx.insert(inventoryMovementsTable).values({
        productId: material.id, movementType: "decrease", quantityChange: -line.quantity,
        quantityBefore: material.stockQuantity, quantityAfter: material.stockQuantity - line.quantity,
        reason: `Manufacturing batch ${batch.batchNumber}`, unitCost: material.averageCost, totalCost: money(cost),
        sourceType: "manufacturing_batch", sourceId: String(batch.id), eventKey: `manufacturing-consumption:${batch.id}:${line.id}`, performedBy: actorId,
      });
    }
    const [output] = await tx.select().from(productsTable).where(eq(productsTable.id, batch.productId)).limit(1);
    if (!output) throw new Error("Manufacturing output product not found");
    const outputUnitCost = manufacturingOutputUnitCost(total, batch.quantityProduced);
    const outputAfter = output.stockQuantity + batch.quantityProduced;
    const outputAverage = outputAfter ? ((output.stockQuantity * Number(output.averageCost)) + total) / outputAfter : 0;
    await tx.update(productsTable).set({ stockQuantity: outputAfter, averageCost: money(outputAverage) }).where(eq(productsTable.id, output.id));
    await tx.insert(inventoryMovementsTable).values({
      productId: output.id, movementType: "increase", quantityChange: batch.quantityProduced,
      quantityBefore: output.stockQuantity, quantityAfter: outputAfter, reason: `Manufacturing batch ${batch.batchNumber}`,
      unitCost: money(outputUnitCost), totalCost: money(total), sourceType: "manufacturing_batch", sourceId: String(batch.id),
      eventKey: `manufacturing-output:${batch.id}`, performedBy: actorId,
    });
    if (event) {
      await postJournalEntry({
        entryDate: batch.productionDate, description: `Manufacturing batch ${batch.batchNumber}`, createdBy: actorId,
        sourceType: "manufacturing", sourceId: String(batch.id),
        lines: [{ accountCode: "1140", debit: total }, { accountCode: "1140", credit: total }],
      }, tx);
      await tx.update(operationEventsTable).set({ status: "posted" }).where(eq(operationEventsTable.id, event.id));
    }
    const [approved] = await tx.update(manufacturingBatchesTable).set({ status: "approved", costPerUnit: outputUnitCost }).where(eq(manufacturingBatchesTable.id, batch.id)).returning();
    return approved;
  });
}