import { eq, inArray } from "drizzle-orm";
import { db, invoicesTable, invoiceItemsTable, receivablePaymentsTable, productsTable, wholesaleDistributorsTable, distributorContractsTable, uploadedContractFilesTable } from "@workspace/db";
import { createDistributorInvoiceInTransaction, DistributorInvoiceConflictError, DistributorInvoiceValidationError, lockDistributorContractSource } from "./invoices";
import { createHistoricalInvoice, type HistoricalInvoiceInput } from "./historical-company-invoices";
import { discountedGrossCents, extractVatFromGross, taxTreatmentForContractType } from "./vat";
import { saudiCalendarDate } from "./invoice-dates";
import { zatcaSellerConfiguration } from "./zatca";

type CompanyInvoiceLine = {
  productId?: number;
  productName?: string;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
};

export type CompanyInvoiceInput = {
  showShipping?: boolean;
  creationKey: string;
  issueDate: string;
  dueDate: string;
  distributorId: number;
  contractId?: number;
  uploadedContractFileId?: number;
  discountOverride?: { percent: number; reason?: string };
  originalInvoiceNumber?: string;
  collected?: boolean;
  paymentDate?: string;
  paymentMethod?: "cash" | "bank_transfer";
  items: CompanyInvoiceLine[];
};

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const amount = (value: number) => value / 100;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00.000Z`)) &&
  new Date(`${value}T12:00:00.000Z`).toISOString().slice(0, 10) === value;

/**
 * Issue a current company invoice using the caller's transaction. The company
 * lock is taken before the invoice issuer's creation/product/number locks; portal
 * callers may take it earlier, before locking their order row.
 */
export async function createCurrentCompanyInvoiceInTransaction(
  tx: any,
  input: CompanyInvoiceInput,
  actorId: number,
  environment: NodeJS.ProcessEnv = process.env,
) {
  if (!input.creationKey || input.creationKey.trim().length < 16 || input.creationKey.length > 80 ||
    !validDate(input.issueDate) || !validDate(input.dueDate) || input.dueDate < input.issueDate ||
    !input.items.length || input.items.length > 100 ||
    input.items.some((item) => item.productId === undefined || !Number.isSafeInteger(item.productId) || item.productId < 1 ||
      !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
      !Number.isFinite(item.unitPrice) || item.unitPrice <= 0 || cents(item.unitPrice) / 100 !== item.unitPrice)) {
    throw new DistributorInvoiceValidationError("Current company invoices require a valid key, dates, catalog products, quantities and prices");
  }
  if (input.contractId !== undefined && input.uploadedContractFileId !== undefined) {
    throw new DistributorInvoiceValidationError("Select only one contract source");
  }
  if (input.discountOverride && (!Number.isFinite(input.discountOverride.percent) ||
    input.discountOverride.percent < 0 || input.discountOverride.percent > 100 ||
    Math.round(input.discountOverride.percent * 100) !== input.discountOverride.percent * 100)) {
    throw new DistributorInvoiceValidationError("Invoice discount must be between 0 and 100 percent with at most two decimals");
  }
  const todayRiyadh = saudiCalendarDate(new Date());
  if (input.issueDate > todayRiyadh) throw new DistributorInvoiceValidationError("issueDate cannot be in the future in the Riyadh calendar");
  if (input.collected && (!input.paymentDate || !validDate(input.paymentDate) || !input.paymentMethod)) {
    throw new DistributorInvoiceValidationError("paymentDate and paymentMethod are required when collected is true");
  }
  if (!input.collected && (input.paymentDate || input.paymentMethod)) {
    throw new DistributorInvoiceValidationError("paymentDate and paymentMethod can only be supplied when collected is true");
  }
  if (input.collected && input.paymentDate! > todayRiyadh) {
    throw new DistributorInvoiceValidationError("paymentDate cannot be in the future in the Riyadh calendar");
  }
  await lockDistributorContractSource(tx, input.distributorId);
  const [distributor] = await tx.select().from(wholesaleDistributorsTable)
    .where(eq(wholesaleDistributorsTable.id, input.distributorId)).limit(1);
  if (!distributor) throw new DistributorInvoiceValidationError("Distributor not found");
  const countryCode = distributor.countryCode?.trim().toUpperCase();
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    throw new DistributorInvoiceConflictError("Distributor countryCode must be an ISO 3166-1 alpha-2 code");
  }
  return createDistributorInvoiceInTransaction(tx, {
    ...(input.showShipping ? { showShipping: true } : {}),
    creationKey: input.creationKey,
    distributorId: input.distributorId,
    contractId: input.contractId,
    uploadedContractFileId: input.uploadedContractFileId,
    discountOverride: input.discountOverride,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    taxTreatment: countryCode && countryCode !== "SA" ? "international" : "domestic",
    collected: input.collected ? { paymentDate: input.paymentDate!, paymentMethod: input.paymentMethod! } : undefined,
    items: input.items.map(({ productId, quantity, unitPrice }) => ({ productId: productId!, quantity, unitPrice })),
  }, actorId, environment);
}

export async function createCompanyInvoice(input: CompanyInvoiceInput, actorId: number, environment: NodeJS.ProcessEnv = process.env) {
  if (!input.creationKey || input.creationKey.trim().length < 16 || input.creationKey.length > 80) {
    throw new DistributorInvoiceValidationError("A valid creationKey between 16 and 80 characters is required");
  }
  const originalInvoiceNumber = input.originalInvoiceNumber?.trim() || undefined;
  if (originalInvoiceNumber && originalInvoiceNumber.length > 100) {
    throw new DistributorInvoiceValidationError("originalInvoiceNumber cannot exceed 100 characters");
  }
  if (!validDate(input.issueDate) || !validDate(input.dueDate) || input.dueDate < input.issueDate) {
    throw new DistributorInvoiceValidationError("Valid issueDate and dueDate are required, and dueDate cannot precede issueDate");
  }
  if (!input.items.length || input.items.length > 100 ||
    input.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
      !Number.isFinite(item.unitPrice) || item.unitPrice <= 0 || cents(item.unitPrice) / 100 !== item.unitPrice)) {
    throw new DistributorInvoiceValidationError("Each invoice line requires a positive quantity and a price with at most two decimals");
  }
  if (input.collected && (!input.paymentDate || !validDate(input.paymentDate) || !input.paymentMethod)) {
    throw new DistributorInvoiceValidationError("paymentDate and paymentMethod are required when collected is true");
  }
  if (!input.collected && (input.paymentDate || input.paymentMethod)) {
    throw new DistributorInvoiceValidationError("paymentDate and paymentMethod can only be supplied when collected is true");
  }
  if (input.items.some((item) =>
    (item.productId !== undefined && (!Number.isSafeInteger(item.productId) || item.productId < 1)) ||
    (item.productName !== undefined && (item.productName.length > 200 || (item.productId === undefined && !item.productName.trim()))) ||
    (item.sku != null && item.sku.length > 100))) {
    throw new DistributorInvoiceValidationError("Invalid product reference or historical line snapshot");
  }
  const todayRiyadh = saudiCalendarDate(new Date());
  if (input.collected && input.paymentDate! > todayRiyadh) {
    throw new DistributorInvoiceValidationError("paymentDate cannot be in the future in the Riyadh calendar");
  }
  const historical = input.issueDate < todayRiyadh;
  if (input.discountOverride && (!Number.isFinite(input.discountOverride.percent) ||
    input.discountOverride.percent < 0 || input.discountOverride.percent > 100 ||
    Math.round(input.discountOverride.percent * 100) !== input.discountOverride.percent * 100)) {
    throw new DistributorInvoiceValidationError("Invoice discount must be between 0 and 100 percent with at most two decimals");
  }
  const allCurrentProductLines = input.items.every((item) => item.productId !== undefined);
  if (!historical && !allCurrentProductLines) {
    throw new DistributorInvoiceValidationError("Current company invoices require a catalog productId on every line");
  }
  if (historical && input.items.some((item) => item.productId === undefined && !item.productName?.trim())) {
    throw new DistributorInvoiceValidationError("A historical line without a catalog product requires productName");
  }
  const productIds = input.items.flatMap((item) => item.productId === undefined ? [] : [item.productId]);
  if (new Set(productIds).size !== productIds.length) {
    throw new DistributorInvoiceValidationError("Each catalog product may appear only once per invoice");
  }
  const fallbackKeys = input.items.filter((item) => item.productId === undefined)
    .map((item) => `${item.productName!.trim().toLocaleLowerCase()}|${item.sku?.trim().toLocaleLowerCase() ?? ""}`);
  if (new Set(fallbackKeys).size !== fallbackKeys.length) {
    throw new DistributorInvoiceValidationError("Repeated historical snapshot lines are not allowed");
  }
  if (!historical && originalInvoiceNumber) {
    throw new DistributorInvoiceValidationError("originalInvoiceNumber is only valid for historical invoices");
  }
  if (input.contractId !== undefined && input.uploadedContractFileId !== undefined) {
    throw new DistributorInvoiceValidationError("Select only one contract source");
  }

  const [existingByKey] = await db.select()
    .from(invoicesTable).where(eq(invoicesTable.creationKey, input.creationKey)).limit(1);
  if (input.issueDate > todayRiyadh) {
    throw new DistributorInvoiceValidationError("issueDate cannot be in the future in the Riyadh calendar");
  }
  const [distributor] = await db.select().from(wholesaleDistributorsTable)
    .where(eq(wholesaleDistributorsTable.id, input.distributorId)).limit(1);
  if (!distributor) throw new DistributorInvoiceValidationError("Distributor not found");

  let invoice;
  const createCurrentInvoice = () => db.transaction((tx) =>
    createCurrentCompanyInvoiceInTransaction(tx, input, actorId, environment));
  if (historical && existingByKey?.historical === "no" && allCurrentProductLines && !originalInvoiceNumber) {
    // A retry of an existing current invoice after Riyadh midnight replays its
    // original issuance; all new classification is based solely on issueDate.
    invoice = await createCurrentInvoice();
  } else if (!historical) {
    invoice = await createCurrentInvoice();
  } else {
    const countryCode = distributor.countryCode?.trim().toUpperCase();
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
      throw new DistributorInvoiceConflictError("Distributor countryCode must be an ISO 3166-1 alpha-2 code");
    }
    const taxTreatment = countryCode && countryCode !== "SA" ? "international" : "domestic";
    const [contract] = input.contractId === undefined ? [] : await db.select().from(distributorContractsTable)
      .where(eq(distributorContractsTable.id, input.contractId)).limit(1);
    const [uploadedContract] = input.uploadedContractFileId === undefined ? [] : await db.select().from(uploadedContractFilesTable)
      .where(eq(uploadedContractFilesTable.id, input.uploadedContractFileId)).limit(1);
    if (input.contractId !== undefined && (!contract || contract.distributorId !== distributor.id || contract.status !== "final")) {
      throw new DistributorInvoiceConflictError("Selected contract must be a final contract linked to this company");
    }
    if (input.uploadedContractFileId !== undefined && (!uploadedContract || uploadedContract.ownerType !== "distributor" ||
      uploadedContract.ownerId !== distributor.id || !uploadedContract.termsConfirmedAt ||
      !uploadedContract.contractType?.trim() || uploadedContract.discountPercent === null ||
      !Number.isFinite(Number(uploadedContract.discountPercent)) ||
      Number(uploadedContract.discountPercent) < 0 || Number(uploadedContract.discountPercent) > 100)) {
      throw new DistributorInvoiceConflictError("Selected uploaded contract must have confirmed terms linked to this company");
    }
    const contractType = contract?.contractType ?? uploadedContract?.contractType ?? null;
    const requiredTaxTreatment = contractType ? taxTreatmentForContractType(contractType) : null;
    if (requiredTaxTreatment && requiredTaxTreatment !== taxTreatment) {
      throw new DistributorInvoiceConflictError("Contract tax treatment does not match the company country");
    }
    const contractDiscountPercent = contract ? Number(contract.marginPercent) : uploadedContract ? Number(uploadedContract.discountPercent) : null;
    if (contractDiscountPercent !== null && (!Number.isFinite(contractDiscountPercent) || contractDiscountPercent < 0 || contractDiscountPercent > 100)) {
      throw new DistributorInvoiceConflictError("Contract discount must be between 0 and 100 percent");
    }
    const effectiveOverride = input.discountOverride?.percent === (contractDiscountPercent ?? 0) ? undefined : input.discountOverride;
    if (effectiveOverride && ((effectiveOverride.reason?.trim().length ?? 0) < 10 || (effectiveOverride.reason?.trim().length ?? 0) > 500)) {
      throw new DistributorInvoiceValidationError("An invoice discount override requires a written reason (10–500 characters)");
    }
    const appliedDiscountPercent = effectiveOverride?.percent ?? contractDiscountPercent ?? 0;
    const vatRate = taxTreatment === "domestic" ? (contract ? Number(contract.vatRate) : 15) : 0;
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) throw new DistributorInvoiceConflictError("Invalid contract VAT rate");
    const productRows = productIds.length
      ? await db.select({
        id: productsTable.id,
        invoiceNameAr: productsTable.invoiceNameAr,
        invoiceNameEn: productsTable.invoiceNameEn,
        nameAr: productsTable.nameAr,
        nameEn: productsTable.nameEn,
        sku: productsTable.sku,
      }).from(productsTable).where(inArray(productsTable.id, productIds))
      : [];
    const productsById = new Map(productRows.map((product) => [product.id, product]));
    if (productRows.length !== productIds.length) {
      throw new DistributorInvoiceValidationError("A selected historical catalog product no longer exists");
    }
    const lines = input.items.map((item) => {
      const grossCents = cents(item.unitPrice) * item.quantity;
      const split = extractVatFromGross(discountedGrossCents(grossCents, appliedDiscountPercent), vatRate);
      const product = item.productId === undefined ? undefined : productsById.get(item.productId);
      const productName = product
        ? item.productName?.trim() || product.invoiceNameAr?.trim() || product.nameAr
        : item.productName?.trim();
      if (!productName) throw new DistributorInvoiceValidationError("Historical product name is required when no catalog invoice name is available");
      return {
        productId: product?.id ?? null,
        productName,
        productNameEn: product ? product.invoiceNameEn?.trim() || product.nameEn : null,
        sku: product?.sku?.trim() || item.sku?.trim() || null,
        quantity: item.quantity,
        unitPrice: amount(cents(item.unitPrice)),
        subtotal: amount(split.netCents),
        vatAmount: amount(split.vatCents),
        totalAmount: amount(split.grossCents),
      };
    });
    const snapshotKeys = lines.map((line) =>
      `${line.productName.trim().toLocaleLowerCase()}|${line.sku?.trim().toLocaleLowerCase() ?? ""}`);
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].productId === null && snapshotKeys.slice(0, index).includes(snapshotKeys[index])) {
        throw new DistributorInvoiceValidationError("Repeated historical snapshot lines are not allowed");
      }
      if (lines[index].productId !== null && lines.slice(0, index).some((prior) =>
        prior.productId === null && snapshotKeys[index] === `${prior.productName.trim().toLocaleLowerCase()}|${prior.sku?.trim().toLocaleLowerCase() ?? ""}`)) {
        throw new DistributorInvoiceValidationError("Repeated historical snapshot lines are not allowed");
      }
    }
    const subtotal = amount(lines.reduce((sum, line) => sum + cents(line.subtotal), 0));
    const vatAmount = amount(lines.reduce((sum, line) => sum + cents(line.vatAmount), 0));
    const totalAmount = amount(cents(subtotal) + cents(vatAmount));
    const discountAmount = amount(input.items.reduce((sum, item) => sum + cents(item.unitPrice) * item.quantity, 0) - cents(totalAmount));
    const configuration = zatcaSellerConfiguration(environment);
    const payment = input.collected ? [{
      paymentKey: `company-invoice:${input.creationKey}:collected`,
      paymentDate: input.paymentDate!,
      amount: totalAmount,
      paymentMethod: input.paymentMethod!,
    }] : [];
    const historicalInput: HistoricalInvoiceInput = {
      ...(input.showShipping ? { showShipping: true } : {}),
      creationKey: input.creationKey,
      distributorId: input.distributorId,
      invoiceNumber: originalInvoiceNumber,
      internalReference: true,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      buyerName: distributor.companyName,
      buyerTaxNumber: distributor.taxNumber,
      buyerAddress: [distributor.address, distributor.city].filter(Boolean).join(", ") || null,
      buyerCommercialRegistrationNumber: distributor.commercialRegistrationNumber,
      sellerName: configuration.sellerName,
      sellerVatNumber: configuration.vatRegistrationNumber,
      taxTreatment,
      contractId: contract?.id,
      uploadedContractFileId: uploadedContract?.id,
      contractNumber: contract?.contractNumber ?? uploadedContract?.fileName,
      contractType: contractType ?? undefined,
      contractDiscountPercent: contractDiscountPercent ?? undefined,
      invoiceDiscountPercent: effectiveOverride?.percent,
      discountOverrideReason: effectiveOverride?.reason?.trim(),
      vatRate,
      paymentTerm: uploadedContract?.paymentTerm ?? (contract ? "net_days" : undefined),
      paymentDays: uploadedContract?.paymentDays ?? contract?.paymentDays,
      subtotal,
      discountAmount,
      vatAmount,
      totalAmount,
      items: lines,
      payments: payment,
    };
    invoice = await createHistoricalInvoice(historicalInput, actorId);
  }

  const [stored] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id)).limit(1);
  const [items, payments] = await Promise.all([
    db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoice.id)).orderBy(invoiceItemsTable.id),
    db.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId, invoice.id)).orderBy(receivablePaymentsTable.paymentDate),
  ]);
  const paidAmount = amount(payments.reduce((sum, payment) => sum + cents(payment.amount), 0));
  return {
    id: invoice.id,
    invoiceNumber: stored.invoiceNumber,
    originalInvoiceNumber: stored.originalInvoiceNumber,
    historical: stored.historical,
    paidAmount,
    outstandingAmount: amount(Math.max(0, cents(stored.totalAmount) - cents(paidAmount))),
    paymentStatus: paidAmount >= stored.totalAmount ? "paid" as const : paidAmount > 0 ? "partial" as const : "unpaid" as const,
    items,
    payments,
  };
}