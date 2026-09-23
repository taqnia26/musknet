import { and, asc, eq, ne, sql, desc, ilike } from "drizzle-orm";
import {
  db, inventoryMovementsTable, operationEventsTable, openingBalanceImportsTable,
  openingBalanceLinesTable, productsTable,
  purchaseReceiptsTable, purchaseReceiptLinesTable, purchaseReceiptPaymentsTable, manufacturingBatchesTable, manufacturingInputLinesTable,
  inventoryLocationsTable, inventoryBalancesTable,
  inventoryTransfersTable, inventoryTransferLinesTable, inventoryCycleCountsTable, inventoryCycleCountLinesTable,
  inventoryAlertsTable,
  inventoryPurchaseOrdersTable, inventoryPurchaseOrderLinesTable,
  accountingAccountsTable, journalEntriesTable, journalEntryLinesTable, adminUsersTable,
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

export async function adjustOperationalBalances(
  tx: any,
  productId: number,
  quantityChange: number,
  unitCost: string | number,
  globalQuantityBefore: number,
) {
  if (!Number.isInteger(quantityChange) || quantityChange === 0) return;
  let balances = await tx.select({
    id: inventoryBalancesTable.id,
    available: inventoryBalancesTable.available,
    isDefault: inventoryLocationsTable.isDefault,
    locationCode: inventoryLocationsTable.code,
  }).from(inventoryBalancesTable)
    .innerJoin(inventoryLocationsTable, eq(inventoryLocationsTable.id, inventoryBalancesTable.locationId))
    .where(and(
      eq(inventoryBalancesTable.productId, productId),
      ne(inventoryLocationsTable.code, "B2B_USED_RETURN"),
    ))
    .orderBy(sql`${inventoryLocationsTable.isDefault} desc`, inventoryBalancesTable.id)
    .for("update");

  if (!balances.length) {
    let [location] = await tx.select().from(inventoryLocationsTable)
      .where(eq(inventoryLocationsTable.isDefault, true)).limit(1);
    if (!location) {
      [location] = await tx.insert(inventoryLocationsTable)
        .values({ name: "Default warehouse", code: "DEFAULT", isDefault: true })
        .returning();
    }
    const [created] = await tx.insert(inventoryBalancesTable).values({
      productId,
      locationId: location.id,
      available: globalQuantityBefore,
      averageCost: money(unitCost),
    }).returning();
    balances = [{ id: created.id, available: created.available, isDefault: true }];
  }

  if (quantityChange > 0) {
    const target = balances.find((balance: { isDefault: boolean }) => balance.isDefault) ?? balances[0];
    await tx.update(inventoryBalancesTable).set({
      available: target.available + quantityChange,
      averageCost: money(unitCost),
      updatedAt: new Date(),
    }).where(eq(inventoryBalancesTable.id, target.id));
    return;
  }

  let remaining = -quantityChange;
  const available = balances.reduce((sum: number, balance: { available: number }) => sum + balance.available, 0);
  if (available < remaining) throw new Error(`Insufficient operational balance for product ${productId}`);
  for (const balance of balances) {
    if (!remaining) break;
    const deducted = Math.min(balance.available, remaining);
    if (!deducted) continue;
    await tx.update(inventoryBalancesTable).set({
      available: balance.available - deducted,
      updatedAt: new Date(),
    }).where(eq(inventoryBalancesTable.id, balance.id));
    remaining -= deducted;
  }
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
      await adjustOperationalBalances(tx, product.id, line.openingQuantity - before, line.fullBatchUnitCost, before);
      await tx.update(inventoryBalancesTable).set({
        averageCost: money(line.fullBatchUnitCost),
        updatedAt: new Date(),
      }).where(eq(inventoryBalancesTable.productId, product.id));
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
      await adjustOperationalBalances(tx, product.id, line.quantity, averageCost, before);
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
      await adjustOperationalBalances(tx, material.id, -line.quantity, material.averageCost, material.stockQuantity);
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
    await adjustOperationalBalances(tx, output.id, batch.quantityProduced, outputAverage, output.stockQuantity);
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

/** Returns (and, on first use, creates) the migration-safe default location. */
export async function ensureDefaultInventoryLocation() {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.isDefault, true)).limit(1);
    if (existing) return existing;
    const [created] = await tx.insert(inventoryLocationsTable).values({ name: "Default warehouse", code: "DEFAULT", type: "warehouse", isDefault: true }).returning();
    if (!created) throw new Error("Could not create default inventory location");
    return created;
  });
}

