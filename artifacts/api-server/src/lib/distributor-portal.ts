import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  companyOrderItemsTable,
  companyOrdersTable,
  distributorPortalAccountsTable,
  distributorContractsTable,
  adminUsersTable,
  productsTable,
  uploadedContractFilesTable,
  wholesaleDistributorsTable,
} from "@workspace/db";
import { getCompanyCreditPosition } from "./invoices";
import { discountedGrossCents, extractVatFromGross, taxTreatmentForContractType } from "./vat";
import { addCalendarDays, saudiCalendarDate } from "./invoice-dates";

const cents = (value: number | string) => Math.round((Number(value) + Number.EPSILON) * 100);
const amount = (value: number) => value / 100;
const jsonCanonical = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item);
export const fingerprint = (value: unknown) => createHash("sha256").update(jsonCanonical(value)).digest("hex");

export type PortalCompany = Pick<typeof wholesaleDistributorsTable.$inferSelect, "id" | "companyName" | "contactName" | "email" | "countryCode" | "isActive">;
export type PortalTerms = {
  contractId: number | null;
  uploadedContractFileId: number | null;
  contractType: string | null;
  contractNumber: string | null;
  discountPercent: number;
  taxTreatment: "domestic" | "international";
  vatRate: number;
  paymentTerm: string | null;
  paymentDays: number | null;
  minOrderValue: number | null;
  creditLimit: number | null;
  creditLimitApproved: boolean;
  creditLimitApprovedAt: string | null;
  termsConfirmedAt: string | null;
};
export type OrderLine = {
  productId: number;
  productName: string;
  productNameEn: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
};
type CatalogProduct = {
  id: number;
  nameAr: string;
  nameEn: string;
  invoiceNameAr: string;
  invoiceNameEn: string;
  distributorNameOverride: string | null;
  sku: string | null;
  distributorImageOverride: string | null;
  images: unknown;
  price: number;
  stockQuantity: number;
  isActive: boolean;
  sellable: boolean;
  showOnDistributors: boolean;
};

async function currentSources(tx: any, distributorId: number) {
  const today = saudiCalendarDate(new Date());
  const contracts = await tx.select().from(distributorContractsTable).where(and(
    eq(distributorContractsTable.distributorId, distributorId),
    eq(distributorContractsTable.status, "final"),
    sql`(${distributorContractsTable.startDate} is null or ${distributorContractsTable.startDate}::date <= ${today}::date)`,
    sql`(${distributorContractsTable.endDate} is null or ${distributorContractsTable.endDate}::date >= ${today}::date)`,
  )).orderBy(desc(distributorContractsTable.startDate), desc(distributorContractsTable.id));
  const files = await tx.select().from(uploadedContractFilesTable).where(and(
    eq(uploadedContractFilesTable.ownerType, "distributor"),
    eq(uploadedContractFilesTable.ownerId, distributorId),
    sql`(${uploadedContractFilesTable.startDate} is null or ${uploadedContractFilesTable.startDate}::date <= ${today}::date)`,
    sql`(${uploadedContractFilesTable.endDate} is null or ${uploadedContractFilesTable.endDate}::date >= ${today}::date)`,
  )).orderBy(desc(uploadedContractFilesTable.signedDate), desc(uploadedContractFilesTable.id));
  return { contracts, files };
}

