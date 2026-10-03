import { randomUUID } from "node:crypto";
import { eq, sql, inArray } from "drizzle-orm";
import { db, companyOrdersTable, companyOrderItemsTable, wholesaleDistributorsTable, orderEditAuditsTable, adminUsersTable, productsTable, salesReturnsTable } from "@workspace/db";
import type { CompanyOrderEditInput } from "@workspace/api-zod";
import { AccountingConflictError, AccountingNotFoundError, AccountingValidationError } from "./accounting";
import { lockDistributorContractSource } from "./invoices";
import { readOrderItems, resolvePortalTerms, calculateLines, totalsFor, orderSnapshotFingerprint } from "./distributor-portal";
import { canonicalOrderEdit, cleanOrderEditAddress } from "./order-editing";
import { validateManualDiscount } from "./sale-discounts";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getCompanyOrderEditor(id: number, tx: Tx = db as unknown as Tx) {
  const [order] = await tx.select().from(companyOrdersTable).where(eq(companyOrdersTable.id, id));
  if (!order) throw new AccountingNotFoundError("طلب الشركة غير موجود.");
  const [company] = await tx.select().from(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, order.distributorId));
  if (!company) throw new AccountingNotFoundError("الشركة غير موجودة.");
  const context = await resolvePortalTerms(tx, company);
  const snapshot = order.adminEditSnapshot as Partial<CompanyOrderEditInput> | null;
  const items = await readOrderItems(tx, id);
  const [returned] = await tx.select({ id: salesReturnsTable.id }).from(salesReturnsTable).where(eq(salesReturnsTable.companyOrderId, id)).limit(1);
  const blockedReason = order.status !== "pending_review" || order.invoiceId
    ? "التعديل متاح فقط قبل اعتماد الطلب أو رفضه وقبل إصدار الفاتورة." : returned ? "يوجد سجل مرتجع مرتبط بالطلب." : null;
  const history = await tx.select({
    id: orderEditAuditsTable.id, actorName: adminUsersTable.name, editedAt: orderEditAuditsTable.editedAt,
    beforeSnapshot: orderEditAuditsTable.beforeSnapshot, afterSnapshot: orderEditAuditsTable.afterSnapshot,
  }).from(orderEditAuditsTable).innerJoin(adminUsersTable, eq(adminUsersTable.id, orderEditAuditsTable.actorId))
    .where(eq(orderEditAuditsTable.companyOrderId, id)).orderBy(sql`${orderEditAuditsTable.id} desc`);
  return {
    orderNumber: order.orderNumber, eligible: blockedReason === null, blockedReason,
    contractDiscountPercent: context.terms.discountPercent,
    values: {
      requestKey: randomUUID(), expectedUpdatedAt: order.updatedAt.toISOString(),
      items: items.map(i => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice })),
      contactName: snapshot?.contactName ?? company.contactName, contactPhone: snapshot?.contactPhone ?? company.phone,
      adminNotes: snapshot?.adminNotes ?? null, discountOverride: snapshot?.discountOverride ?? null,
      orderAddress: snapshot?.orderAddress ?? {
        country: company.countryCode, label: "", city: company.city ?? "", district: company.district ?? "",
        street: company.street ?? "", buildingNo: company.buildingNo ?? "", nationalAddressShortCode: company.nationalAddressShortCode,
        postalCode: company.postalCode, additionalNumber: company.additionalNumber, additionalInfo: company.address,
        isDefault: false,
      },
    }, history,
  };
}