export async function listInventoryLocations() {
  await ensureDefaultInventoryLocation();
  const rows = await db.select().from(inventoryLocationsTable).orderBy(inventoryLocationsTable.id);
  return rows.map((row) => row.code === "B2B_USED_RETURN"
    ? { ...row, name: "تيستر مفتوح (Opened Testers)" }
    : row);
}

export async function lookupInventoryBarcode(barcode: string) {
  const value = barcode.trim();
  if (!value) throw new Error("Barcode is required");
  const [product] = await db.select().from(productsTable).where(eq(productsTable.barcode, value)).limit(1);
  return product ?? null;
}

export async function listInventoryBalances(locationId?: number) {
  return db.select().from(inventoryBalancesTable).where(locationId ? eq(inventoryBalancesTable.locationId, locationId) : undefined)
    .orderBy(desc(inventoryBalancesTable.updatedAt));
}

export async function transferInventory(input: {
  transferNumber: string; idempotencyKey: string; fromLocationId: number; toLocationId: number; createdBy: number;
  lines: Array<{ productId: number; quantity: number }>;
}) {
  if (input.fromLocationId === input.toLocationId) throw new Error("Transfer locations must differ");
  if (!input.lines.length || input.lines.some((l) => !Number.isSafeInteger(l.quantity) || l.quantity <= 0)) throw new Error("Transfer quantities must be positive integers");
  return db.transaction(async (tx) => {
    const protectedLocations = await tx.select({ id: inventoryLocationsTable.id }).from(inventoryLocationsTable)
      .where(and(eq(inventoryLocationsTable.code, "B2B_USED_RETURN"), sql`${inventoryLocationsTable.id} in (${input.fromLocationId}, ${input.toLocationId})`));
    if (protectedLocations.length) throw new Error("Opened tester stock cannot be transferred as ordinary inventory");
    const [prior] = await tx.select().from(inventoryTransfersTable).where(eq(inventoryTransfersTable.idempotencyKey, input.idempotencyKey)).limit(1);
    if (prior) return prior;
    const [transfer] = await tx.insert(inventoryTransfersTable).values(input).returning();
    if (!transfer) throw new Error("Transfer could not be created");
    for (const line of [...input.lines].sort((a, b) => a.productId - b.productId)) {
      const [balance] = await tx.select().from(inventoryBalancesTable)
        .where(and(eq(inventoryBalancesTable.productId, line.productId), eq(inventoryBalancesTable.locationId, input.fromLocationId))).for("update");
      if (!balance || balance.available < line.quantity) throw new Error(`Insufficient inventory for product ${line.productId}`);
      const [destination] = await tx.select().from(inventoryBalancesTable).where(and(eq(inventoryBalancesTable.productId, line.productId), eq(inventoryBalancesTable.locationId, input.toLocationId))).for("update");
      if (destination) await tx.update(inventoryBalancesTable).set({ incoming: destination.incoming + line.quantity, updatedAt: new Date() }).where(eq(inventoryBalancesTable.id, destination.id));
      else await tx.insert(inventoryBalancesTable).values({ productId: line.productId, locationId: input.toLocationId, incoming: line.quantity, averageCost: balance.averageCost });
      await tx.insert(inventoryTransferLinesTable).values({ transferId: transfer.id, productId: line.productId, quantity: line.quantity, unitCost: balance.averageCost });
    }
    return transfer;
  });
}