export async function resolvePortalTerms(tx: any, company: PortalCompany) {
  const { contracts, files } = await currentSources(tx, company.id);
  const activeSources = [...contracts.map((row: any) => ({ kind: "contract" as const, row })),
    ...files.map((row: any) => ({ kind: "file" as const, row }))];
  const ambiguous = activeSources.length > 1;
  const source = activeSources.length === 1 ? activeSources[0] : undefined;
  const contract = source?.kind === "contract" ? source.row : undefined;
  const file = source?.kind === "file" ? source.row : undefined;
  const contractType = contract?.contractType ?? file?.contractType ?? null;
  const country = company.countryCode?.trim().toUpperCase() ?? "";
  const taxTreatment = country && country !== "SA" ? "international" : "domestic";
  const contractTreatment = contractType ? taxTreatmentForContractType(contractType) : null;
  const discountPercent = contract ? Number(contract.marginPercent) : file?.discountPercent === null || !file ? 0 : Number(file.discountPercent);
  const vatRate = taxTreatment === "international" ? 0 : contract ? Number(contract.vatRate) : 15;
  const paymentTerm = file?.paymentTerm ?? (contract ? "net_days" : null);
  const paymentDays = file?.paymentDays ?? (contract ? contract.paymentDays : null);
  const termsConfirmedAt = contract
    ? (contract.buyerSignedAt ?? contract.sellerSignedAt ?? contract.contractDate ?? contract.createdAt)?.toISOString() ?? null
    : file?.termsConfirmedAt?.toISOString() ?? null;
  const selectedSource: any = contract ?? file;
  const approvalReason = selectedSource?.creditLimitApprovalReason?.trim() ?? "";
  const creditLimit = selectedSource?.creditLimit === null || selectedSource?.creditLimit === undefined
    ? null : Number(selectedSource.creditLimit);
  const creditLimitApproved = creditLimit !== null && Number.isFinite(creditLimit) &&
    selectedSource?.creditLimitApprovedBy !== null && selectedSource?.creditLimitApprovedBy !== undefined &&
    selectedSource?.creditLimitApprovedAt !== null && selectedSource?.creditLimitApprovedAt !== undefined &&
    approvalReason.length >= 10 && approvalReason.length <= 500;
  const terms: PortalTerms = {
    contractId: contract?.id ?? null,
    uploadedContractFileId: file?.id ?? null,
    contractType,
    contractNumber: contract?.contractNumber ?? file?.fileName ?? null,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
    taxTreatment,
    vatRate: Number.isFinite(vatRate) ? vatRate : 15,
    paymentTerm,
    paymentDays,
    minOrderValue: contract ? Number(contract.minOrderValue) : null,
    creditLimit,
    creditLimitApproved,
    creditLimitApprovedAt: selectedSource?.creditLimitApprovedAt?.toISOString() ?? null,
    termsConfirmedAt,
  };
  const blockReasons: string[] = [];
  if (ambiguous) blockReasons.push("More than one current contract source is linked to this company.");
  if (!source) blockReasons.push("No current final contract or uploaded contract is linked to this company.");
  if (file && !file.termsConfirmedAt) blockReasons.push("Uploaded contract terms have not been reviewed and confirmed.");
  if (source && file && (
    !file.contractType?.trim() || !["net_days", "end_of_month", "due_on_issue"].includes(file.paymentTerm ?? "") ||
    file.discountPercent === null || !Number.isFinite(Number(file.discountPercent)) ||
    Number(file.discountPercent) < 0 || Number(file.discountPercent) > 100 ||
    (file.paymentTerm === "net_days" && (!Number.isSafeInteger(file.paymentDays) || (file.paymentDays ?? 0) < 1)) ||
    (file.paymentTerm !== "net_days" && file.paymentDays !== null)
  )) blockReasons.push("Uploaded contract terms are incomplete or invalid.");
  if (source && (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100)) {
    blockReasons.push("The active contract discount is invalid.");
  }
  if (source && (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100)) {
    blockReasons.push("The active contract VAT rate is invalid.");
  }
  if (contractTreatment && contractTreatment !== taxTreatment) {
    blockReasons.push("The active contract tax treatment does not match the company country.");
  }
  if (contractType && !contractTreatment) {
    blockReasons.push("The active contract type has no recognized tax treatment.");
  }
  if (country && !/^[A-Z]{2}$/.test(country)) blockReasons.push("The company country code is invalid.");
  return { terms, blockReasons, contract, file };
}

export function totalsFor(lines: OrderLine[]) {
  const subtotal = lines.reduce((sum, line) => sum + cents(line.subtotal), 0);
  const discountAmount = lines.reduce((sum, line) => sum + cents(line.unitPrice) * line.quantity -
    cents(line.subtotal) - cents(line.vatAmount), 0);
  const vatAmount = lines.reduce((sum, line) => sum + cents(line.vatAmount), 0);
  const totalAmount = lines.reduce((sum, line) => sum + cents(line.totalAmount), 0);
  return {
    subtotal: amount(subtotal),
    discountAmount: amount(discountAmount),
    vatAmount: amount(vatAmount),
    totalAmount: amount(totalAmount),
  };
}

export function calculateLines(products: CatalogProduct[], inputItems: Array<{ productId: number; quantity: number }>, terms: PortalTerms): OrderLine[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  return inputItems.map(({ productId, quantity }) => {
    const product = byId.get(productId);
    if (!product) throw new Error(`Catalog product ${productId} is unavailable to this company.`);
    const grossCents = cents(product.price) * quantity;
    const afterDiscount = discountedGrossCents(grossCents, terms.discountPercent);
    const split = extractVatFromGross(afterDiscount, terms.vatRate);
    return {
      productId,
      productName: product.invoiceNameAr?.trim() || product.nameAr,
      productNameEn: product.invoiceNameEn?.trim() || product.nameEn,
      sku: product.sku,
      quantity,
      unitPrice: amount(cents(product.price)),
      subtotal: amount(split.netCents),
      vatAmount: amount(split.vatCents),
      totalAmount: amount(split.grossCents),
    };
  });
}

