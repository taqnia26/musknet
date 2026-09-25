import { and, eq, ilike, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, invoicesTable, invoiceItemsTable, journalEntriesTable, receivablePaymentsTable, wholesaleDistributorsTable } from "@workspace/db";
import { ensureStandardAccountingChart, postJournalEntry } from "./accounting";
import { DistributorInvoiceConflictError, DistributorInvoiceValidationError } from "./invoices";
import { reconcileHistoricalPayment } from "./historical-payment-reconciliation";

export type HistoricalInvoiceInput = {
  creationKey: string; distributorId: number; invoiceNumber: string; issueDate: string; dueDate: string;
  buyerName: string; buyerTaxNumber?: string | null; buyerAddress?: string | null;
  buyerCommercialRegistrationNumber?: string | null;
  sellerName: string; sellerVatNumber: string; taxTreatment: "domestic" | "international";
  subtotal: number; discountAmount: number; vatAmount: number; totalAmount: number;
  items: { productName: string; sku?: string | null; quantity: number; unitPrice: number; subtotal: number; vatAmount: number; totalAmount: number }[];
  payments: { paymentKey: string; paymentDate: string; amount: number; paymentMethod: "cash" | "bank_transfer"; reference?: string | null }[];
};
const cent = (n: number) => Math.round(n * 100);
const creationFingerprint = (input: HistoricalInvoiceInput) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
const currency = (n: number) => Number.isFinite(n) && n >= 0 && Math.abs(n * 100 - Math.round(n * 100)) < 0.00001;
function validate(input: HistoricalInvoiceInput) {
  if (!input.creationKey || input.creationKey.length < 16 || !input.invoiceNumber?.trim() || input.invoiceNumber.length > 100 ||
      !input.buyerName?.trim() || !input.sellerName?.trim() || !input.sellerVatNumber?.trim() ||
      !validDate(input.issueDate) || !validDate(input.dueDate) || input.issueDate > new Date().toISOString().slice(0, 10) ||
      input.dueDate < input.issueDate || !Number.isSafeInteger(input.distributorId) || input.distributorId < 1 ||
      !input.items?.length || input.items.length > 100 || !currency(input.subtotal) || !currency(input.discountAmount) ||
      !currency(input.vatAmount) || !currency(input.totalAmount) || cent(input.totalAmount) <= 0 ||
      (input.taxTreatment !== "domestic" && input.taxTreatment !== "international") ||
      (input.taxTreatment === "international" && cent(input.vatAmount) !== 0)) {
    throw new DistributorInvoiceValidationError("Invalid original invoice identity, date, buyer or totals");
  }
  if (input.items.some(i => !i.productName?.trim() || !Number.isSafeInteger(i.quantity) || i.quantity < 1 ||
    !currency(i.unitPrice) || !currency(i.subtotal) || !currency(i.vatAmount) || !currency(i.totalAmount) ||
    cent(i.subtotal) + cent(i.vatAmount) !== cent(i.totalAmount))) {
    throw new DistributorInvoiceValidationError("Each historical line requires a name, quantity and consistent net, VAT and gross totals");
  }
  if (input.items.reduce((n, i) => n + cent(i.subtotal), 0) !== cent(input.subtotal) ||
      input.items.reduce((n, i) => n + cent(i.vatAmount), 0) !== cent(input.vatAmount) ||
      input.items.reduce((n, i) => n + cent(i.totalAmount), 0) !== cent(input.totalAmount) ||
      input.items.reduce((n, i) => n + cent(i.unitPrice) * i.quantity, 0) - cent(input.discountAmount) !== cent(input.totalAmount)) {
    throw new DistributorInvoiceValidationError("Original line sums, discount, VAT and invoice totals do not agree");
  }
  if (new Set(input.payments.map(p => p.paymentKey)).size !== input.payments.length ||
      new Set(input.payments.map(p => `${p.paymentDate}|${cent(p.amount)}|${p.paymentMethod}|${p.reference?.trim() || ""}`)).size !== input.payments.length ||
      input.payments.some(p => !p.paymentKey || p.paymentKey.length < 16 || !validDate(p.paymentDate) ||
        !currency(p.amount) || cent(p.amount) <= 0 || !["cash", "bank_transfer"].includes(p.paymentMethod)) ||
      input.payments.reduce((n, p) => n + cent(p.amount), 0) > cent(input.totalAmount)) {
    throw new DistributorInvoiceValidationError("Invalid, repeated or excessive collections");
  }
}