export async function sendInventoryTransfer(transferId: number, actorId: number) {
  return db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(inventoryTransfersTable).where(eq(inventoryTransfersTable.id, transferId)).for("update");
    if (!transfer) throw new Error("Transfer not found");
    const protectedLocations = await tx.select({ id: inventoryLocationsTable.id }).from(inventoryLocationsTable)
      .where(and(eq(inventoryLocationsTable.code, "B2B_USED_RETURN"), sql`${inventoryLocationsTable.id} in (${transfer.fromLocationId}, ${transfer.toLocationId})`));
    if (protectedLocations.length) throw new Error("Opened tester stock cannot be transferred as ordinary inventory");
    if (transfer.status === "sent" || transfer.status === "received") return transfer;
    if (transfer.status !== "draft") throw new Error("Only draft transfers can be sent");
    const lines = await tx.select().from(inventoryTransferLinesTable).where(eq(inventoryTransferLinesTable.transferId, transferId));
    for (const line of lines) {
      const [balance] = await tx.select().from(inventoryBalancesTable).where(and(eq(inventoryBalancesTable.productId, line.productId), eq(inventoryBalancesTable.locationId, transfer.fromLocationId))).for("update");
      if (!balance || balance.available < line.quantity) throw new Error(`Insufficient inventory for product ${line.productId}`);
      await tx.update(inventoryBalancesTable).set({ available: balance.available - line.quantity, updatedAt: new Date() }).where(eq(inventoryBalancesTable.id, balance.id));
      await tx.insert(inventoryMovementsTable).values({ productId: line.productId, movementType: "decrease", quantityChange: -line.quantity, quantityBefore: balance.available, quantityAfter: balance.available - line.quantity, unitCost: balance.averageCost, totalCost: money(line.quantity * Number(balance.averageCost)), reason: `Transfer ${transfer.transferNumber} sent`, sourceType: "inventory_transfer", sourceId: String(transfer.id), eventKey: `transfer-send:${transfer.id}:${line.id}`, performedBy: actorId });
    }
    const [row] = await tx.update(inventoryTransfersTable).set({ status: "sent", sentAt: new Date() }).where(eq(inventoryTransfersTable.id, transferId)).returning();
    return row;
  });
}

export async function receiveInventoryTransfer(transferId: number, actorId: number) {
  return db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(inventoryTransfersTable).where(eq(inventoryTransfersTable.id, transferId)).for("update");
    if (!transfer) throw new Error("Transfer not found");
    const protectedLocations = await tx.select({ id: inventoryLocationsTable.id }).from(inventoryLocationsTable)
      .where(and(eq(inventoryLocationsTable.code, "B2B_USED_RETURN"), sql`${inventoryLocationsTable.id} in (${transfer.fromLocationId}, ${transfer.toLocationId})`));
    if (protectedLocations.length) throw new Error("Opened tester stock cannot be transferred as ordinary inventory");
    if (transfer.status === "received") return transfer;
    if (transfer.status !== "sent") throw new Error("Only sent transfers can be received");
    const lines = await tx.select().from(inventoryTransferLinesTable).where(eq(inventoryTransferLinesTable.transferId, transferId));
    for (const line of lines) {
      const [destination] = await tx.select().from(inventoryBalancesTable).where(and(eq(inventoryBalancesTable.productId, line.productId), eq(inventoryBalancesTable.locationId, transfer.toLocationId))).for("update");
      if (!destination) throw new Error("Transfer destination balance missing");
      if (destination.incoming < line.quantity) throw new Error("Incoming quantity is inconsistent");
      await tx.update(inventoryBalancesTable).set({ incoming: destination.incoming - line.quantity, available: destination.available + line.quantity, updatedAt: new Date() }).where(eq(inventoryBalancesTable.id, destination.id));
    }
    const [row] = await tx.update(inventoryTransfersTable).set({ status: "received", receivedAt: new Date() }).where(eq(inventoryTransfersTable.id, transferId)).returning();
    return row;
  });
}

export async function inventoryValueReport() {
  const rows = await db.select().from(inventoryBalancesTable);
  return rows.map((row) => ({ ...row, value: (row.available + row.reserved) * Number(row.averageCost) }));
}

