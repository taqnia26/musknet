import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { AccountingConflictError, ensureStandardAccountingChart, postJournalEntry, postSalesJournal, reverseJournalEntry } from "./accounting";
import { zatcaPhaseOneBase64, zatcaSellerConfiguration } from "./zatca";
import { adjustOperationalBalances } from "./operations";
import { discountedGrossCents, extractVatFromGross, taxTreatmentForContractType, type TaxTreatment } from "./vat";
import { addCalendarDays, defaultCompanyDueDate, dueDateFromContract, invoiceIssueTimestamp, saudiCalendarDate } from "./invoice-dates";
import { reconcileHistoricalPayment } from "./historical-payment-reconciliation";
import { INVOICE_SEQUENCE_SCOPE, nextInvoiceSequenceNumber } from "./invoice-sequence";
import { shipheroDispatchesTable } from "@workspace/db";
import { SHIPHERO_TRIGGER_STATUS } from "./shiphero-config";
import { assertPhoneOrderTransition, orderInvoiceIsDue } from "./phone-order-policy";
import { db, adminUsersTable, accountingAccountsTable, exhibitionProductsTable, exhibitionsTable, invoiceItemsTable, invoicesTable, journalEntriesTable, journalEntryLinesTable, ordersTable, orderItemsTable, orderPaymentLinksTable, productsTable, operationEventsTable, inventoryMovementsTable, receivablePaymentsTable, wholesaleDistributorsTable, shipmentsTable, shipmentEventsTable, distributorContractsTable, uploadedContractFilesTable } from "@workspace/db";

const INVOICE_NUMBER_LOCK = 7_521_010_001;

export async function nextLiveInvoiceNumber(tx: any, prefix: "INV" | "LC") {
  // Caller holds INVOICE_NUMBER_LOCK. Historical external references occupy the
  // same namespace, but never consume the live sequence.
  const [{ liveMaximum }] = await tx.select({
    liveMaximum: sql<number>`greatest(coalesce(max(${invoicesTable.sequenceNumber}), 0), 0)`,
  }).from(invoicesTable);
  const retainedHighWaterResult = await tx.execute(sql`
    select value
      from public.backup_invoice_highwater
     where scope = ${INVOICE_SEQUENCE_SCOPE}
     limit 1
  `);
  const retainedHighWater = Number(retainedHighWaterResult.rows[0]?.value ?? 0);
  let candidate = nextInvoiceSequenceNumber(Number(liveMaximum), retainedHighWater);
  while (true) {
    const invoiceNumber = `${prefix}-${String(candidate).padStart(6, "0")}`;
    const [reserved] = await tx.select({ id: invoicesTable.id }).from(invoicesTable)
      .where(sql`lower(${invoicesTable.invoiceNumber}) = lower(${invoiceNumber})`).limit(1);
    if (!reserved) {
      // This shares the caller's transaction and advisory lock. Failed invoice
      // issuance rolls the ledger update back together with the invoice write.
      await tx.execute(sql`
        insert into public.backup_invoice_highwater (scope, value)
        values (${INVOICE_SEQUENCE_SCOPE}, ${candidate})
        on conflict (scope) do update
          set value = greatest(public.backup_invoice_highwater.value, excluded.value),
              updated_at = now()
      `);
      return { sequenceNumber: candidate, invoiceNumber };
    }
    candidate += 1;
  }
}
const DISTRIBUTOR_CONTRACT_LOCK_NAMESPACE = 752_101;

const money = (value: number) => value.toFixed(2);
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const fromCents = (value: number) => value / 100;
const stableJson = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item);