// Read-only reconciliation, repeated under the number lock immediately before posting.
export async function reconcileHistoricalInvoice(input: HistoricalInvoiceInput, executor: any = db) {
  validate(input);
  const [distributor] = await executor.select().from(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, input.distributorId)).limit(1);
  if (!distributor) throw new DistributorInvoiceValidationError("Company not found");
  const matchingTaxNumber = Boolean(distributor.taxNumber && input.buyerTaxNumber && distributor.taxNumber === input.buyerTaxNumber);
  if ((!matchingTaxNumber && distributor.companyName.trim().toLowerCase() !== input.buyerName.trim().toLowerCase()) ||
    (distributor.taxNumber && input.buyerTaxNumber && !matchingTaxNumber)) {
    throw new DistributorInvoiceConflictError("Buyer identity differs from the selected company; review it manually");
  }
  const existing = await executor.select().from(invoicesTable).where(or(
    sql`lower(${invoicesTable.invoiceNumber}) = lower(${input.invoiceNumber.trim()})`,
    and(eq(invoicesTable.distributorId, input.distributorId),
      sql`${invoicesTable.issueDatetime}::date = ${input.issueDate}::date`,
      sql`abs(${invoicesTable.totalAmount} - ${input.totalAmount}) < 0.005`),
  ));
  const imported = await executor.select({ id: journalEntriesTable.id, description: journalEntriesTable.description })
    .from(journalEntriesTable).where(and(
      eq(journalEntriesTable.sourceType, "historical_import"),
      sql`to_char(${journalEntriesTable.entryDate}, 'YYYY-MM') = ${input.issueDate.slice(0, 7)}`,
    ));
  // Other ledger entries can represent the same sale or an already collected amount.
  // Conservatively flag a reference or buyer together with the original month.
  const ledger = await executor.select({ id: journalEntriesTable.id, sourceType: journalEntriesTable.sourceType, description: journalEntriesTable.description })
    .from(journalEntriesTable).where(and(
      sql`to_char(${journalEntriesTable.entryDate}, 'YYYY-MM') = ${input.issueDate.slice(0, 7)}`,
      or(ilike(journalEntriesTable.description, `%${input.invoiceNumber.replace(/[%_]/g, "\\$&")}%`),
        ilike(journalEntriesTable.description, `%${distributor.companyName.replace(/[%_]/g, "\\$&")}%`)),
    ));
  const paymentKeys = await Promise.all(input.payments.map(p => executor.select({ id: receivablePaymentsTable.id })
    .from(receivablePaymentsTable).where(eq(receivablePaymentsTable.paymentKey, p.paymentKey))));
  const paymentConflicts = await Promise.all(input.payments.map(p => reconcileHistoricalPayment(input.distributorId, p, executor)));
  const conflicts = [
    ...existing.map((row: typeof invoicesTable.$inferSelect) => `Invoice #${row.id}: ${row.invoiceNumber}`),
    ...imported.map((row: { id: number }) => `Master Sales journal #${row.id}`),
    ...ledger.filter((row: { id: number; sourceType: string }) => !imported.some((i: { id: number }) => i.id === row.id))
      .map((row: { id: number; sourceType: string }) => `Journal #${row.id} (${row.sourceType})`),
    ...paymentKeys.flat().map((row: { id: number }) => `Payment #${row.id}`),
    ...paymentConflicts.flat(),
  ];
  return { conflicts, warnings: ["Compare the original document and bank receipts with the ledger before saving. An external original is not a newly issued ZATCA invoice."] };
}