export async function inventoryReorderSuggestions() {
  const products = await db.select().from(productsTable).where(eq(productsTable.isActive, true));
  const balances = await db.select({
    productId: inventoryBalancesTable.productId,
    available: inventoryBalancesTable.available,
    incoming: inventoryBalancesTable.incoming,
  }).from(inventoryBalancesTable)
    .innerJoin(inventoryLocationsTable, eq(inventoryLocationsTable.id, inventoryBalancesTable.locationId))
    .where(ne(inventoryLocationsTable.code, "B2B_USED_RETURN"));
  const suggestions = products.map((product) => {
    const rows = balances.filter((b) => b.productId === product.id);
    const available = rows.reduce((n, b) => n + b.available, 0);
    const incoming = rows.reduce((n, b) => n + b.incoming, 0);
    const reorderQuantity = Math.max(0, product.targetStockQuantity - available - incoming);
    return { productId: product.id, sku: product.sku, available, incoming, reorderPoint: product.reorderPoint, reorderQuantity, status: available <= 0 ? "out" : available <= product.reorderPoint ? "low" : "ok" };
  }).filter((x) => x.reorderQuantity > 0);
  await db.transaction(async (tx) => {
    for (const item of suggestions) {
      await tx.insert(inventoryAlertsTable).values({ productId: item.productId, kind: item.status, reorderQuantity: item.reorderQuantity })
        .onConflictDoNothing();
    }
  });
  return suggestions;
}