const dateOnly = (value: string | Date) => value instanceof Date ? value.toISOString().slice(0, 10) : value;
function uploadedContractDueDate(issueDate: Date, paymentTerm: string, paymentDays: number | null) {
  const issueDateSaudi = saudiCalendarDate(issueDate);
  if (paymentTerm === "due_on_issue") return issueDateSaudi;
  if (paymentTerm === "end_of_month") {
    const [year, month] = issueDateSaudi.split("-").map(Number);
    const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${String(month).padStart(2, "0")}-${String(finalDay).padStart(2, "0")}`;
  }
  if (paymentTerm === "net_days" && Number.isSafeInteger(paymentDays) && paymentDays! > 0) {
    return addCalendarDays(issueDateSaudi, paymentDays!);
  }
  throw new DistributorInvoiceConflictError("Uploaded contract payment terms are incomplete or invalid");
}
function orderInvoiceTaxSnapshot(order: typeof ordersTable.$inferSelect) {
  let address: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(order.address) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) address = parsed;
  } catch {
    // Old rows occasionally contain non-JSON address text; preserve their legacy totals.
  }
  const storedTreatment = address.taxTreatment;
  const country = String(address.countryCode ?? address.country ?? "").trim().toUpperCase();
  const destinationTreatment: TaxTreatment = storedTreatment === "domestic" || storedTreatment === "international"
    ? storedTreatment
    : !country || ["SA", "SAUDI ARABIA", "السعودية", "المملكة العربية السعودية"].includes(country)
      ? "domestic"
      : "international";
  const totalCents = cents(order.total);
  const subtotalCents = cents(order.subtotal);
  const shippingCents = cents(order.shippingCost);
  const discountCents = cents(order.discount);
  const taxCents = cents(order.tax);
  const legacyArithmetic = totalCents + discountCents === subtotalCents + shippingCents + taxCents;
  const inclusiveArithmetic = totalCents === subtotalCents - discountCents + shippingCents;
  const inclusive = inclusiveArithmetic && (storedTreatment === "domestic" || storedTreatment === "international" || !legacyArithmetic);
  const legacy = !inclusive;
  return {
    legacy,
    taxTreatment: destinationTreatment,
    vatRate: legacy ? (taxCents > 0 ? 15 : 0) : (destinationTreatment === "domestic" ? 15 : 0),
  };
}

export class DistributorInvoiceValidationError extends Error {}
export class DistributorInvoiceConflictError extends Error {}

export class ReceivablePaymentNotFoundError extends Error {}

/** Void the issued document while retaining its number and original ledger entries. */
export async function cancelCompanyInvoice(invoiceId: number, reason: string, actorId: number) {
  const explanation = reason.trim();
  if (explanation.length < 10 || explanation.length > 500) throw new DistributorInvoiceValidationError("A cancellation reason of 10–500 characters is required");
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    const [identity] = await tx.select({ distributorId: invoicesTable.distributorId }).from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId)).limit(1);
    if (identity?.distributorId !== null && identity?.distributorId !== undefined) {
      await lockDistributorContractSource(tx, identity.distributorId);
    }
    await tx.execute(sql`select id from ${invoicesTable} where ${invoicesTable.id} = ${invoiceId} for update`);
    const [invoice] = await tx.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
    if (!invoice || invoice.distributorId === null) throw new ReceivablePaymentNotFoundError("Company invoice not found");
    if (invoice.cancelledAt) throw new DistributorInvoiceConflictError("Invoice is already cancelled");
    const payments = await tx.select({ id: receivablePaymentsTable.id }).from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, invoiceId));
    if (payments.length) throw new DistributorInvoiceConflictError("Invoice with collections cannot be cancelled");
    const [shipment] = await tx.select().from(shipmentsTable).where(eq(shipmentsTable.invoiceId, invoiceId)).for("update");
    const events = shipment ? await tx.select({ id: shipmentEventsTable.id }).from(shipmentEventsTable).where(eq(shipmentEventsTable.shipmentId, shipment.id)).limit(1) : [];
    if (shipment && (shipment.status !== "pending" || shipment.trackingNumber || shipment.carrierShipmentId || shipment.labelUrl ||
      shipment.integrationStatus !== "not_requested" || shipment.integrationAttempts || shipment.shippedAt || events.length))
      throw new DistributorInvoiceConflictError("Shipment has advanced or been sent to a carrier");
    const sourceTypes = invoice.historical === "yes" ? ["historical_company_invoice"] : ["distributor_invoice", "distributor_invoice_cogs"];
    const journals = await tx.select().from(journalEntriesTable).where(and(
      sql`${journalEntriesTable.sourceType} in (${sql.join(sourceTypes.map(type => sql`${type}`), sql`, `)})`,
      eq(journalEntriesTable.sourceId, String(invoiceId)),
    )).orderBy(journalEntriesTable.id);
    if (!journals.some(entry => entry.sourceType === sourceTypes[0]) || journals.some(entry => entry.status !== "posted"))
      throw new DistributorInvoiceConflictError("Invoice journals require accounting review before cancellation");
    const movements = await tx.select().from(inventoryMovementsTable).where(and(
      eq(inventoryMovementsTable.sourceType, "distributor_invoice"), eq(inventoryMovementsTable.sourceId, String(invoiceId)),
    )).orderBy(inventoryMovementsTable.productId);
    const items = await tx.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId));
    if (invoice.historical === "yes" ? movements.length > 0 : (items.some(item =>
      !movements.some(m => m.productId === item.productId && m.quantityChange === -item.quantity)) || movements.length !== items.length))
      throw new DistributorInvoiceConflictError("Invoice stock movements require reconciliation before cancellation");
    if (movements.some(movement => Number(movement.totalCost) > 0) && !journals.some(entry => entry.sourceType === "distributor_invoice_cogs"))
      throw new DistributorInvoiceConflictError("Invoice COGS journal requires accounting review before cancellation");
    for (const id of [...new Set(movements.map(m => m.productId))].sort((a, b) => a - b))
      await tx.execute(sql`select id from ${productsTable} where ${productsTable.id} = ${id} for update`);
    const today = saudiCalendarDate(new Date());
    for (const movement of movements) {
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, movement.productId));
      if (!product) throw new DistributorInvoiceConflictError("Invoice product no longer exists");
      const quantity = -movement.quantityChange;
      const after = product.stockQuantity + quantity;
      const averageCost = ((product.stockQuantity * Number(product.averageCost)) + Number(movement.totalCost)) / after;
      await adjustOperationalBalances(tx, product.id, quantity, averageCost, product.stockQuantity);
      await tx.update(productsTable).set({ stockQuantity: after, averageCost: averageCost.toFixed(4) }).where(eq(productsTable.id, product.id));
      await tx.insert(inventoryMovementsTable).values({
        productId: product.id, movementType: "increase", quantityChange: quantity, quantityBefore: product.stockQuantity,
        quantityAfter: after, unitCost: movement.unitCost, totalCost: movement.totalCost,
        reason: `Cancellation ${invoice.invoiceNumber}: ${explanation}`, sourceType: "distributor_invoice_cancellation",
        sourceId: String(invoiceId), eventKey: `distributor-invoice-cancellation:${invoiceId}:${product.id}`, performedBy: actorId,
      });
    }
    for (const entry of journals) await reverseJournalEntry(entry.id, actorId, `Cancel ${invoice.invoiceNumber}: ${explanation}`, today, tx);
    await tx.insert(operationEventsTable).values({
      eventKey: `distributor-invoice-cancellation:${invoiceId}`, kind: "sale_fulfillment", status: "posted",
      sourceType: "distributor_invoice_cancellation", sourceId: String(invoiceId), actorId,
      payload: { reason: explanation, journalIds: journals.map(entry => entry.id) },
    });
    if (shipment) await tx.update(shipmentsTable).set({ status: "cancelled" }).where(eq(shipmentsTable.id, shipment.id));
    const [cancelled] = await tx.update(invoicesTable).set({
      cancelledAt: new Date(), cancelledByAdminId: actorId, cancellationReason: explanation,
    }).where(eq(invoicesTable.id, invoiceId)).returning();
    return cancelled;
  });
}

// Every path that reads or writes distributor contract-source state must take
// this lock first. Invoice paths take product/sequence locks only afterward;
// term confirmation never takes those locks, preserving a single safe order.
export async function lockDistributorContractSource(tx: any, distributorId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(${DISTRIBUTOR_CONTRACT_LOCK_NAMESPACE}, ${distributorId})`);
}

async function assertDistributorInvoiceReplay(tx: any, previous: typeof invoicesTable.$inferSelect, input: {
  creationKey: string;
  distributorId: number;
  contractId?: number;
  uploadedContractFileId?: number;
  discountOverride?: { percent: number; reason?: string };
  taxTreatment?: TaxTreatment;
  dueDate?: string | Date;
  items: Array<{ productId: number; quantity: number; unitPrice: number }>;
}) {
  if (previous.cancelledAt) throw new DistributorInvoiceConflictError("Cancelled invoice cannot be reissued");
  if (previous.distributorId !== input.distributorId) throw new DistributorInvoiceConflictError("Creation key already used for a different distributor invoice");
  const [event] = await tx.select().from(operationEventsTable)
    .where(eq(operationEventsTable.eventKey, `distributor-invoice:${previous.id}`)).limit(1);
  if (event) {
    const recordedRequest = (event.payload as { request?: unknown } | null)?.request;
    if (stableJson(recordedRequest) !== stableJson(input)) {
      throw new DistributorInvoiceConflictError("Creation key already used for different invoice details");
    }
    return;
  }
  const previousItems = await tx.select().from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, previous.id)).orderBy(invoiceItemsTable.id);
  const requestedItems = input.items.map((item) => ({
    productId: item.productId, quantity: item.quantity, unitPriceCents: cents(item.unitPrice),
  })).sort((a, b) => a.productId - b.productId);
  const recordedItems = previousItems.map((item: typeof invoiceItemsTable.$inferSelect) => ({
    productId: item.productId, quantity: item.quantity, unitPriceCents: cents(item.unitPrice),
  })).sort((a: { productId: number }, b: { productId: number }) => a.productId - b.productId);
  const mismatch = (input.contractId !== undefined && input.contractId !== previous.contractId) ||
    (input.uploadedContractFileId !== undefined && input.uploadedContractFileId !== previous.uploadedContractFileId) ||
    (input.discountOverride !== undefined && (
      previous.invoiceDiscountPercent !== String(input.discountOverride.percent.toFixed(2)) ||
       previous.discountOverrideReason !== input.discountOverride.reason?.trim()
    )) ||
    (input.discountOverride === undefined && previous.invoiceDiscountPercent !== null) ||
    (input.taxTreatment !== undefined && input.taxTreatment !== previous.taxTreatment) ||
    (input.dueDate !== undefined && previous.dueDate !== dateOnly(input.dueDate)) ||
    stableJson(requestedItems) !== stableJson(recordedItems);
  if (mismatch) throw new DistributorInvoiceConflictError("Creation key already used for different invoice details");
}