export async function createHistoricalInvoice(input: HistoricalInvoiceInput, actorId: number) {
  await ensureStandardAccountingChart();
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(${7_521_010_001})`);
    const [replayed] = await tx.select().from(invoicesTable).where(eq(invoicesTable.creationKey, input.creationKey)).limit(1);
    if (replayed) {
      if (replayed.historicalCreationFingerprint) {
        if (replayed.historical !== "yes" || replayed.historicalCreationFingerprint !== creationFingerprint(input))
          throw new DistributorInvoiceConflictError("Creation key belongs to a different invoice or collection");
        return replayed;
      }
      const existingItems = await tx.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, replayed.id)).orderBy(invoiceItemsTable.id);
      const existingPayments = await tx.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, replayed.id)).orderBy(receivablePaymentsTable.id);
      if (replayed.historical !== "yes" || replayed.invoiceNumber !== input.invoiceNumber.trim() ||
          replayed.distributorId !== input.distributorId || replayed.issueDatetime.toISOString().slice(0, 10) !== input.issueDate ||
          replayed.dueDate !== input.dueDate || replayed.sellerName !== input.sellerName.trim() ||
          replayed.sellerVatNumber !== input.sellerVatNumber.trim() || replayed.buyerTaxNumber !== (input.buyerTaxNumber?.trim() || null) ||
          replayed.buyerAddress !== (input.buyerAddress?.trim() || null) ||
          replayed.buyerCommercialRegistrationNumber !== (input.buyerCommercialRegistrationNumber?.trim() || null) ||
          replayed.taxTreatment !== input.taxTreatment || cent(replayed.subtotal) !== cent(input.subtotal) ||
          cent(replayed.discountAmount) !== cent(input.discountAmount) || cent(replayed.vatAmount) !== cent(input.vatAmount) ||
          cent(replayed.totalAmount) !== cent(input.totalAmount) || replayed.buyerName !== input.buyerName.trim() ||
          JSON.stringify(existingItems.map(i => ({ productName: i.productName, sku: i.sku, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal, vatAmount: i.vatAmount, totalAmount: i.totalAmount }))) !==
          JSON.stringify(input.items.map(i => ({ productName: i.productName.trim(), sku: i.sku?.trim() || null, quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal, vatAmount: i.vatAmount, totalAmount: i.totalAmount }))) ||
          JSON.stringify(existingPayments.map(p => ({ paymentKey: p.paymentKey, paymentDate: p.paymentDate, amount: p.amount, paymentMethod: p.paymentMethod, reference: p.reference }))) !==
          JSON.stringify(input.payments.map(p => ({ paymentKey: p.paymentKey, paymentDate: p.paymentDate, amount: p.amount, paymentMethod: p.paymentMethod, reference: p.reference?.trim() || null })))) {
        throw new DistributorInvoiceConflictError("Creation key belongs to a different invoice or collection");
      }
      return replayed;
    }
    const review = await reconcileHistoricalInvoice(input, tx);
    if (review.conflicts.length) throw new DistributorInvoiceConflictError(`Reconciliation required: ${review.conflicts.join("; ")}`);
    const [{ next }] = await tx.select({ next: sql<number>`coalesce(min(${invoicesTable.sequenceNumber}), 0) - 1` }).from(invoicesTable);
    const [invoice] = await tx.insert(invoicesTable).values({
      historical: "yes", creationKey: input.creationKey, historicalCreationFingerprint: creationFingerprint(input), distributorId: input.distributorId,
      sequenceNumber: Math.min(-1, Number(next)), invoiceNumber: input.invoiceNumber.trim(),
      sellerName: input.sellerName.trim(), sellerVatNumber: input.sellerVatNumber.trim(),
      issueDatetime: new Date(`${input.issueDate}T12:00:00.000Z`), dueDate: input.dueDate,
      buyerName: input.buyerName.trim(), buyerTaxNumber: input.buyerTaxNumber?.trim() || null,
      buyerAddress: input.buyerAddress?.trim() || null, buyerCommercialRegistrationNumber: input.buyerCommercialRegistrationNumber?.trim() || null,
      taxTreatment: input.taxTreatment, subtotal: input.subtotal, discountAmount: input.discountAmount,
      vatAmount: input.vatAmount, totalAmount: input.totalAmount, qrCodeData: "",
    }).returning();
    await tx.insert(invoiceItemsTable).values(input.items.map(i => ({
      invoiceId: invoice.id, productId: null, productName: i.productName.trim(), sku: i.sku?.trim() || null,
      quantity: i.quantity, unitPrice: i.unitPrice, subtotal: i.subtotal, vatAmount: i.vatAmount, totalAmount: i.totalAmount,
    })));
    await postJournalEntry({
      entryDate: input.issueDate, createdBy: actorId, description: `Historical company invoice ${invoice.invoiceNumber}`,
      sourceType: "historical_company_invoice", sourceId: String(invoice.id),
      lines: [{ accountCode: "1130", debit: input.totalAmount },
        ...(cent(input.subtotal) > 0 ? [{ accountCode: "4100", credit: input.subtotal }] : []),
        ...(cent(input.vatAmount) > 0 ? [{ accountCode: "2120", credit: input.vatAmount }] : [])],
    }, tx);
    for (const p of input.payments) {
      const [payment] = await tx.insert(receivablePaymentsTable).values({
        invoiceId: invoice.id, paymentKey: p.paymentKey, paymentDate: p.paymentDate, amount: p.amount,
        paymentMethod: p.paymentMethod, reference: p.reference?.trim() || null, createdBy: actorId,
      }).returning();
      await postJournalEntry({
        entryDate: p.paymentDate, createdBy: actorId, description: `Collection for ${invoice.invoiceNumber}${payment.reference ? ` (${payment.reference})` : ""}`,
        sourceType: "receivable_payment", sourceId: String(payment.id),
        lines: [{ accountCode: p.paymentMethod === "cash" ? "1110" : "1120", debit: p.amount },
          { accountCode: "1130", credit: p.amount }],
      }, tx);
    }
    return invoice;
  });
}