export type InventoryReportQuery = {
  productId?: number;
  sourceType?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

function normalizeReportQuery(query: InventoryReportQuery) {
  const page = Number.isInteger(query.page) && Number(query.page) > 0 ? Number(query.page) : 1;
  const requestedPageSize = Number.isInteger(query.pageSize) ? Number(query.pageSize) : 50;
  const pageSize = Math.min(100, Math.max(1, requestedPageSize));
  return { ...query, page, pageSize };
}

function movementReportWhere(query: InventoryReportQuery) {
  return and(
    query.productId ? eq(inventoryMovementsTable.productId, query.productId) : undefined,
    query.sourceType ? eq(inventoryMovementsTable.sourceType, query.sourceType) : undefined,
    query.from ? sql`${inventoryMovementsTable.createdAt} >= ${query.from}` : undefined,
    query.to ? sql`${inventoryMovementsTable.createdAt} <= ${query.to}` : undefined,
  );
}

export async function inventoryMovementReport(input: InventoryReportQuery = {}) {
  const query = normalizeReportQuery(input);
  const where = movementReportWhere(query);
  const [items, [totalRow]] = await Promise.all([
    db.select().from(inventoryMovementsTable).where(where)
      .orderBy(desc(inventoryMovementsTable.createdAt), desc(inventoryMovementsTable.id))
      .limit(query.pageSize).offset((query.page - 1) * query.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(inventoryMovementsTable).where(where),
  ]);
  return { items, page: query.page, pageSize: query.pageSize, total: totalRow?.total ?? 0 };
}
export async function inventoryAgingReport() {
  return db.select({
    id: inventoryBalancesTable.id,
    productId: inventoryBalancesTable.productId,
    locationId: inventoryBalancesTable.locationId,
    available: inventoryBalancesTable.available,
    reserved: inventoryBalancesTable.reserved,
    incoming: inventoryBalancesTable.incoming,
    averageCost: inventoryBalancesTable.averageCost,
    updatedAt: inventoryBalancesTable.updatedAt,
    ageDays: sql<number>`greatest(0, floor(extract(epoch from (now() - coalesce(min(${inventoryMovementsTable.createdAt}), now()))) / 86400))::int`,
  }).from(inventoryBalancesTable)
    .leftJoin(inventoryMovementsTable, and(
      eq(inventoryMovementsTable.productId, inventoryBalancesTable.productId),
      eq(inventoryMovementsTable.movementType, "increase"),
    ))
    .groupBy(inventoryBalancesTable.id);
}

export async function inventoryValuationReport() {
  const rows = await db.select({ balance: inventoryBalancesTable, location: inventoryLocationsTable, product: productsTable })
    .from(inventoryBalancesTable).innerJoin(inventoryLocationsTable, eq(inventoryBalancesTable.locationId, inventoryLocationsTable.id))
    .innerJoin(productsTable, eq(inventoryBalancesTable.productId, productsTable.id));
  const grouped = new Map<string, { locationId: number; location: string; operationalType: string; quantity: number; value: number }>();
  for (const row of rows) {
    const key = `${row.location.id}:${row.product.operationalType}`;
    const current = grouped.get(key) ?? { locationId: row.location.id, location: row.location.name, operationalType: row.product.operationalType, quantity: 0, value: 0 };
    current.quantity += row.balance.available + row.balance.reserved;
    current.value += (row.balance.available + row.balance.reserved) * Number(row.balance.averageCost);
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

export async function inventoryAuditReport(input: InventoryReportQuery = {}) {
  const query = normalizeReportQuery(input);
  const where = movementReportWhere(query);
  const [items, [totalRow]] = await Promise.all([
    db.select({ id: inventoryMovementsTable.id, productId: inventoryMovementsTable.productId, sourceType: inventoryMovementsTable.sourceType, sourceId: inventoryMovementsTable.sourceId, quantityChange: inventoryMovementsTable.quantityChange, performedBy: inventoryMovementsTable.performedBy, performerName: adminUsersTable.name, createdAt: inventoryMovementsTable.createdAt })
      .from(inventoryMovementsTable).leftJoin(adminUsersTable, eq(inventoryMovementsTable.performedBy, adminUsersTable.id))
      .where(where).orderBy(desc(inventoryMovementsTable.createdAt), desc(inventoryMovementsTable.id))
      .limit(query.pageSize).offset((query.page - 1) * query.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(inventoryMovementsTable).where(where),
  ]);
  return { items, page: query.page, pageSize: query.pageSize, total: totalRow?.total ?? 0 };
}

export async function inventoryReconciliationReport() {
  const [account] = await db.select({ value: sql<string>`coalesce(sum(${journalEntryLinesTable.debit} - ${journalEntryLinesTable.credit}), 0)` })
    .from(journalEntryLinesTable).innerJoin(journalEntriesTable, eq(journalEntryLinesTable.journalEntryId, journalEntriesTable.id))
    .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
    .where(and(eq(accountingAccountsTable.code, "1140"), eq(journalEntriesTable.status, "posted")));
  const values = await inventoryValueReport();
  const operationalValue = values.reduce((n, row) => n + Number(row.value), 0);
  const movements = await db.select({ sourceType: inventoryMovementsTable.sourceType, sourceId: inventoryMovementsTable.sourceId, eventKey: inventoryMovementsTable.eventKey }).from(inventoryMovementsTable);
  const journals = await db.select({ sourceType: journalEntriesTable.sourceType, sourceId: journalEntriesTable.sourceId }).from(journalEntriesTable).where(eq(journalEntriesTable.status, "posted"));
  const journalKeys = new Set(journals.map((j) => `${j.sourceType}:${j.sourceId}`));
  const movementKeys = new Set(movements.flatMap((m) => [
    `${m.sourceType}:${m.sourceId}`,
    // Older opened-tester issues used a dedicated movement type while their
    // journal used the gifting issue type.
    ...(m.sourceType === "b2b_tester_used_return" ? [`gifting_issue:${m.sourceId}`, `gifting_issue_batch:${m.sourceId}`] : []),
    ...(m.sourceType === "b2b_return_new" || m.sourceType === "b2b_return_used"
      ? [m.eventKey?.startsWith("b2b:return:")
        ? `b2b_evaluation_return:${m.eventKey.slice("b2b:return:".length)}`
        : `b2b_evaluation_return:${m.sourceId}`]
      : []),
  ]));
  const movementLinked = (m: typeof movements[number]) =>
    journalKeys.has(`${m.sourceType}:${m.sourceId}`) ||
    (m.sourceType === "b2b_tester_used_return" && (journalKeys.has(`gifting_issue:${m.sourceId}`) || journalKeys.has(`gifting_issue_batch:${m.sourceId}`))) ||
    ((m.sourceType === "b2b_return_new" || m.sourceType === "b2b_return_used") && movementKeys.has(`b2b_evaluation_return:${m.eventKey?.slice("b2b:return:".length)}`));
  return { operationalValue, accountingInventoryValue: Number(account?.value ?? 0), difference: operationalValue - Number(account?.value ?? 0), unlinkedMovements: movements.filter((m) => !movementLinked(m)), unlinkedInventoryJournals: journals.filter((j) => (j.sourceType?.includes("inventory") || j.sourceType === "b2b_evaluation_return" || j.sourceType === "gifting_issue" || j.sourceType === "gifting_issue_batch") && !movementKeys.has(`${j.sourceType}:${j.sourceId}`)) };
}

export function inventoryCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const quote = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return [columns.map(quote).join(","), ...rows.map((r) => columns.map((c) => quote(r[c])).join(","))].join("\n");
}

export async function createInventoryPurchaseOrder(input: { orderNumber: string; vendorName: string; locationId: number; idempotencyKey: string; createdBy: number; lines: Array<{ productId: number; quantity: number; unitCost: string | number }> }) {
  if (!input.lines.length || input.lines.some((l) => l.quantity <= 0 || Number(l.unitCost) < 0)) throw new Error("Purchase order lines must be positive");
  return db.transaction(async (tx) => {
    const [prior] = await tx.select().from(inventoryPurchaseOrdersTable).where(eq(inventoryPurchaseOrdersTable.idempotencyKey, input.idempotencyKey)).limit(1);
    if (prior) {
      const priorLines = await tx.select().from(inventoryPurchaseOrderLinesTable).where(eq(inventoryPurchaseOrderLinesTable.purchaseOrderId, prior.id));
      return {
        ...prior,
        lines: priorLines.map((line) => ({ productId: line.productId, quantity: line.orderedQuantity, receivedQuantity: line.receivedQuantity, unitCost: line.unitCost })),
      };
    }
    const [order] = await tx.insert(inventoryPurchaseOrdersTable).values({ orderNumber: input.orderNumber, vendorName: input.vendorName, locationId: input.locationId, idempotencyKey: input.idempotencyKey, createdBy: input.createdBy, status: "ordered" }).returning();
    if (!order) throw new Error("Purchase order could not be created");
    const createdLines = await tx.insert(inventoryPurchaseOrderLinesTable).values(input.lines.map((l) => ({ purchaseOrderId: order.id, productId: l.productId, orderedQuantity: l.quantity, unitCost: money(l.unitCost) }))).returning();
    for (const l of input.lines) {
      const [b] = await tx.select().from(inventoryBalancesTable).where(and(eq(inventoryBalancesTable.productId, l.productId), eq(inventoryBalancesTable.locationId, input.locationId))).for("update");
      if (b) await tx.update(inventoryBalancesTable).set({ incoming: b.incoming + l.quantity, updatedAt: new Date() }).where(eq(inventoryBalancesTable.id, b.id));
      else await tx.insert(inventoryBalancesTable).values({ productId: l.productId, locationId: input.locationId, incoming: l.quantity, averageCost: money(l.unitCost) });
    }
    return {
      ...order,
      lines: createdLines.map((line) => ({ productId: line.productId, quantity: line.orderedQuantity, receivedQuantity: line.receivedQuantity, unitCost: line.unitCost })),
    };
  });
}

export async function receiveInventoryPurchaseOrder(orderId: number, actorId: number, receipts: Array<{ productId: number; quantity: number }>, idempotencyKey = `legacy-${Date.now()}`) {
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(inventoryPurchaseOrdersTable).where(eq(inventoryPurchaseOrdersTable.id, orderId)).for("update");
    if (!order || order.status === "cancelled") throw new Error("Purchase order is not receivable");
    const eventKey = `inventory-po-receipt:${orderId}:${idempotencyKey}`;
    const receiptSourceId = `${orderId}:${idempotencyKey}`;
    const [event] = await tx.insert(operationEventsTable).values({ eventKey, kind: "purchase_receipt", status: "pending", sourceType: "inventory_purchase_order_receipt", sourceId: receiptSourceId, actorId, payload: { receipts } }).onConflictDoNothing({ target: operationEventsTable.eventKey }).returning();
    if (!event) {
      const replayLines = await tx.select().from(inventoryPurchaseOrderLinesTable).where(eq(inventoryPurchaseOrderLinesTable.purchaseOrderId, orderId));
      return {
        ...order,
        lines: replayLines.map((line) => ({ productId: line.productId, quantity: line.orderedQuantity, receivedQuantity: line.receivedQuantity, unitCost: line.unitCost })),
      };
    }
    const lines = await tx.select().from(inventoryPurchaseOrderLinesTable).where(eq(inventoryPurchaseOrderLinesTable.purchaseOrderId, orderId));
    let total = 0;
    for (const receipt of receipts.sort((a, b) => a.productId - b.productId)) {
      const line = lines.find((l) => l.productId === receipt.productId);
      if (!line || receipt.quantity <= 0 || line.receivedQuantity + receipt.quantity > line.orderedQuantity) throw new Error("Receipt exceeds ordered quantity");
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, line.productId)).for("update");
      if (!product) throw new Error("Product not found");
      const [balance] = await tx.select().from(inventoryBalancesTable).where(and(eq(inventoryBalancesTable.productId, line.productId), eq(inventoryBalancesTable.locationId, order.locationId))).for("update");
      if (!balance) throw new Error("Purchase order balance missing");
      const oldQty = balance.available, incoming = balance.incoming - receipt.quantity;
      if (incoming < 0) throw new Error("Incoming inventory cannot be negative");
      const avg = weightedAverageCost(oldQty, Number(balance.averageCost), receipt.quantity, Number(line.unitCost));
      await tx.update(inventoryBalancesTable).set({ available: oldQty + receipt.quantity, incoming, averageCost: money(avg), updatedAt: new Date() }).where(eq(inventoryBalancesTable.id, balance.id));
      const globalAvg = weightedAverageCost(product.stockQuantity, Number(product.averageCost), receipt.quantity, Number(line.unitCost));
      await tx.update(productsTable).set({ stockQuantity: product.stockQuantity + receipt.quantity, averageCost: money(globalAvg) }).where(eq(productsTable.id, product.id));
      total += receipt.quantity * Number(line.unitCost);
      await tx.update(inventoryPurchaseOrderLinesTable).set({ receivedQuantity: line.receivedQuantity + receipt.quantity, receivedAt: new Date() }).where(eq(inventoryPurchaseOrderLinesTable.id, line.id));
      await tx.insert(inventoryMovementsTable).values({ productId: line.productId, movementType: "increase", quantityChange: receipt.quantity, quantityBefore: product.stockQuantity, quantityAfter: product.stockQuantity + receipt.quantity, unitCost: line.unitCost, totalCost: money(receipt.quantity * Number(line.unitCost)), reason: `Purchase order ${order.orderNumber}`, sourceType: "inventory_purchase_order_receipt", sourceId: receiptSourceId, eventKey: `inventory-po:${order.id}:${line.id}:${line.receivedQuantity + receipt.quantity}`, performedBy: actorId });
    }
    const refreshed = await tx.select().from(inventoryPurchaseOrderLinesTable).where(eq(inventoryPurchaseOrderLinesTable.purchaseOrderId, orderId));
    const status = refreshed.every((l) => l.receivedQuantity === l.orderedQuantity) ? "received" : "partially_received";
    if (total > 0) await postJournalEntry({ entryDate: new Date().toISOString().slice(0, 10), description: `Inventory purchase ${order.orderNumber}`, createdBy: actorId, sourceType: "inventory_purchase_order_receipt", sourceId: receiptSourceId, lines: [{ accountCode: "1140", debit: total }, { accountCode: "2110", credit: total }] }, tx);
    await tx.update(operationEventsTable).set({ status: "posted" }).where(eq(operationEventsTable.id, event.id));
    const [updated] = await tx.update(inventoryPurchaseOrdersTable).set({ status }).where(eq(inventoryPurchaseOrdersTable.id, orderId)).returning();
    return {
      ...updated,
      lines: refreshed.map((line) => ({ productId: line.productId, quantity: line.orderedQuantity, receivedQuantity: line.receivedQuantity, unitCost: line.unitCost })),
    };
  });
}

