import { createHash } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import {
  companyOrderItemsTable, companyOrdersTable, customersTable, db,
  inventoryBalancesTable, inventoryLocationsTable, inventoryMovementsTable, invoicesTable,
  journalEntriesTable, operationEventsTable, orderItemsTable, ordersTable,
  productsTable, salesReturnLinesTable, salesReturnsTable, wholesaleDistributorsTable,
} from "@workspace/db";
import { postJournalEntry } from "./accounting";

export type ReturnSourceType = "individual" | "company";
export type ReturnCondition = "new" | "opened" | "damaged";
export interface ReturnInput {
  sourceType: ReturnSourceType;
  sourceId: number;
  reason?: string | null;
  lines: Array<{ itemId: number; quantity: number; condition: ReturnCondition }>;
}
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
const openedPoolCode = "B2B_USED_RETURN";

export class SalesReturnError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function conflict(message: string): never { throw new SalesReturnError(409, message); }
function sourceOf(row: typeof salesReturnsTable.$inferSelect) {
  return { sourceType: (row.orderId !== null ? "individual" : "company") as ReturnSourceType, sourceId: (row.orderId ?? row.companyOrderId)! };
}
function units4(value: string) {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) conflict("تكلفة الخروج الأصلية غير صالحة؛ يلزم مراجعتها قبل الإرجاع");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
}
function decimal4(value: bigint) { return `${value / 10000n}.${String(value % 10000n).padStart(4, "0")}`; }
function weightedCost(quantity: number, cost: string, added: number, addedCost: string) {
  if (quantity < 0 || added <= 0) conflict("رصيد المخزون غير صالح");
  const total = BigInt(quantity + added);
  return decimal4((BigInt(quantity) * units4(cost) + BigInt(added) * units4(addedCost) + total / 2n) / total);
}

