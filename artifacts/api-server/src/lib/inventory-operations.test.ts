import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import {
  accountingAccountsTable,
  adminUsersTable,
  categoriesTable,
  db,
  inventoryBalancesTable,
  inventoryCycleCountLinesTable,
  inventoryCycleCountsTable,
  inventoryLocationsTable,
  inventoryMovementsTable,
  inventoryPurchaseOrderLinesTable,
  inventoryPurchaseOrdersTable,
  inventoryTransferLinesTable,
  inventoryTransfersTable,
  journalEntriesTable,
  journalEntryAuditTable,
  journalEntryLinesTable,
  operationEventsTable,
  productsTable,
} from "@workspace/db";
import {
  adjustOperationalBalances,
  approveCycleCount,
  createCycleCount,
  createInventoryPurchaseOrder,
  receiveInventoryPurchaseOrder,
  receiveInventoryTransfer,
  sendInventoryTransfer,
  transferInventory,
} from "./operations";

describe.sequential("operational inventory lifecycle", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let actorId: number;
  let categoryId: number;
  let sourceLocationId: number;
  let destinationLocationId: number;
  let transferProductId: number;
  let purchaseProductId: number;
  const transferIds: number[] = [];
  const purchaseOrderIds: number[] = [];
  const cycleCountIds: number[] = [];

  beforeAll(async () => {
    const [actor] = await db.insert(adminUsersTable).values({
      email: `inventory-operations-${suffix}@example.com`,
      name: "Inventory Operations",
      passwordHash: "test-hash",
      isSuperAdmin: true,
    }).returning();
    actorId = actor.id;
    const [category] = await db.insert(categoriesTable).values({
      nameAr: `مخزون ${suffix}`,
      nameEn: `Inventory ${suffix}`,
      slug: `inventory-${suffix}`,
    }).returning();
    categoryId = category.id;
    const [source, destination] = await db.insert(inventoryLocationsTable).values([
      { name: `Source ${suffix}`, code: `SRC-${suffix}`, type: "warehouse" },
      { name: `Destination ${suffix}`, code: `DST-${suffix}`, type: "store" },
    ]).returning();
    sourceLocationId = source.id;
    destinationLocationId = destination.id;
    const products = await db.insert(productsTable).values([
      { nameAr: "تحويل", nameEn: "Transfer", slug: `transfer-${suffix}`, price: 20, categoryId, stockQuantity: 10, averageCost: "5" },
      { nameAr: "شراء", nameEn: "Purchase", slug: `purchase-inventory-${suffix}`, price: 20, categoryId, stockQuantity: 0, averageCost: "0" },
    ]).returning();
    transferProductId = products[0].id;
    purchaseProductId = products[1].id;
    await db.insert(inventoryBalancesTable).values([
      { productId: transferProductId, locationId: sourceLocationId, available: 10, averageCost: "5" },
      { productId: transferProductId, locationId: destinationLocationId, available: 0, averageCost: "5" },
      { productId: purchaseProductId, locationId: sourceLocationId, available: 0, averageCost: "0" },
    ]);
  });

  afterAll(async () => {
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
      await tx.delete(operationEventsTable).where(eq(operationEventsTable.actorId, actorId));
      await tx.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.performedBy, actorId));
      if (cycleCountIds.length) {
        await tx.delete(inventoryCycleCountLinesTable).where(inArray(inventoryCycleCountLinesTable.cycleCountId, cycleCountIds));
        await tx.delete(inventoryCycleCountsTable).where(inArray(inventoryCycleCountsTable.id, cycleCountIds));
      }
      if (transferIds.length) {
        await tx.delete(inventoryTransferLinesTable).where(inArray(inventoryTransferLinesTable.transferId, transferIds));
        await tx.delete(inventoryTransfersTable).where(inArray(inventoryTransfersTable.id, transferIds));
      }
      if (purchaseOrderIds.length) {
        await tx.delete(inventoryPurchaseOrderLinesTable).where(inArray(inventoryPurchaseOrderLinesTable.purchaseOrderId, purchaseOrderIds));
        await tx.delete(inventoryPurchaseOrdersTable).where(inArray(inventoryPurchaseOrdersTable.id, purchaseOrderIds));
      }
      await tx.delete(inventoryBalancesTable).where(inArray(inventoryBalancesTable.productId, [transferProductId, purchaseProductId]));
      await tx.delete(productsTable).where(inArray(productsTable.id, [transferProductId, purchaseProductId]));
      await tx.delete(inventoryLocationsTable).where(inArray(inventoryLocationsTable.id, [sourceLocationId, destinationLocationId]));
      await tx.delete(categoriesTable).where(eq(categoriesTable.id, categoryId));
      await tx.delete(adminUsersTable).where(eq(adminUsersTable.id, actorId));
    });
  });

  it("moves stock between locations without changing global stock", async () => {
    const transfer = await transferInventory({
      transferNumber: `TR-${suffix}`,
      fromLocationId: sourceLocationId,
      toLocationId: destinationLocationId,
      idempotencyKey: `transfer-${suffix}`,
      createdBy: actorId,
      lines: [{ productId: transferProductId, quantity: 4 }],
    });
    transferIds.push(transfer.id);
    await sendInventoryTransfer(transfer.id, actorId);
    const sent = await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, transferProductId));
    expect(sent.find((balance) => balance.locationId === sourceLocationId)?.available).toBe(6);
    expect(sent.find((balance) => balance.locationId === destinationLocationId)?.available).toBe(0);

    await receiveInventoryTransfer(transfer.id, actorId);
    const received = await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, transferProductId));
    expect(received.find((balance) => balance.locationId === destinationLocationId)?.available).toBe(4);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, transferProductId));
    expect(product.stockQuantity).toBe(10);
  });

  it("returns PO lines and supports partial then complete receipt atomically", async () => {
    const order = await createInventoryPurchaseOrder({
      orderNumber: `PO-${suffix}`,
      vendorName: "Inventory Vendor",
      locationId: sourceLocationId,
      idempotencyKey: `po-${suffix}`,
      createdBy: actorId,
      lines: [{ productId: purchaseProductId, quantity: 10, unitCost: 7 }],
    });
    purchaseOrderIds.push(order.id);
    expect(order.lines).toMatchObject([{ productId: purchaseProductId, quantity: 10, receivedQuantity: 0 }]);

    const partial = await receiveInventoryPurchaseOrder(order.id, actorId, [{ productId: purchaseProductId, quantity: 4 }], `receipt-a-${suffix}`);
    expect(partial.status).toBe("partially_received");
    expect(partial.lines[0].receivedQuantity).toBe(4);
    const completed = await receiveInventoryPurchaseOrder(order.id, actorId, [{ productId: purchaseProductId, quantity: 6 }], `receipt-b-${suffix}`);
    expect(completed.status).toBe("received");
    expect(completed.lines[0].receivedQuantity).toBe(10);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, purchaseProductId));
    const [balance] = await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, purchaseProductId));
    expect(product.stockQuantity).toBe(10);
    expect(balance.available).toBe(10);
    expect(balance.incoming).toBe(0);
  });

  it("approves a cycle count once and keeps global and location totals aligned", async () => {
    const count = await createCycleCount({
      locationId: sourceLocationId,
      createdBy: actorId,
      lines: [{ productId: transferProductId, countedQuantity: 5 }],
    });
    cycleCountIds.push(count.id);
    await db.update(inventoryCycleCountsTable).set({ status: "review" }).where(eq(inventoryCycleCountsTable.id, count.id));
    const approved = await approveCycleCount(count.id, actorId);
    expect(approved.status).toBe("approved");
    const replay = await approveCycleCount(count.id, actorId);
    expect(replay.status).toBe("approved");
    const movements = await db.select().from(inventoryMovementsTable).where(eq(inventoryMovementsTable.sourceId, String(count.id)));
    expect(movements.filter((movement) => movement.sourceType === "cycle_count")).toHaveLength(1);
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, transferProductId));
    const balances = await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, transferProductId));
    expect(product.stockQuantity).toBe(9);
    expect(balances.reduce((sum, balance) => sum + balance.available, 0)).toBe(9);
  });

  it("applies a sale-style deduction to location balances and global stock in one transaction", async () => {
    await db.transaction(async (tx) => {
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, transferProductId)).for("update");
      await adjustOperationalBalances(tx, product.id, -2, product.averageCost, product.stockQuantity);
      await tx.update(productsTable).set({ stockQuantity: product.stockQuantity - 2 }).where(eq(productsTable.id, product.id));
    });
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, transferProductId));
    const balances = await db.select().from(inventoryBalancesTable).where(eq(inventoryBalancesTable.productId, transferProductId));
    expect(product.stockQuantity).toBe(7);
    expect(balances.reduce((sum, balance) => sum + balance.available, 0)).toBe(7);
  });
});