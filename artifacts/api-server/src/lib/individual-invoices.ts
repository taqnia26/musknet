import { eq, sql } from "drizzle-orm";
import {
  db, inventoryMovementsTable, invoiceItemsTable, invoicesTable, operationEventsTable,
  productsTable, receivablePaymentsTable,
} from "@workspace/db";
import { ensureStandardAccountingChart, postJournalEntry } from "./accounting";
import { adjustOperationalBalances } from "./operations";
import { nextLiveInvoiceNumber } from "./invoices";
import { extractVatFromGross } from "./vat";
import { invoiceIssueTimestamp, saudiCalendarDate } from "./invoice-dates";
import { zatcaPhaseOneBase64, zatcaSellerConfiguration } from "./zatca";
import { allocateDiscountedGross, calculateSaleDiscount, discountResponseFields, validateManualDiscount, type ManualDiscountInput } from "./sale-discounts";

const money = (amount: number) => amount.toFixed(2);
const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);
const fromCents = (amount: number) => amount / 100;
const stableJson = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item);

export class IndividualInvoiceValidationError extends Error {}
export class IndividualInvoiceConflictError extends Error {}

type IndividualInvoiceInput = {
  creationKey: string;
  buyerName: string;
  buyerPhone?: string | null;
  buyerCountry?: string | null;
  buyerAddress: string | null;
  buyerTaxNumber: string | null;
  issueDate: string;
  dueDate?: string;
  collected?: { paymentDate: string; paymentMethod: "cash" | "bank_transfer" };
  couponCode?: string | null;
  discountOverride?: ManualDiscountInput;
  items: Array<{ productId: number; quantity: number; unitPrice: number }>;
};

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizedInput(input: IndividualInvoiceInput): IndividualInvoiceInput {
  return {
    creationKey: input.creationKey.trim(),
    buyerName: input.buyerName.trim(),
    buyerPhone: input.buyerPhone?.trim() || null,
    buyerCountry: input.buyerCountry?.trim().toUpperCase() || null,
    buyerAddress: input.buyerAddress?.trim() || null,
    buyerTaxNumber: input.buyerTaxNumber?.trim() || null,
    issueDate: input.issueDate,
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    ...(input.collected ? { collected: { ...input.collected } } : {}),
    ...(input.couponCode?.trim() ? { couponCode: input.couponCode.trim().toUpperCase() } : {}),
    ...(input.discountOverride?.percent ? { discountOverride: { percent: input.discountOverride.percent, reason: input.discountOverride.reason!.trim() } } : {}),
    items: input.items.map((item) => ({ ...item })),
  };
}

function validateInput(input: IndividualInvoiceInput) {
  if (input.buyerPhone != null && (typeof input.buyerPhone !== "string" || input.buyerPhone.length > 40 ||
      (input.buyerPhone.trim() !== "" && !/^(?=(?:\D*\d){8,15}\D*$)\+?[\d ().-]+$/.test(input.buyerPhone.trim())))) {
    throw new IndividualInvoiceValidationError("Buyer phone must contain 8–15 digits, with an optional + prefix and separators");
  }
  validateManualDiscount(input.discountOverride);
  if (typeof input.creationKey !== "string" || input.creationKey.trim().length < 16 || input.creationKey.length > 200) {
    throw new IndividualInvoiceValidationError("A creation key between 16 and 200 characters is required");
  }
  if (typeof input.buyerName !== "string" || !input.buyerName.trim() || input.buyerName.trim().length > 250) {
    throw new IndividualInvoiceValidationError("A buyer name between 1 and 250 characters is required");
  }
  if (input.buyerAddress !== null && (typeof input.buyerAddress !== "string" || input.buyerAddress.length > 1000)) {
    throw new IndividualInvoiceValidationError("Buyer address must be text or null, up to 1000 characters");
  }
  if (input.buyerTaxNumber !== null && (typeof input.buyerTaxNumber !== "string" || !/^\d{15}$/.test(input.buyerTaxNumber.trim()))) {
    throw new IndividualInvoiceValidationError("Buyer tax number must contain exactly 15 digits or be null");
  }
  const today = saudiCalendarDate(new Date());
  if (!isCalendarDate(input.issueDate) || input.issueDate > today) {
    throw new IndividualInvoiceValidationError("Issue date must be a valid date no later than today in Saudi Arabia");
  }
  if (input.dueDate !== undefined && (!isCalendarDate(input.dueDate) || input.dueDate < input.issueDate)) {
    throw new IndividualInvoiceValidationError("Due date must be valid and on or after the issue date");
  }
  if (input.collected && (!isCalendarDate(input.collected.paymentDate) ||
      input.collected.paymentDate < input.issueDate || input.collected.paymentDate > today ||
      !["cash", "bank_transfer"].includes(input.collected.paymentMethod))) {
    throw new IndividualInvoiceValidationError("Collected payment requires a valid date from issue date through today and a supported payment method");
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    throw new IndividualInvoiceValidationError("An invoice must contain between 1 and 100 products");
  }
  const ids = input.items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) throw new IndividualInvoiceValidationError("Each product may only appear once");
  if (input.items.some((item) => !Number.isSafeInteger(item.productId) || item.productId < 1 ||
      !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100_000 ||
      !Number.isFinite(item.unitPrice) || item.unitPrice <= 0 || item.unitPrice > 100_000_000 ||
      Math.round(item.unitPrice * 100) / 100 !== item.unitPrice)) {
    throw new IndividualInvoiceValidationError("Each item requires a valid product, quantity and positive price with at most two decimal places");
  }
  const grossTotalCents = input.items.reduce((sum, item) => sum + cents(item.unitPrice) * item.quantity, 0);
  if (!Number.isSafeInteger(grossTotalCents) || grossTotalCents < 1) {
    throw new IndividualInvoiceValidationError("Invoice total is outside the supported money range");
  }
  return grossTotalCents;
}

