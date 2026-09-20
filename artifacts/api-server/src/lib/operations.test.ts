import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  adminUsersTable, categoriesTable, db, inventoryBalancesTable, inventoryMovementsTable, journalEntriesTable, journalEntryLinesTable, journalEntryAuditTable,
  manufacturingBatchesTable, operationEventsTable, openingBalanceImportsTable, productsTable,
  purchaseReceiptLinesTable, purchaseReceiptPaymentsTable, purchaseReceiptsTable,
} from "@workspace/db";
import {
  addManufacturingInputs, allocateReceiptPayment, approveManufacturingBatch, approveOpeningBalanceImport,
  createOpeningBalanceImport, createPurchaseReceipt, createPurchaseReceiptPayment, manufacturingOutputUnitCost,
  inventoryAgingReport, inventoryAuditReport, inventoryMovementReport,
  postPurchaseReceipt, purchaseReceiptPaymentStatus, reviewOpeningBalanceImport, weightedAverageCost,
} from "./operations";

describe("linked operations valuation", () => {
  it("updates weighted average cost from an explicit receipt", () => {
    expect(weightedAverageCost(10, 20, 5, 32)).toBeCloseTo(24, 8);
    expect(weightedAverageCost(0, 0, 7, 11.25)).toBeCloseTo(11.25, 8);
  });

  it("allocates manufacturing input cost across output quantity", () => {
    expect(manufacturingOutputUnitCost(125, 10)).toBe(12.5);
    expect(() => manufacturingOutputUnitCost(10, 0)).toThrow("quantity must be positive");
  });

  it("splits a receipt between paid cash/owner funding and accounts payable", () => {
    expect(allocateReceiptPayment(100, 35)).toEqual({ paid: 35, payable: 65 });
    expect(() => allocateReceiptPayment(100, 101)).toThrow("Paid amount");
  });

  it("closes a receipt only when its remaining balance is settled", () => {
    expect(purchaseReceiptPaymentStatus(100, 35)).toBe("partial");
    expect(purchaseReceiptPaymentStatus(100, 100)).toBe("paid");
    expect(() => purchaseReceiptPaymentStatus(100, 101)).toThrow("exceeds");
  });
});