export async function createCycleCount(input: { locationId: number; createdBy: number; lines: Array<{ productId: number; countedQuantity: number }> }) {
  return db.transaction(async (tx) => {
    const [protectedLocation] = await tx.select({ id: inventoryLocationsTable.id }).from(inventoryLocationsTable)
      .where(and(eq(inventoryLocationsTable.id, input.locationId), eq(inventoryLocationsTable.code, "B2B_USED_RETURN"))).limit(1);
    if (protectedLocation) throw new Error("Opened tester stock cannot be cycle-counted as ordinary inventory");
    const [count] = await tx.insert(inventoryCycleCountsTable).values({ locationId: input.locationId, createdBy: input.createdBy }).returning();
    if (!count) throw new Error("Cycle count could not be created");
    const createdLines: Array<typeof inventoryCycleCountLinesTable.$inferSelect> = [];
    for (const l of input.lines) {
      const [b] = await tx.select().from(inventoryBalancesTable).where(and(eq(inventoryBalancesTable.productId, l.productId), eq(inventoryBalancesTable.locationId, input.locationId)));
      if (l.countedQuantity < 0) throw new Error("Count cannot be negative");
      const [createdLine] = await tx.insert(inventoryCycleCountLinesTable).values({ cycleCountId: count.id, productId: l.productId, expectedQuantity: b?.available ?? 0, countedQuantity: l.countedQuantity, unitCost: b?.averageCost ?? "0" }).returning();
      createdLines.push(createdLine);
    }
    return { ...count, lines: createdLines };
  });
}