async function invoiceResponse(tx: any, invoice: typeof invoicesTable.$inferSelect) {
  const items = await tx.select().from(invoiceItemsTable)
    .where(eq(invoiceItemsTable.invoiceId, invoice.id)).orderBy(invoiceItemsTable.id);
  const payments = await tx.select().from(receivablePaymentsTable)
    .where(eq(receivablePaymentsTable.invoiceId, invoice.id)).orderBy(receivablePaymentsTable.paymentDate, receivablePaymentsTable.id);
  const paidAmount = fromCents(payments.reduce((sum: number, payment: typeof receivablePaymentsTable.$inferSelect) =>
    sum + cents(payment.amount), 0));
  const outstandingAmount = invoice.cancelledAt ? 0 : Math.max(0, fromCents(cents(invoice.totalAmount) - cents(paidAmount)));
  return {
    ...invoice,
    orderNumber: null,
    distributorName: null,
    exhibitionName: null,
    shippingAmount: 0,
    ...discountResponseFields(invoice),
    appliedDiscountPercent: invoice.appliedDiscountPercent == null ? null : Number(invoice.appliedDiscountPercent),
    invoiceDiscountPercent: invoice.invoiceDiscountPercent == null ? null : Number(invoice.invoiceDiscountPercent),
    discountOverrideOutsideContractPeriod: null,
    cancelledByName: null,
    paidAmount,
    outstandingAmount,
    paymentStatus: outstandingAmount === 0 ? "paid" as const : paidAmount > 0 ? "partial" as const : "unpaid" as const,
    payments,
    items,
  };
}