export function orderSnapshotFingerprint(
  terms: PortalTerms,
  items: OrderLine[],
  totals: ReturnType<typeof totalsFor>,
  stockAtSubmission: Array<{ productId: number; quantity: number; stockQuantity: number }> = [],
) {
  return fingerprint({ terms, items, totals, stockAtSubmission });
}

export function publicCompany(company: PortalCompany) {
  return {
    id: company.id,
    companyName: company.companyName,
    contactName: company.contactName,
    email: company.email,
    countryCode: company.countryCode,
  };
}

export async function readOrderItems(tx: any, orderId: number): Promise<OrderLine[]> {
  const rows = await tx.select().from(companyOrderItemsTable)
    .where(eq(companyOrderItemsTable.companyOrderId, orderId))
    .orderBy(companyOrderItemsTable.id);
  return rows.map((row: any) => ({
    productId: row.productId,
    productName: row.productName,
    productNameEn: row.productNameEn,
    sku: row.sku,
    quantity: row.quantity,
    unitPrice: Number(row.unitPrice),
    subtotal: Number(row.subtotal),
    vatAmount: Number(row.vatAmount),
    totalAmount: Number(row.totalAmount),
  }));
}

export function orderTotalsFromRow(order: typeof companyOrdersTable.$inferSelect) {
  const totals = order.snapshotTotals;
  return {
    subtotal: Number(totals.subtotal ?? 0),
    discountAmount: Number(totals.discountAmount ?? 0),
    vatAmount: Number(totals.vatAmount ?? 0),
    totalAmount: Number(totals.totalAmount ?? 0),
  };
}

export async function companyOrderPublic(tx: any, order: typeof companyOrdersTable.$inferSelect) {
  const [company] = await tx.select({
    id: wholesaleDistributorsTable.id,
    companyName: wholesaleDistributorsTable.companyName,
  }).from(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, order.distributorId)).limit(1);
  const [reviewer] = order.reviewedByAdminId
    ? await tx.select({ id: adminUsersTable.id, name: adminUsersTable.name })
      .from(adminUsersTable).where(eq(adminUsersTable.id, order.reviewedByAdminId)).limit(1)
    : [];
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    companyId: order.distributorId,
    companyName: company?.companyName ?? "",
    status: order.status,
    items: await readOrderItems(tx, order.id),
    ...orderTotalsFromRow(order),
    contractId: order.contractId,
    uploadedContractFileId: order.uploadedContractFileId,
    snapshotTerms: order.snapshotTerms,
    createdAt: order.createdAt.toISOString(),
    reviewedByAdminId: order.reviewedByAdminId,
    reviewedByName: reviewer?.name ?? null,
    reviewedAt: order.decisionAt?.toISOString() ?? null,
    decisionAt: order.decisionAt?.toISOString() ?? null,
    decisionReason: order.decisionReason,
    invoiceId: order.invoiceId,
  };
}