/** Source/order locks serialize every partial return, not merely retries of one return. */
export async function getReturnSource(executor: Executor, sourceType: ReturnSourceType, sourceId: number, lock = false) {
  if (!Number.isSafeInteger(sourceId) || sourceId < 1 || sourceId > 2147483647)
    throw new SalesReturnError(400, "رقم الطلب الأصلي غير صالح");
  let orderNumber: string;
  let customerName: string;
  let blockedReason: string | null = null;
  let movementSource: string;
  let movementId: number;
  let journalSource: string;
  let sourceLines: Array<{ id: number; productId: number; productName: string; quantity: number; costSnapshot?: string }>;
  if (sourceType === "individual") {
    const rootQuery = executor.select().from(ordersTable).where(eq(ordersTable.id, sourceId));
    const [order] = await (lock ? rootQuery.for("update") : rootQuery).limit(1);
    if (!order) throw new SalesReturnError(404, "الطلب الأصلي غير موجود");
    orderNumber = order.orderNumber;
    const [customer] = await executor.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, order.userId));
    customerName = customer?.name ?? "";
    if (order.status !== "delivered") blockedReason = "يجب تسليم الطلب الأصلي قبل تسجيل مرتجع له";
    const lineQuery = executor.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, sourceId)).orderBy(asc(orderItemsTable.id));
    sourceLines = await (lock ? lineQuery.for("update") : lineQuery);
    movementSource = "order"; movementId = sourceId; journalSource = "sale_cogs";
  } else {
    const rootQuery = executor.select().from(companyOrdersTable).where(eq(companyOrdersTable.id, sourceId));
    const [order] = await (lock ? rootQuery.for("update") : rootQuery).limit(1);
    if (!order) throw new SalesReturnError(404, "طلب الشركة الأصلي غير موجود");
    orderNumber = order.orderNumber;
    const [company] = await executor.select({ name: wholesaleDistributorsTable.companyName }).from(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, order.distributorId));
    customerName = company?.name ?? "";
    if (order.status !== "approved" || !order.invoiceId) blockedReason = "طلب الشركة لم يُعتمد وتُصدر فاتورته بعد";
    if (order.invoiceId) {
      // Cancellation of a company invoice uses the same invoice lock.
      const invoiceQuery = executor.select().from(invoicesTable).where(eq(invoicesTable.id, order.invoiceId));
      const [invoice] = await (lock ? invoiceQuery.for("update") : invoiceQuery).limit(1);
      if (!invoice || invoice.cancelledAt !== null || invoice.historical === "yes")
        blockedReason = "فاتورة الأصل ليست صادرة وقابلة للإرجاع؛ يلزم مراجعة المالية";
    }
    const lineQuery = executor.select().from(companyOrderItemsTable).where(eq(companyOrderItemsTable.companyOrderId, sourceId)).orderBy(asc(companyOrderItemsTable.id));
    sourceLines = await (lock ? lineQuery.for("update") : lineQuery);
    movementSource = "distributor_invoice"; movementId = order.invoiceId ?? -1; journalSource = "distributor_invoice_cogs";
  }
  const movements = await executor.select().from(inventoryMovementsTable).where(and(
    eq(inventoryMovementsTable.sourceType, movementSource), eq(inventoryMovementsTable.sourceId, String(movementId)),
    sql`${inventoryMovementsTable.quantityChange} < 0`,
  ));
  const completed = await executor.select({
    itemId: sourceType === "individual" ? salesReturnLinesTable.orderItemId : salesReturnLinesTable.companyOrderItemId,
    quantity: salesReturnLinesTable.quantity,
  }).from(salesReturnLinesTable).innerJoin(salesReturnsTable, eq(salesReturnsTable.id, salesReturnLinesTable.returnId))
    .where(and(eq(salesReturnsTable.status, "completed"),
      sourceType === "individual" ? eq(salesReturnsTable.orderId, sourceId) : eq(salesReturnsTable.companyOrderId, sourceId)));
  const [cogs] = await executor.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(and(
    eq(journalEntriesTable.sourceType, journalSource), eq(journalEntriesTable.sourceId, String(movementId)),
    eq(journalEntriesTable.status, "posted"),
  )).limit(1);
  const sourceQuantities = new Map<number, number>();
  for (const line of sourceLines) sourceQuantities.set(line.productId, (sourceQuantities.get(line.productId) ?? 0) + line.quantity);
  const items = sourceLines.map((line) => {
    const exits = movements.filter((m) => m.productId === line.productId);
    const exitsQuantity = exits.reduce((sum, m) => sum - m.quantityChange, 0);
    const provenCost = exits.length > 0 && exitsQuantity >= sourceQuantities.get(line.productId)! &&
      exits.every((m) => m.unitCost !== null && Number(m.unitCost) >= 0) &&
      new Set(exits.map((m) => m.unitCost)).size === 1;
    let unitCost: string | null = provenCost ? exits[0].unitCost : null;
    if (sourceType === "individual" && unitCost !== line.costSnapshot) unitCost = null;
    if (unitCost !== null && Number(unitCost) > 0 && !cogs) unitCost = null;
    const returnedQuantity = completed.filter((l) => l.itemId === line.id).reduce((sum, l) => sum + l.quantity, 0);
    return { id: line.id, productId: line.productId, productName: line.productName, quantity: line.quantity,
      returnedQuantity, remainingQuantity: Math.max(0, line.quantity - returnedQuantity), unitCost };
  });
  if (!sourceLines.length) blockedReason ??= "الطلب الأصلي لا يحتوي منتجات";
  if (items.length && items.every((line) => !line.remainingQuantity)) blockedReason ??= "أُرجعت كامل كميات هذا الطلب بالفعل";
  if (items.length && !items.some((line) => line.remainingQuantity > 0 && line.unitCost !== null))
    blockedReason ??= "تكلفة أو حركة الخروج الأصلية غير موثقة؛ لا يمكن استخدام متوسط التكلفة الحالي بديلاً عنها";
  return { sourceType, sourceId, orderNumber, customerName, eligible: blockedReason === null, blockedReason, items };
}

export async function listReturnSources(sourceType: ReturnSourceType, search?: string, sourceId?: number) {
  if (sourceId !== undefined) return [await getReturnSource(db, sourceType, sourceId)];
  const table = sourceType === "individual" ? ordersTable : companyOrdersTable;
  const ids = await db.select({ id: table.id }).from(table).where(search?.trim() ? ilike(table.orderNumber, `%${search.trim()}%`) : undefined)
    .orderBy(desc(table.createdAt), desc(table.id)).limit(50);
  return Promise.all(ids.map((row) => getReturnSource(db, sourceType, row.id)));
}