export async function createIndividualInvoice(
  rawInput: IndividualInvoiceInput,
  actorId: number,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const totalGrossCents = validateInput(rawInput);
  const input = normalizedInput(rawInput);
  await ensureStandardAccountingChart();
  return db.transaction(async (tx) => {
    // This lock is shared by all invoice channels because creationKey is unique
    // across the entire invoice table.
    await tx.execute(sql`select pg_advisory_xact_lock(7521, hashtext(${input.creationKey}))`);
    const [previous] = await tx.select().from(invoicesTable)
      .where(eq(invoicesTable.creationKey, input.creationKey)).limit(1);
    if (previous) {
      if (!previous.individual) throw new IndividualInvoiceConflictError("Creation key is already used by another invoice channel");
      if (previous.cancelledAt) throw new IndividualInvoiceConflictError("Cancelled invoice cannot be reissued");
      const [event] = await tx.select().from(operationEventsTable)
        .where(eq(operationEventsTable.eventKey, `individual-invoice:${previous.id}`)).limit(1);
      const recordedRequest = (event?.payload as { request?: unknown } | undefined)?.request;
      if (!event || stableJson(recordedRequest) !== stableJson(input)) {
        throw new IndividualInvoiceConflictError("Creation key already used for different invoice details");
      }
      return invoiceResponse(tx, previous);
    }

    const productIds = [...new Set(input.items.map((item) => item.productId))].sort((a, b) => a - b);
    for (const productId of productIds) {
      await tx.execute(sql`select id from ${productsTable} where ${productsTable.id} = ${productId} for update`);
    }
    const products: Array<typeof productsTable.$inferSelect> = [];
    for (const productId of productIds) {
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
      if (!product || !product.isActive) throw new IndividualInvoiceConflictError(`Product ${productId} is unavailable`);
      if (!Number.isFinite(Number(product.averageCost)) || Number(product.averageCost) < 0) {
        throw new IndividualInvoiceConflictError(`Product ${product.nameAr} has an invalid inventory cost and requires review`);
      }
      products.push(product);
    }
    const productById = new Map(products.map((product) => [product.id, product]));
    const discount = await calculateSaleDiscount(tx, totalGrossCents / 100, input.couponCode, input.discountOverride?.percent, true, {
      buyerPhone: input.buyerPhone, country: input.buyerCountry, items: input.items,
    });
    const finalGrossCents = cents(discount.productsTotal);
    if (finalGrossCents < 1) throw new IndividualInvoiceValidationError("يجب أن تبقى قيمة الفاتورة أكبر من صفر بعد الخصم");
    const grossLines = input.items.map(item => cents(item.unitPrice) * item.quantity);
    const eligibleLines = input.items.map((item, index) => discount.couponExcludedProductIds.includes(item.productId) ? 0 : grossLines[index]);
    const eligibleTotal = eligibleLines.reduce((a,b) => a+b,0);
    const afterCouponEligible = allocateDiscountedGross(eligibleLines, eligibleTotal - cents(discount.couponDiscountAmount));
    const afterCoupon = grossLines.map((value,index) => value - eligibleLines[index] + afterCouponEligible[index]);
    const allocated = allocateDiscountedGross(afterCoupon, finalGrossCents);
    const lines = input.items.map((item, index) => {
      const product = productById.get(item.productId)!;
      if (product.stockQuantity < item.quantity) {
        throw new IndividualInvoiceConflictError(`Insufficient stock for ${product.nameAr}`);
      }
      const grossCents = allocated[index];
      const amounts = extractVatFromGross(grossCents, 15);
      return {
        productId: product.id,
        productName: product.invoiceNameAr.trim() || product.nameAr,
        productNameEn: product.invoiceNameEn.trim() || product.nameEn,
        sku: product.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: fromCents(amounts.netCents),
        vatAmount: fromCents(amounts.vatCents),
        totalAmount: fromCents(amounts.grossCents),
        stockBefore: product.stockQuantity,
        unitCost: product.averageCost,
      };
    });
    const subtotalCents = lines.reduce((sum, line) => sum + cents(line.subtotal), 0);
    const vatCents = lines.reduce((sum, line) => sum + cents(line.vatAmount), 0);
    const calculatedGrossCents = subtotalCents + vatCents;
    if (calculatedGrossCents !== finalGrossCents) throw new Error("Individual invoice VAT calculation did not reconcile to the discounted gross amounts");
    const subtotal = fromCents(subtotalCents);
    const vatAmount = fromCents(vatCents);
    const totalAmount = fromCents(finalGrossCents);
    const configuration = zatcaSellerConfiguration(environment);
    const issueDatetime = invoiceIssueTimestamp(input.issueDate, new Date());
    await tx.execute(sql`select pg_advisory_xact_lock(7521010001)`);
    const { sequenceNumber, invoiceNumber } = await nextLiveInvoiceNumber(tx, "INV");
    const [invoice] = await tx.insert(invoicesTable).values({
      individual: true,
      creationKey: input.creationKey,
      sequenceNumber,
      invoiceNumber,
      sellerName: configuration.sellerName,
      sellerVatNumber: configuration.vatRegistrationNumber,
      issueDatetime,
      dueDate: input.dueDate ?? null,
      buyerName: input.buyerName,
      buyerPhone: input.buyerPhone,
      buyerAddress: input.buyerAddress,
      buyerTaxNumber: input.buyerTaxNumber,
      subtotal,
      discountAmount: discount.discountAmount,
      couponCode: discount.couponCode,
      couponDiscountType: discount.couponDiscountType,
      couponDiscountValue: discount.couponDiscountValue,
      couponDiscountAmount: discount.couponCode ? discount.couponDiscountAmount.toFixed(2) : null,
      manualDiscountAmount: input.discountOverride ? discount.manualDiscountAmount.toFixed(2) : null,
      invoiceDiscountPercent: input.discountOverride ? input.discountOverride.percent.toFixed(2) : null,
      discountOverrideReason: input.discountOverride?.reason ?? null,
      discountOverrideByAdminId: input.discountOverride ? actorId : null,
      discountOverrideAt: input.discountOverride ? new Date() : null,
      vatAmount,
      totalAmount,
      taxTreatment: "domestic",
      vatRate: "15",
      qrCodeData: zatcaPhaseOneBase64({
        ...configuration,
        timestamp: issueDatetime.toISOString(),
        invoiceTotal: money(totalAmount),
        vatTotal: money(vatAmount),
      }),
    }).returning();
    const items = await tx.insert(invoiceItemsTable).values(lines.map(({ stockBefore, unitCost, ...line }) => ({
      ...line,
      invoiceId: invoice.id,
    }))).returning();

    let totalCost = 0;
    for (const line of lines) {
      const product = productById.get(line.productId)!;
      const after = line.stockBefore - line.quantity;
      await adjustOperationalBalances(tx, product.id, -line.quantity, line.unitCost, line.stockBefore);
      await tx.update(productsTable).set({ stockQuantity: after }).where(eq(productsTable.id, product.id));
      const lineCost = Number(line.unitCost) * line.quantity;
      totalCost += lineCost;
      await tx.insert(inventoryMovementsTable).values({
        productId: product.id,
        movementType: "decrease",
        quantityChange: -line.quantity,
        quantityBefore: line.stockBefore,
        quantityAfter: after,
        reason: `Individual invoice ${invoiceNumber}`,
        unitCost: line.unitCost,
        totalCost: lineCost.toFixed(4),
        sourceType: "individual_invoice",
        sourceId: String(invoice.id),
        eventKey: `individual-invoice:${invoice.id}:${product.id}`,
        performedBy: actorId,
      });
    }

    await postJournalEntry({
      entryDate: input.issueDate,
      description: `Individual sale ${invoiceNumber}`,
      createdBy: actorId,
      sourceType: "individual_invoice",
      sourceId: String(invoice.id),
      lines: [
        { accountCode: "1130", debit: totalAmount },
        { accountCode: "4100", credit: subtotal },
        { accountCode: "2120", credit: vatAmount },
      ],
    }, tx);
    if (totalCost > 0) {
      await postJournalEntry({
        entryDate: input.issueDate,
        description: `Cost of individual sale ${invoiceNumber}`,
        createdBy: actorId,
        sourceType: "individual_invoice_cogs",
        sourceId: String(invoice.id),
        lines: [
          { accountCode: "5100", debit: totalCost },
          { accountCode: "1140", credit: totalCost },
        ],
      }, tx);
    }
    if (input.collected) {
      const [payment] = await tx.insert(receivablePaymentsTable).values({
        invoiceId: invoice.id,
        paymentKey: `individual:${input.creationKey}`,
        paymentDate: input.collected.paymentDate,
        amount: totalAmount,
        paymentMethod: input.collected.paymentMethod,
        createdBy: actorId,
      }).returning();
      await postJournalEntry({
        entryDate: input.collected.paymentDate,
        description: `Collection for ${invoice.invoiceNumber}`,
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
        occurredAt: new Date(`${payment.paymentDate}T12:00:00.000Z`),
        actorId,
        payload: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          reference: payment.reference,
        },
      }).returning();
      await tx.update(operationEventsTable).set({ status: "posted" })
        .where(eq(operationEventsTable.id, event.id));
    }
    await tx.insert(operationEventsTable).values({
      eventKey: `individual-invoice:${invoice.id}`,
      kind: "sale_fulfillment",
      status: "posted",
      sourceType: "individual_invoice",
      sourceId: String(invoice.id),
      actorId,
      occurredAt: issueDatetime,
      payload: { request: input, itemCount: items.length, grossCents: totalGrossCents },
    });
    return invoiceResponse(tx, invoice);
  });
}