export async function createReviewSnapshot(tx: any, order: typeof companyOrdersTable.$inferSelect, company: PortalCompany) {
  const [context, allOrderItems] = await Promise.all([
    resolvePortalTerms(tx, company),
    tx.select().from(companyOrderItemsTable).where(eq(companyOrderItemsTable.companyOrderId, order.id))
      .orderBy(companyOrderItemsTable.id),
  ]);
  const originalItems: OrderLine[] = allOrderItems.map((row: any) => ({
    productId: row.productId,
    productName: row.productName,
    productNameEn: row.productNameEn,
    sku: row.sku,
    quantity: row.quantity,
    unitPrice: Number(row.unitPrice),
    subtotal: Number(row.subtotal),
    vatAmount: Number(row.vatAmount),
    totalAmount: Number(row.totalAmount),
  }));
  const override = order.adminEditSnapshot?.discountOverride as { percent: number; reason?: string } | null | undefined;
  if (override) context.terms = { ...context.terms, discountPercent: override.percent };
  const ids = originalItems.map((item) => item.productId);
  const currentProducts = ids.length ? await tx.select().from(productsTable).where(inArray(productsTable.id, ids)) : [];
  const products = currentProducts as CatalogProduct[];
  const productById = new Map(products.map((product) => [product.id, product]));
  const currentItems: OrderLine[] = [];
  const stockChecks: Array<{ productId: number; quantity: number; stockQuantity: number | null }> = [];
  const reasons = [...context.blockReasons];
  const [portalAccount] = await tx.select({ enabled: distributorPortalAccountsTable.enabled })
    .from(distributorPortalAccountsTable)
    .where(eq(distributorPortalAccountsTable.distributorId, company.id)).limit(1);
  if (!portalAccount?.enabled) reasons.push("Distributor portal access is disabled for this company.");
  for (const item of originalItems) {
    const product = productById.get(item.productId);
    if (!product) {
      reasons.push(`Product ${item.productName} no longer exists.`);
      stockChecks.push({ productId: item.productId, quantity: item.quantity, stockQuantity: null });
      continue;
    }
    if (!product.isActive || !product.sellable || !product.showOnDistributors) {
      reasons.push(`Product ${product.nameAr} is no longer available in the B2B catalog.`);
    }
    if (product.stockQuantity < item.quantity) {
      reasons.push(`Insufficient stock for ${product.nameAr}: ${product.stockQuantity} available, ${item.quantity} requested.`);
    }
    stockChecks.push({ productId: item.productId, quantity: item.quantity, stockQuantity: product.stockQuantity });
    // An explicit admin price is a reviewed order snapshot, not a catalog edit.
    currentItems.push(...calculateLines([{ ...product, price: order.adminEditSnapshot ? item.unitPrice : product.price }], [{ productId: item.productId, quantity: item.quantity }], context.terms));
  }
  const currentTotals = totalsFor(currentItems);
  const snapshotTerms = order.snapshotTerms as unknown as PortalTerms;
  const snapshotTermsWithoutInternalStock = Object.fromEntries(
    Object.entries(snapshotTerms).filter(([key]) => key !== "_stockAtSubmission"),
  );
  const snapshotTotals = orderTotalsFromRow(order);
  stockChecks.sort((a, b) => a.productId - b.productId);
  const snapshotStock = (snapshotTerms as PortalTerms & { _stockAtSubmission?: Array<{ productId: number; quantity: number; stockQuantity: number }> })._stockAtSubmission ?? [];
  const currentTermFingerprint = fingerprint({
    terms: context.terms,
    items: currentItems,
    totals: currentTotals,
    stockChecks,
  });
  const baselineFingerprint = fingerprint({
    terms: snapshotTermsWithoutInternalStock,
    items: originalItems,
    totals: snapshotTotals,
    stockChecks: snapshotStock,
  });
  const hasMeaningfulChanges = currentTermFingerprint !== baselineFingerprint;
  const creditLimit = context.terms.creditLimit;
  const creditPosition = await getCompanyCreditPosition(
    tx,
    company.id,
    context.contract ?? context.file,
    cents(currentTotals.totalAmount),
  );
  const availableBefore = creditPosition.creditLimitCents === null ? null :
    amount(creditPosition.creditLimitCents - creditPosition.outstandingCents);
  const availableAfter = creditPosition.creditLimitCents === null ? null :
    amount(creditPosition.creditLimitCents - creditPosition.projectedOutstandingCents);
  if (!creditPosition.allowed && creditPosition.blockingReason) reasons.push(creditPosition.blockingReason);
  if (context.terms.minOrderValue !== null && currentTotals.totalAmount < context.terms.minOrderValue) {
    reasons.push("Order total is below the active contract minimum order value.");
  }
  if (!company.countryCode?.trim()) reasons.push("Company country is not configured.");
  if (!company.isActive) reasons.push("Company is inactive.");
  const reviewCore = {
    order: await companyOrderPublic(tx, order),
    company: publicCompany(company),
    snapshotTerms,
    currentTerms: context.terms,
    currentItems,
    currentTotals,
    credit: {
      limit: creditLimit,
      outstanding: amount(creditPosition.outstandingCents),
      availableBefore,
      availableAfter,
    },
    blockReasons: [...new Set(reasons)],
    hasMeaningfulChanges,
    _stockChecks: stockChecks,
  };
  return {
    ...reviewCore,
    reviewFingerprint: fingerprint({
      orderId: order.id,
      status: order.status,
      companyId: company.id,
      terms: reviewCore.currentTerms,
      currentItems: reviewCore.currentItems,
      currentTotals: reviewCore.currentTotals,
      credit: reviewCore.credit,
      blockReasons: reviewCore.blockReasons,
      hasMeaningfulChanges,
      stockChecks,
    }),
  };
}

export function approvalIssueDates(terms: PortalTerms) {
  const issueDate = saudiCalendarDate(new Date());
  if (terms.paymentTerm === "due_on_issue" || /cash|نقد/i.test(terms.contractType ?? "")) {
    return { issueDate, dueDate: issueDate };
  }
  if (terms.paymentTerm === "end_of_month") {
    const [year, month] = issueDate.split("-").map(Number);
    return { issueDate, dueDate: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
  }
  return { issueDate, dueDate: addCalendarDays(issueDate, terms.paymentDays ?? 30) };
}

export function canonicalJson(value: unknown) {
  return jsonCanonical(value);
}