describe.sequential("linked operations database integration", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let actorId: number;
  let categoryId: number;
  let purchaseProductId: number;
  let materialProductId: number;
  let outputProductId: number;
  let openingProductId: number;
  const createdProductIds: number[] = [];
  const createdBatchIds: number[] = [];
  const createdReceiptIds: number[] = [];
  const createdImportIds: number[] = [];

  beforeAll(async () => {
    const [actor] = await db.insert(adminUsersTable).values({
      email: `operations-integration-${suffix}@example.com`, name: "Operations Integration",
      passwordHash: "test-hash", isSuperAdmin: true,
    }).returning();
    actorId = actor.id;
    await db.execute(sql`select setval(pg_get_serial_sequence('storefront_categories', 'id'), coalesce((select max(id) from storefront_categories), 1), true)`);
    await db.execute(sql`select setval(pg_get_serial_sequence('storefront_products', 'id'), coalesce((select max(id) from storefront_products), 1), true)`);
    const [category] = await db.insert(categoriesTable).values({
      nameAr: `اختبار العمليات ${suffix}`, nameEn: `Operations ${suffix}`, slug: `operations-${suffix}`,
    }).returning();
    categoryId = category.id;
    const products = await db.insert(productsTable).values([
      { nameAr: "شراء", nameEn: "Purchase", slug: `purchase-${suffix}`, price: 10, categoryId, stockQuantity: 10, averageCost: "20" },
      { nameAr: "مادة", nameEn: "Material", slug: `material-${suffix}`, price: 10, categoryId, stockQuantity: 5, averageCost: "10" },
      { nameAr: "ناتج", nameEn: "Output", slug: `output-${suffix}`, price: 10, categoryId, stockQuantity: 1, averageCost: "2" },
      { nameAr: "افتتاحي", nameEn: "Opening", slug: `opening-${suffix}`, price: 10, categoryId, stockQuantity: 0, averageCost: "0" },
    ]).returning();
    [purchaseProductId, materialProductId, outputProductId, openingProductId] = products.map((product) => product.id);
    createdProductIds.push(...products.map((product) => product.id));
  });

  afterAll(async () => {
    await db.delete(operationEventsTable).where(eq(operationEventsTable.actorId, actorId));
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = 'replica'`);
      const entries = await tx.select({ id: journalEntriesTable.id }).from(journalEntriesTable)
        .where(eq(journalEntriesTable.createdBy, actorId));
      if (entries.length) {
        const ids = entries.map((entry) => entry.id);
        await tx.delete(journalEntryAuditTable).where(inArray(journalEntryAuditTable.journalEntryId, ids));
        await tx.delete(journalEntryLinesTable).where(inArray(journalEntryLinesTable.journalEntryId, ids));
        await tx.delete(journalEntriesTable).where(inArray(journalEntriesTable.id, ids));
      }
    });
    await db.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.performedBy, actorId));
    if (createdReceiptIds.length) {
      await db.delete(purchaseReceiptPaymentsTable).where(inArray(purchaseReceiptPaymentsTable.receiptId, createdReceiptIds));
      await db.delete(purchaseReceiptLinesTable).where(inArray(purchaseReceiptLinesTable.receiptId, createdReceiptIds));
      await db.delete(purchaseReceiptsTable).where(inArray(purchaseReceiptsTable.id, createdReceiptIds));
    }
    if (createdBatchIds.length) await db.delete(manufacturingBatchesTable).where(inArray(manufacturingBatchesTable.id, createdBatchIds));
    if (createdImportIds.length) await db.delete(openingBalanceImportsTable).where(inArray(openingBalanceImportsTable.id, createdImportIds));
    await db.delete(inventoryBalancesTable).where(inArray(inventoryBalancesTable.productId, createdProductIds));
    await db.delete(productsTable).where(inArray(productsTable.id, createdProductIds));
    await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
    await db.delete(adminUsersTable).where(eq(adminUsersTable.id, actorId));
  });

  it("posts receipts, updates weighted average inventory, and settles AP idempotently", async () => {
    const receipt = await createPurchaseReceipt({
      receiptNumber: `R-${suffix}`, vendorName: "Integration Vendor", receiptDate: "2165-01-02",
      createdBy: actorId, lines: [{ productId: purchaseProductId, quantity: 5, unitCost: 32 }],
    });
    createdReceiptIds.push(receipt.id);
    await postPurchaseReceipt(receipt.id, actorId);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, purchaseProductId));
    expect(product.stockQuantity).toBe(15);
    expect(Number(product.averageCost)).toBeCloseTo(24, 4);
    const movements = await db.select().from(inventoryMovementsTable)
      .where(and(eq(inventoryMovementsTable.sourceType, "purchase_receipt"), eq(inventoryMovementsTable.sourceId, String(receipt.id))));
    expect(movements).toHaveLength(1);
    const [inventoryJournal] = await db.select().from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.sourceType, "purchase_receipt"), eq(journalEntriesTable.sourceId, String(receipt.id))));
    expect(inventoryJournal).toBeTruthy();

    const payment = await createPurchaseReceiptPayment({
      receiptId: receipt.id, paymentKey: `payment-${suffix}`, paymentDate: "2165-01-03",
      amount: 50, paymentSource: "company_account", paymentReference: "BANK-1", createdBy: actorId,
    });
    const retry = await createPurchaseReceiptPayment({
      receiptId: receipt.id, paymentKey: `payment-${suffix}`, paymentDate: "2165-01-03",
      amount: 50, paymentSource: "company_account", paymentReference: "BANK-1", createdBy: actorId,
    });
    expect(retry.id).toBe(payment.id);
    const [updatedReceipt] = await db.select().from(purchaseReceiptsTable).where(eq(purchaseReceiptsTable.id, receipt.id));
    expect(Number(updatedReceipt.paidAmount)).toBe(50);
    expect(updatedReceipt.paymentStatus).toBe("partial");
    const payments = await db.select().from(purchaseReceiptPaymentsTable).where(eq(purchaseReceiptPaymentsTable.receiptId, receipt.id));
    expect(payments).toHaveLength(1);
    const replayResults = await Promise.allSettled([
      createPurchaseReceiptPayment({ receiptId: receipt.id, paymentKey: `payment-conflict-${suffix}`, paymentDate: "2165-01-04", amount: 10, paymentSource: "company_account", createdBy: actorId }),
      createPurchaseReceiptPayment({ receiptId: receipt.id, paymentKey: `payment-conflict-${suffix}`, paymentDate: "2165-01-04", amount: 11, paymentSource: "company_account", createdBy: actorId }),
    ]);
    expect(replayResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(replayResults.filter((result) => result.status === "rejected")).toHaveLength(1);
    const [paymentJournal] = await db.select().from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.sourceType, "purchase_receipt_payment"), eq(journalEntriesTable.sourceId, String(payment.id))));
    const paymentLines = await db.select().from(journalEntryLinesTable).where(eq(journalEntryLinesTable.journalEntryId, paymentJournal.id));
    expect(paymentLines).toHaveLength(2);
  });

  it("consumes explicit materials and receives output, while insufficient stock rolls back", async () => {
    const [batch] = await db.insert(manufacturingBatchesTable).values({
      batchNumber: `B-${suffix}`, productId: outputProductId, quantityProduced: 2,
      productionDate: "2165-02-01", costPerUnit: 0, status: "in_production",
    }).returning();
    createdBatchIds.push(batch.id);
    await addManufacturingInputs(batch.id, [{ materialProductId, quantity: 3 }]);
    await approveManufacturingBatch(batch.id, actorId);
    const [material, output] = await Promise.all([
      db.select().from(productsTable).where(eq(productsTable.id, materialProductId)).then((rows) => rows[0]),
      db.select().from(productsTable).where(eq(productsTable.id, outputProductId)).then((rows) => rows[0]),
    ]);
    expect(material.stockQuantity).toBe(2);
    expect(output.stockQuantity).toBe(3);
    expect(Number(output.averageCost)).toBeCloseTo(10.6667, 4);

    const [raceBatch] = await db.insert(manufacturingBatchesTable).values({
      batchNumber: `B-RACE-${suffix}`, productId: outputProductId, quantityProduced: 1,
      productionDate: "2165-02-01", costPerUnit: 0, status: "in_production",
    }).returning();
    createdBatchIds.push(raceBatch.id);
    await addManufacturingInputs(raceBatch.id, [{ materialProductId, quantity: 1 }]);
    const raceResults = await Promise.all([
      approveManufacturingBatch(raceBatch.id, actorId),
      approveManufacturingBatch(raceBatch.id, actorId),
    ]);
    expect(raceResults.every((result) => result.status === "approved")).toBe(true);
    const raceMovements = await db.select().from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.sourceId, String(raceBatch.id)));
    expect(raceMovements).toHaveLength(2);
    const raceEvents = await db.select().from(operationEventsTable)
      .where(and(
        eq(operationEventsTable.sourceType, "manufacturing_posting"),
        eq(operationEventsTable.sourceId, String(raceBatch.id)),
      ));
    expect(raceEvents).toHaveLength(1);
    const raceJournals = await db.select().from(journalEntriesTable)
      .where(and(eq(journalEntriesTable.sourceType, "manufacturing"), eq(journalEntriesTable.sourceId, String(raceBatch.id))));
    expect(raceJournals).toHaveLength(1);

    const [badBatch] = await db.insert(manufacturingBatchesTable).values({
      batchNumber: `B-BAD-${suffix}`, productId: outputProductId, quantityProduced: 1,
      productionDate: "2165-02-02", costPerUnit: 0, status: "in_production",
    }).returning();
    createdBatchIds.push(badBatch.id);
    await addManufacturingInputs(badBatch.id, [{ materialProductId, quantity: 3 }]);
    await expect(approveManufacturingBatch(badBatch.id, actorId)).rejects.toThrow("Insufficient material stock");
    const [unchanged] = await db.select().from(productsTable).where(eq(productsTable.id, materialProductId));
    expect(unchanged.stockQuantity).toBe(1);
    const badMovements = await db.select().from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.sourceId, String(badBatch.id)));
    expect(badMovements).toHaveLength(0);
  });

  it("rejects approval of a second distinct opening import", async () => {
    const makeImport = async (key: string, productId = openingProductId) => {
      const row = await createOpeningBalanceImport({
        importKey: key, sourceFileName: "integration.xlsx", sourceSheet: "المخوزن الفعلي", createdBy: actorId,
        lines: [{ sourceRow: 2, sourceLabel: "Purchase", sourceQuantity: 1, openingQuantity: 1, fullBatchUnitCost: 24,
          productId, provenance: { file: "integration.xlsx", sheet: "المخوزن الفعلي", row: 2 } }],
      });
      createdImportIds.push(row.id);
      await reviewOpeningBalanceImport(row.id);
      return row.id;
    };
    const [existingApprovedBeforeChecks] = await db.select({ id: openingBalanceImportsTable.id })
      .from(openingBalanceImportsTable).where(eq(openingBalanceImportsTable.status, "approved")).limit(1);
    if (!existingApprovedBeforeChecks) {
    const duplicate = await createOpeningBalanceImport({
      importKey: `opening-${suffix}-duplicate`, sourceFileName: "integration.xlsx", sourceSheet: "المخوزن الفعلي", createdBy: actorId,
      lines: [
        { sourceRow: 2, sourceLabel: "A", sourceQuantity: 1, openingQuantity: 1, fullBatchUnitCost: 24, productId: purchaseProductId, provenance: { file: "integration.xlsx", sheet: "المخوزن الفعلي", row: 2 } },
        { sourceRow: 3, sourceLabel: "B", sourceQuantity: 1, openingQuantity: 1, fullBatchUnitCost: 24, productId: purchaseProductId, provenance: { file: "integration.xlsx", sheet: "المخوزن الفعلي", row: 3 } },
      ],
    });
    createdImportIds.push(duplicate.id);
    await reviewOpeningBalanceImport(duplicate.id);
    await expect(approveOpeningBalanceImport(duplicate.id, actorId, "2165-02-28")).rejects.toThrow("only once");
    const live = await makeImport(`opening-${suffix}-live`, purchaseProductId);
    await expect(approveOpeningBalanceImport(live, actorId, "2165-02-28")).rejects.toThrow("overwrite live inventory");
    }
    const [existingApproved] = await db.select({ id: openingBalanceImportsTable.id })
      .from(openingBalanceImportsTable).where(eq(openingBalanceImportsTable.status, "approved")).limit(1);
    if (!existingApproved) {
      const firstId = await makeImport(`opening-${suffix}-one`);
      await approveOpeningBalanceImport(firstId, actorId, "2165-03-01");
    }
    const secondId = await makeImport(`opening-${suffix}-two`);
    await expect(approveOpeningBalanceImport(secondId, actorId, "2165-03-02")).rejects.toThrow("already been approved");
  });

  it("keeps movement and audit reports bounded on a large movement history", async () => {
    const inserted = await db.execute(sql`
      insert into inventory_movements (
        product_id, movement_type, quantity_change, quantity_before, quantity_after,
        reason, source_type, source_id, performed_by, created_at
      )
      select ${purchaseProductId}, 'increase', 1, n, n + 1, 'report performance',
        'performance_test', n::text, ${actorId}, now() - (n || ' seconds')::interval
      from generate_series(1, 5000) n
    `);
    expect(inserted.rowCount).toBe(5000);

    const startedAt = performance.now();
    const movements = await inventoryMovementReport({ sourceType: "performance_test", page: 2, pageSize: 40 });
    const audit = await inventoryAuditReport({ sourceType: "performance_test", page: 1, pageSize: 25 });
    const aging = await inventoryAgingReport();
    const elapsedMs = performance.now() - startedAt;

    expect(movements.items).toHaveLength(40);
    expect(movements.total).toBe(5000);
    expect(movements.page).toBe(2);
    expect(audit.items).toHaveLength(25);
    expect(audit.total).toBe(5000);
    expect(aging.some((row) => row.productId === purchaseProductId)).toBe(true);
    expect(elapsedMs).toBeLessThan(2000);
  });
});