export async function createExhibitionInvoice(
  input: { creationKey: string; exhibitionId: number; saleDate: string; buyerName: string; buyerAddress?: string | null; buyerTaxNumber?: string | null; buyerCommercialRegistrationNumber?: string | null; paymentMethod: "cash" | "bank_transfer"; items: Array<{ productId: number; quantity: number; unitPrice: number }> },
  actorId: number,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!input.buyerName.trim() || !input.items.length || new Set(input.items.map(i => i.productId)).size !== input.items.length ||
    input.items.some(i => !Number.isSafeInteger(i.quantity) || i.quantity < 1 || !Number.isFinite(i.unitPrice) || i.unitPrice <= 0 || cents(i.unitPrice) / 100 !== i.unitPrice) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.saleDate) || Number.isNaN(Date.parse(`${input.saleDate}T12:00:00Z`))) {
    throw new DistributorInvoiceValidationError("Enter a valid buyer, sale date, unique products, quantities and prices (two decimals)");
  }
  await ensureStandardAccountingChart();
  return db.transaction(async tx => {
    // Serialize creation keys before taking any inventory locks. The same key must
    // never be re-used to issue a different sale.
    await tx.execute(sql`select pg_advisory_xact_lock(7521, hashtext(${input.creationKey}))`);
    const [previous] = await tx.select().from(invoicesTable).where(eq(invoicesTable.creationKey, input.creationKey)).limit(1);
    if (previous) {
      if (previous.exhibitionId !== input.exhibitionId) throw new DistributorInvoiceConflictError("Creation key already used");
      const [event] = await tx.select().from(operationEventsTable).where(eq(operationEventsTable.eventKey, `exhibition-invoice:${previous.id}`)).limit(1);
      const previousItems = await tx.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, previous.id)).orderBy(invoiceItemsTable.id);
      if (stableJson(event?.payload && (event.payload as { request?: unknown }).request) !== stableJson(input)) throw new DistributorInvoiceConflictError("Creation key already used for different details");
      const payments = await tx.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, previous.id));
      const [exhibition] = await tx.select({ name: exhibitionsTable.name }).from(exhibitionsTable).where(eq(exhibitionsTable.id, input.exhibitionId));
      return { ...previous, orderNumber: null, distributorName: null, exhibitionName: exhibition.name, paidAmount: previous.totalAmount, outstandingAmount: 0, paymentStatus: "paid" as const, payments, items: previousItems };
    }
    await tx.execute(sql`select id from ${exhibitionsTable} where ${exhibitionsTable.id} = ${input.exhibitionId} for update`);
    const [exhibition] = await tx.select().from(exhibitionsTable).where(eq(exhibitionsTable.id, input.exhibitionId));
    if (!exhibition) throw new DistributorInvoiceValidationError("Exhibition not found");
    if (exhibition.status === "cancelled" || input.saleDate < exhibition.startDate || input.saleDate > exhibition.endDate)
      throw new DistributorInvoiceConflictError("Sale date must be within a non-cancelled exhibition");
    for (const id of input.items.map(i => i.productId).sort((a, b) => a - b)) {
      await tx.execute(sql`select id from ${productsTable} where ${productsTable.id} = ${id} for update`);
    }
    const lines = [];
    let totalCost = 0;
    for (const item of input.items) {
      const [allocation] = await tx.select().from(exhibitionProductsTable).where(and(eq(exhibitionProductsTable.exhibitionId, input.exhibitionId), eq(exhibitionProductsTable.productId, item.productId)));
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, item.productId));
      if (!allocation || !product || !product.isActive) throw new DistributorInvoiceConflictError(`Product ${item.productId} is not available at this exhibition`);
      if (allocation.quantityAllocated - allocation.quantitySold < item.quantity) throw new DistributorInvoiceConflictError(`Insufficient exhibition allocation for ${product.nameAr}`);
      if (product.stockQuantity < item.quantity) throw new DistributorInvoiceConflictError(`Insufficient stock for ${product.nameAr}`);
      const grossCents = cents(item.unitPrice) * item.quantity;
      const amounts = extractVatFromGross(grossCents, 15);
      lines.push({ productId: item.productId, productName: product.invoiceNameAr, productNameEn: product.invoiceNameEn, sku: product.sku, quantity: item.quantity, unitPrice: item.unitPrice,
        subtotal: fromCents(amounts.netCents), vatAmount: fromCents(amounts.vatCents), totalAmount: fromCents(amounts.grossCents),
        stockBefore: product.stockQuantity, unitCost: product.averageCost, allocationId: allocation.id, soldBefore: allocation.quantitySold });
      totalCost += Number(product.averageCost) * item.quantity;
    }
    const subtotal = fromCents(lines.reduce((sum, line) => sum + cents(line.subtotal), 0));
    const vatAmount = fromCents(lines.reduce((sum, line) => sum + cents(line.vatAmount), 0));
    const totalAmount = fromCents(cents(subtotal) + cents(vatAmount));
    const configuration = zatcaSellerConfiguration(environment);
    const issuedAt = new Date(`${input.saleDate}T12:00:00.000Z`);
    await tx.execute(sql`select pg_advisory_xact_lock(${INVOICE_NUMBER_LOCK})`);
    const { sequenceNumber, invoiceNumber } = await nextLiveInvoiceNumber(tx, "INV");
    const [invoice] = await tx.insert(invoicesTable).values({
      exhibitionId: exhibition.id, creationKey: input.creationKey, sequenceNumber, invoiceNumber,
      sellerName: configuration.sellerName, sellerVatNumber: configuration.vatRegistrationNumber, issueDatetime: issuedAt,
      buyerName: input.buyerName.trim(), buyerAddress: input.buyerAddress?.trim() || null, buyerTaxNumber: input.buyerTaxNumber?.trim() || null,
      buyerCommercialRegistrationNumber: input.buyerCommercialRegistrationNumber?.trim() || null,
      subtotal, discountAmount: 0, vatAmount, totalAmount, taxTreatment: "domestic", vatRate: "15",
      qrCodeData: zatcaPhaseOneBase64({ ...configuration, timestamp: issuedAt.toISOString(), invoiceTotal: money(totalAmount), vatTotal: money(vatAmount) }),
    }).returning();
    const items = await tx.insert(invoiceItemsTable).values(lines.map(({ stockBefore, unitCost, allocationId, soldBefore, ...line }) => ({ ...line, invoiceId: invoice.id }))).returning();
    for (const line of lines) {
      await tx.update(exhibitionProductsTable).set({ quantitySold: line.soldBefore + line.quantity }).where(eq(exhibitionProductsTable.id, line.allocationId));
      await adjustOperationalBalances(tx, line.productId, -line.quantity, line.unitCost, line.stockBefore);
      await tx.update(productsTable).set({ stockQuantity: line.stockBefore - line.quantity }).where(eq(productsTable.id, line.productId));
      await tx.insert(inventoryMovementsTable).values({
        productId: line.productId, movementType: "decrease", quantityChange: -line.quantity,
        quantityBefore: line.stockBefore, quantityAfter: line.stockBefore - line.quantity,
        reason: `Exhibition invoice ${invoiceNumber}`, unitCost: line.unitCost,
        totalCost: (Number(line.unitCost) * line.quantity).toFixed(4),
        sourceType: "exhibition_invoice", sourceId: String(invoice.id), eventKey: `exhibition-invoice:${invoice.id}:${line.productId}`, performedBy: actorId,
      });
    }
    const [payment] = await tx.insert(receivablePaymentsTable).values({
      invoiceId: invoice.id, paymentKey: `exhibition:${input.creationKey}`, paymentDate: input.saleDate,
      amount: totalAmount, paymentMethod: input.paymentMethod, createdBy: actorId,
    }).returning();
    await postJournalEntry({ entryDate: input.saleDate, description: `Exhibition sale ${invoiceNumber}`, createdBy: actorId,
      sourceType: "exhibition_invoice", sourceId: String(invoice.id),
      lines: [{ accountCode: input.paymentMethod === "cash" ? "1110" : "1120", debit: totalAmount },
        { accountCode: "4100", credit: subtotal }, { accountCode: "2120", credit: vatAmount }] }, tx);
    if (totalCost > 0) await postJournalEntry({ entryDate: input.saleDate, description: `Cost of exhibition sale ${invoiceNumber}`,
      createdBy: actorId, sourceType: "exhibition_invoice_cogs", sourceId: String(invoice.id),
      lines: [{ accountCode: "5100", debit: totalCost }, { accountCode: "1140", credit: totalCost }] }, tx);
    await tx.insert(operationEventsTable).values({ eventKey: `exhibition-invoice:${invoice.id}`, kind: "sale_fulfillment", status: "posted",
      sourceType: "exhibition_invoice", sourceId: String(invoice.id), actorId, payload: { request: input } });
    return { ...invoice, orderNumber: null, distributorName: null, exhibitionName: exhibition.name, paidAmount: totalAmount, outstandingAmount: 0, paymentStatus: "paid" as const, payments: [payment], items };
  });
}