export async function getSalesReturn(id: number, executor: Executor = db) {
  const [row] = await executor.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id));
  if (!row) throw new SalesReturnError(404, "سجل المرتجع غير موجود");
  const source = sourceOf(row);
  // Display remains possible even when the source is no longer eligible.
  let orderNumber = "", customerName = "";
  if (row.orderId !== null) {
    const [original] = await executor.select({ number: ordersTable.orderNumber, name: customersTable.name })
      .from(ordersTable).leftJoin(customersTable, eq(customersTable.id, ordersTable.userId)).where(eq(ordersTable.id, row.orderId));
    orderNumber = original?.number ?? ""; customerName = original?.name ?? "";
  } else {
    const [original] = await executor.select({ number: companyOrdersTable.orderNumber, name: wholesaleDistributorsTable.companyName })
      .from(companyOrdersTable).leftJoin(wholesaleDistributorsTable, eq(wholesaleDistributorsTable.id, companyOrdersTable.distributorId))
      .where(eq(companyOrdersTable.id, row.companyOrderId!));
    orderNumber = original?.number ?? ""; customerName = original?.name ?? "";
  }
  const lines = await executor.select({
    line: salesReturnLinesTable, orderName: orderItemsTable.productName, companyName: companyOrderItemsTable.productName,
  }).from(salesReturnLinesTable)
    .leftJoin(orderItemsTable, eq(orderItemsTable.id, salesReturnLinesTable.orderItemId))
    .leftJoin(companyOrderItemsTable, eq(companyOrderItemsTable.id, salesReturnLinesTable.companyOrderItemId))
    .where(eq(salesReturnLinesTable.returnId, id)).orderBy(asc(salesReturnLinesTable.id));
  return { id: row.id, ...source, orderNumber, customerName, status: row.status as "draft" | "completed" | "cancelled",
    reason: row.reason, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null,
    lines: lines.map(({ line, orderName, companyName }) => ({
      id: line.id, itemId: (line.orderItemId ?? line.companyOrderItemId)!, productId: line.productId,
      productName: orderName ?? companyName ?? "", quantity: line.quantity, condition: line.condition as ReturnCondition,
      unitCost: line.unitCost, targetLocationId: line.targetLocationId,
    })),
  };
}
export async function listSalesReturns(allowedSources: ReturnSourceType[], search?: string, status?: string) {
  if (!allowedSources.length) return [];
  const filters = [];
  if (allowedSources.length === 1) filters.push(allowedSources[0] === "individual" ? sql`${salesReturnsTable.orderId} is not null` : sql`${salesReturnsTable.companyOrderId} is not null`);
  if (status) filters.push(eq(salesReturnsTable.status, status));
  if (search?.trim()) {
    const like = `%${search.trim()}%`;
    filters.push(sql`(cast(${salesReturnsTable.id} as text) ilike ${like} or ${ordersTable.orderNumber} ilike ${like} or ${companyOrdersTable.orderNumber} ilike ${like})`);
  }
  const headers = await db.select({ id: salesReturnsTable.id }).from(salesReturnsTable)
    .leftJoin(ordersTable, eq(ordersTable.id, salesReturnsTable.orderId)).leftJoin(companyOrdersTable, eq(companyOrdersTable.id, salesReturnsTable.companyOrderId))
    .where(filters.length ? and(...filters) : undefined).orderBy(desc(salesReturnsTable.createdAt), desc(salesReturnsTable.id)).limit(500);
  return Promise.all(headers.map((h) => getSalesReturn(h.id)));
}
async function destinations(executor: Executor, conditions: ReturnCondition[], lock = false) {
  let newLocation: number | null = null, openedLocation: number | null = null;
  if (conditions.includes("new")) {
    const query = executor.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.isDefault, true))
      .orderBy(asc(inventoryLocationsTable.id)).limit(1);
    const [location] = await (lock ? query.for("update") : query);
    if (!location || !location.active || location.code === openedPoolCode) conflict("لا يوجد مستودع بيع افتراضي نشط لإرجاع المنتج الجديد");
    newLocation = location.id;
  }
  if (conditions.includes("opened")) {
    await executor.insert(inventoryLocationsTable).values({
      code: openedPoolCode, name: "تيستر مفتوح (Opened Testers)", type: "virtual", isDefault: false, active: true,
    }).onConflictDoNothing({ target: inventoryLocationsTable.code });
    const query = executor.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.code, openedPoolCode)).limit(1);
    const [location] = await (lock ? query.for("update") : query);
    if (!location?.active || location.isDefault) conflict("رصيد التستر المفتوح غير متاح؛ يلزم مراجعته دون إنشاء رصيد بديل");
    openedLocation = location.id;
  }
  return { newLocation, openedLocation };
}
function checkInput(input: ReturnInput, source: Awaited<ReturnType<typeof getReturnSource>>) {
  if (!source.eligible) conflict(source.blockedReason!);
  if (!input.lines.length || input.lines.length > 100) throw new SalesReturnError(400, "اختر منتجاً واحداً على الأقل");
  const keys = new Set<string>(), totals = new Map<number, number>();
  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || !["new", "opened", "damaged"].includes(line.condition)) throw new SalesReturnError(400, "الكمية أو حالة المنتج غير صالحة");
    const original = source.items.find((item) => item.id === line.itemId);
    if (!original) throw new SalesReturnError(400, "المنتج لا ينتمي إلى الطلب الأصلي");
    const key = `${line.itemId}:${line.condition}`;
    if (keys.has(key)) throw new SalesReturnError(400, "اجمع كمية المنتج وحالته في بند واحد داخل المرتجع");
    keys.add(key); totals.set(line.itemId, (totals.get(line.itemId) ?? 0) + line.quantity);
    if (totals.get(line.itemId)! > original.remainingQuantity) conflict(`كمية المرتجع تتجاوز المتاح للمنتج: ${original.productName}`);
    if (original.unitCost === null) conflict("تكلفة الخروج الأصلية غير موثقة");
  }
}
async function insertLines(executor: Executor, id: number, input: ReturnInput, source: Awaited<ReturnType<typeof getReturnSource>>) {
  checkInput(input, source);
  const locations = await destinations(executor, input.lines.map((l) => l.condition));
  await executor.insert(salesReturnLinesTable).values(input.lines.map((line) => {
    const original = source.items.find((i) => i.id === line.itemId)!;
    return { returnId: id, orderId: input.sourceType === "individual" ? input.sourceId : null,
      companyOrderId: input.sourceType === "company" ? input.sourceId : null,
      orderItemId: input.sourceType === "individual" ? line.itemId : null,
      companyOrderItemId: input.sourceType === "company" ? line.itemId : null,
      productId: original.productId, quantity: line.quantity, condition: line.condition, unitCost: original.unitCost!,
      targetLocationId: line.condition === "damaged" ? null : line.condition === "opened" ? locations.openedLocation : locations.newLocation };
  }));
}
function checkRevision(row: typeof salesReturnsTable.$inferSelect, expectedUpdatedAt: string) {
  if (row.updatedAt.toISOString() !== expectedUpdatedAt) conflict("تغير سجل المرتجع؛ أعد فتحه قبل الحفظ أو الاعتماد");
}
export async function createSalesReturn(input: ReturnInput, actorId: number) {
  return db.transaction(async (tx) => {
    const source = await getReturnSource(tx, input.sourceType, input.sourceId, true);
    checkInput(input, source);
    const [header] = await tx.insert(salesReturnsTable).values({ orderId: input.sourceType === "individual" ? input.sourceId : null,
      companyOrderId: input.sourceType === "company" ? input.sourceId : null, reason: input.reason?.trim() || null, createdBy: actorId }).returning();
    await insertLines(tx, header.id, input, source);
    return getSalesReturn(header.id, tx);
  });
}
async function lockReturn(executor: Executor, id: number) {
  const [initial] = await executor.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id));
  if (!initial) throw new SalesReturnError(404, "سجل المرتجع غير موجود");
  const sourceRef = sourceOf(initial);
  const source = await getReturnSource(executor, sourceRef.sourceType, sourceRef.sourceId, true);
  const [row] = await executor.select().from(salesReturnsTable).where(eq(salesReturnsTable.id, id)).for("update");
  if (!row) throw new SalesReturnError(404, "سجل المرتجع غير موجود");
  return { row, source };
}
export async function updateSalesReturn(id: number, input: ReturnInput, expectedUpdatedAt: string) {
  return db.transaction(async (tx) => {
    const { row, source } = await lockReturn(tx, id);
    if (row.status !== "draft") conflict("لا يمكن تعديل مرتجع معتمد أو ملغى");
    checkRevision(row, expectedUpdatedAt);
    if (input.sourceType !== source.sourceType || input.sourceId !== source.sourceId) conflict("لا يمكن تغيير أصل المرتجع بعد إنشاء سجله");
    checkInput(input, source);
    await tx.delete(salesReturnLinesTable).where(eq(salesReturnLinesTable.returnId, id));
    await insertLines(tx, id, input, source);
    await tx.update(salesReturnsTable).set({ reason: input.reason?.trim() || null,
      updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)) }).where(eq(salesReturnsTable.id, id));
    return getSalesReturn(id, tx);
  });
}
export async function cancelSalesReturn(id: number, expectedUpdatedAt: string) {
  return db.transaction(async (tx) => {
    const { row } = await lockReturn(tx, id);
    if (row.status === "cancelled") return getSalesReturn(id, tx);
    if (row.status !== "draft") conflict("لا يمكن إلغاء مرتجع معتمد؛ يلزم مسار تصحيح مستقل");
    checkRevision(row, expectedUpdatedAt);
    await tx.update(salesReturnsTable).set({ status: "cancelled",
      updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)) }).where(eq(salesReturnsTable.id, id));
    return getSalesReturn(id, tx);
  });
}