export async function saveCompanyOrderEditor(id: number, input: CompanyOrderEditInput, actorId: number) {
  if (new Set(input.items.map(i => i.productId)).size !== input.items.length) throw new AccountingValidationError("لا تكرر المنتج.");
  if (!input.contactName.trim() || !/^(?=(?:\D*\d){8,15}\D*$)\+?[\d ().-]+$/.test(input.contactPhone.trim()))
    throw new AccountingValidationError("الاسم ورقم الجوال الصحيح مطلوبان.");
  if (input.discountOverride) {
    validateManualDiscount(input.discountOverride);
    const reason = input.discountOverride.reason?.trim() ?? "";
    if (reason.length < 10 || reason.length > 500) throw new AccountingValidationError("سبب استثناء خصم العقد مطلوب، من 10 إلى 500 حرف.");
  }
  const address = cleanOrderEditAddress(input.orderAddress);
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`order-edit:${input.requestKey}`}))`);
    const [candidate] = await tx.select().from(companyOrdersTable).where(eq(companyOrdersTable.id, id));
    if (!candidate) throw new AccountingNotFoundError("طلب الشركة غير موجود.");
    // Same company -> order lock order as approval, never the reverse.
    await lockDistributorContractSource(tx, candidate.distributorId);
    const [order] = await tx.select().from(companyOrdersTable).where(eq(companyOrdersTable.id, id)).for("update");
    const [prior] = await tx.select().from(orderEditAuditsTable).where(eq(orderEditAuditsTable.requestKey, input.requestKey));
    if (prior) {
      if (prior.companyOrderId !== id || prior.actorId !== actorId || canonicalOrderEdit(prior.afterSnapshot.request) !== canonicalOrderEdit(input))
        throw new AccountingConflictError("مفتاح الحفظ مستخدم لتعديل مختلف.");
      return;
    }
    const before = await getCompanyOrderEditor(id, tx);
    if (!before.eligible) throw new AccountingConflictError(before.blockedReason!);
    if (order.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new AccountingConflictError("تغير الطلب منذ فتحه. أعد فتح التعديل.");
    const [company] = await tx.select().from(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, order.distributorId));
    const context = await resolvePortalTerms(tx, company);
    const terms = input.discountOverride ? { ...context.terms, discountPercent: input.discountOverride.percent } : context.terms;
    const ids = input.items.map(i => i.productId).sort((a, b) => a - b);
    for (const productId of ids) await tx.execute(sql`select id from ${productsTable} where id = ${productId} for update`);
    const products = await tx.select().from(productsTable).where(inArray(productsTable.id, ids));
    for (const i of input.items) {
      const p = products.find(p => p.id === i.productId);
      if (!p || !p.isActive || !p.sellable || !p.showOnDistributors) throw new AccountingConflictError(`المنتج ${i.productId} غير متاح للشركات.`);
    }
    const lines = calculateLines(products.map(p => ({ ...p, price: input.items.find(i => i.productId === p.id)!.unitPrice })), input.items, terms);
    const totals = totalsFor(lines);
    const stock = input.items.map(i => ({ productId: i.productId, quantity: i.quantity, stockQuantity: products.find(p => p.id === i.productId)!.stockQuantity }));
    await tx.insert(orderEditAuditsTable).values({
      companyOrderId: id, requestKey: input.requestKey, actorId,
      beforeSnapshot: { values: before.values, terms: order.snapshotTerms, totals: order.snapshotTotals },
      afterSnapshot: { request: input, terms, totals },
    });
    // Pending company requests have no inventory reservation or journal.
    await tx.delete(companyOrderItemsTable).where(eq(companyOrderItemsTable.companyOrderId, id));
    await tx.insert(companyOrderItemsTable).values(lines.map(line => ({
      ...line, companyOrderId: id, unitPrice: line.unitPrice.toFixed(2), subtotal: line.subtotal.toFixed(2),
      vatAmount: line.vatAmount.toFixed(2), totalAmount: line.totalAmount.toFixed(2),
    })));
    await tx.update(companyOrdersTable).set({
      snapshotTerms: { ...terms, _stockAtSubmission: stock }, snapshotTotals: totals,
      snapshotFingerprint: orderSnapshotFingerprint(terms, lines, totals, stock),
      adminEditSnapshot: { contactName: input.contactName.trim(), contactPhone: input.contactPhone.trim(),
        orderAddress: address, adminNotes: input.adminNotes?.trim() || null, discountOverride: input.discountOverride },
    }).where(eq(companyOrdersTable.id, id));
  });
  return getCompanyOrderEditor(id);
}