export async function createDistributorInvoice(
  input: { creationKey: string; distributorId: number; contractId?: number; uploadedContractFileId?: number; discountOverride?: { percent: number; reason?: string }; taxTreatment?: TaxTreatment; issueDate?: string | Date; dueDate?: string | Date; collected?: { paymentDate: string | Date; paymentMethod: "cash" | "bank_transfer" }; items: Array<{ productId: number; quantity: number; unitPrice: number }> },
  actorId: number,
  environment: NodeJS.ProcessEnv = process.env,
  executor?: any,
) {
  if (!input.items.length) throw new DistributorInvoiceValidationError("At least one invoice item is required");
  if (input.creationKey.trim().length < 16) throw new DistributorInvoiceValidationError("A valid creation key is required");
  if (input.contractId !== undefined && input.uploadedContractFileId !== undefined) {
    throw new DistributorInvoiceValidationError("Select either a generated contract or an uploaded contract file, not both");
  }
  if (input.discountOverride && (
    !Number.isFinite(input.discountOverride.percent) || input.discountOverride.percent < 0 ||
     input.discountOverride.percent > 100 || Math.round(input.discountOverride.percent * 100) !== input.discountOverride.percent * 100
   )) throw new DistributorInvoiceValidationError("Discount override requires a percentage between 0 and 100 with at most two decimals");
  const productIds = input.items.map((item) => item.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new DistributorInvoiceValidationError("Each product may only appear once");
  }
  if (input.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0)) {
    throw new DistributorInvoiceValidationError("Each item requires a valid quantity and price");
  }

  await ensureStandardAccountingChart();
  const issue = async (tx: any) => {
    if (!executor) await lockDistributorContractSource(tx, input.distributorId);
    await tx.execute(sql`select pg_advisory_xact_lock(7521, hashtext(${input.creationKey}))`);
    const [previous] = await tx.select().from(invoicesTable).where(eq(invoicesTable.creationKey, input.creationKey)).limit(1);
    if (previous) {
      await assertDistributorInvoiceReplay(tx, previous, { ...input, discountOverride: input.discountOverride?.percent === Number(previous.contractDiscountPercent ?? 0) ? undefined : input.discountOverride });
      const previousItems = await tx.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, previous.id)).orderBy(invoiceItemsTable.id);
      const payments: (typeof receivablePaymentsTable.$inferSelect)[] = await tx.select().from(receivablePaymentsTable)
        .where(eq(receivablePaymentsTable.invoiceId, previous.id)).orderBy(receivablePaymentsTable.paymentDate);
      const paidAmount = fromCents(payments.reduce((sum: number, payment) => sum + cents(payment.amount), 0));
      return { ...previous, orderNumber: null, distributorName: previous.buyerName, exhibitionName: null, paidAmount, outstandingAmount: fromCents(cents(previous.totalAmount) - cents(paidAmount)), paymentStatus: paidAmount > 0 ? "partial" as const : "unpaid" as const, payments, items: previousItems };
    }
    const [distributor] = await tx.select().from(wholesaleDistributorsTable)
      .where(eq(wholesaleDistributorsTable.id, input.distributorId)).limit(1);
    if (!distributor) throw new DistributorInvoiceValidationError("Distributor not found");
    if (!distributor.isActive) throw new DistributorInvoiceConflictError("Distributor is inactive");

    const todayDate = saudiCalendarDate(new Date());
    const currentContracts: (typeof distributorContractsTable.$inferSelect)[] = await tx.select().from(distributorContractsTable).where(and(
      eq(distributorContractsTable.distributorId, distributor.id),
      eq(distributorContractsTable.status, "final"),
      sql`(${distributorContractsTable.startDate} is null or ${distributorContractsTable.startDate}::date <= ${todayDate}::date)`,
      sql`(${distributorContractsTable.endDate} is null or ${distributorContractsTable.endDate}::date >= ${todayDate}::date)`,
    ));
    const currentUploadedContracts: (typeof uploadedContractFilesTable.$inferSelect)[] = await tx.select().from(uploadedContractFilesTable).where(and(
      eq(uploadedContractFilesTable.ownerType, "distributor"),
      eq(uploadedContractFilesTable.ownerId, distributor.id),
      isNotNull(uploadedContractFilesTable.termsConfirmedAt),
      sql`(${uploadedContractFilesTable.startDate} is null or ${uploadedContractFilesTable.startDate}::date <= ${todayDate}::date)`,
      sql`(${uploadedContractFilesTable.endDate} is null or ${uploadedContractFilesTable.endDate}::date >= ${todayDate}::date)`,
    ));
    const pendingUploadedContracts: Array<{ id: number }> = await tx.select({ id: uploadedContractFilesTable.id }).from(uploadedContractFilesTable).where(and(
      eq(uploadedContractFilesTable.ownerType, "distributor"),
      eq(uploadedContractFilesTable.ownerId, distributor.id),
      isNull(uploadedContractFilesTable.termsConfirmedAt),
    ));
    let contract: typeof distributorContractsTable.$inferSelect | undefined;
    let uploadedContract: typeof uploadedContractFilesTable.$inferSelect | undefined;
    if (input.contractId !== undefined) {
      contract = currentContracts.find((row) => row.id === input.contractId);
      if (!contract) throw new DistributorInvoiceConflictError("Selected contract is not a current final contract linked to this distributor");
    } else if (input.uploadedContractFileId !== undefined) {
      uploadedContract = currentUploadedContracts.find((row) => row.id === input.uploadedContractFileId);
      if (!uploadedContract) throw new DistributorInvoiceConflictError("Selected uploaded contract is not confirmed, current, and linked to this distributor");
    } else {
      if (pendingUploadedContracts.length > 0) {
        throw new DistributorInvoiceConflictError("A linked uploaded contract must have its terms reviewed and a source selected before issuing an invoice");
      }
      if (currentContracts.length + currentUploadedContracts.length > 1) {
        throw new DistributorInvoiceConflictError("Multiple current contracts are linked to this distributor; select a contract source explicitly");
      }
      contract = currentContracts[0];
      uploadedContract = currentUploadedContracts[0];
    }
    if (uploadedContract && (
      !uploadedContract.contractType?.trim() ||
      !["net_days", "end_of_month", "due_on_issue"].includes(uploadedContract.paymentTerm ?? "") ||
      uploadedContract.discountPercent === null ||
      !Number.isFinite(Number(uploadedContract.discountPercent)) ||
      Number(uploadedContract.discountPercent) < 0 ||
      Number(uploadedContract.discountPercent) > 100 ||
      (uploadedContract.paymentTerm === "net_days" && (!Number.isSafeInteger(uploadedContract.paymentDays) || (uploadedContract.paymentDays ?? 0) < 1)) ||
      (uploadedContract.paymentTerm !== "net_days" && uploadedContract.paymentDays !== null)
    )) {
      throw new DistributorInvoiceConflictError("Uploaded contract has incomplete or invalid confirmed terms");
    }
    const selectedContractType = contract?.contractType ?? uploadedContract?.contractType ?? null;
    const contractTreatment = selectedContractType ? taxTreatmentForContractType(selectedContractType) : null;
    const taxTreatment: TaxTreatment = input.taxTreatment ?? contractTreatment ??
      (distributor.countryCode?.trim().toUpperCase() && distributor.countryCode.trim().toUpperCase() !== "SA" ? "international" : "domestic");
    if (contractTreatment && taxTreatment !== contractTreatment) {
      throw new DistributorInvoiceConflictError(`Contract tax treatment must be ${contractTreatment}`);
    }
    const countryCode = distributor.countryCode?.trim().toUpperCase() || null;
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
      throw new DistributorInvoiceConflictError("Distributor countryCode must be an ISO 3166-1 alpha-2 code");
    }
    if (taxTreatment === "international" && (!countryCode || countryCode === "SA")) {
      throw new DistributorInvoiceValidationError("International company invoices require a distributor countryCode other than SA");
    }
    if (contractTreatment === "domestic" && countryCode && countryCode !== "SA") {
      throw new DistributorInvoiceConflictError("Saudi contract type cannot be invoiced to a non-Saudi distributor");
    }
    if (contractTreatment === "international" && countryCode === "SA") {
      throw new DistributorInvoiceConflictError("Gulf contract type cannot be invoiced to a Saudi distributor");
    }
    const rawVatRate = contract ? Number(contract.vatRate) : taxTreatment === "international" ? 0 : 15;
    const vatRate = taxTreatment === "international" ? 0 : Number.isFinite(rawVatRate) && rawVatRate >= 0 && rawVatRate <= 100 ? rawVatRate : 15;
    const rawDiscount = contract ? Number(contract.marginPercent) : uploadedContract ? Number(uploadedContract.discountPercent) : 0;
    if (!Number.isFinite(rawDiscount) || rawDiscount < 0 || rawDiscount > 100) {
      throw new DistributorInvoiceConflictError("Contract discount must be between 0 and 100 percent");
    }
    const contractDiscountPercent = contract || uploadedContract ? rawDiscount : 0;
    const effectiveOverride = input.discountOverride?.percent === contractDiscountPercent ? undefined : input.discountOverride;
    if (effectiveOverride && ((effectiveOverride.reason?.trim().length ?? 0) < 10 || (effectiveOverride.reason?.trim().length ?? 0) > 500)) {
      throw new DistributorInvoiceValidationError("Discount override requires a written reason (10–500 characters)");
    }
    const appliedDiscountPercent = effectiveOverride?.percent ?? contractDiscountPercent;
    const normalizedInput = { ...input, discountOverride: effectiveOverride };

    const sortedProductIds = [...productIds].sort((a, b) => a - b);
    for (const productId of sortedProductIds) {
      await tx.execute(sql`select id from ${productsTable} where ${productsTable.id} = ${productId} for update`);
    }
    const products: Array<{ id: number; nameAr: string; nameEn: string; invoiceNameAr: string; invoiceNameEn: string; sku: string | null; isActive: boolean; stockQuantity: number; averageCost: string }> = [];
    for (const item of input.items) {
      const [product] = await tx.select({
        id: productsTable.id, nameAr: productsTable.nameAr, nameEn: productsTable.nameEn, invoiceNameAr: productsTable.invoiceNameAr, invoiceNameEn: productsTable.invoiceNameEn,
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
      const listGrossCents = cents(item.unitPrice) * item.quantity;
      const grossCents = discountedGrossCents(listGrossCents, appliedDiscountPercent);
      const amounts = extractVatFromGross(grossCents, vatRate);
      return {
        productId: item.productId,
        productName: products[index].invoiceNameAr,
        productNameEn: products[index].invoiceNameEn,
        sku: products[index].sku,
        quantity: item.quantity,
        unitPrice: fromCents(cents(item.unitPrice)),
        subtotal: fromCents(amounts.netCents),
        vatAmount: fromCents(amounts.vatCents),
        totalAmount: fromCents(amounts.grossCents),
      };
    });
    const listSubtotal = fromCents(input.items.reduce((sum, item) => sum + cents(item.unitPrice) * item.quantity, 0));
    const subtotal = fromCents(lines.reduce((sum, line) => sum + cents(line.subtotal), 0));
    const vatAmount = fromCents(lines.reduce((sum, line) => sum + cents(line.vatAmount), 0));
    const totalAmount = fromCents(lines.reduce((sum, line) => sum + cents(line.totalAmount), 0));
    const discountAmount = fromCents(cents(listSubtotal) - cents(totalAmount));

    const creditSource = contract ?? uploadedContract;
    const creditPosition = await getCompanyCreditPosition(
      tx,
      distributor.id,
      creditSource,
      Math.max(0, cents(totalAmount) - (input.collected ? cents(totalAmount) : 0)),
    );
    if (!creditPosition.allowed) {
      throw new DistributorInvoiceConflictError(creditPosition.blockingReason ?? "Company credit limit is not approved");
    }

    await tx.execute(sql`select pg_advisory_xact_lock(${INVOICE_NUMBER_LOCK})`);
    const [afterLock] = await tx.select().from(invoicesTable).where(eq(invoicesTable.creationKey, input.creationKey)).limit(1);
    if (afterLock) {
      await assertDistributorInvoiceReplay(tx, afterLock, normalizedInput);
      const afterLockItems = await tx.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, afterLock.id)).orderBy(invoiceItemsTable.id);
      const payments: (typeof receivablePaymentsTable.$inferSelect)[] = await tx.select().from(receivablePaymentsTable)
        .where(eq(receivablePaymentsTable.invoiceId, afterLock.id)).orderBy(receivablePaymentsTable.paymentDate);
      const paidAmount = fromCents(payments.reduce((sum: number, payment) => sum + cents(payment.amount), 0));
      return { ...afterLock, orderNumber: null, distributorName: afterLock.buyerName, exhibitionName: null, paidAmount, outstandingAmount: fromCents(cents(afterLock.totalAmount) - cents(paidAmount)), paymentStatus: paidAmount > 0 ? "partial" as const : "unpaid" as const, payments, items: afterLockItems };
    }
    const configuration = zatcaSellerConfiguration(environment);
    const issuedAt = new Date();
    const issueDate = input.issueDate ? dateOnly(input.issueDate) : saudiCalendarDate(issuedAt);
    const issueDatetime = invoiceIssueTimestamp(issueDate, issuedAt);
    const { sequenceNumber, invoiceNumber } = await nextLiveInvoiceNumber(tx, "LC");
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
      dueDate: input.dueDate
        ? dateOnly(input.dueDate)
        : uploadedContract
        ? uploadedContractDueDate(issueDatetime, uploadedContract.paymentTerm ?? "", uploadedContract.paymentDays)
        : contract
        ? dueDateFromContract(issueDatetime, contract.contractType, contract.paymentDays)
        : defaultCompanyDueDate(),
      sellerVatNumber: configuration.vatRegistrationNumber,
      buyerName: distributor.companyName,
      buyerTaxNumber: distributor.taxNumber,
      buyerCommercialRegistrationNumber: distributor.commercialRegistrationNumber,
      buyerAddress: [distributor.address, distributor.city].filter(Boolean).join(", ") || null,
      contractId: contract?.id ?? null,
      uploadedContractFileId: uploadedContract?.id ?? null,
      contractNumber: contract?.contractNumber ?? uploadedContract?.fileName ?? null,
      contractType: selectedContractType,
      contractDiscountPercent: contract || uploadedContract ? String(contractDiscountPercent) : null,
      appliedDiscountPercent: appliedDiscountPercent.toFixed(2),
      invoiceDiscountPercent: effectiveOverride ? appliedDiscountPercent.toFixed(2) : null,
      discountOverrideReason: effectiveOverride?.reason?.trim() ?? null,
      discountOverrideByAdminId: effectiveOverride ? actorId : null,
      discountOverrideAt: effectiveOverride ? new Date() : null,
      discountOverrideOutsideContractPeriod: effectiveOverride ? false : null,
      paymentDays: contract?.paymentDays ?? (uploadedContract?.paymentTerm === "net_days" ? uploadedContract.paymentDays : null),
      paymentTerm: uploadedContract?.paymentTerm ?? (contract ? (/نقد|cash/i.test(contract.contractType) ? "due_on_issue" : "net_days") : null),
      taxTreatment,
      vatRate: String(vatRate),
      subtotal,
      discountAmount,
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
      await adjustOperationalBalances(tx, product.id, -item.quantity, product.averageCost, product.stockQuantity);
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
    const saleLines = [
      ...(totalAmount > 0 ? [{ accountCode: "1130", debit: totalAmount }] : []),
      ...(subtotal > 0 ? [{ accountCode: "4100", credit: subtotal }] : []),
      ...(vatAmount > 0 ? [{ accountCode: "2120", credit: vatAmount }] : []),
    ];
    if (saleLines.length) await postJournalEntry({
      entryDate: issueDate,
      description: `Distributor sale ${invoiceNumber}`,
      createdBy: actorId,
      sourceType: "distributor_invoice",
      sourceId: String(invoice.id),
      lines: saleLines,
    }, tx);
    if (totalCost > 0) {
      await postJournalEntry({
        entryDate: issueDate,
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
    let payments: typeof receivablePaymentsTable.$inferSelect[] = [];
    if (input.collected) {
      const [payment] = await tx.insert(receivablePaymentsTable).values({
        invoiceId: invoice.id,
        paymentKey: `company-invoice:${input.creationKey}:collected`,
        paymentDate: dateOnly(input.collected.paymentDate),
        amount: totalAmount,
        paymentMethod: input.collected.paymentMethod,
        createdBy: actorId,
      }).returning();
      await postJournalEntry({
        entryDate: dateOnly(input.collected.paymentDate),
        description: `Collection for ${invoice.invoiceNumber}`,
        createdBy: actorId,
        sourceType: "receivable_payment",
        sourceId: String(payment.id),
        lines: [
          { accountCode: payment.paymentMethod === "cash" ? "1110" : "1120", debit: payment.amount },
          { accountCode: "1130", credit: payment.amount },
        ],
      }, tx);
      const [paymentEvent] = await tx.insert(operationEventsTable).values({
        eventKey: `receivable-payment:${payment.id}`,
        kind: "payment",
        status: "pending",
        sourceType: "receivable_payment",
        sourceId: String(payment.id),
        occurredAt: new Date(`${dateOnly(input.collected.paymentDate)}T12:00:00.000Z`),
        actorId,
        payload: {
          invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: payment.amount,
          paymentMethod: payment.paymentMethod, reference: payment.reference,
        },
      }).returning();
      await tx.update(operationEventsTable).set({ status: "posted" }).where(eq(operationEventsTable.id, paymentEvent.id));
      payments = [payment];
    }
    await tx.insert(operationEventsTable).values({
      eventKey: `distributor-invoice:${invoice.id}`,
      kind: "sale_fulfillment",
      status: "posted",
      sourceType: "distributor_invoice",
      sourceId: String(invoice.id),
      actorId,
      payload: { request: normalizedInput },
    });
    return { ...invoice, orderNumber: null, distributorName: distributor.companyName, exhibitionName: null,
      paidAmount: input.collected ? totalAmount : 0, outstandingAmount: input.collected ? 0 : invoice.totalAmount,
      paymentStatus: input.collected ? "paid" as const : "unpaid" as const, payments, items: createdItems };
  };
  return executor ? issue(executor) : db.transaction(issue);
}

export type CompanyCreditPosition = {
  distributorId: number;
  creditLimitCents: number | null;
  outstandingCents: number;
  requestedCents: number;
  projectedOutstandingCents: number;
  availableCents: number | null;
  allowed: boolean;
  blockingReason: string | null;
};
export async function createReceivablePayment(
  invoiceId: number,
  input: { paymentKey: string; paymentDate: string | Date; amount: number; paymentMethod: "cash" | "bank_transfer"; reference?: string | null },
  actorId: number,
) {
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    const [identity] = await tx.select({ distributorId: invoicesTable.distributorId }).from(invoicesTable)
      .where(eq(invoicesTable.id, invoiceId)).limit(1);
    if (identity?.distributorId !== null && identity?.distributorId !== undefined) {
      await lockDistributorContractSource(tx, identity.distributorId);
    }
    await tx.execute(sql`select id from ${invoicesTable} where ${invoicesTable.id} = ${invoiceId} for update`);
    const [invoice] = await tx.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1);
    if (!invoice || (invoice.distributorId === null && !invoice.individual)) {
      throw new ReceivablePaymentNotFoundError("Receivable company or individual invoice not found");
    }
    if (invoice.cancelledAt) throw new DistributorInvoiceConflictError("Cancelled invoices cannot receive collections");
    const [afterLock] = await tx.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.paymentKey, input.paymentKey)).limit(1);
    if (afterLock) {
      if (afterLock.invoiceId !== invoiceId || afterLock.paymentDate !== dateOnly(input.paymentDate) ||
        cents(afterLock.amount) !== cents(input.amount) || afterLock.paymentMethod !== input.paymentMethod ||
        afterLock.reference !== (input.reference?.trim() || null)) throw new DistributorInvoiceConflictError("Payment key is already used with different details");
      return afterLock;
    }
    if (invoice.historical === "yes") {
      if (invoice.distributorId === null) throw new DistributorInvoiceConflictError("Historical payment reconciliation requires a company invoice");
      const conflicts = await reconcileHistoricalPayment(invoice.distributorId, {
        paymentDate: dateOnly(input.paymentDate), amount: input.amount, reference: input.reference,
      }, tx);
      if (conflicts.length) throw new DistributorInvoiceConflictError(`Collection reconciliation required: ${conflicts.join("; ")}`);
    }
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
  verifiedProviderInvoiceId?: string,
  verifiedProviderCancellationId?: string,
) {
  if (actorId !== undefined) await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${ordersTable} where ${ordersTable.id} = ${orderId} for update`);
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) return null;
    if (order.orderSource === "phone") assertPhoneOrderTransition(order.status, values.status);
    if (verifiedProviderInvoiceId && order.paymentStatus === "paid") {
      const [link] = await tx.select().from(orderPaymentLinksTable).where(eq(orderPaymentLinksTable.orderId, orderId));
      if (link?.providerInvoiceId !== verifiedProviderInvoiceId)
        throw new AccountingConflictError("Payment confirmation does not match this order");
      return order;
    }
    if (order.paymentMethod === "moyasar" && order.status === "pending_payment") {
      const [link] = await tx.select().from(orderPaymentLinksTable).where(eq(orderPaymentLinksTable.orderId, orderId));
      if (verifiedProviderInvoiceId) {
        if (link?.providerInvoiceId !== verifiedProviderInvoiceId ||
          values.status !== "pending_review" || values.paymentStatus !== "paid" ||
          order.paymentStatus !== "pending")
          throw new AccountingConflictError("Payment confirmation no longer matches this pending order");
      } else if (verifiedProviderCancellationId) {
        if (values.status !== "cancelled" || link?.providerInvoiceId !== verifiedProviderCancellationId ||
          order.paymentStatus !== "pending")
          throw new AccountingConflictError("Cancellation does not match this unpaid link order");
      } else if ((values.status !== undefined && values.status !== "pending_payment" &&
          !(values.status === "cancelled" && !link?.providerInvoiceId)) ||
          (values.paymentStatus !== undefined && values.paymentStatus !== "pending")) {
        throw new AccountingConflictError("A pending payment cannot be advanced or marked paid manually");
      }
    }
    if (values.status === "pending_payment" && order.status !== "pending_payment")
      throw new AccountingConflictError("Pending payment is only set when a payment-link order is created");
    if (order.status === "cancelled" && values.status && values.status !== "cancelled")
      throw new AccountingConflictError("Cancelled orders cannot advance");
    if (values.status === "returned" && order.status !== "returned")
      throw new AccountingConflictError("Use the refund workflow before marking an order returned");
    const cancelling = values.status === "cancelled" && order.status !== "cancelled";
    if (cancelling) {
      const [dispatch] = await tx.select().from(shipheroDispatchesTable)
        .where(eq(shipheroDispatchesTable.orderId, order.id)).for("update");
      if (dispatch && ["sending", "sent", "uncertain"].includes(dispatch.status)) {
        throw new AccountingConflictError("ShipHero dispatch may have reached the warehouse; reconcile it before cancelling");
      }
      const [shipment] = await tx.select().from(shipmentsTable).where(eq(shipmentsTable.orderId, order.id)).for("update");
      if (shipment) {
        if (shipment.status !== "pending" || shipment.trackingNumber || shipment.carrierShipmentId || shipment.labelUrl || shipment.shippedAt ||
          shipment.integrationStatus !== "not_requested" || shipment.integrationAttempts)
          throw new AccountingConflictError("Shipment has advanced; use the shipping return workflow");
        await tx.update(shipmentsTable).set({ status: "cancelled" }).where(eq(shipmentsTable.id, shipment.id));
      }
    }
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
    if (orderInvoiceIsDue(order, values)) {
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
          const { sequenceNumber, invoiceNumber } = await nextLiveInvoiceNumber(tx, "INV");
          const total = values.total ?? order.total;
          const vatTotal = values.tax ?? order.tax;
          const orderTaxSnapshot = orderInvoiceTaxSnapshot(order);
          const qrCodeBase64 = zatcaPhaseOneBase64({
            ...configuration,
            timestamp: issuedAt.toISOString(),
            invoiceTotal: money(total),
            vatTotal: money(vatTotal),
          });
          const [createdInvoice] = await tx.insert(invoicesTable).values({
            orderId: order.id,
            sequenceNumber,
            invoiceNumber,
            sellerName: configuration.sellerName,
            issueDatetime: issuedAt,
            sellerVatNumber: configuration.vatRegistrationNumber,
              subtotal: orderTaxSnapshot.legacy ? (values.subtotal ?? order.subtotal) : fromCents(cents(total) - cents(vatTotal)),
              discountAmount: values.discount ?? order.discount,
            totalAmount: total,
            vatAmount: vatTotal,
              taxTreatment: orderTaxSnapshot.taxTreatment,
              vatRate: String(orderTaxSnapshot.vatRate),
            qrCodeData: qrCodeBase64,
          }).returning({ id: invoicesTable.id });
          const orderLines = await tx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
          for (const line of orderLines) {
            const [product] = await tx.select({
              invoiceNameAr: productsTable.invoiceNameAr,
              invoiceNameEn: productsTable.invoiceNameEn,
              sku: productsTable.sku,
            }).from(productsTable).where(eq(productsTable.id, line.productId)).limit(1);
            if (!product) throw new Error(`Product ${line.productId} not found for invoice`);
            const lineAmountCents = cents(line.totalPrice);
            // Legacy order lines stored pre-VAT prices; later orders store VAT-inclusive prices.
            // Keep that historical arithmetic in the issued invoice-line snapshot as well.
            const { netCents, vatCents } = orderTaxSnapshot.legacy
              ? { netCents: lineAmountCents, vatCents: Math.round(lineAmountCents * orderTaxSnapshot.vatRate / 100) }
              : extractVatFromGross(lineAmountCents, orderTaxSnapshot.vatRate);
            await tx.insert(invoiceItemsTable).values({
              invoiceId: createdInvoice.id,
              productId: line.productId,
              productName: product.invoiceNameAr,
              productNameEn: product.invoiceNameEn,
              sku: product.sku,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              subtotal: fromCents(netCents),
              vatAmount: fromCents(vatCents),
              totalAmount: fromCents(netCents + vatCents),
            });
          }
        }
      }
    }
    const statusChanged = values.status !== undefined && values.status !== order.status;
    const [updated] = await tx.update(ordersTable).set({
      ...values,
      ...(actorId !== undefined && values.status !== undefined ? { statusManuallyUpdatedAt: new Date() } : {}),
    })
      .where(eq(ordersTable.id, order.id)).returning();
    // Only entering preparing creates a durable job. Order creation and earlier
    // statuses never call ShipHero; the worker rechecks payment and live readiness.
    if (statusChanged && updated.status === SHIPHERO_TRIGGER_STATUS && updated.orderSource !== "phone") {
      await tx.insert(shipheroDispatchesTable).values({
        orderId: updated.id, orderNumber: updated.orderNumber, status: "queued",
      }).onConflictDoNothing({ target: shipheroDispatchesTable.orderId });
    }
    if (cancelling) {
      await tx.update(shipheroDispatchesTable).set({
        status: "skipped", lastError: "Order cancelled before dispatch",
      }).where(and(eq(shipheroDispatchesTable.orderId, order.id),
        sql`${shipheroDispatchesTable.status} in ('queued', 'blocked', 'failed')`));
    }
    if (cancelling && actorId !== undefined) {
      const items = await tx.select({ productId: orderItemsTable.productId, quantity: orderItemsTable.quantity, costSnapshot: orderItemsTable.costSnapshot })
        .from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
      const fulfillmentMovements = await tx.select({ productId: inventoryMovementsTable.productId })
        .from(inventoryMovementsTable).where(and(eq(inventoryMovementsTable.sourceType, "order"), eq(inventoryMovementsTable.sourceId, String(order.id))));
      const returnedItems = fulfillmentMovements.length ? items : [];
      const productIds = [...new Set(returnedItems.map((item) => item.productId))].sort((a, b) => a - b);
      for (const productId of productIds) await tx.execute(sql`select id from ${productsTable} where id = ${productId} for update`);
      const eventKey = `sale-cancellation:${order.id}`;
      const [event] = await tx.insert(operationEventsTable).values({
        eventKey, kind: "sale_fulfillment", status: "pending", sourceType: "order_cancellation",
        sourceId: String(order.id), actorId, payload: { orderNumber: order.orderNumber },
      }).onConflictDoNothing({ target: operationEventsTable.eventKey }).returning();
      if (event) {
        let reversalCost = 0;
        for (const item of returnedItems) {
          const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, item.productId)).limit(1);
          if (!product) throw new Error(`Product ${item.productId} not found`);
          const quantityAfter = product.stockQuantity + item.quantity;
          const totalCost = Number(item.costSnapshot) * item.quantity;
          reversalCost += totalCost;
          const averageCost = quantityAfter > 0
            ? ((product.stockQuantity * Number(product.averageCost)) + totalCost) / quantityAfter
            : 0;
          await adjustOperationalBalances(tx, product.id, item.quantity, averageCost, product.stockQuantity);
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
        if (reversalCost > 0 && cogsJournal) {
          const postedLines = await tx.select({
            accountCode: accountingAccountsTable.code,
            debit: journalEntryLinesTable.debit,
            credit: journalEntryLinesTable.credit,
            description: journalEntryLinesTable.description,
          }).from(journalEntryLinesTable)
            .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
            .where(eq(journalEntryLinesTable.journalEntryId, cogsJournal.id))
            .orderBy(journalEntryLinesTable.lineNumber);
          if (postedLines.length) await postJournalEntry({
            entryDate: new Date().toISOString().slice(0, 10), description: `Reverse COGS ${order.orderNumber}`,
            createdBy: actorId, sourceType: "sale_cogs_reversal", sourceId: String(order.id),
            lines: postedLines.map((line) => ({
              accountCode: line.accountCode, debit: line.credit, credit: line.debit,
              ...(line.description ? { description: line.description } : {}),
            })),
          }, tx);
        }
        if (order.paymentStatus === "paid") {
          const [saleJournal] = await tx.select({ id: journalEntriesTable.id }).from(journalEntriesTable)
            .where(and(eq(journalEntriesTable.sourceType, "order"), eq(journalEntriesTable.sourceId, String(order.id)))).limit(1);
          if (saleJournal) {
            const postedLines = await tx.select({
              accountCode: accountingAccountsTable.code,
              debit: journalEntryLinesTable.debit,
              credit: journalEntryLinesTable.credit,
              description: journalEntryLinesTable.description,
            }).from(journalEntryLinesTable)
              .innerJoin(accountingAccountsTable, eq(journalEntryLinesTable.accountId, accountingAccountsTable.id))
              .where(eq(journalEntryLinesTable.journalEntryId, saleJournal.id))
              .orderBy(journalEntryLinesTable.lineNumber);
            if (postedLines.length) await postJournalEntry({
              entryDate: new Date().toISOString().slice(0, 10), description: `Reverse sale ${order.orderNumber}`,
              createdBy: actorId, sourceType: "sale_revenue_reversal", sourceId: String(order.id),
              lines: postedLines.map((line) => ({
                accountCode: line.accountCode, debit: line.credit, credit: line.debit,
                ...(line.description ? { description: line.description } : {}),
              })),
            }, tx);
          }
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

/**
 * Credit-limit configuration belongs to the selected current contract source;
 * exposure belongs to the company and deliberately includes invoices under all
 * older contracts, net of recorded collections and excluding cancelled invoices.
 * Callers must hold lockDistributorContractSource before invoking this helper.
 */
export async function getCompanyCreditPosition(
  tx: any,
  distributorId: number,
  source: (typeof distributorContractsTable.$inferSelect | typeof uploadedContractFilesTable.$inferSelect | undefined),
  requestedCents = 0,
): Promise<CompanyCreditPosition> {
  const approved = source && source.creditLimit !== null && source.creditLimitApprovedBy !== null &&
    source.creditLimitApprovedAt !== null && (source.creditLimitApprovalReason?.trim().length ?? 0) >= 10 &&
    (source.creditLimitApprovalReason?.trim().length ?? 0) <= 500;
  const creditLimitCents = approved ? cents(Number(source.creditLimit)) : null;
  const rows = await tx.select({
    totalCents: sql<string>`round(${invoicesTable.totalAmount} * 100)::bigint`,
    paidCents: sql<string>`round(coalesce(sum(${receivablePaymentsTable.amount}), 0) * 100)::bigint`,
  }).from(invoicesTable)
    .leftJoin(receivablePaymentsTable, eq(receivablePaymentsTable.invoiceId, invoicesTable.id))
    .where(and(eq(invoicesTable.distributorId, distributorId), isNull(invoicesTable.cancelledAt)))
    .groupBy(invoicesTable.id);
  const outstandingCents = rows.reduce((sum: number, row: { totalCents: string; paidCents: string }) =>
    sum + Math.max(0, Number(row.totalCents) - Number(row.paidCents)), 0);
  const projectedOutstandingCents = outstandingCents + requestedCents;
  const availableCents = creditLimitCents === null ? null : Math.max(0, creditLimitCents - outstandingCents);
  const allowed = creditLimitCents !== null && projectedOutstandingCents <= creditLimitCents;
  const blockingReason = creditLimitCents === null
    ? "An explicitly approved credit limit is required for this contract before current company invoices can be issued"
    : allowed
      ? null
      : `Company credit limit exceeded: ${projectedOutstandingCents} cents projected against ${creditLimitCents} cents approved`;
  return {
    distributorId,
    creditLimitCents,
    outstandingCents,
    requestedCents,
    projectedOutstandingCents,
    availableCents,
    allowed,
    blockingReason,
  };
}

export async function createDistributorInvoiceInTransaction(
  tx: any,
  input: Parameters<typeof createDistributorInvoice>[0],
  actorId: number,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return createDistributorInvoice(input, actorId, environment, tx);
}