/** Inventory and its COGS reversal commit with completion; sales/VAT/cash are untouched. */
export async function completeSalesReturn(id: number, expectedUpdatedAt: string, actorId: number) {
  return db.transaction(async (tx) => {
    const { row, source } = await lockReturn(tx, id);
    const lines = await tx.select().from(salesReturnLinesTable).where(eq(salesReturnLinesTable.returnId, id))
      .orderBy(asc(salesReturnLinesTable.productId), asc(salesReturnLinesTable.targetLocationId), asc(salesReturnLinesTable.id)).for("update");
    const fingerprint = createHash("sha256").update(JSON.stringify({ expectedUpdatedAt, sourceType: source.sourceType, sourceId: source.sourceId,
      lines: lines.map((l) => [l.orderItemId ?? l.companyOrderItemId, l.quantity, l.condition, l.unitCost, l.targetLocationId]) })).digest("hex");
    if (row.status === "completed") {
      if (row.completionFingerprint !== fingerprint) conflict("إعادة الاعتماد لا تطابق النسخة الأصلية من المرتجع");
      return getSalesReturn(id, tx);
    }
    if (row.status !== "draft") conflict("لا يمكن اعتماد مرتجع ملغى");
    checkRevision(row, expectedUpdatedAt);
    const input: ReturnInput = { sourceType: source.sourceType, sourceId: source.sourceId,
      lines: lines.map((l) => ({ itemId: (l.orderItemId ?? l.companyOrderItemId)!, quantity: l.quantity, condition: l.condition as ReturnCondition })) };
    checkInput(input, source);
    const productIds = [...new Set(lines.map((l) => l.productId))].sort((a, b) => a - b);
    const products = await tx.select().from(productsTable).where(inArray(productsTable.id, productIds)).orderBy(asc(productsTable.id)).for("update");
    if (products.length !== productIds.length) conflict("منتج المرتجع غير موجود");
    const locations = await destinations(tx, input.lines.map((l) => l.condition), true);
    const eventKey = `sales-return:${id}`;
    const [event] = await tx.insert(operationEventsTable).values({
      eventKey, kind: "sale_fulfillment", sourceType: "sales_return", sourceId: String(id), actorId,
      payload: { sourceType: source.sourceType, sourceId: source.sourceId, fingerprint, originalCost: true }, status: "pending",
    }).returning();
    let restoredValue = 0n;
    for (const line of lines) {
      const original = source.items.find((i) => i.id === (line.orderItemId ?? line.companyOrderItemId))!;
      if (original.productId !== line.productId || original.unitCost !== line.unitCost) conflict("تكلفة أو منتج البند لا يطابق أصل الخروج");
      const expectedDestination = line.condition === "damaged" ? null : line.condition === "opened" ? locations.openedLocation : locations.newLocation;
      if (line.targetLocationId !== expectedDestination) conflict("وجهة المرتجع لا تطابق حالة المنتج");
      const product = products.find((p) => p.id === line.productId)!;
      const cost = units4(line.unitCost) * BigInt(line.quantity);
      let quantityBefore = product.stockQuantity, quantityAfter = quantityBefore, quantityChange = 0;
      if (line.condition !== "damaged") {
        const [balance] = await tx.select().from(inventoryBalancesTable).where(and(
          eq(inventoryBalancesTable.productId, line.productId), eq(inventoryBalancesTable.locationId, line.targetLocationId!),
        )).for("update");
        const available = balance?.available ?? 0;
        const averageCost = weightedCost(available + (balance?.reserved ?? 0), balance?.averageCost ?? "0.0000", line.quantity, line.unitCost);
        if (balance) await tx.update(inventoryBalancesTable).set({ available: available + line.quantity, averageCost, updatedAt: new Date() }).where(eq(inventoryBalancesTable.id, balance.id));
        else await tx.insert(inventoryBalancesTable).values({ productId: line.productId, locationId: line.targetLocationId!, available: line.quantity, averageCost });
        if (line.condition === "new") {
          quantityChange = line.quantity; quantityAfter = quantityBefore + line.quantity;
          product.averageCost = weightedCost(quantityBefore, product.averageCost, line.quantity, line.unitCost);
          product.stockQuantity = quantityAfter;
          await tx.update(productsTable).set({ stockQuantity: quantityAfter, averageCost: product.averageCost }).where(eq(productsTable.id, product.id));
        } else {
          // Movement quantities describe the tester pool, never sellable stock.
          quantityBefore = available; quantityAfter = available + line.quantity; quantityChange = line.quantity;
        }
        restoredValue += cost;
      }
      await tx.insert(inventoryMovementsTable).values({
        productId: line.productId, movementType: line.condition === "damaged" ? "adjustment" : "increase",
        quantityChange, quantityBefore, quantityAfter, reason: `Sales return #${id} (${line.condition}) · ${source.orderNumber}`,
        unitCost: line.unitCost, totalCost: decimal4(cost), sourceType: `sales_return_${line.condition}`, sourceId: String(id),
        eventKey: `${eventKey}:line:${line.id}`, performedBy: actorId,
      });
    }
    // Round the complete immutable-cost sum once to journal currency precision.
    const restoredCents = (restoredValue + 50n) / 100n;
    if (restoredCents > BigInt(Number.MAX_SAFE_INTEGER)) conflict("قيمة المرتجع تتجاوز دقة القيد المحاسبي المسموح بها");
    if (restoredCents > 0n) await postJournalEntry({
      entryDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
      description: `Sales return #${id} · ${source.orderNumber}`, createdBy: actorId, sourceType: "sales_return", sourceId: String(id),
      lines: [{ accountCode: "1140", debit: Number(restoredCents) / 100 }, { accountCode: "5100", credit: Number(restoredCents) / 100 }],
    }, tx);
    await tx.update(operationEventsTable).set({ status: "posted" }).where(eq(operationEventsTable.id, event.id));
    const now = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
    await tx.update(salesReturnsTable).set({ status: "completed", completedAt: now, completedBy: actorId,
      completionKey: eventKey, completionFingerprint: fingerprint, updatedAt: now }).where(eq(salesReturnsTable.id, id));
    return getSalesReturn(id, tx);
  });
}