export async function approveCycleCount(countId: number, actorId: number) {
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    const [count] = await tx.select().from(inventoryCycleCountsTable).where(eq(inventoryCycleCountsTable.id, countId)).for("update");
    if (!count) throw new Error("Cycle count not found");
    if (count.status === "approved") {
      const lines = await tx.select().from(inventoryCycleCountLinesTable).where(eq(inventoryCycleCountLinesTable.cycleCountId, countId));
      return { ...count, lines };
    }
    if (count.status !== "review") throw new Error("Cycle count must be reviewed before approval");
    const lines = await tx.select().from(inventoryCycleCountLinesTable).where(eq(inventoryCycleCountLinesTable.cycleCountId, countId));
    for (const l of lines) {
      const [b] = await tx.select().from(inventoryBalancesTable).where(and(eq(inventoryBalancesTable.productId, l.productId), eq(inventoryBalancesTable.locationId, count.locationId))).for("update");
      const before = b?.available ?? 0, delta = l.countedQuantity - before;
      if (!b) await tx.insert(inventoryBalancesTable).values({ productId: l.productId, locationId: count.locationId, available: l.countedQuantity, averageCost: l.unitCost });
      else await tx.update(inventoryBalancesTable).set({ available: l.countedQuantity, updatedAt: new Date() }).where(eq(inventoryBalancesTable.id, b.id));
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, l.productId)).for("update");
      if (!product || product.stockQuantity + delta < 0) throw new Error("Cycle count would create negative global stock");
      await tx.update(productsTable).set({ stockQuantity: product.stockQuantity + delta }).where(eq(productsTable.id, product.id));
      if (delta) await tx.insert(inventoryMovementsTable).values({ productId: l.productId, movementType: "adjustment", quantityChange: delta, quantityBefore: before, quantityAfter: l.countedQuantity, unitCost: l.unitCost, totalCost: money(Math.abs(delta) * Number(l.unitCost)), reason: `Cycle count ${count.id}`, sourceType: "cycle_count", sourceId: String(count.id), eventKey: `cycle-count:${count.id}:${l.id}`, performedBy: actorId });
    }
    const variance = lines.reduce((n, l) => n + (l.countedQuantity - l.expectedQuantity) * Number(l.unitCost), 0);
    if (variance !== 0) await postJournalEntry({ entryDate: new Date().toISOString().slice(0, 10), description: `Cycle count ${count.id} variance`, createdBy: actorId, sourceType: "cycle_count", sourceId: String(count.id), lines: variance > 0 ? [{ accountCode: "1140", debit: variance }, { accountCode: "5100", credit: variance }] : [{ accountCode: "5100", debit: -variance }, { accountCode: "1140", credit: -variance }] }, tx);
    const [updated] = await tx.update(inventoryCycleCountsTable).set({ status: "approved", approvedBy: actorId, approvedAt: new Date() }).where(eq(inventoryCycleCountsTable.id, countId)).returning();
    return { ...updated, lines };
  });
}