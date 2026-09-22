import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, or, sql, sum } from "drizzle-orm";
import ExcelJS from "exceljs";
import QRCode from "qrcode";
import * as Api from "@workspace/api-zod";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminIntegrationsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  categoriesTable,
  campaignCouponsTable,
  campaignsTable,
  couponsTable,
  customersTable,
  db,
  employeesTable,
  attendanceRecordsTable,
  leaveRequestsTable,
  payrollRecordsTable,
  expensesTable,
  purchasesTable,
  manufacturingBatchesTable,
  exhibitionsTable,
  exhibitionProductsTable,
  inventoryMovementsTable,
  invoiceItemsTable,
  invoicesTable,
  orderAddressesTable,
  orderItemsTable,
  ordersTable,
  pageViewsTable,
  productsTable,
  wholesaleDistributorsTable,
  accountingAccountsTable,
  journalEntriesTable,
  journalEntryLinesTable,
  distributorContractsTable,
  siteContentTable,
  ownerCredentialsTable,
  ownerUsersTable,
  openingBalanceImportsTable,
  openingBalanceLinesTable,
  operationEventsTable,
  purchaseReceiptsTable,
  shipmentEventsTable,
  shipmentsTable,
  receivablePaymentsTable,
  inventoryBalancesTable,
  inventoryCycleCountsTable, inventoryCycleCountLinesTable,
  inventoryLocationsTable,
  inventoryTransfersTable, inventoryPurchaseOrdersTable, inventoryPurchaseOrderLinesTable,
} from "@workspace/db";
import {
  adminFromToken,
  createAdminSession,
  ensureAdminSeeded,
  hashAdminPassword,
  publicAdmin,
  revokeAdminSession,
  verifyAdminPassword,
} from "../lib/admin-auth";
import { hashOwnerPassword } from "../lib/owner-auth";
import { createDistributorInvoice, createReceivablePayment, DistributorInvoiceConflictError, DistributorInvoiceValidationError, postFulfillmentCogs, ReceivablePaymentNotFoundError, updateOrderAndIssueInvoice } from "../lib/invoices";
import {
  AccountingConflictError,
  AccountingNotFoundError,
  AccountingValidationError,
  createExpenseWithJournal,
  createPurchaseWithJournal,
  createPayrollWithJournal,
  ensureStandardAccountingChart,
  postJournalEntry,
  reverseJournalEntry,
  trialBalance,
} from "../lib/accounting";
import { ObjectStorageService } from "../lib/object-storage";
import { assertTransition, contractByDownloadToken, contractBySigningToken, createContractPdf, hashContractToken, newContractToken } from "../lib/contracts";
import { approveOpeningBalanceImport, createOpeningBalanceImport, openingBalanceReconciliation, reviewOpeningBalanceImport, mapOpeningBalanceLine, createPurchaseReceipt, postPurchaseReceipt, createPurchaseReceiptPayment, addManufacturingInputs, approveManufacturingBatch, ensureDefaultInventoryLocation, listInventoryLocations, lookupInventoryBarcode, listInventoryBalances, transferInventory, sendInventoryTransfer, receiveInventoryTransfer, inventoryValueReport, inventoryCsv, createInventoryPurchaseOrder, receiveInventoryPurchaseOrder, createCycleCount, approveCycleCount, inventoryReorderSuggestions, inventoryMovementReport, inventoryAgingReport, inventoryValuationReport, inventoryAuditReport, inventoryReconciliationReport, adjustOperationalBalances } from "../lib/operations";
import { createSmsaShippingLabel } from "../lib/shipping-carriers";
import { assertShippingStatusTransition, canApplyCarrierShippingStatus, ShippingStatusTransitionError } from "../lib/shipping-status";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const integrationProviderIds = new Set([
  "zatca",
  "moyasar",
  "tabby",
  "smsa",
  "odoo",
  "storage-station",
]);
const bearer = (req: Request) => {
  const header = req.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
};
const route = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };

function inventoryReportQuery(query: Request["query"]) {
  const from = typeof query.from === "string" && query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined;
  const to = typeof query.to === "string" && query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined;
  return {
    productId: typeof query.productId === "string" && query.productId ? Number(query.productId) : undefined,
    sourceType: typeof query.sourceType === "string" && query.sourceType ? query.sourceType : undefined,
    from,
    to,
    page: typeof query.page === "string" ? Number(query.page) : undefined,
    pageSize: typeof query.pageSize === "string" ? Number(query.pageSize) : undefined,
  };
}

router.use("/admin", async (req, res, next) => {
 try {
  await ensureAdminSeeded();
  if (req.path === "/auth/login") { next(); return; }
  const user = await adminFromToken(bearer(req));
  if (!user) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  res.locals.admin = user;
  next();
 } catch (error) { next(error); }
});

function allowed(res: Response, module: string, action: string) {
  const user = res.locals.admin as typeof adminUsersTable.$inferSelect;
  return user.isSuperAdmin || (res.locals.permissions as string[] | undefined)?.includes(`${module}:${action}`);
}

export function permit(module: string, action: "view" | "edit" | "delete") {
  return async (_req: Request, res: Response, next: NextFunction) => {
   try {
    const user = res.locals.admin as typeof adminUsersTable.$inferSelect;
    res.locals.permissions = await (await publicAdmin(user)).permissions;
    if (!allowed(res, module, action)) {
      res.status(403).json({ error: "Insufficient permission" });
      return;
    }
    next();
   } catch (error) { next(error); }
  };
}

function superOnly(_req: Request, res: Response, next: NextFunction) {
  if (!(res.locals.admin as typeof adminUsersTable.$inferSelect).isSuperAdmin) {
    res.status(403).json({ error: "Super administrator access required" });
    return;
  }
  next();
}

function parse<T>(schema: { safeParse(value: unknown): { success: boolean; data?: T; error?: { message: string } } }, value: unknown, res: Response): T | null {
  const result = schema.safeParse(value);
  if (!result.success) {
    res.status(400).json({ error: result.error?.message ?? "Invalid request" });
    return null;
  }
  return result.data!;
}

const statusFilter = <T extends { isActive: boolean }>(rows: T[], status?: string) =>
  status === "active" ? rows.filter((r) => r.isActive) : status === "inactive" ? rows.filter((r) => !r.isActive) : rows;
const searchFilter = <T>(rows: T[], search: string | undefined, fields: Array<keyof T>) => {
  const needle = search?.trim().toLocaleLowerCase();
  return needle ? rows.filter((row) => fields.some((field) => String(row[field] ?? "").toLocaleLowerCase().includes(needle))) : rows;
};

const isoDate = (value: unknown) => value instanceof Date
  ? value.toISOString().slice(0, 10)
  : String(value).slice(0, 10);
const validDateRange = (start: unknown, end: unknown) => isoDate(end) >= isoDate(start);
const parsedJson = (schema: { parse(value: unknown): unknown }, value: unknown, res: Response, status = 200) => {
  schema.parse(value);
  res.status(status).json(value);
};

const shippingStatusLabels: Record<string, { labelAr: string; labelEn: string }> = {
  pending: { labelAr: "قيد الانتظار", labelEn: "Pending" },
  ready: { labelAr: "جاهزة للشحن", labelEn: "Ready" },
  in_transit: { labelAr: "في الطريق", labelEn: "In transit" },
  delivered: { labelAr: "تم التوصيل", labelEn: "Delivered" },
  returned: { labelAr: "مرتجعة", labelEn: "Returned" },
  cancelled: { labelAr: "ملغاة", labelEn: "Cancelled" },
};

async function canUseShipping(res: Response, channel: "online" | "b2b", action: "view" | "edit") {
  const user = res.locals.admin as typeof adminUsersTable.$inferSelect;
  res.locals.permissions = await (await publicAdmin(user)).permissions;
  return allowed(res, channel === "online" ? "orders" : "invoices", action);
}

async function shippingRows(channel: "online" | "b2b") {
  const rows = channel === "online"
    ? await db.select({
      shipment: shipmentsTable,
      referenceNumber: ordersTable.orderNumber,
      partyName: customersTable.name,
      partyPhone: customersTable.phone,
    }).from(shipmentsTable)
      .innerJoin(ordersTable, eq(shipmentsTable.orderId, ordersTable.id))
      .innerJoin(customersTable, eq(ordersTable.userId, customersTable.id))
      .where(eq(shipmentsTable.channel, "online"))
    : await db.select({
    shipment: shipmentsTable,
    referenceNumber: invoicesTable.invoiceNumber,
    partyName: wholesaleDistributorsTable.companyName,
    partyPhone: wholesaleDistributorsTable.phone,
  }).from(shipmentsTable)
    .innerJoin(invoicesTable, eq(shipmentsTable.invoiceId, invoicesTable.id))
    .innerJoin(wholesaleDistributorsTable, eq(invoicesTable.distributorId, wholesaleDistributorsTable.id))
    .where(eq(shipmentsTable.channel, "b2b"));
  const events = rows.length
    ? await db.select().from(shipmentEventsTable)
      .where(inArray(shipmentEventsTable.shipmentId, rows.map((row) => row.shipment.id)))
      .orderBy(desc(shipmentEventsTable.createdAt))
    : [];
  return rows.map((row) => ({
    ...row,
    events: events.filter((event) => event.shipmentId === row.shipment.id),
  }));
}

const publicShipment = (row: Awaited<ReturnType<typeof shippingRows>>[number]) => ({
  ...row.shipment,
  referenceNumber: row.referenceNumber,
  partyName: row.partyName,
  events: row.events.map(({ id, carrier, eventType, status, outcome, errorMessage, createdAt }) => ({
    id, carrier, eventType, status, outcome, errorMessage, createdAt,
  })),
});

const carrierStatusToShipmentStatus = {
  created: "ready",
  picked_up: "in_transit",
  in_transit: "in_transit",
  delivered: "delivered",
  returned: "returned",
  cancelled: "cancelled",
} as const;

function secretsMatch(received: string | undefined, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && timingSafeEqual(receivedBuffer, expectedBuffer);
}

router.get("/admin/operations/opening-balances", permit("inventory", "view"), route(async (req, res) => {
  const raw = req.query.importId;
  const importId = raw === undefined ? undefined : Number(raw);
  if (importId !== undefined && (!Number.isSafeInteger(importId) || importId < 1)) {
    res.status(400).json({ error: "Invalid importId" }); return;
  }
  res.json(await openingBalanceReconciliation(importId));
}));
router.post("/admin/operations/opening-balances", permit("inventory", "edit"), route(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (typeof body.importKey !== "string" || typeof body.sourceFileName !== "string" || typeof body.sourceSheet !== "string" || !lines.length) {
    res.status(400).json({ error: "Import key, source file/sheet, and lines are required" }); return;
  }
  try {
    const row = await createOpeningBalanceImport({
      importKey: body.importKey, sourceFileName: body.sourceFileName, sourceSheet: body.sourceSheet,
      createdBy: res.locals.admin.id,
      lines: lines.map((value) => {
        const line = value as Record<string, unknown>;
        if (!Number.isSafeInteger(Number(line.sourceRow)) || typeof line.sourceLabel !== "string" ||
          !Number.isSafeInteger(Number(line.openingQuantity)) || Number(line.openingQuantity) < 0 ||
          typeof line.fullBatchUnitCost !== "number" && typeof line.fullBatchUnitCost !== "string" ||
          !line.provenance || typeof line.provenance !== "object") throw new Error("Each opening line must preserve its source row, label, quantity, cost and provenance");
        return { sourceRow: Number(line.sourceRow), sourceLabel: line.sourceLabel,
          sourceQuantity: String(line.sourceQuantity ?? line.openingQuantity), openingQuantity: Number(line.openingQuantity),
          fullBatchUnitCost: line.fullBatchUnitCost as string | number, productId: line.productId == null ? null : Number(line.productId),
          mappingNote: line.mappingNote == null ? null : String(line.mappingNote), provenance: line.provenance as { file: string; sheet: string; row: number } };
      }),
    });
    res.status(201).json(row);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid opening balance import" }); }
}));
router.post("/admin/operations/opening-balances/:id/review", permit("inventory", "edit"), route(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid import id" }); return; }
  const row = await reviewOpeningBalanceImport(id);
  if (!row) { res.status(409).json({ error: "Only a draft import can be moved to review" }); return; }
  res.json(row);
}));
router.patch("/admin/operations/opening-balances/:id/lines/:lineId", permit("inventory", "edit"), route(async (req, res) => {
  const importId = Number(req.params.id);
  const lineId = Number(req.params.lineId);
  const productId = req.body?.productId == null ? null : Number(req.body.productId);
  const mappingNote = req.body?.mappingNote == null ? null : String(req.body.mappingNote);
  if (!Number.isSafeInteger(importId) || !Number.isSafeInteger(lineId) || importId < 1 || lineId < 1 ||
    (productId !== null && (!Number.isSafeInteger(productId) || productId < 1))) {
    res.status(400).json({ error: "Valid import, line and product ids are required" }); return;
  }
  if (productId !== null) {
    const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  }
  let line;
  try { line = await mapOpeningBalanceLine(importId, lineId, productId, mappingNote); }
  catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "Opening balance mapping failed" }); return; }
  if (!line) { res.status(404).json({ error: "Opening balance line not found" }); return; }
  res.json(line);
}));
router.post("/admin/operations/opening-balances/:id/approve", permit("finance", "edit"), route(async (req, res) => {
  const id = Number(req.params.id);
  const entryDate = typeof req.body?.entryDate === "string" ? req.body.entryDate : utcDateString(new Date());
  if (!Number.isSafeInteger(id) || id < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) { res.status(400).json({ error: "Valid import id and entryDate are required" }); return; }
  try {
    res.json(await approveOpeningBalanceImport(id, res.locals.admin.id, entryDate));
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "Opening balance approval failed" }); }
}));

router.post("/admin/auth/login", route(async (req, res) => {
  const body = parse(Api.AdminLoginBody, req.body, res);
  if (!body) return;
  const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.email, body.email.trim().toLowerCase())).limit(1);
  if (!user || !user.isActive || !(await verifyAdminPassword(body.password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const now = new Date();
  await db.update(adminUsersTable).set({ lastLoginAt: now }).where(eq(adminUsersTable.id, user.id));
  const token = await createAdminSession(user.id);
  res.json(Api.AdminLoginResponse.parse({ token, user: await publicAdmin({ ...user, lastLoginAt: now }) }));
}));

router.post("/admin/auth/logout", route(async (req, res) => {
  await revokeAdminSession(bearer(req)!);
  res.sendStatus(204);
}));
router.get("/admin/auth/me", route(async (_req, res) => {
  res.json(Api.GetAdminMeResponse.parse(await publicAdmin(res.locals.admin)));
}));

router.get("/admin/settings/owner-credentials", superOnly, route(async (_req, res) => {
  const [configured] = await db.select({
    email: ownerCredentialsTable.email,
    updatedAt: ownerCredentialsTable.updatedAt,
  }).from(ownerCredentialsTable).limit(1);
  res.json({ configured: Boolean(configured), email: configured?.email ?? null, updatedAt: configured?.updatedAt ?? null });
}));

router.put("/admin/settings/owner-credentials", superOnly, route(async (req, res) => {
  const input = req.body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : undefined;
  const passwordConfirmation = typeof input.passwordConfirmation === "string" ? input.passwordConfirmation : undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (password !== undefined && password.length < 8) || (passwordConfirmation !== undefined && passwordConfirmation.length < 8)) {
    res.status(400).json({ error: "A valid email and password of at least 8 characters are required" });
    return;
  }
  if (password && password !== passwordConfirmation) {
    res.status(400).json({ error: "Password confirmation does not match" });
    return;
  }
  const [current] = await db.select().from(ownerCredentialsTable).limit(1);
  if (!current && !password) {
    res.status(400).json({ error: "A password is required when configuring owner credentials" });
    return;
  }
  const passwordHash = password ? await hashOwnerPassword(password) : current!.passwordHash;
  const admin = res.locals.admin as typeof adminUsersTable.$inferSelect;
  await db.insert(ownerCredentialsTable).values({
    id: 1, email, passwordHash, updatedBy: admin.id,
  }).onConflictDoUpdate({
    target: ownerCredentialsTable.id,
    set: { email, passwordHash, updatedBy: admin.id, updatedAt: new Date() },
  });
  const [owner] = await db.select({ id: ownerUsersTable.id }).from(ownerUsersTable).limit(1);
  if (owner) {
    await db.update(ownerUsersTable).set({ email, passwordHash }).where(eq(ownerUsersTable.id, owner.id));
  } else {
    await db.insert(ownerUsersTable).values({ email, name: "Owner", passwordHash, isActive: true });
  }
  res.json({ configured: true, email, updatedAt: new Date() });
}));

router.get("/admin/dashboard", permit("dashboard", "view"), route(async (_req, res) => {
  if (res.headersSent) return;
  const [[revenue], [orders], [customers], [products], [lowStock], [pending], [coupons], [distributors]] = await Promise.all([
    db.select({ value: sum(ordersTable.total) }).from(ordersTable).where(and(eq(ordersTable.paymentStatus, "paid"), sql`${ordersTable.status} <> 'cancelled'`)),
    db.select({ value: count() }).from(ordersTable),
    db.select({ value: count() }).from(customersTable),
    db.select({ value: count() }).from(productsTable).where(eq(productsTable.isActive, true)),
    db.select({ value: count() }).from(productsTable).where(and(eq(productsTable.isActive, true), sql`${productsTable.stockQuantity} <= 10`)),
    db.select({ value: count() }).from(ordersTable).where(eq(ordersTable.status, "new")),
    db.select({ value: count() }).from(couponsTable).where(eq(couponsTable.isActive, true)),
    db.select({ value: count() }).from(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.isActive, true)),
  ]);
  res.json(Api.GetAdminDashboardResponse.parse({
    revenue: Number(revenue.value ?? 0), orders: orders.value, customers: customers.value, products: products.value,
    lowStock: lowStock.value, pendingOrders: pending.value, activeCoupons: coupons.value, distributors: distributors.value,
  }));
}));

const contractPublic = (row: typeof distributorContractsTable.$inferSelect) => row;
const contractNumber = () => `DC-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
const safeSignaturePath = (value: string) => value.startsWith("/objects/") && !value.includes("..");

router.get("/admin/contracts", permit("contracts", "view"), route(async (req, res) => {
  const query = parse(Api.AdminListContractsQueryParams, req.query, res); if (!query) return;
  let rows = await db.select().from(distributorContractsTable).orderBy(desc(distributorContractsTable.createdAt));
  if (query.search) {
    const needle = query.search.toLowerCase();
    rows = rows.filter((row) => row.contractNumber.toLowerCase().includes(needle) || row.buyerCompanyName.toLowerCase().includes(needle));
  }
  res.json(Api.AdminListContractsResponse.parse(rows.map(contractPublic)));
}));
router.post("/admin/contracts", permit("contracts", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateContractBody, req.body, res); if (!body) return;
  if (body.distributorId != null) {
    const [distributor] = await db.select({ id: wholesaleDistributorsTable.id }).from(wholesaleDistributorsTable)
      .where(eq(wholesaleDistributorsTable.id, body.distributorId)).limit(1);
    if (!distributor) { res.status(400).json({ error: "Distributor not found" }); return; }
  }
  const [row] = await db.insert(distributorContractsTable).values({
    ...body,
    contractNumber: body.contractNumber?.trim() || contractNumber(),
    createdBy: res.locals.admin.id,
    products: body.products ?? [],
  }).returning();
  res.status(201).json(Api.AdminCreateContractResponse.parse(contractPublic(row)));
}));
router.get("/admin/contracts/:id", permit("contracts", "view"), route(async (req, res) => {
  const params = parse(Api.AdminGetContractParams, req.params, res); if (!params) return;
  const [row] = await db.select().from(distributorContractsTable).where(eq(distributorContractsTable.id, params.id)).limit(1);
  if (!row) { res.status(404).json({ error: "Contract not found" }); return; }
  res.json(Api.AdminGetContractResponse.parse(contractPublic(row)));
}));
router.post("/admin/contracts/signatures/upload-url", permit("contracts", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminRequestContractSignatureUploadBody, req.body, res); if (!body) return;
  const upload = await objectStorage.createPrivateUpload("uploads/contracts/signatures");
  res.json(Api.AdminRequestContractSignatureUploadResponse.parse(upload));
}));
router.patch("/admin/contracts/:id", permit("contracts", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateContractParams, req.params, res);
  const body = parse(Api.AdminUpdateContractBody.partial(), req.body, res); if (!params || !body) return;
  const [existing] = await db.select().from(distributorContractsTable).where(eq(distributorContractsTable.id, params.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Contract not found" }); return; }
  if (existing.status !== "draft") { res.status(409).json({ error: "Only draft contracts can be edited" }); return; }
  const { contractNumber: requestedContractNumber, ...contractUpdate } = body;
  const [row] = await db.update(distributorContractsTable).set({
    ...contractUpdate,
    ...(requestedContractNumber ? { contractNumber: requestedContractNumber } : {}),
  }).where(eq(distributorContractsTable.id, params.id)).returning();
  res.json(Api.AdminUpdateContractResponse.parse(contractPublic(row)));
}));
router.delete("/admin/contracts/:id", permit("contracts", "delete"), route(async (req, res) => {
  const params = parse(Api.AdminDeleteContractParams, req.params, res); if (!params) return;
  const [existing] = await db.select({ id: distributorContractsTable.id, status: distributorContractsTable.status })
    .from(distributorContractsTable).where(eq(distributorContractsTable.id, params.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Contract not found" }); return; }
  if (existing.status !== "draft" && existing.status !== "cancelled") { res.status(409).json({ error: "Only draft or cancelled contracts can be deleted" }); return; }
  await db.delete(distributorContractsTable).where(eq(distributorContractsTable.id, params.id));
  res.sendStatus(204);
}));
router.post("/admin/contracts/:id/seller-sign", permit("contracts", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminSignContractParams, req.params, res);
  const body = parse(Api.AdminSignContractBody, req.body, res); if (!params || !body) return;
  if (!safeSignaturePath(body.signaturePath)) { res.status(400).json({ error: "Signature must be a private object path" }); return; }
  const [existing] = await db.select().from(distributorContractsTable).where(eq(distributorContractsTable.id, params.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Contract not found" }); return; }
  try { assertTransition(existing.status, "seller_signed"); } catch (error) { res.status(409).json({ error: (error as Error).message }); return; }
  const [row] = await db.update(distributorContractsTable).set({
    status: "seller_signed", sellerSignaturePath: body.signaturePath, sellerSignedAt: new Date(),
    sellerSignedByUserId: res.locals.admin.id, sellerSignedBy: res.locals.admin.name, sellerSignedIp: req.ip,
  }).where(eq(distributorContractsTable.id, params.id)).returning();
  res.json(Api.AdminSignContractResponse.parse(contractPublic(row)));
}));
router.post("/admin/contracts/:id/send", permit("contracts", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminSendContractParams, req.params, res); if (!params) return;
  const [existing] = await db.select().from(distributorContractsTable).where(eq(distributorContractsTable.id, params.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Contract not found" }); return; }
  try { assertTransition(existing.status, "sent"); } catch (error) { res.status(409).json({ error: (error as Error).message }); return; }
  const signingToken = newContractToken();
  const [row] = await db.update(distributorContractsTable).set({
    status: "sent", signingTokenHash: hashContractToken(signingToken),
    signingTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), sentForSignatureAt: new Date(),
  }).where(eq(distributorContractsTable.id, params.id)).returning();
  const base = process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`;
  res.json(Api.AdminSendContractResponse.parse({ contract: contractPublic(row), signingToken, signingUrl: `${base}/contracts/sign/${signingToken}` }));
}));
router.post("/admin/contracts/:id/cancel", permit("contracts", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminCancelContractParams, req.params, res); if (!params) return;
  const [existing] = await db.select().from(distributorContractsTable).where(eq(distributorContractsTable.id, params.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Contract not found" }); return; }
  try { assertTransition(existing.status, "cancelled"); } catch (error) { res.status(409).json({ error: (error as Error).message }); return; }
  const [row] = await db.update(distributorContractsTable).set({ status: "cancelled", signingTokenHash: null, downloadTokenHash: null }).where(eq(distributorContractsTable.id, params.id)).returning();
  res.json(Api.AdminCancelContractResponse.parse(contractPublic(row)));
}));
router.get("/admin/contracts/:id/pdf", permit("contracts", "view"), route(async (req, res) => {
  const params = parse(Api.AdminGetContractPdfParams, req.params, res); if (!params) return;
  const [row] = await db.select().from(distributorContractsTable).where(eq(distributorContractsTable.id, params.id)).limit(1);
  if (!row) { res.status(404).json({ error: "Contract not found" }); return; }
  const url = `${process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`}/api/public/contracts/by-token/${row.signingTokenHash ?? row.id}`;
  const pdf = await createContractPdf(row, url);
  res.type("application/pdf").setHeader("Content-Disposition", `inline; filename="${row.contractNumber}.pdf"`).send(pdf);
}));

router.get("/admin/site-content", permit("site-content", "view"), route(async (_req, res) => {
  const rows = await db.select().from(siteContentTable).orderBy(siteContentTable.key);
  res.json(Api.AdminListSiteContentResponse.parse(rows));
}));
router.put("/admin/site-content", permit("site-content", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminUpsertSiteContentBody, req.body, res); if (!body) return;
  for (const item of body.items) {
    await db.insert(siteContentTable).values({ key: item.key, data: item.data, updatedBy: String(res.locals.admin.id) })
      .onConflictDoUpdate({ target: siteContentTable.key, set: { data: item.data, updatedBy: String(res.locals.admin.id), updatedAt: new Date() } });
  }
  const rows = await db.select().from(siteContentTable).orderBy(siteContentTable.key);
  res.json(Api.AdminUpsertSiteContentResponse.parse(rows));
}));

router.get("/admin/distributor-catalog", permit("distributors", "view"), route(async (_req, res) => {
  const rows = await db.select({
    id: productsTable.id, nameAr: productsTable.nameAr, nameEn: productsTable.nameEn,
    showOnDistributors: productsTable.showOnDistributors, distributorNameOverride: productsTable.distributorNameOverride,
    distributorImageOverride: productsTable.distributorImageOverride,
  }).from(productsTable).orderBy(productsTable.id);
  res.json(Api.AdminListDistributorCatalogResponse.parse(rows));
}));
router.patch("/admin/distributor-catalog", permit("distributors", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminUpdateDistributorCatalogBody, req.body, res); if (!body) return;
  const [row] = await db.update(productsTable).set({
    showOnDistributors: body.showOnDistributors,
    distributorNameOverride: body.distributorNameOverride,
    distributorImageOverride: body.distributorImageOverride,
  }).where(eq(productsTable.id, body.productId)).returning({
    id: productsTable.id, nameAr: productsTable.nameAr, nameEn: productsTable.nameEn,
    showOnDistributors: productsTable.showOnDistributors, distributorNameOverride: productsTable.distributorNameOverride,
    distributorImageOverride: productsTable.distributorImageOverride,
  });
  if (!row) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(Api.AdminUpdateDistributorCatalogResponse.parse(row));
}));

router.get("/admin/analytics/dashboard", permit("dashboard", "view"), route(async (req, res) => {
  const rawRangeDays = Array.isArray(req.query.rangeDays)
    ? req.query.rangeDays[0]
    : req.query.rangeDays;
  const query = parse(Api.GetAdminAnalyticsDashboardQueryParams, {
    ...req.query,
    rangeDays: rawRangeDays === undefined ? undefined : Number(rawRangeDays),
  }, res);
  if (!query) return;

  const rangeDays = query.rangeDays ?? 30;
  const endExclusive = new Date();
  const start = new Date(endExclusive);
  start.setUTCDate(start.getUTCDate() - (rangeDays - 1));
  start.setUTCHours(0, 0, 0, 0);

  const pageViewDay = sql<string>`to_char(date_trunc('day', ${pageViewsTable.createdAt} AT TIME ZONE 'Asia/Riyadh'), 'YYYY-MM-DD')`;
  const orderDay = sql<string>`to_char(date_trunc('day', ${ordersTable.createdAt} AT TIME ZONE 'Asia/Riyadh'), 'YYYY-MM-DD')`;

  const [pageViewRows, orderRows, topProductRows, sourceRows] = await Promise.all([
    db.select({
      date: pageViewDay,
      pageViews: count(),
      visits: sql<number>`count(distinct ${pageViewsTable.sessionKey})`,
    })
      .from(pageViewsTable)
      .where(and(gte(pageViewsTable.createdAt, start), lt(pageViewsTable.createdAt, endExclusive)))
      .groupBy(pageViewDay)
      .orderBy(pageViewDay),
    db.select({
      date: orderDay,
      orders: count(),
      revenue: sum(ordersTable.total),
    })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.paymentStatus, "paid"), sql`${ordersTable.status} <> 'cancelled'`,
        gte(ordersTable.createdAt, start),
        lt(ordersTable.createdAt, endExclusive),
      ))
      .groupBy(orderDay)
      .orderBy(orderDay),
    db.select({
      name: orderItemsTable.productName,
      quantity: sum(orderItemsTable.quantity),
      revenue: sum(orderItemsTable.totalPrice),
    })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(and(
        eq(ordersTable.paymentStatus, "paid"), sql`${ordersTable.status} <> 'cancelled'`,
        gte(ordersTable.createdAt, start),
        lt(ordersTable.createdAt, endExclusive),
      ))
      .groupBy(orderItemsTable.productName)
      .orderBy(desc(sum(orderItemsTable.totalPrice)))
      .limit(5),
    db.select({
      source: pageViewsTable.source,
      visits: sql<number>`count(distinct ${pageViewsTable.sessionKey})`,
    })
      .from(pageViewsTable)
      .where(and(gte(pageViewsTable.createdAt, start), lt(pageViewsTable.createdAt, endExclusive)))
      .groupBy(pageViewsTable.source)
      .orderBy(desc(sql`count(distinct ${pageViewsTable.sessionKey})`)),
  ]);

  const pagesByDate = new Map(pageViewRows.map((row) => [row.date, row]));
  const ordersByDate = new Map(orderRows.map((row) => [row.date, row]));
  const series = Array.from({ length: rangeDays }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const pages = pagesByDate.get(key);
    const sales = ordersByDate.get(key);
    return {
      date: key,
      pageViews: Number(pages?.pageViews ?? 0),
      visits: Number(pages?.visits ?? 0),
      orders: Number(sales?.orders ?? 0),
      revenue: Number(sales?.revenue ?? 0),
    };
  });

  const pageViews = series.reduce((total, row) => total + row.pageViews, 0);
  const visits = series.reduce((total, row) => total + row.visits, 0);
  const orders = series.reduce((total, row) => total + row.orders, 0);
  const revenue = series.reduce((total, row) => total + row.revenue, 0);

  res.json(Api.GetAdminAnalyticsDashboardResponse.parse({
    rangeDays,
    period: {
      from: start.toISOString().slice(0, 10),
      to: endExclusive.toISOString().slice(0, 10),
    },
    summary: {
      visits,
      pageViews,
      orders,
      revenue,
      conversionRate: visits > 0 ? (orders / visits) * 100 : 0,
      averageOrderValue: orders > 0 ? revenue / orders : 0,
    },
    series,
    topProducts: topProductRows.map((row) => ({
      name: row.name,
      quantity: Number(row.quantity ?? 0),
      revenue: Number(row.revenue ?? 0),
    })),
    trafficSources: sourceRows.map((row) => ({
      source: row.source,
      visits: Number(row.visits ?? 0),
    })),
  }));
}));

router.get("/admin/analytics/revenue", permit("revenue", "view"), route(async (req, res) => {
  const rawRangeDays = Array.isArray(req.query.rangeDays) ? req.query.rangeDays[0] : req.query.rangeDays;
  const query = parse(Api.GetAdminRevenueAnalyticsQueryParams, {
    ...req.query,
    rangeDays: rawRangeDays === undefined ? undefined : Number(rawRangeDays),
  }, res);
  if (!query) return;

  const rangeDays = query.rangeDays ?? 30;
  const riyadhDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const shiftDate = (date: string, days: number) => {
    const shifted = new Date(`${date}T00:00:00Z`);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted.toISOString().slice(0, 10);
  };
  const currentFrom = shiftDate(riyadhDate, -(rangeDays - 1));
  const currentTo = shiftDate(riyadhDate, 1);
  const previousFrom = shiftDate(currentFrom, -rangeDays);
  const previousTo = currentFrom;
  const rangeStart = new Date(`${previousFrom}T00:00:00+03:00`);
  const rangeEnd = new Date(`${currentTo}T00:00:00+03:00`);
  const onlineDay = sql<string>`to_char(date_trunc('day', ${ordersTable.createdAt} AT TIME ZONE 'Asia/Riyadh'), 'YYYY-MM-DD')`;
  const companyDay = sql<string>`to_char(date_trunc('day', ${invoicesTable.issueDatetime} AT TIME ZONE 'Asia/Riyadh'), 'YYYY-MM-DD')`;

  const [onlineRows, companyRows] = await Promise.all([
    db.select({
      date: onlineDay,
      revenue: sum(ordersTable.total),
      transactions: count(),
    })
      .from(ordersTable)
      .leftJoin(invoicesTable, eq(invoicesTable.orderId, ordersTable.id))
      .where(and(
        eq(ordersTable.paymentStatus, "paid"),
        sql`${ordersTable.status} <> 'cancelled'`,
        isNull(invoicesTable.distributorId),
        gte(ordersTable.createdAt, rangeStart),
        lt(ordersTable.createdAt, rangeEnd),
      ))
      .groupBy(onlineDay)
      .orderBy(onlineDay),
    db.select({
      date: companyDay,
      companyId: wholesaleDistributorsTable.id,
      companyName: wholesaleDistributorsTable.companyName,
      revenue: sum(invoicesTable.totalAmount),
      transactions: count(),
    })
      .from(invoicesTable)
      .innerJoin(wholesaleDistributorsTable, eq(invoicesTable.distributorId, wholesaleDistributorsTable.id))
      .where(and(
        isNotNull(invoicesTable.distributorId),
        gte(invoicesTable.issueDatetime, rangeStart),
        lt(invoicesTable.issueDatetime, rangeEnd),
      ))
      .groupBy(companyDay, wholesaleDistributorsTable.id, wholesaleDistributorsTable.companyName)
      .orderBy(companyDay),
  ]);

  const onlineByDate = new Map(onlineRows.map((row) => [row.date, {
    revenue: Number(row.revenue ?? 0),
    transactions: Number(row.transactions ?? 0),
  }]));
  const companyByDate = new Map<string, { revenue: number; transactions: number }>();
  for (const row of companyRows) {
    const current = companyByDate.get(row.date) ?? { revenue: 0, transactions: 0 };
    current.revenue += Number(row.revenue ?? 0);
    current.transactions += Number(row.transactions ?? 0);
    companyByDate.set(row.date, current);
  }

  const summarize = (from: string, to: string) => {
    let onlineRevenue = 0;
    let companyRevenue = 0;
    let onlineOrders = 0;
    let companyInvoices = 0;
    const companyIds = new Set<number>();
    for (const row of onlineRows) {
      if (row.date >= from && row.date < to) {
        onlineRevenue += Number(row.revenue ?? 0);
        onlineOrders += Number(row.transactions ?? 0);
      }
    }
    for (const row of companyRows) {
      if (row.date >= from && row.date < to) {
        companyRevenue += Number(row.revenue ?? 0);
        companyInvoices += Number(row.transactions ?? 0);
        companyIds.add(row.companyId);
      }
    }
    return {
      onlineRevenue,
      companyRevenue,
      totalRevenue: onlineRevenue + companyRevenue,
      onlineOrders,
      companyInvoices,
      activeCompanies: companyIds.size,
      changePct: 0,
    };
  };
  const summary = summarize(currentFrom, currentTo);
  const previousSummary = summarize(previousFrom, previousTo);
  const percentChange = (current: number, previous: number) =>
    previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / previous) * 100;
  summary.changePct = percentChange(summary.totalRevenue, previousSummary.totalRevenue);
  previousSummary.changePct = 0;

  const trend = Array.from({ length: rangeDays }, (_, index) => {
    const date = shiftDate(currentFrom, index);
    const onlineRevenue = onlineByDate.get(date)?.revenue ?? 0;
    const companyRevenue = companyByDate.get(date)?.revenue ?? 0;
    return { date, onlineRevenue, companyRevenue, totalRevenue: onlineRevenue + companyRevenue };
  });

  const companyTotals = new Map<number, {
    companyName: string;
    revenue: number;
    previousRevenue: number;
    invoices: number;
  }>();
  for (const row of companyRows) {
    const metric = companyTotals.get(row.companyId) ?? {
      companyName: row.companyName,
      revenue: 0,
      previousRevenue: 0,
      invoices: 0,
    };
    if (row.date >= currentFrom && row.date < currentTo) {
      metric.revenue += Number(row.revenue ?? 0);
      metric.invoices += Number(row.transactions ?? 0);
    } else if (row.date >= previousFrom && row.date < previousTo) {
      metric.previousRevenue += Number(row.revenue ?? 0);
    }
    companyTotals.set(row.companyId, metric);
  }
  const byCompany = Array.from(companyTotals.entries())
    .filter(([, metric]) => metric.revenue > 0 || metric.previousRevenue > 0)
    .map(([companyId, metric]) => ({
      companyId,
      companyName: metric.companyName,
      revenue: metric.revenue,
      previousRevenue: metric.previousRevenue,
      invoices: metric.invoices,
      sharePct: summary.companyRevenue > 0 ? (metric.revenue / summary.companyRevenue) * 100 : 0,
      changePct: percentChange(metric.revenue, metric.previousRevenue),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const [onlineProductRows, companyProductRows] = await Promise.all([
    db.select({
      productId: productsTable.id,
      nameAr: productsTable.nameAr,
      nameEn: productsTable.nameEn,
      sku: productsTable.sku,
      quantity: sum(orderItemsTable.quantity),
      transactions: sql<number>`count(distinct ${orderItemsTable.orderId})`,
    })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
      .leftJoin(invoicesTable, eq(invoicesTable.orderId, ordersTable.id))
      .where(and(
        eq(ordersTable.paymentStatus, "paid"),
        sql`${ordersTable.status} <> 'cancelled'`,
        isNull(invoicesTable.distributorId),
        gte(ordersTable.createdAt, new Date(`${currentFrom}T00:00:00+03:00`)),
        lt(ordersTable.createdAt, new Date(`${currentTo}T00:00:00+03:00`)),
      ))
      .groupBy(productsTable.id, productsTable.nameAr, productsTable.nameEn, productsTable.sku)
      .orderBy(desc(sum(orderItemsTable.quantity))),
    db.select({
      productId: productsTable.id,
      nameAr: productsTable.nameAr,
      nameEn: productsTable.nameEn,
      sku: productsTable.sku,
      quantity: sum(invoiceItemsTable.quantity),
      transactions: sql<number>`count(distinct ${invoiceItemsTable.invoiceId})`,
    })
      .from(invoiceItemsTable)
      .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
      .innerJoin(productsTable, eq(invoiceItemsTable.productId, productsTable.id))
      .where(and(
        isNotNull(invoicesTable.distributorId),
        gte(invoicesTable.issueDatetime, new Date(`${currentFrom}T00:00:00+03:00`)),
        lt(invoicesTable.issueDatetime, new Date(`${currentTo}T00:00:00+03:00`)),
      ))
      .groupBy(productsTable.id, productsTable.nameAr, productsTable.nameEn, productsTable.sku)
      .orderBy(desc(sum(invoiceItemsTable.quantity))),
  ]);
  const productMetric = (row: typeof onlineProductRows[number]) => ({
    productId: row.productId,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    sku: row.sku,
    quantity: Number(row.quantity ?? 0),
    transactions: Number(row.transactions ?? 0),
  });

  const shipmentRows = await db.select({
    id: shipmentsTable.id,
    channel: shipmentsTable.channel,
    orderId: shipmentsTable.orderId,
    invoiceId: shipmentsTable.invoiceId,
    status: shipmentsTable.status,
    shippedAt: shipmentsTable.shippedAt,
    shippingScope: shipmentsTable.shippingScope,
    actualCost: shipmentsTable.actualCost,
    collectedCost: shipmentsTable.collectedCost,
  })
    .from(shipmentsTable)
    .where(and(
      inArray(shipmentsTable.channel, ["online", "b2b"]),
      gte(shipmentsTable.createdAt, new Date(`${currentFrom}T00:00:00+03:00`)),
      lt(shipmentsTable.createdAt, new Date(`${currentTo}T00:00:00+03:00`)),
    ));
  const onlineOrderIds = Array.from(new Set(shipmentRows
    .filter((shipment) => shipment.channel === "online" && shipment.orderId != null)
    .map((shipment) => shipment.orderId as number)));
  const companyInvoiceIds = Array.from(new Set(shipmentRows
    .filter((shipment) => shipment.channel === "b2b" && shipment.invoiceId != null)
    .map((shipment) => shipment.invoiceId as number)));

  const [onlineAmounts, onlineQuantities, companyAmounts, companyQuantities, companyPayments] = await Promise.all([
    onlineOrderIds.length > 0
      ? db.select({
        id: ordersTable.id,
        total: ordersTable.total,
        paymentStatus: ordersTable.paymentStatus,
      }).from(ordersTable).where(inArray(ordersTable.id, onlineOrderIds))
      : Promise.resolve([]),
    onlineOrderIds.length > 0
      ? db.select({
        sourceId: orderItemsTable.orderId,
        quantity: sum(orderItemsTable.quantity),
      }).from(orderItemsTable)
        .where(inArray(orderItemsTable.orderId, onlineOrderIds))
        .groupBy(orderItemsTable.orderId)
      : Promise.resolve([]),
    companyInvoiceIds.length > 0
      ? db.select({
        id: invoicesTable.id,
        total: invoicesTable.totalAmount,
      }).from(invoicesTable).where(inArray(invoicesTable.id, companyInvoiceIds))
      : Promise.resolve([]),
    companyInvoiceIds.length > 0
      ? db.select({
        sourceId: invoiceItemsTable.invoiceId,
        quantity: sum(invoiceItemsTable.quantity),
      }).from(invoiceItemsTable)
        .where(inArray(invoiceItemsTable.invoiceId, companyInvoiceIds))
        .groupBy(invoiceItemsTable.invoiceId)
      : Promise.resolve([]),
    companyInvoiceIds.length > 0
      ? db.select({
        sourceId: receivablePaymentsTable.invoiceId,
        paid: sum(receivablePaymentsTable.amount),
      }).from(receivablePaymentsTable)
        .where(inArray(receivablePaymentsTable.invoiceId, companyInvoiceIds))
        .groupBy(receivablePaymentsTable.invoiceId)
      : Promise.resolve([]),
  ]);
  const onlineAmountMap = new Map(onlineAmounts.map((row) => [row.id, row]));
  const onlineQuantityMap = new Map(onlineQuantities.map((row) => [row.sourceId, Number(row.quantity ?? 0)]));
  const companyAmountMap = new Map(companyAmounts.map((row) => [row.id, Number(row.total)]));
  const companyQuantityMap = new Map(companyQuantities.map((row) => [row.sourceId, Number(row.quantity ?? 0)]));
  const companyPaymentMap = new Map(companyPayments.map((row) => [row.sourceId, Number(row.paid ?? 0)]));

  type ShippingMetric = {
    shipmentCount: number;
    shippedCount: number;
    quantity: number;
    amountRequired: number;
    amountPaid: number;
    outstandingAmount: number;
    actualCost: number;
    collectedCost: number;
    netCost: number;
  };
  const emptyShippingMetric = (): ShippingMetric => ({
    shipmentCount: 0,
    shippedCount: 0,
    quantity: 0,
    amountRequired: 0,
    amountPaid: 0,
    outstandingAmount: 0,
    actualCost: 0,
    collectedCost: 0,
    netCost: 0,
  });
  const shippingOnline = emptyShippingMetric();
  const shippingCompanies = emptyShippingMetric();
  const shippingDomestic = emptyShippingMetric();
  const shippingInternational = emptyShippingMetric();
  const shippedStatuses = new Set(["in_transit", "delivered"]);
  for (const shipment of shipmentRows) {
    const target = shipment.channel === "online" ? shippingOnline : shippingCompanies;
    const scopeTarget = shipment.shippingScope === "international" ? shippingInternational : shippingDomestic;
    for (const metric of [target, scopeTarget]) {
      metric.shipmentCount += 1;
      if (shipment.shippedAt != null || shippedStatuses.has(shipment.status)) metric.shippedCount += 1;
      metric.actualCost += Number(shipment.actualCost ?? 0);
      metric.collectedCost += Number(shipment.collectedCost ?? 0);
      metric.netCost += Number(shipment.actualCost ?? 0) - Number(shipment.collectedCost ?? 0);
    }
    if (shipment.channel === "online" && shipment.orderId != null) {
      const order = onlineAmountMap.get(shipment.orderId);
      const required = Number(order?.total ?? 0);
      const paid = order?.paymentStatus === "paid" ? required : 0;
      target.quantity += onlineQuantityMap.get(shipment.orderId) ?? 0;
      scopeTarget.quantity += onlineQuantityMap.get(shipment.orderId) ?? 0;
      target.amountRequired += required;
      target.amountPaid += paid;
      target.outstandingAmount += Math.max(0, required - paid);
      scopeTarget.amountRequired += required;
      scopeTarget.amountPaid += paid;
      scopeTarget.outstandingAmount += Math.max(0, required - paid);
    } else if (shipment.channel === "b2b" && shipment.invoiceId != null) {
      const required = companyAmountMap.get(shipment.invoiceId) ?? 0;
      const paid = Math.min(required, companyPaymentMap.get(shipment.invoiceId) ?? 0);
      target.quantity += companyQuantityMap.get(shipment.invoiceId) ?? 0;
      scopeTarget.quantity += companyQuantityMap.get(shipment.invoiceId) ?? 0;
      target.amountRequired += required;
      target.amountPaid += paid;
      target.outstandingAmount += Math.max(0, required - paid);
      scopeTarget.amountRequired += required;
      scopeTarget.amountPaid += paid;
      scopeTarget.outstandingAmount += Math.max(0, required - paid);
    }
  }
  const shippingTotal = (Object.keys(shippingOnline) as Array<keyof ShippingMetric>).reduce((metric, key) => {
    metric[key] = shippingOnline[key] + shippingCompanies[key];
    return metric;
  }, emptyShippingMetric());

  res.json(Api.GetAdminRevenueAnalyticsResponse.parse({
    rangeDays,
    currency: "SAR",
    period: { from: currentFrom, to: shiftDate(currentTo, -1) },
    previousPeriod: { from: previousFrom, to: shiftDate(previousTo, -1) },
    summary,
    previousSummary,
    trend,
    byCompany,
    productMovements: {
      online: onlineProductRows.map(productMetric),
      companies: companyProductRows.map(productMetric),
    },
    shipping: {
      total: shippingTotal,
      online: shippingOnline,
      companies: shippingCompanies,
      domestic: shippingDomestic,
      international: shippingInternational,
    },
  }));
}));

router.get("/admin/integrations", permit("integrations", "view"), route(async (_req, res) => {
  const rows = await db.select().from(adminIntegrationsTable).orderBy(adminIntegrationsTable.providerId);
  res.json(Api.AdminListIntegrationsResponse.parse(rows));
}));
router.put("/admin/integrations/:providerId", permit("integrations", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminConfigureIntegrationParams, req.params, res);
  const body = parse(Api.AdminConfigureIntegrationBody, req.body, res);
  if (!params || !body) return;
  if (!integrationProviderIds.has(params.providerId)) {
    res.status(400).json({ error: "Unsupported integration provider" });
    return;
  }

  const accountLabel = body.accountLabel?.trim() || null;
  const apiBaseUrl = body.apiBaseUrl?.trim() || null;
  if (apiBaseUrl) {
    try {
      const url = new URL(apiBaseUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported URL scheme");
    } catch {
      res.status(400).json({ error: "API base URL must be a valid HTTP or HTTPS URL" });
      return;
    }
  }

  const [row] = await db.insert(adminIntegrationsTable).values({
    providerId: params.providerId,
    status: "configured",
    accountLabel,
    apiBaseUrl,
    configuredBy: (res.locals.admin as typeof adminUsersTable.$inferSelect).id,
  }).onConflictDoUpdate({
    target: adminIntegrationsTable.providerId,
    set: {
      status: "configured",
      accountLabel,
      apiBaseUrl,
      configuredBy: (res.locals.admin as typeof adminUsersTable.$inferSelect).id,
      updatedAt: new Date(),
    },
  }).returning();
  res.json(Api.AdminConfigureIntegrationResponse.parse(row));
}));
router.delete("/admin/integrations/:providerId", permit("integrations", "delete"), route(async (req, res) => {
  const params = parse(Api.AdminDisconnectIntegrationParams, req.params, res);
  if (!params) return;
  if (!integrationProviderIds.has(params.providerId)) {
    res.status(400).json({ error: "Unsupported integration provider" });
    return;
  }
  await db.delete(adminIntegrationsTable).where(eq(adminIntegrationsTable.providerId, params.providerId));
  res.sendStatus(204);
}));

router.get("/admin/products", permit("products", "view"), route(async (req, res) => {
  if (res.headersSent) return;
  const query = parse(Api.AdminListProductsQueryParams, req.query, res); if (!query) return;
  let rows = await db.select().from(productsTable).orderBy(productsTable.id);
  rows = statusFilter(searchFilter(rows, query.search, ["nameAr", "nameEn", "slug", "sku"]), query.status);
  res.json(Api.AdminListProductsResponse.parse(rows));
}));
router.post("/admin/products", permit("products", "edit"), route(async (req, res) => {
  if (res.headersSent) return;
  const body = parse(Api.AdminCreateProductBody, req.body, res); if (!body) return;
  const [category] = await db.select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(eq(categoriesTable.id, body.categoryId))
    .limit(1);
  if (!category) { res.status(400).json({ error: "Category not found" }); return; }
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(productsTable).values(body).returning();
    if (created.stockQuantity > 0) {
      await tx.insert(inventoryMovementsTable).values({
        productId: created.id, movementType: "increase", quantityChange: created.stockQuantity,
        quantityBefore: 0, quantityAfter: created.stockQuantity, reason: "Initial stock",
        sourceType: "product_creation", sourceId: String(created.id), eventKey: `product-creation:${created.id}`,
        performedBy: res.locals.admin.id,
      });
    }
    return created;
  });
  res.status(201).json(Api.AdminCreateProductResponse.parse(row));
}));
router.post("/admin/products/images/upload-url", permit("products", "edit"), route(async (req, res) => {
  if (res.headersSent) return;
  const body = parse(Api.AdminRequestProductImageUploadBody, req.body, res); if (!body) return;
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
  if (!allowedTypes.has(body.contentType)) {
    res.status(400).json({ error: "Unsupported image type" });
    return;
  }
  if (body.size > 8 * 1024 * 1024) {
    res.status(400).json({ error: "Image must be 8 MB or smaller" });
    return;
  }
  const upload = await objectStorage.createProductImageUpload();
  res.json(Api.AdminRequestProductImageUploadResponse.parse({
    ...upload,
    imageUrl: `/api/storage${upload.objectPath}`,
  }));
}));
router.get("/admin/products/:id", permit("products", "view"), route(async (req, res) => {
  if (res.headersSent) return;
  const params = parse(Api.AdminGetProductParams, req.params, res); if (!params) return;
  const [row] = await db.select().from(productsTable).where(eq(productsTable.id, params.id)).limit(1);
  if (!row) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(Api.AdminGetProductResponse.parse(row));
}));
router.patch("/admin/products/:id", permit("products", "edit"), route(async (req, res) => {
  if (res.headersSent) return;
  const params = parse(Api.AdminUpdateProductParams, req.params, res);
  const body = parse(Api.AdminUpdateProductBody, req.body, res); if (!params || !body) return;
  const [existingProduct] = await db.select()
    .from(productsTable)
    .where(eq(productsTable.id, params.id))
    .limit(1);
  if (!existingProduct) { res.status(404).json({ error: "Product not found" }); return; }
  if (Object.keys(body).length === 0) {
    res.json(Api.AdminUpdateProductResponse.parse(existingProduct));
    return;
  }
  if (body.categoryId !== undefined) {
    const [category] = await db.select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, body.categoryId))
      .limit(1);
    if (!category) { res.status(400).json({ error: "Category not found" }); return; }
  }
  const [row] = await db.update(productsTable).set(body).where(eq(productsTable.id, params.id)).returning();
  res.json(Api.AdminUpdateProductResponse.parse(row));
}));
router.delete("/admin/products/:id", permit("products", "delete"), route(async (req, res) => {
  if (res.headersSent) return;
  const params = parse(Api.AdminDisableProductParams, req.params, res); if (!params) return;
  await db.update(productsTable).set({ isActive: false }).where(eq(productsTable.id, params.id));
  res.sendStatus(204);
}));

router.get("/admin/categories", permit("categories", "view"), route(async (req, res) => {
  if (res.headersSent) return;
  const query = parse(Api.AdminListCategoriesQueryParams, req.query, res); if (!query) return;
  let rows = await db.select().from(categoriesTable).orderBy(categoriesTable.id);
  rows = statusFilter(searchFilter(rows, query.search, ["nameAr", "nameEn", "slug"]), query.status);
  res.json(Api.AdminListCategoriesResponse.parse(rows));
}));
router.post("/admin/categories", permit("categories", "edit"), route(async (req, res) => {
  if (res.headersSent) return;
  const body = parse(Api.AdminCreateCategoryBody, req.body, res); if (!body) return;
  const [row] = await db.insert(categoriesTable).values(body).returning();
  res.status(201).json(Api.AdminCreateCategoryResponse.parse(row));
}));
router.patch("/admin/categories/:id", permit("categories", "edit"), route(async (req, res) => {
  if (res.headersSent) return;
  const params = parse(Api.AdminUpdateCategoryParams, req.params, res);
  const body = parse(Api.AdminUpdateCategoryBody.partial(), req.body, res); if (!params || !body) return;
  const [row] = await db.update(categoriesTable).set(body).where(eq(categoriesTable.id, params.id)).returning();
  if (!row) { res.status(404).json({ error: "Category not found" }); return; }
  res.json(Api.AdminUpdateCategoryResponse.parse(row));
}));
router.delete("/admin/categories/:id", permit("categories", "delete"), route(async (req, res) => {
  if (res.headersSent) return;
  const params = parse(Api.AdminDisableCategoryParams, req.params, res); if (!params) return;
  await db.update(categoriesTable).set({ isActive: false }).where(eq(categoriesTable.id, params.id)); res.sendStatus(204);
}));

router.get("/admin/orders", permit("orders", "view"), route(async (req, res) => {
  const query = parse(Api.AdminListOrdersQueryParams, req.query, res); if (!query) return;
  let rows = await db.select().from(ordersTable).orderBy(sql`${ordersTable.createdAt} desc`);
  rows = searchFilter(rows, query.search, ["orderNumber", "trackingNumber"]);
  if (query.status !== "all") rows = rows.filter((row) => row.status === query.status);
  res.json(Api.AdminListOrdersResponse.parse(rows));
}));
router.post("/admin/orders", permit("orders", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateOrderBody, req.body, res); if (!body) return;
  const duplicateProductIds = body.items
    .map((item) => item.productId)
    .filter((productId, index, ids) => ids.indexOf(productId) !== index);
  if (duplicateProductIds.length > 0) {
    res.status(400).json({ error: "Each product can appear only once in an order" });
    return;
  }

  try {
    const order = await db.transaction(async (tx) => {
      const [customer] = await tx.select({ id: customersTable.id, isActive: customersTable.isActive })
        .from(customersTable).where(eq(customersTable.id, body.userId)).limit(1);
      if (!customer?.isActive) throw new Error("CUSTOMER_UNAVAILABLE");

      const selectedProducts: Array<{
        product: typeof productsTable.$inferSelect;
        quantity: number;
      }> = [];
      for (const item of [...body.items].sort((left, right) => left.productId - right.productId)) {
        await tx.execute(sql`select id from ${productsTable} where ${productsTable.id} = ${item.productId} for update`);
        const [product] = await tx.select().from(productsTable)
          .where(and(eq(productsTable.id, item.productId), eq(productsTable.isActive, true)))
          .limit(1);
        if (!product) throw new Error("PRODUCT_UNAVAILABLE");
        if (product.stockQuantity < item.quantity) {
          throw new Error(`INSUFFICIENT_STOCK:${product.nameAr}:${product.stockQuantity}`);
        }
        selectedProducts.push({ product, quantity: item.quantity });
      }

      const subtotal = Math.round(selectedProducts.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0,
      ) * 100) / 100;
      const shippingCost = body.shippingCost ?? (
        /الرياض|riyadh/i.test(body.orderAddress.city.trim()) ? 20 : 30
      );
      const tax = Math.round(subtotal * 0.15 * 100) / 100;
      const total = Math.round((subtotal + shippingCost + tax) * 100) / 100;
      const orderNumber = `ME-${randomBytes(5).toString("hex").toUpperCase()}`;
      const [created] = await tx.insert(ordersTable).values({
        userId: body.userId,
        orderNumber,
        subtotal,
        shippingCost,
        discount: 0,
        tax,
        total,
        address: JSON.stringify(body.orderAddress),
        shippingMethod: body.shippingMethod,
        paymentMethod: body.paymentMethod,
        adminNotes: body.adminNotes ?? null,
      }).returning();

      await tx.insert(orderAddressesTable).values({
        orderId: created.id,
        label: body.orderAddress.label,
        city: body.orderAddress.city,
        district: body.orderAddress.district,
        street: body.orderAddress.street,
        buildingNo: body.orderAddress.buildingNo,
        additionalInfo: body.orderAddress.additionalInfo,
        isDefault: body.orderAddress.isDefault,
      });
      await tx.insert(shipmentsTable).values({
        channel: "online",
        orderId: created.id,
        destinationCity: body.orderAddress.city,
        destinationAddress: [body.orderAddress.district, body.orderAddress.street, body.orderAddress.buildingNo].filter(Boolean).join(", "),
        serviceMethod: body.shippingMethod,
        status: "pending",
        collectedCost: shippingCost,
      });
      await tx.insert(orderItemsTable).values(selectedProducts.map(({ product, quantity }) => ({
        orderId: created.id,
        productId: product.id,
        productName: product.nameAr,
        quantity,
        unitPrice: product.price,
        totalPrice: Math.round(product.price * quantity * 100) / 100,
        costSnapshot: product.averageCost,
        imageUrl: product.images[0]?.url ?? null,
      })));

      for (const { product, quantity } of selectedProducts) {
        const quantityAfter = product.stockQuantity - quantity;
        await adjustOperationalBalances(tx, product.id, -quantity, product.averageCost, product.stockQuantity);
        const [updated] = await tx.update(productsTable)
          .set({ stockQuantity: quantityAfter })
          .where(and(eq(productsTable.id, product.id), eq(productsTable.stockQuantity, product.stockQuantity)))
          .returning({ id: productsTable.id });
        if (!updated) throw new Error("INVENTORY_CHANGED");
        await tx.insert(inventoryMovementsTable).values({
          productId: product.id,
          movementType: "decrease",
          quantityChange: -quantity,
          quantityBefore: product.stockQuantity,
          quantityAfter,
          reason: `Admin order ${orderNumber}`,
          unitCost: product.averageCost,
          totalCost: (Number(product.averageCost) * quantity).toFixed(4),
          sourceType: "order",
          sourceId: String(created.id),
          eventKey: `sale-fulfillment:${created.id}:${product.id}`,
          performedBy: (res.locals.admin as typeof adminUsersTable.$inferSelect).id,
        });
      }
      await postFulfillmentCogs(tx, created.id, res.locals.admin.id, created.orderNumber, created.createdAt.toISOString().slice(0, 10));
      return created;
    });
    res.status(201).json(Api.AdminCreateOrderResponse.parse(order));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "CUSTOMER_UNAVAILABLE") {
      res.status(400).json({ error: "Customer was not found or is inactive" });
      return;
    }
    if (message === "PRODUCT_UNAVAILABLE") {
      res.status(400).json({ error: "A selected product was not found or is inactive" });
      return;
    }
    if (message.startsWith("INSUFFICIENT_STOCK:")) {
      const [, productName, available] = message.split(":");
      res.status(409).json({ error: `Insufficient stock for ${productName}. Available: ${available}` });
      return;
    }
    if (message === "INVENTORY_CHANGED") {
      res.status(409).json({ error: "Inventory changed while the order was being created. Please try again." });
      return;
    }
    throw error;
  }
}));
router.get("/admin/orders/:id", permit("orders", "view"), route(async (req, res) => {
  const params = parse(Api.AdminGetOrderParams, req.params, res); if (!params) return;
  const [row] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.id)).limit(1);
  if (!row) { res.status(404).json({ error: "Order not found" }); return; }
  const [[customer], [orderAddress], items] = await Promise.all([
    db.select({ name: customersTable.name, phone: customersTable.phone, email: customersTable.email })
      .from(customersTable).where(eq(customersTable.id, row.userId)).limit(1),
    db.select().from(orderAddressesTable).where(eq(orderAddressesTable.orderId, row.id)).limit(1),
    db.select({
      productId: orderItemsTable.productId,
      productName: orderItemsTable.productName,
      quantity: orderItemsTable.quantity,
      unitPrice: orderItemsTable.unitPrice,
      totalPrice: orderItemsTable.totalPrice,
      imageUrl: orderItemsTable.imageUrl,
    }).from(orderItemsTable).where(eq(orderItemsTable.orderId, row.id)).orderBy(orderItemsTable.id),
  ]);
  if (!customer) { res.status(404).json({ error: "Order customer not found" }); return; }
  let legacyAddress: Record<string, unknown> = {};
  try { legacyAddress = JSON.parse(row.address) as Record<string, unknown>; } catch { /* legacy address is optional */ }
  const address = orderAddress ?? {
    label: typeof legacyAddress.label === "string" ? legacyAddress.label : "",
    city: typeof legacyAddress.city === "string" ? legacyAddress.city : "",
    district: typeof legacyAddress.district === "string" ? legacyAddress.district : "",
    street: typeof legacyAddress.street === "string" ? legacyAddress.street : "",
    buildingNo: typeof legacyAddress.buildingNo === "string" ? legacyAddress.buildingNo : "",
    additionalInfo: typeof legacyAddress.additionalInfo === "string" ? legacyAddress.additionalInfo : null,
    isDefault: typeof legacyAddress.isDefault === "boolean" ? legacyAddress.isDefault : false,
  };
  const coupon = row.couponCode && row.couponDiscountType && row.couponDiscountValue != null
    ? { code: row.couponCode, discountType: row.couponDiscountType, discountValue: row.couponDiscountValue }
    : null;
  res.json(Api.AdminGetOrderResponse.parse({
    ...row,
    customer,
    orderAddress: {
      label: address.label, city: address.city, district: address.district, street: address.street,
      buildingNo: address.buildingNo, additionalInfo: address.additionalInfo, isDefault: address.isDefault,
    },
    items,
    coupon,
  }));
}));
router.patch("/admin/orders/:id", permit("orders", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateOrderParams, req.params, res);
  const body = parse(Api.AdminUpdateOrderBody, req.body, res); if (!params || !body) return;
  const row = await updateOrderAndIssueInvoice(params.id, body, process.env, res.locals.admin.id);
  if (!row) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(Api.AdminUpdateOrderResponse.parse(row));
}));

router.get("/admin/invoices", permit("invoices", "view"), route(async (req, res) => {
  const query = parse(Api.AdminListInvoicesQueryParams, req.query, res); if (!query) return;
  const search = query.search?.trim();
  const rows = await db.select({
    id: invoicesTable.id,
    orderId: invoicesTable.orderId,
    orderNumber: ordersTable.orderNumber,
    distributorId: invoicesTable.distributorId,
    distributorName: invoicesTable.buyerName,
    sequenceNumber: invoicesTable.sequenceNumber,
    invoiceNumber: invoicesTable.invoiceNumber,
    sellerName: invoicesTable.sellerName,
    issueDatetime: invoicesTable.issueDatetime,
    dueDate: invoicesTable.dueDate,
    sellerVatNumber: invoicesTable.sellerVatNumber,
    buyerName: invoicesTable.buyerName,
    buyerTaxNumber: invoicesTable.buyerTaxNumber,
    buyerCommercialRegistrationNumber: invoicesTable.buyerCommercialRegistrationNumber,
    buyerAddress: invoicesTable.buyerAddress,
    subtotal: invoicesTable.subtotal,
    vatAmount: invoicesTable.vatAmount,
    totalAmount: invoicesTable.totalAmount,
    qrCodeData: invoicesTable.qrCodeData,
    createdAt: invoicesTable.createdAt,
  }).from(invoicesTable)
    .leftJoin(ordersTable, eq(invoicesTable.orderId, ordersTable.id))
    .where(and(
      isNull(invoicesTable.archivedAt),
      query.channel === "companies" ? sql`${invoicesTable.distributorId} is not null` : undefined,
      search ? or(
        ilike(invoicesTable.invoiceNumber, `%${search}%`),
        ilike(invoicesTable.sellerName, `%${search}%`),
        ilike(invoicesTable.sellerVatNumber, `%${search}%`),
        ilike(invoicesTable.buyerName, `%${search}%`),
        ilike(invoicesTable.buyerTaxNumber, `%${search}%`),
        ilike(invoicesTable.buyerCommercialRegistrationNumber, `%${search}%`),
        ilike(ordersTable.orderNumber, `%${search}%`),
      ) : undefined,
    ))
    .orderBy(desc(invoicesTable.sequenceNumber));
  const itemRows = rows.length
    ? await db.select().from(invoiceItemsTable).where(inArray(invoiceItemsTable.invoiceId, rows.map((row) => row.id))).orderBy(invoiceItemsTable.id)
    : [];
  const paymentRows = rows.length
    ? await db.select().from(receivablePaymentsTable).where(inArray(receivablePaymentsTable.invoiceId, rows.map((row) => row.id))).orderBy(receivablePaymentsTable.paymentDate, receivablePaymentsTable.id)
    : [];
  const today = new Date().toISOString().slice(0, 10);
  const enriched = rows.map((row) => {
    const payments = paymentRows.filter((payment) => payment.invoiceId === row.id);
    const paidAmount = Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100;
    const outstandingAmount = Math.max(0, Math.round((row.totalAmount - paidAmount) * 100) / 100);
    const paymentStatus = outstandingAmount === 0 ? "paid" as const : paidAmount > 0 ? "partial" as const : "unpaid" as const;
    return { ...row, paidAmount, outstandingAmount, paymentStatus, payments, items: itemRows.filter((item) => item.invoiceId === row.id) };
  }).filter((invoice) => {
    if (!query.receivableStatus || query.receivableStatus === "all") return true;
    if (query.receivableStatus === "paid") return invoice.paymentStatus === "paid";
    if (query.receivableStatus === "open") return invoice.outstandingAmount > 0;
    return invoice.outstandingAmount > 0 && invoice.dueDate !== null && invoice.dueDate < today;
  });
  res.json(Api.AdminListInvoicesResponse.parse(enriched));
}));

router.post("/admin/invoices", permit("invoices", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateDistributorInvoiceBody, req.body, res); if (!body) return;
  try {
    const invoice = await createDistributorInvoice(body, res.locals.admin.id);
    res.status(201).json(Api.AdminCreateDistributorInvoiceResponse.parse(invoice));
  } catch (error) {
    if (error instanceof DistributorInvoiceValidationError) {
      res.status(400).json({ error: error.message }); return;
    }
    if (error instanceof DistributorInvoiceConflictError) {
      res.status(409).json({ error: error.message }); return;
    }
    throw error;
  }
}));

router.patch("/admin/invoices/:id", permit("invoices", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateInvoiceParams, req.params, res);
  const body = parse(Api.AdminUpdateInvoiceBody, req.body, res); if (!params || !body) return;
  const clean = (value: string | null | undefined) => value === undefined ? undefined : value?.trim() || null;
  const [updated] = await db.update(invoicesTable).set({
    ...(body.dueDate !== undefined ? {
      dueDate: body.dueDate instanceof Date ? body.dueDate.toISOString().slice(0, 10) : body.dueDate,
    } : {}),
    ...(body.buyerName !== undefined ? { buyerName: clean(body.buyerName) } : {}),
    ...(body.buyerTaxNumber !== undefined ? { buyerTaxNumber: clean(body.buyerTaxNumber) } : {}),
    ...(body.buyerCommercialRegistrationNumber !== undefined ? { buyerCommercialRegistrationNumber: clean(body.buyerCommercialRegistrationNumber) } : {}),
    ...(body.buyerAddress !== undefined ? { buyerAddress: clean(body.buyerAddress) } : {}),
  }).where(and(eq(invoicesTable.id, params.id), isNull(invoicesTable.archivedAt))).returning({ id: invoicesTable.id });
  if (!updated) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.sendStatus(204);
}));

router.delete("/admin/invoices/:id", permit("invoices", "delete"), route(async (req, res) => {
  const params = parse(Api.AdminArchiveInvoiceParams, req.params, res); if (!params) return;
  const [archived] = await db.update(invoicesTable).set({
    archivedAt: new Date(),
    archivedByAdminId: res.locals.admin.id,
  }).where(and(eq(invoicesTable.id, params.id), isNull(invoicesTable.archivedAt))).returning({ id: invoicesTable.id });
  if (!archived) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.sendStatus(204);
}));

router.post("/admin/invoices/:id/payments", permit("invoices", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminCreateReceivablePaymentParams, req.params, res);
  const body = parse(Api.AdminCreateReceivablePaymentBody, req.body, res); if (!params || !body) return;
  try {
    const payment = await createReceivablePayment(params.id, body, res.locals.admin.id);
    res.status(201).json(Api.AdminCreateReceivablePaymentResponse.parse(payment));
  } catch (error) {
    if (error instanceof ReceivablePaymentNotFoundError) {
      res.status(404).json({ error: error.message }); return;
    }
    if (error instanceof DistributorInvoiceValidationError) {
      res.status(400).json({ error: error.message }); return;
    }
    if (error instanceof DistributorInvoiceConflictError) {
      res.status(409).json({ error: error.message }); return;
    }
    throw error;
  }
}));

router.get("/admin/invoices/:id/qr", permit("invoices", "view"), route(async (req, res) => {
  const params = parse(Api.AdminGetInvoiceQrParams, req.params, res); if (!params) return;
  const [invoice] = await db.select({ qrCodeBase64: invoicesTable.qrCodeData })
    .from(invoicesTable).where(eq(invoicesTable.id, params.id)).limit(1);
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  const png = await QRCode.toBuffer(invoice.qrCodeBase64, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
  });
  res.type("image/png").send(png);
}));

router.get("/admin/shipping", permit("shipping", "view"), route(async (req, res) => {
  const query = parse(Api.GetAdminShippingDashboardQueryParams, {
    ...req.query,
    status: req.query.status ?? "all",
    page: req.query.page ?? 1,
    pageSize: req.query.pageSize ?? 20,
    from: typeof req.query.from === "string" && req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : undefined,
    to: typeof req.query.to === "string" && req.query.to ? new Date(`${req.query.to}T00:00:00.000Z`) : undefined,
  }, res); if (!query) return;
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    res.status(400).json({ error: "Invalid pagination" }); return;
  }
  if (!(await canUseShipping(res, query.channel, "view"))) {
    res.status(403).json({ error: "Insufficient permission" }); return;
  }
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  if (to) to.setUTCHours(23, 59, 59, 999);
  const needle = query.search?.trim().toLocaleLowerCase();
  let rows = (await shippingRows(query.channel)).filter(({ shipment, referenceNumber, partyName }) => {
    if (from && shipment.createdAt < from) return false;
    if (to && shipment.createdAt > to) return false;
    if (query.status !== "all" && shipment.status !== query.status) return false;
    if (query.city && shipment.destinationCity !== query.city) return false;
    if (needle && ![referenceNumber, partyName, shipment.trackingNumber, shipment.carrier, shipment.destinationCity]
      .some((value) => value?.toLocaleLowerCase().includes(needle))) return false;
    return true;
  });
  rows = rows.sort((a, b) => b.shipment.createdAt.getTime() - a.shipment.createdAt.getTime());

  const actualCosts = rows.map(({ shipment }) => shipment.actualCost).filter((value): value is number => value != null);
  const totalActualCost = actualCosts.reduce((sumValue, value) => sumValue + value, 0);
  const totalCollectedCost = rows.reduce((sumValue, { shipment }) => sumValue + (shipment.collectedCost ?? 0), 0);
  const metric = (key: string, countValue: number, labels?: { labelAr: string; labelEn: string }) => ({
    key, labelAr: labels?.labelAr ?? key, labelEn: labels?.labelEn ?? key, count: countValue,
  });
  const countBy = (values: string[]) => Array.from(values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>()));
  const statuses = countBy(rows.map(({ shipment }) => shipment.status))
    .map(([key, value]) => metric(key, value, shippingStatusLabels[key]));
  const destinations = countBy(rows.map(({ shipment }) => shipment.destinationCity))
    .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, value]) => metric(key, value));
  const trend = countBy(rows.map(({ shipment }) => shipment.createdAt.toISOString().slice(0, 10)))
    .map(([date, shipments]) => ({
      date,
      shipments,
      actualCost: rows.filter(({ shipment }) => shipment.createdAt.toISOString().slice(0, 10) === date)
        .reduce((sumValue, { shipment }) => sumValue + (shipment.actualCost ?? 0), 0),
    })).sort((a, b) => a.date.localeCompare(b.date));
  const items = rows.slice((page - 1) * pageSize, page * pageSize).map(publicShipment);
  res.json(Api.GetAdminShippingDashboardResponse.parse({
    channel: query.channel,
    summary: {
      shipmentCount: rows.length,
      uniqueParties: new Set(rows.map((row) => row.partyName)).size,
      totalActualCost,
      averageActualCost: actualCosts.length ? totalActualCost / actualCosts.length : 0,
      totalCollectedCost,
    },
    trend,
    statuses,
    destinations,
    cities: [...new Set((await shippingRows(query.channel)).map(({ shipment }) => shipment.destinationCity))].sort(),
    items,
    total: rows.length,
    page,
    pageSize,
  }));
}));

router.post("/admin/shipping", permit("shipping", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateShipmentBody, req.body, res); if (!body) return;
  if (!Number.isInteger(body.sourceId) || body.sourceId < 1
    || (body.actualCost != null && body.actualCost < 0)
    || (body.collectedCost != null && body.collectedCost < 0)) {
    res.status(400).json({ error: "Invalid shipment input" }); return;
  }
  if (!(await canUseShipping(res, body.channel, "edit"))) {
    res.status(403).json({ error: "Insufficient permission" }); return;
  }
  const source = body.channel === "online"
    ? (await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.id, body.sourceId)).limit(1))[0]
    : (await db.select({ id: invoicesTable.id }).from(invoicesTable)
      .where(and(eq(invoicesTable.id, body.sourceId), sql`${invoicesTable.distributorId} is not null`)).limit(1))[0];
  if (!source) { res.status(400).json({ error: "Shipping source not found for this channel" }); return; }
  const existing = body.channel === "online"
    ? (await db.select({ id: shipmentsTable.id }).from(shipmentsTable).where(eq(shipmentsTable.orderId, body.sourceId)).limit(1))[0]
    : (await db.select({ id: shipmentsTable.id }).from(shipmentsTable).where(eq(shipmentsTable.invoiceId, body.sourceId)).limit(1))[0];
  if (existing) { res.status(409).json({ error: "A shipment is already registered for this source" }); return; }
  const { sourceId, ...values } = body;
  const [created] = await db.insert(shipmentsTable).values({
    ...values,
    orderId: body.channel === "online" ? sourceId : null,
    invoiceId: body.channel === "b2b" ? sourceId : null,
  }).returning();
  const row = (await shippingRows(body.channel)).find((item) => item.shipment.id === created.id)!;
  res.status(201).json(Api.AdminCreateShipmentResponse.parse(publicShipment(row)));
}));

router.patch("/admin/shipping/:id", permit("shipping", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateShipmentParams, req.params, res);
  const body = parse(Api.AdminUpdateShipmentBody, req.body, res); if (!params || !body) return;
  if ((body.actualCost != null && body.actualCost < 0)
    || (body.collectedCost != null && body.collectedCost < 0)) {
    res.status(400).json({ error: "Invalid shipment input" }); return;
  }
  const [existing] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, params.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Shipment not found" }); return; }
  const channel = existing.channel as "online" | "b2b";
  if (!(await canUseShipping(res, channel, "edit"))) {
    res.status(403).json({ error: "Insufficient permission" }); return;
  }
  if (body.status !== undefined) {
    try {
      assertShippingStatusTransition(existing.status, body.status);
    } catch (error) {
      if (error instanceof ShippingStatusTransitionError) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
  }
  await db.transaction(async (tx) => {
    await tx.update(shipmentsTable).set(body).where(eq(shipmentsTable.id, params.id));
    if (channel === "online" && existing.orderId && body.trackingNumber !== undefined) {
      await tx.update(ordersTable)
        .set({ trackingNumber: body.trackingNumber })
        .where(eq(ordersTable.id, existing.orderId));
    }
  });
  const row = (await shippingRows(channel)).find((item) => item.shipment.id === params.id)!;
  res.json(Api.AdminUpdateShipmentResponse.parse(publicShipment(row)));
}));

router.post("/admin/shipping/:id/label", permit("shipping", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminCreateShippingLabelParams, req.params, res);
  const body = parse(Api.AdminCreateShippingLabelBody, req.body, res);
  if (!params || !body) return;
  const row = (await shippingRows("online")).find((item) => item.shipment.id === params.id)
    ?? (await shippingRows("b2b")).find((item) => item.shipment.id === params.id);
  if (!row) { res.status(404).json({ error: "Shipment not found" }); return; }
  const channel = row.shipment.channel as "online" | "b2b";
  if (!(await canUseShipping(res, channel, "edit"))) {
    res.status(403).json({ error: "Insufficient permission" }); return;
  }
  if (row.shipment.trackingNumber && row.shipment.labelUrl && row.shipment.integrationStatus === "active") {
    res.json(Api.AdminCreateShippingLabelResponse.parse(publicShipment(row))); return;
  }
  if (row.shipment.status !== "ready") {
    try {
      assertShippingStatusTransition(row.shipment.status, "ready");
    } catch (error) {
      if (error instanceof ShippingStatusTransitionError) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
  }

  const [integration] = await db.select().from(adminIntegrationsTable)
    .where(eq(adminIntegrationsTable.providerId, body.carrier)).limit(1);
  const attemptAt = new Date();
  await db.update(shipmentsTable).set({
    carrier: body.carrier,
    serviceMethod: body.serviceMethod,
    integrationStatus: "processing",
    integrationError: null,
    integrationAttempts: row.shipment.integrationAttempts + 1,
    lastIntegrationAttemptAt: attemptAt,
  }).where(eq(shipmentsTable.id, params.id));

  try {
    const label = await createSmsaShippingLabel(integration?.apiBaseUrl ?? null, {
      referenceNumber: row.referenceNumber,
      recipientName: row.partyName,
      recipientPhone: row.partyPhone,
      destinationCity: row.shipment.destinationCity,
      destinationAddress: row.shipment.destinationAddress,
      serviceMethod: body.serviceMethod,
    });
    await db.transaction(async (tx) => {
      await tx.update(shipmentsTable).set({
        carrier: body.carrier,
        serviceMethod: body.serviceMethod,
        carrierShipmentId: label.carrierShipmentId,
        trackingNumber: label.trackingNumber,
        labelUrl: label.labelUrl,
        actualCost: label.actualCost,
        status: "ready",
        integrationStatus: "active",
        integrationError: null,
      }).where(eq(shipmentsTable.id, params.id));
      if (row.shipment.orderId) {
        await tx.update(ordersTable).set({ trackingNumber: label.trackingNumber })
          .where(eq(ordersTable.id, row.shipment.orderId));
      }
      await tx.insert(shipmentEventsTable).values({
        shipmentId: params.id,
        carrier: body.carrier,
        eventType: "label_created",
        status: "ready",
        outcome: "success",
      });
    });
    const updated = (await shippingRows(channel)).find((item) => item.shipment.id === params.id)!;
    res.status(201).json(Api.AdminCreateShippingLabelResponse.parse(publicShipment(updated)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Carrier request failed";
    req.log.warn({ shipmentId: params.id, carrier: body.carrier, error: message }, "Shipping label request failed");
    await db.transaction(async (tx) => {
      await tx.update(shipmentsTable).set({
        integrationStatus: "failed",
        integrationError: message,
      }).where(eq(shipmentsTable.id, params.id));
      await tx.insert(shipmentEventsTable).values({
        shipmentId: params.id,
        carrier: body.carrier,
        eventType: "label_request",
        outcome: "failed",
        errorMessage: message,
      });
    });
    res.status(502).json({ error: message });
  }
}));

router.post("/shipping/webhooks/:carrier", route(async (req, res) => {
  const params = parse(Api.ReceiveShippingWebhookParams, req.params, res);
  const headers = parse(Api.ReceiveShippingWebhookHeader, req.headers, res);
  const body = parse(Api.ReceiveShippingWebhookBody, req.body, res);
  if (!params || !headers || !body) return;
  if (!secretsMatch(headers["x-webhook-secret"], process.env.SMSA_WEBHOOK_SECRET)) {
    res.status(401).json({ error: "Invalid webhook secret" }); return;
  }
  const [shipment] = await db.select().from(shipmentsTable)
    .where(and(
      eq(shipmentsTable.carrier, params.carrier),
      eq(shipmentsTable.trackingNumber, body.trackingNumber),
    )).limit(1);
  if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return; }

  const [duplicate] = await db.select({ id: shipmentEventsTable.id }).from(shipmentEventsTable)
    .where(and(
      eq(shipmentEventsTable.carrier, params.carrier),
      eq(shipmentEventsTable.carrierEventId, body.eventId),
    )).limit(1);
  if (duplicate) {
    res.json(Api.ReceiveShippingWebhookResponse.parse({ accepted: true, duplicate: true })); return;
  }

  const status = carrierStatusToShipmentStatus[body.status];
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
  await db.transaction(async (tx) => {
    const shouldAdvance = canApplyCarrierShippingStatus(shipment.status, status);
    await tx.update(shipmentsTable).set({
      ...(shouldAdvance ? { status } : {}),
      integrationStatus: "active",
      integrationError: null,
      ...(body.actualCost != null ? { actualCost: body.actualCost } : {}),
      ...(shouldAdvance && status === "in_transit" && !shipment.shippedAt ? { shippedAt: occurredAt } : {}),
      ...(shouldAdvance && status === "delivered" ? { deliveredAt: occurredAt } : {}),
    }).where(eq(shipmentsTable.id, shipment.id));
    if (shipment.orderId && shouldAdvance) {
      const orderStatus = status === "delivered" ? "delivered"
        : status === "in_transit" ? "shipped"
        : undefined;
      if (orderStatus) {
        await tx.update(ordersTable).set({ status: orderStatus })
          .where(eq(ordersTable.id, shipment.orderId));
      }
    }
    await tx.insert(shipmentEventsTable).values({
      shipmentId: shipment.id,
      carrier: params.carrier,
      carrierEventId: body.eventId,
      eventType: "tracking_update",
      status,
      outcome: shouldAdvance ? "success" : "ignored",
      ...(!shouldAdvance && shipment.status !== status
        ? { errorMessage: `Ignored invalid shipment status transition from '${shipment.status}' to '${status}'` }
        : {}),
      payload: body,
    });
  });
  res.json(Api.ReceiveShippingWebhookResponse.parse({ accepted: true, duplicate: false }));
}));

router.get("/admin/coupons", permit("coupons", "view"), route(async (req, res) => {
  const query = parse(Api.AdminListCouponsQueryParams, req.query, res); if (!query) return;
  let rows = await db.select().from(couponsTable).orderBy(couponsTable.id);
  rows = statusFilter(searchFilter(rows, query.search, ["code"]), query.status);
  res.json(Api.AdminListCouponsResponse.parse(rows));
}));
router.post("/admin/coupons", permit("coupons", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateCouponBody, req.body, res); if (!body) return;
  const [row] = await db.insert(couponsTable).values({ ...body, code: body.code.toUpperCase() }).returning();
  res.status(201).json(Api.AdminCreateCouponResponse.parse(row));
}));
router.patch("/admin/coupons/:id", permit("coupons", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateCouponParams, req.params, res);
  const body = parse(Api.AdminUpdateCouponBody.partial(), req.body, res); if (!params || !body) return;
  const [row] = await db.update(couponsTable).set({ ...body, code: body.code?.toUpperCase() }).where(eq(couponsTable.id, params.id)).returning();
  if (!row) { res.status(404).json({ error: "Coupon not found" }); return; }
  res.json(Api.AdminUpdateCouponResponse.parse(row));
}));
router.delete("/admin/coupons/:id", permit("coupons", "delete"), route(async (req, res) => {
  const params = parse(Api.AdminDisableCouponParams, req.params, res); if (!params) return;
  let confirmed = false;
  if (req.body != null && Object.keys(req.body).length > 0) {
    const body = parse(Api.AdminDisableCouponBody, req.body, res); if (!body) return;
    confirmed = body.confirm;
  }

  const result = await db.transaction(async (tx) => {
    const [coupon] = await tx.select({ id: couponsTable.id })
      .from(couponsTable)
      .where(eq(couponsTable.id, params.id))
      .for("update")
      .limit(1);
    if (!coupon) return { kind: "not-found" as const };

    const affectedCampaigns = await tx.select({
      id: campaignsTable.id,
      name: campaignsTable.name,
    })
      .from(campaignCouponsTable)
      .innerJoin(campaignsTable, eq(campaignCouponsTable.campaignId, campaignsTable.id))
      .where(and(
        eq(campaignCouponsTable.couponId, params.id),
        eq(campaignsTable.status, "active"),
      ))
      .orderBy(campaignsTable.name, campaignsTable.id);

    if (affectedCampaigns.length > 0 && !confirmed) {
      return { kind: "confirmation-required" as const, affectedCampaigns };
    }

    await tx.update(couponsTable)
      .set({ isActive: false })
      .where(eq(couponsTable.id, params.id));
    return { kind: "disabled" as const };
  });

  if (result.kind === "not-found") {
    res.status(404).json({ error: "Coupon not found" }); return;
  }
  if (result.kind === "confirmation-required") {
    res.status(409).json({
      error: "Coupon is used by active campaigns. Explicit confirmation is required.",
      affectedCampaigns: result.affectedCampaigns,
    });
    return;
  }
  res.sendStatus(204);
}));

async function campaignWithCoupons(campaign: typeof campaignsTable.$inferSelect) {
  const coupons = await db.select({ id: couponsTable.id, code: couponsTable.code })
    .from(campaignCouponsTable)
    .innerJoin(couponsTable, eq(campaignCouponsTable.couponId, couponsTable.id))
    .where(eq(campaignCouponsTable.campaignId, campaign.id))
    .orderBy(couponsTable.code);
  return { ...campaign, coupons };
}

class UnavailableCampaignCouponsError extends Error {
  constructor(readonly couponIds: number[]) {
    super(`Campaign coupons are missing or inactive: ${couponIds.join(", ")}`);
  }
}

async function assertCampaignCouponsAvailable(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  couponIds: number[],
) {
  if (!couponIds.length) return;
  const available = await tx.select({ id: couponsTable.id })
    .from(couponsTable)
    .where(and(inArray(couponsTable.id, couponIds), eq(couponsTable.isActive, true)))
    .for("update");
  const availableIds = new Set(available.map((coupon) => coupon.id));
  const unavailableIds = couponIds.filter((couponId) => !availableIds.has(couponId));
  if (unavailableIds.length) throw new UnavailableCampaignCouponsError(unavailableIds);
}

router.get("/admin/campaigns", permit("campaigns", "view"), route(async (_req, res) => {
  const rows = await db.select().from(campaignsTable).orderBy(desc(campaignsTable.startsAt), desc(campaignsTable.id));
  res.json(Api.AdminListCampaignsResponse.parse(await Promise.all(rows.map(campaignWithCoupons))));
}));

router.get("/admin/campaigns/coupon-options", permit("campaigns", "view"), route(async (_req, res) => {
  const rows = await db.select({ id: couponsTable.id, code: couponsTable.code })
    .from(couponsTable)
    .where(eq(couponsTable.isActive, true))
    .orderBy(couponsTable.code);
  res.json(Api.AdminListCampaignCouponOptionsResponse.parse(rows));
}));

type CampaignReportQuery = {
  from?: Date;
  to?: Date;
  channel?: string;
};

async function campaignResults(query: CampaignReportQuery) {
  const campaignConditions = query.channel ? eq(campaignsTable.channel, query.channel) : undefined;
  const campaigns = await db.select().from(campaignsTable)
    .where(campaignConditions)
    .orderBy(desc(campaignsTable.startsAt), desc(campaignsTable.id));
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const linkedCoupons = campaignIds.length
    ? await db.select({
        campaignId: campaignCouponsTable.campaignId,
        id: couponsTable.id,
        code: couponsTable.code,
      }).from(campaignCouponsTable)
        .innerJoin(couponsTable, eq(campaignCouponsTable.couponId, couponsTable.id))
        .where(inArray(campaignCouponsTable.campaignId, campaignIds))
        .orderBy(couponsTable.code)
    : [];
  const codes = [...new Set(linkedCoupons.map((coupon) => coupon.code))];
  const orderConditions = [
    eq(ordersTable.paymentStatus, "paid"),
    sql`${ordersTable.status} <> 'cancelled'`,
    ...(query.from ? [gte(ordersTable.createdAt, query.from)] : []),
    ...(query.to ? [lte(ordersTable.createdAt, query.to)] : []),
  ];
  const attributedOrders = codes.length
    ? await db.select({
        id: ordersTable.id,
        couponCode: ordersTable.couponCode,
        total: ordersTable.total,
        createdAt: ordersTable.createdAt,
      }).from(ordersTable)
        .where(and(inArray(ordersTable.couponCode, codes), ...orderConditions))
    : [];

  const results = campaigns.map((campaign) => {
    const coupons = linkedCoupons.filter((coupon) => coupon.campaignId === campaign.id);
    const campaignOrders = attributedOrders.filter((order) =>
      order.createdAt >= campaign.startsAt
      && order.createdAt <= campaign.endsAt
      && coupons.some((coupon) => coupon.code === order.couponCode));
    const couponResults = coupons.map((coupon) => {
      const orders = campaignOrders.filter((order) => order.couponCode === coupon.code);
      return {
        id: coupon.id,
        code: coupon.code,
        uses: orders.length,
        orders: orders.length,
        revenue: orders.reduce((total, order) => total + order.total, 0),
      };
    });
    return {
      id: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      couponUses: campaignOrders.length,
      orders: campaignOrders.length,
      revenue: campaignOrders.reduce((total, order) => total + order.total, 0),
      coupons: couponResults,
    };
  });
  const byChannel = [...new Set(results.map((campaign) => campaign.channel))].map((channel) => {
    const channelCampaigns = results.filter((campaign) => campaign.channel === channel);
    return {
      channel,
      campaigns: channelCampaigns.length,
      couponUses: channelCampaigns.reduce((total, campaign) => total + campaign.couponUses, 0),
      orders: channelCampaigns.reduce((total, campaign) => total + campaign.orders, 0),
      revenue: channelCampaigns.reduce((total, campaign) => total + campaign.revenue, 0),
    };
  }).sort((left, right) => right.revenue - left.revenue);
  return Api.AdminGetCampaignResultsResponse.parse({
    couponUses: results.reduce((total, campaign) => total + campaign.couponUses, 0),
    orders: results.reduce((total, campaign) => total + campaign.orders, 0),
    revenue: results.reduce((total, campaign) => total + campaign.revenue, 0),
    byChannel,
    campaigns: results,
  });
}

function campaignReportQueryInput(req: Request) {
  return {
    ...req.query,
    ...(typeof req.query.from === "string" ? { from: new Date(req.query.from) } : {}),
    ...(typeof req.query.to === "string" ? { to: new Date(req.query.to) } : {}),
  };
}

function validCampaignReportRange(query: CampaignReportQuery, res: Response) {
  if (query.from && query.to && query.to < query.from) {
    res.status(400).json({ error: "Report end must be after its start" });
    return false;
  }
  return true;
}

function parseCampaignReportQuery(req: Request, res: Response) {
  const query = parse(Api.AdminGetCampaignResultsQueryParams, campaignReportQueryInput(req), res);
  if (!query) return;
  if (!validCampaignReportRange(query, res)) return;
  return query;
}

router.get("/admin/campaigns/results", permit("campaigns", "view"), route(async (req, res) => {
  const query = parseCampaignReportQuery(req, res);
  if (!query) return;
  res.json(await campaignResults(query));
}));

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

router.get("/admin/campaigns/results/export", permit("campaigns", "view"), route(async (req, res) => {
  const query = parse(Api.AdminExportCampaignResultsQueryParams, campaignReportQueryInput(req), res);
  if (!query) return;
  if (!validCampaignReportRange(query, res)) return;
  const report = await campaignResults(query);
  const filename = `campaign-results-${new Date().toISOString().slice(0, 10)}`;

  if (query.format === "csv") {
    const rows: Array<Array<string | number>> = [
      ["row_type", "channel", "campaign_id", "campaign", "status", "starts_at", "ends_at", "coupon_id", "coupon_code", "campaigns", "coupon_uses", "orders", "revenue_sar"],
      ...report.byChannel.map((channel) => ["channel", channel.channel, "", "", "", "", "", "", "", channel.campaigns, channel.couponUses, channel.orders, channel.revenue]),
      ...report.campaigns.map((campaign) => ["campaign", campaign.channel, campaign.id, campaign.name, campaign.status, campaign.startsAt.toISOString(), campaign.endsAt.toISOString(), "", "", "", campaign.couponUses, campaign.orders, campaign.revenue]),
      ...report.campaigns.flatMap((campaign) => campaign.coupons.map((coupon) => ["coupon", campaign.channel, campaign.id, campaign.name, campaign.status, campaign.startsAt.toISOString(), campaign.endsAt.toISOString(), coupon.id, coupon.code, "", coupon.uses, coupon.orders, coupon.revenue])),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    res.type("text/csv; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`)
      .send(csv);
    return;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Musk Ellolo";
  workbook.created = new Date();
  const addSheet = (name: string, columns: Array<{ header: string; key: string; width: number }>, rows: Record<string, unknown>[]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = columns;
    sheet.addRows(rows);
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
    sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + columns.length)}1` };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    return sheet;
  };
  addSheet("Channels", [
    { header: "Channel", key: "channel", width: 22 },
    { header: "Campaigns", key: "campaigns", width: 14 },
    { header: "Coupon uses", key: "couponUses", width: 16 },
    { header: "Orders", key: "orders", width: 14 },
    { header: "Revenue (SAR)", key: "revenue", width: 18 },
  ], report.byChannel);
  addSheet("Campaigns", [
    { header: "ID", key: "id", width: 10 },
    { header: "Campaign", key: "name", width: 30 },
    { header: "Channel", key: "channel", width: 20 },
    { header: "Status", key: "status", width: 14 },
    { header: "Starts at", key: "startsAt", width: 24 },
    { header: "Ends at", key: "endsAt", width: 24 },
    { header: "Coupon uses", key: "couponUses", width: 16 },
    { header: "Orders", key: "orders", width: 14 },
    { header: "Revenue (SAR)", key: "revenue", width: 18 },
  ], report.campaigns.map(({ coupons: _coupons, ...campaign }) => campaign));
  addSheet("Coupons", [
    { header: "Campaign ID", key: "campaignId", width: 14 },
    { header: "Campaign", key: "campaign", width: 30 },
    { header: "Channel", key: "channel", width: 20 },
    { header: "Coupon ID", key: "id", width: 12 },
    { header: "Coupon code", key: "code", width: 22 },
    { header: "Uses", key: "uses", width: 12 },
    { header: "Orders", key: "orders", width: 12 },
    { header: "Revenue (SAR)", key: "revenue", width: 18 },
  ], report.campaigns.flatMap((campaign) => campaign.coupons.map((coupon) => ({
    campaignId: campaign.id,
    campaign: campaign.name,
    channel: campaign.channel,
    ...coupon,
  }))));
  const buffer = await workbook.xlsx.writeBuffer();
  res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    .setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`)
    .send(Buffer.from(buffer));
}));

router.post("/admin/campaigns", permit("campaigns", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateCampaignBody, req.body, res); if (!body) return;
  if (body.endsAt <= body.startsAt) {
    res.status(400).json({ error: "Campaign end must be after its start" }); return;
  }
  let campaign: typeof campaignsTable.$inferSelect;
  try {
    campaign = await db.transaction(async (tx) => {
      await assertCampaignCouponsAvailable(tx, body.couponIds);
      const [created] = await tx.insert(campaignsTable).values({
        name: body.name.trim(),
        channel: body.channel.trim(),
        status: body.status,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
      }).returning();
      if (body.couponIds.length) {
        await tx.insert(campaignCouponsTable).values(body.couponIds.map((couponId) => ({
          campaignId: created.id,
          couponId,
        })));
      }
      return created;
    });
  } catch (error) {
    if (error instanceof UnavailableCampaignCouponsError) {
      res.status(400).json({ error: error.message }); return;
    }
    throw error;
  }
  res.status(201).json(Api.AdminCreateCampaignResponse.parse(await campaignWithCoupons(campaign)));
}));

router.patch("/admin/campaigns/:id", permit("campaigns", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateCampaignParams, req.params, res);
  const body = parse(Api.AdminUpdateCampaignBody, req.body, res); if (!params || !body) return;
  if (Object.keys(body).length === 0) {
    res.status(400).json({ error: "At least one campaign field is required" }); return;
  }
  const [current] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, params.id)).limit(1);
  if (!current) { res.status(404).json({ error: "Campaign not found" }); return; }
  const startsAt = body.startsAt ?? current.startsAt;
  const endsAt = body.endsAt ?? current.endsAt;
  if (endsAt <= startsAt) {
    res.status(400).json({ error: "Campaign end must be after its start" }); return;
  }
  let campaign: typeof campaignsTable.$inferSelect;
  try {
    campaign = await db.transaction(async (tx) => {
      const { couponIds, ...changes } = body;
      if (couponIds) await assertCampaignCouponsAvailable(tx, couponIds);
      const [updated] = await tx.update(campaignsTable).set({
        ...changes,
        name: changes.name?.trim(),
        channel: changes.channel?.trim(),
        updatedAt: new Date(),
      }).where(eq(campaignsTable.id, params.id)).returning();
      if (couponIds) {
        await tx.delete(campaignCouponsTable).where(eq(campaignCouponsTable.campaignId, params.id));
        if (couponIds.length) {
          await tx.insert(campaignCouponsTable).values(couponIds.map((couponId) => ({
            campaignId: params.id,
            couponId,
          })));
        }
      }
      return updated;
    });
  } catch (error) {
    if (error instanceof UnavailableCampaignCouponsError) {
      res.status(400).json({ error: error.message }); return;
    }
    throw error;
  }
  res.json(Api.AdminUpdateCampaignResponse.parse(await campaignWithCoupons(campaign)));
}));

router.post("/admin/campaigns/:id/pause", permit("campaigns", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminPauseCampaignParams, req.params, res); if (!params) return;
  const [campaign] = await db.update(campaignsTable)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(campaignsTable.id, params.id))
    .returning();
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(Api.AdminPauseCampaignResponse.parse(await campaignWithCoupons(campaign)));
}));

router.get("/admin/customers", permit("customers", "view"), route(async (req, res) => {
  const query = parse(Api.AdminListCustomersQueryParams, req.query, res); if (!query) return;
  let rows = await db.select().from(customersTable).orderBy(customersTable.id);
  rows = statusFilter(searchFilter(rows, query.search, ["name", "phone", "email"]), query.status);
  res.json(Api.AdminListCustomersResponse.parse(rows));
}));
router.get("/admin/customers/:id", permit("customers", "view"), route(async (req, res) => {
  const params = parse(Api.AdminGetCustomerParams, req.params, res); if (!params) return;
  const [row] = await db.select().from(customersTable).where(eq(customersTable.id, params.id)).limit(1);
  if (!row) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(Api.AdminGetCustomerResponse.parse(row));
}));
router.patch("/admin/customers/:id", permit("customers", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateCustomerParams, req.params, res);
  const body = parse(Api.AdminUpdateCustomerBody, req.body, res); if (!params || !body) return;
  const [row] = await db.update(customersTable).set(body).where(eq(customersTable.id, params.id)).returning();
  if (!row) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(Api.AdminUpdateCustomerResponse.parse(row));
}));

router.get("/admin/inventory", permit("inventory", "view"), route(async (req, res) => {
  const query = parse(Api.AdminListInventoryQueryParams, req.query, res); if (!query) return;
  let rows = (await db.select({
    id: productsTable.id, nameAr: productsTable.nameAr, nameEn: productsTable.nameEn,
    sku: productsTable.sku, barcode: productsTable.barcode, operationalType: productsTable.operationalType, unitOfMeasure: productsTable.unitOfMeasure, preferredSupplier: productsTable.preferredSupplier, sellable: productsTable.sellable, price: productsTable.price, averageCost: productsTable.averageCost,
    categoryId: productsTable.categoryId, categoryNameAr: categoriesTable.nameAr, categoryNameEn: categoriesTable.nameEn,
    stockQuantity: productsTable.stockQuantity, reorderPoint: productsTable.reorderPoint,
    targetStockQuantity: productsTable.targetStockQuantity, isActive: productsTable.isActive,
  }).from(productsTable).innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id)));
  rows = searchFilter(rows, query.search, ["nameAr", "nameEn", "sku"]);
  if (query.categoryId) rows = rows.filter((row) => row.categoryId === query.categoryId);
  const enriched = rows.map((row) => ({
    ...row,
    averageCost: Number(row.averageCost),
    inventoryValue: row.stockQuantity * Number(row.averageCost),
    stockStatus: row.stockQuantity === 0 ? "out" as const : row.stockQuantity <= row.reorderPoint ? "low" as const : "in_stock" as const,
  }));
  const summary = {
    totalUnits: enriched.reduce((total, row) => total + row.stockQuantity, 0),
    totalValue: enriched.reduce((total, row) => total + row.inventoryValue, 0),
    lowStockProducts: enriched.filter((row) => row.stockStatus === "low").length,
    outOfStockProducts: enriched.filter((row) => row.stockStatus === "out").length,
  };
  let items = query.stockStatus === "all" ? enriched : enriched.filter((row) => row.stockStatus === query.stockStatus);
  items.sort((a, b) => {
    if (query.sort === "name_desc") return b.nameAr.localeCompare(a.nameAr);
    if (query.sort === "quantity_asc") return a.stockQuantity - b.stockQuantity;
    if (query.sort === "quantity_desc") return b.stockQuantity - a.stockQuantity;
    if (query.sort === "value_desc") return b.inventoryValue - a.inventoryValue;
    return a.nameAr.localeCompare(b.nameAr);
  });
  res.json(Api.AdminListInventoryResponse.parse({ items, summary }));
}));

// Operational inventory endpoints intentionally use the existing inventory permission gate.
router.get("/admin/inventory/locations", permit("inventory", "view"), route(async (_req, res) => {
  res.json(await listInventoryLocations());
}));
router.post("/admin/inventory/locations", permit("inventory", "edit"), route(async (req, res) => {
  const location = await db.transaction(async (tx) => {
    if (req.body.isDefault) await tx.update(inventoryLocationsTable).set({ isDefault: false });
    const [created] = await tx.insert(inventoryLocationsTable).values({
      name: String(req.body.name).trim(),
      code: String(req.body.code).trim(),
      managerName: String(req.body.managerName).trim(),
      email: String(req.body.email).trim().toLowerCase(),
      phone: String(req.body.phone).trim(),
      type: req.body.type ?? "warehouse",
      isDefault: Boolean(req.body.isDefault),
    }).returning();
    return created;
  });
  res.status(201).json(location);
}));
router.patch("/admin/inventory/locations/:id", permit("inventory", "edit"), route(async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Inventory location not found" }); return; }
  if (existing.isDefault && !req.body.isDefault) {
    res.status(409).json({ error: "Choose another default location before removing the current default" });
    return;
  }
  const location = await db.transaction(async (tx) => {
    if (req.body.isDefault) await tx.update(inventoryLocationsTable).set({ isDefault: false });
    const [updated] = await tx.update(inventoryLocationsTable).set({
      name: String(req.body.name).trim(),
      code: String(req.body.code).trim(),
      managerName: String(req.body.managerName).trim(),
      email: String(req.body.email).trim().toLowerCase(),
      phone: String(req.body.phone).trim(),
      type: req.body.type,
      isDefault: Boolean(req.body.isDefault),
      active: Boolean(req.body.active),
    }).where(eq(inventoryLocationsTable.id, id)).returning();
    return updated;
  });
  res.json(location);
}));
router.delete("/admin/inventory/locations/:id", permit("inventory", "edit"), route(async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Inventory location not found" }); return; }
  if (existing.isDefault) { res.status(409).json({ error: "The default inventory location cannot be deleted" }); return; }
  try {
    await db.delete(inventoryLocationsTable).where(eq(inventoryLocationsTable.id, id));
    res.status(204).send();
  } catch (error) {
    if ((error as { code?: string }).code === "23503") {
      res.status(409).json({ error: "This location is linked to inventory operations and cannot be deleted" });
      return;
    }
    throw error;
  }
}));
router.get("/admin/inventory/balances", permit("inventory", "view"), route(async (req, res) => {
  const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
  res.json(await listInventoryBalances(Number.isFinite(locationId) ? locationId : undefined));
}));
router.get("/admin/inventory/barcode/:barcode", permit("inventory", "view"), route(async (req, res) => {
  const product = await lookupInventoryBarcode(String(req.params.barcode));
  if (!product) { res.status(404).json({ error: "Product barcode not found" }); return; }
  res.json(product);
}));
router.post("/admin/inventory/transfers", permit("inventory", "edit"), route(async (req, res) => {
  try { res.status(201).json(await transferInventory({ ...req.body, createdBy: res.locals.admin.id })); }
  catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "Transfer failed" }); }
}));
router.get("/admin/inventory/transfers", permit("inventory", "view"), route(async (_req, res) => { res.json(await db.select().from(inventoryTransfersTable)); }));
router.get("/admin/inventory/transfers/:id", permit("inventory", "view"), route(async (req, res) => { const [row] = await db.select().from(inventoryTransfersTable).where(eq(inventoryTransfersTable.id, Number(req.params.id))); if (!row) { res.status(404).json({ error: "Transfer not found" }); return; } res.json(row); }));
router.post("/admin/inventory/transfers/:id/send", permit("inventory", "edit"), route(async (req, res) => {
  res.json(await sendInventoryTransfer(Number(req.params.id), res.locals.admin.id));
}));
router.post("/admin/inventory/transfers/:id/receive", permit("inventory", "edit"), route(async (req, res) => {
  res.json(await receiveInventoryTransfer(Number(req.params.id), res.locals.admin.id));
}));
router.get("/admin/inventory/reports/value", permit("inventory", "view"), route(async (req, res) => {
  const rows = await inventoryValueReport();
  if (String(req.query.format).toLowerCase() === "csv") { res.type("text/csv").send(inventoryCsv(rows as Array<Record<string, unknown>>)); return; }
  res.json(rows);
}));
router.get("/admin/inventory/alerts", permit("inventory", "view"), route(async (_req, res) => {
  res.json(await inventoryReorderSuggestions());
}));
router.get("/admin/inventory/reports/movements", permit("inventory", "view"), route(async (req, res) => {
  const report = await inventoryMovementReport(inventoryReportQuery(req.query));
  if (req.query.format === "csv") { res.type("text/csv").send(inventoryCsv(report.items as Array<Record<string, unknown>>)); return; } res.json(report);
}));
router.get("/admin/inventory/reports/aging", permit("inventory", "view"), route(async (_req, res) => { res.json(await inventoryAgingReport()); }));
router.get("/admin/inventory/reports/valuation", permit("inventory", "view"), route(async (req, res) => { const rows = await inventoryValuationReport(); if (req.query.format === "csv") { res.type("text/csv").send(inventoryCsv(rows as Array<Record<string, unknown>>)); return; } res.json(rows); }));
router.get("/admin/inventory/reports/audit", permit("inventory", "view"), route(async (req, res) => { const report = await inventoryAuditReport(inventoryReportQuery(req.query)); if (req.query.format === "csv") { res.type("text/csv").send(inventoryCsv(report.items as Array<Record<string, unknown>>)); return; } res.json(report); }));
router.get("/admin/inventory/reports/reconciliation", permit("inventory", "view"), route(async (_req, res) => { res.json(await inventoryReconciliationReport()); }));
router.post("/admin/inventory/purchase-orders", permit("inventory", "edit"), route(async (req, res) => {
  try { res.status(201).json(await createInventoryPurchaseOrder({ ...req.body, createdBy: res.locals.admin.id })); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Purchase order failed" }); }
}));
router.get("/admin/inventory/purchase-orders", permit("inventory", "view"), route(async (_req, res) => {
  const orders = await db.select().from(inventoryPurchaseOrdersTable).orderBy(desc(inventoryPurchaseOrdersTable.createdAt));
  const lines = await db.select().from(inventoryPurchaseOrderLinesTable);
  res.json(orders.map((order) => ({
    ...order,
    lines: lines.filter((line) => line.purchaseOrderId === order.id).map((line) => ({
      productId: line.productId,
      quantity: line.orderedQuantity,
      receivedQuantity: line.receivedQuantity,
      unitCost: line.unitCost,
    })),
  })));
}));
router.get("/admin/inventory/purchase-orders/:id", permit("inventory", "view"), route(async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(inventoryPurchaseOrdersTable).where(eq(inventoryPurchaseOrdersTable.id, id));
  if (!row) { res.status(404).json({ error: "Purchase order not found" }); return; }
  const lines = await db.select().from(inventoryPurchaseOrderLinesTable).where(eq(inventoryPurchaseOrderLinesTable.purchaseOrderId, id));
  res.json({ ...row, lines: lines.map((line) => ({ productId: line.productId, quantity: line.orderedQuantity, receivedQuantity: line.receivedQuantity, unitCost: line.unitCost })) });
}));
router.post("/admin/inventory/purchase-orders/:id/receive", permit("inventory", "edit"), route(async (req, res) => {
  try { res.json(await receiveInventoryPurchaseOrder(Number(req.params.id), res.locals.admin.id, req.body.receipts ?? [], req.body.idempotencyKey)); }
  catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "Receipt failed" }); }
}));
router.post("/admin/inventory/cycle-counts", permit("inventory", "edit"), route(async (req, res) => {
  try { res.status(201).json(await createCycleCount({ ...req.body, createdBy: res.locals.admin.id })); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Cycle count failed" }); }
}));
router.get("/admin/inventory/cycle-counts", permit("inventory", "view"), route(async (_req, res) => {
  const counts = await db.select().from(inventoryCycleCountsTable).orderBy(desc(inventoryCycleCountsTable.createdAt));
  const lines = await db.select().from(inventoryCycleCountLinesTable);
  res.json(counts.map((count) => ({ ...count, lines: lines.filter((line) => line.cycleCountId === count.id) })));
}));
router.get("/admin/inventory/cycle-counts/:id", permit("inventory", "view"), route(async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(inventoryCycleCountsTable).where(eq(inventoryCycleCountsTable.id, id));
  if (!row) { res.status(404).json({ error: "Cycle count not found" }); return; }
  const lines = await db.select().from(inventoryCycleCountLinesTable).where(eq(inventoryCycleCountLinesTable.cycleCountId, id));
  res.json({ ...row, lines });
}));
router.patch("/admin/inventory/cycle-counts/:id", permit("inventory", "edit"), route(async (req, res) => {
  const id = Number(req.params.id);
  const locationId = Number(req.body?.locationId);
  const lines = Array.isArray(req.body?.lines) ? req.body.lines.map((line: any) => ({
    productId: Number(line?.productId),
    countedQuantity: Number(line?.countedQuantity),
  })) : [];
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(locationId) || locationId < 1 ||
    !lines.length || lines.some((line: { productId: number; countedQuantity: number }) =>
      !Number.isSafeInteger(line.productId) || line.productId < 1 ||
      !Number.isSafeInteger(line.countedQuantity) || line.countedQuantity < 0) ||
    new Set(lines.map((line: { productId: number }) => line.productId)).size !== lines.length) {
    res.status(400).json({ error: "Valid location and unique counted product lines are required" }); return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [countRow] = await tx.select().from(inventoryCycleCountsTable)
        .where(eq(inventoryCycleCountsTable.id, id)).for("update").limit(1);
      if (!countRow) throw Object.assign(new Error("Cycle count not found"), { status: 404 });
      if (!["draft", "review"].includes(countRow.status)) throw Object.assign(new Error("Approved or cancelled cycle counts cannot be edited"), { status: 409 });
      const [location] = await tx.select().from(inventoryLocationsTable)
        .where(and(eq(inventoryLocationsTable.id, locationId), eq(inventoryLocationsTable.active, true))).limit(1);
      if (!location) throw Object.assign(new Error("Inventory location not found"), { status: 400 });
      const products = await tx.select({ id: productsTable.id }).from(productsTable)
        .where(inArray(productsTable.id, lines.map((line: { productId: number }) => line.productId)));
      if (products.length !== lines.length) throw Object.assign(new Error("One or more products were not found"), { status: 400 });
      await tx.delete(inventoryCycleCountLinesTable).where(eq(inventoryCycleCountLinesTable.cycleCountId, id));
      const createdLines = [];
      for (const line of lines) {
        const [balance] = await tx.select().from(inventoryBalancesTable)
          .where(and(eq(inventoryBalancesTable.productId, line.productId), eq(inventoryBalancesTable.locationId, locationId))).limit(1);
        const [created] = await tx.insert(inventoryCycleCountLinesTable).values({
          cycleCountId: id, productId: line.productId,
          expectedQuantity: balance?.available ?? 0, countedQuantity: line.countedQuantity,
          unitCost: balance?.averageCost ?? "0",
        }).returning();
        createdLines.push(created);
      }
      const [updated] = await tx.update(inventoryCycleCountsTable).set({
        locationId,
        status: "draft",
        approvedBy: null,
        approvedAt: null,
      })
        .where(eq(inventoryCycleCountsTable.id, id)).returning();
      return { ...updated, lines: createdLines };
    });
    res.json(result);
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 409;
    res.status(status).json({ error: error instanceof Error ? error.message : "Cycle count update failed" });
  }
}));
router.delete("/admin/inventory/cycle-counts/:id", permit("inventory", "delete"), route(async (req, res) => {
  const id = Number(req.params.id);
  const [deleted] = await db.delete(inventoryCycleCountsTable)
    .where(and(eq(inventoryCycleCountsTable.id, id), inArray(inventoryCycleCountsTable.status, ["draft", "review"]))).returning({ id: inventoryCycleCountsTable.id });
  if (!deleted) { res.status(409).json({ error: "Approved or cancelled cycle counts cannot be deleted" }); return; }
  res.sendStatus(204);
}));
router.post("/admin/inventory/cycle-counts/:id/review", permit("inventory", "edit"), route(async (_req, res) => {
  const [row] = await db.update(inventoryCycleCountsTable).set({ status: "review" }).where(and(eq(inventoryCycleCountsTable.id, Number(_req.params.id)), eq(inventoryCycleCountsTable.status, "draft"))).returning();
  if (!row) { res.status(404).json({ error: "Draft cycle count not found" }); return; }
  const lines = await db.select().from(inventoryCycleCountLinesTable).where(eq(inventoryCycleCountLinesTable.cycleCountId, row.id));
  res.json({ ...row, lines });
}));
router.post("/admin/inventory/cycle-counts/:id/approve", permit("inventory", "edit"), route(async (req, res) => {
  try { res.json(await approveCycleCount(Number(req.params.id), res.locals.admin.id)); }
  catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "Cycle count approval failed" }); }
}));
router.post("/admin/inventory", permit("inventory", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateInventoryProductBody, req.body, res); if (!body) return;
  const [category] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, body.categoryId)).limit(1);
  if (!category) { res.status(400).json({ error: "Category not found" }); return; }
  const [existingProduct] = await db.select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.sku, body.sku.trim()))
    .limit(1);
  if (existingProduct) {
    res.status(409).json({
      error: "A product with this SKU already exists. Open the existing product and record an inventory adjustment.",
      productId: existingProduct.id,
    });
    return;
  }
  // Ensure account lookups used by the opening entry are available before the
  // product transaction begins. The product, operational balance, movement and
  // journal itself are still committed atomically below.
  await ensureStandardAccountingChart();
  const item = await db.transaction(async (tx) => {
    const slugBase = body.sku.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `product-${Date.now()}`;
    const [created] = await tx.insert(productsTable).values({
      nameAr: body.nameAr.trim(), nameEn: body.nameEn.trim(),
      descriptionAr: (body.descriptionAr ?? "").trim(), descriptionEn: (body.descriptionEn ?? "").trim(),
      sku: body.sku.trim(),
      barcode: body.barcode ?? null, operationalType: body.operationalType ?? "finished_good", unitOfMeasure: body.unitOfMeasure ?? "unit", preferredSupplier: body.preferredSupplier ?? null, sellable: body.sellable ?? true,
      slug: `${slugBase}-${randomBytes(3).toString("hex")}`, categoryId: body.categoryId, price: body.price,
      stockQuantity: body.openingQuantity, averageCost: (body.openingUnitCost ?? 0).toFixed(4),
      reorderPoint: body.reorderPoint, targetStockQuantity: body.targetStockQuantity,
    }).returning();
    if (created.stockQuantity > 0) {
      let [defaultLocation] = await tx.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.isDefault, true)).limit(1);
      if (!defaultLocation) {
        [defaultLocation] = await tx.insert(inventoryLocationsTable).values({ name: "Default warehouse", code: "DEFAULT", type: "warehouse", isDefault: true }).returning();
      }
      await tx.insert(inventoryBalancesTable).values({
        productId: created.id,
        locationId: defaultLocation.id,
        available: created.stockQuantity,
        averageCost: created.averageCost,
      });
      await tx.insert(inventoryMovementsTable).values({
        productId: created.id, movementType: "increase", quantityChange: created.stockQuantity,
        quantityBefore: 0, quantityAfter: created.stockQuantity, reason: "Initial stock",
        unitCost: created.averageCost,
        totalCost: (created.stockQuantity * Number(created.averageCost)).toFixed(4),
        sourceType: "product_creation", sourceId: String(created.id), eventKey: `product-creation:${created.id}`,
        performedBy: res.locals.admin.id,
      });
      await postJournalEntry({
        entryDate: new Date().toISOString().slice(0, 10),
        description: `Opening inventory: ${created.nameEn || created.sku}`,
        createdBy: res.locals.admin.id,
        sourceType: "product_creation",
        sourceId: String(created.id),
        lines: [
          { accountCode: "1140", debit: (created.stockQuantity * Number(created.averageCost)).toFixed(4) },
          { accountCode: "3100", credit: (created.stockQuantity * Number(created.averageCost)).toFixed(4) },
        ],
      }, tx);
    }
    return {
      id: created.id, nameAr: created.nameAr, nameEn: created.nameEn, sku: created.sku,
      barcode: created.barcode, operationalType: created.operationalType, unitOfMeasure: created.unitOfMeasure, preferredSupplier: created.preferredSupplier, sellable: created.sellable,
      price: created.price, averageCost: Number(created.averageCost), categoryId: created.categoryId,
      categoryNameAr: category.nameAr, categoryNameEn: category.nameEn, stockQuantity: created.stockQuantity,
      reorderPoint: created.reorderPoint, targetStockQuantity: created.targetStockQuantity,
      stockStatus: created.stockQuantity === 0 ? "out" as const : created.stockQuantity <= created.reorderPoint ? "low" as const : "in_stock" as const,
      inventoryValue: created.stockQuantity * Number(created.averageCost), isActive: created.isActive,
    };
  });
  res.status(201).json(Api.AdminCreateInventoryProductResponse.parse(item));
}));
router.get("/admin/inventory/:id/movements", permit("inventory", "view"), route(async (req, res) => {
  const params = parse(Api.AdminListInventoryMovementsParams, req.params, res); if (!params) return;
  const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, params.id)).limit(1);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  const movements = await db.select({
    id: inventoryMovementsTable.id, productId: inventoryMovementsTable.productId,
    movementType: inventoryMovementsTable.movementType, quantityChange: inventoryMovementsTable.quantityChange,
    quantityBefore: inventoryMovementsTable.quantityBefore, quantityAfter: inventoryMovementsTable.quantityAfter,
    reason: inventoryMovementsTable.reason, sourceType: inventoryMovementsTable.sourceType,
    sourceId: inventoryMovementsTable.sourceId, performedBy: inventoryMovementsTable.performedBy,
    performerName: adminUsersTable.name, createdAt: inventoryMovementsTable.createdAt,
  }).from(inventoryMovementsTable)
    .leftJoin(adminUsersTable, eq(inventoryMovementsTable.performedBy, adminUsersTable.id))
    .where(eq(inventoryMovementsTable.productId, params.id))
    .orderBy(sql`${inventoryMovementsTable.createdAt} desc`, sql`${inventoryMovementsTable.id} desc`);
  res.json(Api.AdminListInventoryMovementsResponse.parse(movements));
}));

async function adjustInventory(productId: number, input: {
  operation: "increase" | "decrease" | "adjustment"; quantity: number; unitCost?: number; reason: string; idempotencyKey: string;
}, performedBy: number) {
  return db.transaction(async (tx) => {
    const eventKey = `manual-inventory:${productId}:${input.idempotencyKey}`;
    await tx.execute(sql`select id from ${productsTable} where ${productsTable.id} = ${productId} for update`);
    const [existing] = await tx.select().from(inventoryMovementsTable).where(eq(inventoryMovementsTable.eventKey, eventKey)).limit(1);
    if (existing) {
      const [item] = await tx.select({
        id: productsTable.id, nameAr: productsTable.nameAr, nameEn: productsTable.nameEn, sku: productsTable.sku,
        barcode: productsTable.barcode, operationalType: productsTable.operationalType,
        unitOfMeasure: productsTable.unitOfMeasure, preferredSupplier: productsTable.preferredSupplier,
        sellable: productsTable.sellable,
        price: productsTable.price, averageCost: productsTable.averageCost, categoryId: productsTable.categoryId,
        categoryNameAr: categoriesTable.nameAr, categoryNameEn: categoriesTable.nameEn, stockQuantity: productsTable.stockQuantity,
        reorderPoint: productsTable.reorderPoint, targetStockQuantity: productsTable.targetStockQuantity, isActive: productsTable.isActive,
      }).from(productsTable).innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
        .where(eq(productsTable.id, productId)).limit(1);
      if (!item) return null;
      return { item: { ...item, averageCost: Number(item.averageCost), inventoryValue: item.stockQuantity * Number(item.averageCost),
        stockStatus: item.stockQuantity === 0 ? "out" as const : item.stockQuantity <= item.reorderPoint ? "low" as const : "in_stock" as const },
        movement: { ...existing, performerName: null } };
    }
    const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    if (!product) return null;
    const quantityBefore = product.stockQuantity;
    const stockQuantity = input.operation === "increase" ? quantityBefore + input.quantity
      : input.operation === "decrease" ? quantityBefore - input.quantity : input.quantity;
    if (stockQuantity < 0) throw new Error("Inventory operation cannot produce negative stock");
    const quantityChange = stockQuantity - quantityBefore;
    const currentAverageCost = Number(product.averageCost);
    const nextAverageCost = input.unitCost == null || input.operation === "decrease"
      ? currentAverageCost
      : input.operation === "increase" && stockQuantity > 0
        ? ((quantityBefore * currentAverageCost) + (input.quantity * input.unitCost)) / stockQuantity
        : input.unitCost;
    const averageCost = nextAverageCost.toFixed(4);
    let [defaultLocation] = await tx.select().from(inventoryLocationsTable).where(eq(inventoryLocationsTable.isDefault, true)).limit(1);
    if (!defaultLocation) {
      [defaultLocation] = await tx.insert(inventoryLocationsTable).values({ name: "Default warehouse", code: "DEFAULT", type: "warehouse", isDefault: true }).returning();
    }
    const [defaultBalance] = await tx.select().from(inventoryBalancesTable)
      .where(and(eq(inventoryBalancesTable.productId, productId), eq(inventoryBalancesTable.locationId, defaultLocation.id))).for("update");
    const locationQuantity = (defaultBalance?.available ?? 0) + quantityChange;
    if (locationQuantity < 0) throw new Error("Default location cannot produce negative stock");
    if (defaultBalance) {
      await tx.update(inventoryBalancesTable).set({ available: locationQuantity, averageCost, updatedAt: new Date() }).where(eq(inventoryBalancesTable.id, defaultBalance.id));
    } else {
      await tx.insert(inventoryBalancesTable).values({ productId, locationId: defaultLocation.id, available: locationQuantity, averageCost });
    }
    const movementType = input.operation;
    const [updated] = await tx.update(productsTable).set({ stockQuantity, averageCost }).where(eq(productsTable.id, productId)).returning({
      id: productsTable.id, nameAr: productsTable.nameAr, nameEn: productsTable.nameEn,
      sku: productsTable.sku, barcode: productsTable.barcode, operationalType: productsTable.operationalType,
      unitOfMeasure: productsTable.unitOfMeasure, preferredSupplier: productsTable.preferredSupplier,
      sellable: productsTable.sellable, price: productsTable.price, averageCost: productsTable.averageCost,
      categoryId: productsTable.categoryId, stockQuantity: productsTable.stockQuantity,
      reorderPoint: productsTable.reorderPoint, targetStockQuantity: productsTable.targetStockQuantity, isActive: productsTable.isActive,
    });
    const [movement] = await tx.insert(inventoryMovementsTable).values({
      productId,
      movementType,
      quantityChange,
      quantityBefore,
      quantityAfter: stockQuantity,
      reason: input.reason,
      unitCost: input.unitCost == null ? currentAverageCost.toFixed(4) : input.unitCost.toFixed(4),
      totalCost: (Math.abs(quantityChange) * (input.unitCost ?? currentAverageCost)).toFixed(4),
      sourceType: "manual_adjustment", sourceId: String(productId), eventKey,
      performedBy,
    }).returning();
    const [category] = await tx.select().from(categoriesTable).where(eq(categoriesTable.id, updated.categoryId)).limit(1);
    return { item: { ...updated, averageCost: Number(updated.averageCost), categoryNameAr: category.nameAr, categoryNameEn: category.nameEn,
      inventoryValue: updated.stockQuantity * Number(updated.averageCost),
      stockStatus: updated.stockQuantity === 0 ? "out" as const : updated.stockQuantity <= updated.reorderPoint ? "low" as const : "in_stock" as const },
      movement: { ...movement, performerName: null } };
  });
}

async function handleInventoryAdjustment(
  params: { id: number },
  body: { operation: "increase" | "decrease" | "adjustment"; quantity: number; unitCost?: number; reason: string; idempotencyKey: string },
  res: Response,
  response: { parse(value: unknown): unknown },
) {
  const reason = body.reason.trim();
  if (!reason) { res.status(400).json({ error: "Adjustment reason is required" }); return; }
  let result;
  try { result = await adjustInventory(params.id, { ...body, reason }, res.locals.admin.id); }
  catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "Inventory adjustment failed" }); return; }
  if (!result) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(response.parse(result));
}

router.post("/admin/inventory/:id/adjust", permit("inventory", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminAdjustInventoryParams, req.params, res);
  const body = parse(Api.AdminAdjustInventoryBody, req.body, res); if (!params || !body) return;
  await handleInventoryAdjustment(params, body, res, Api.AdminAdjustInventoryResponse);
}));
router.patch("/admin/inventory/:id", permit("inventory", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateInventoryParams, req.params, res);
  const body = parse(Api.AdminUpdateInventoryBody, req.body, res); if (!params || !body) return;
  await handleInventoryAdjustment(params, body, res, Api.AdminUpdateInventoryResponse);
}));

router.get("/admin/distributors", permit("distributors", "view"), route(async (req, res) => {
  const query = parse(Api.AdminListDistributorsQueryParams, req.query, res); if (!query) return;
  let rows = await db.select().from(wholesaleDistributorsTable).orderBy(wholesaleDistributorsTable.id);
  rows = statusFilter(searchFilter(rows, query.search, ["companyName", "contactName", "email", "phone", "city", "taxNumber", "commercialRegistrationNumber"]), query.status);
  res.json(Api.AdminListDistributorsResponse.parse(rows));
}));
router.post("/admin/distributors", permit("distributors", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateDistributorBody, req.body, res); if (!body) return;
  const [row] = await db.insert(wholesaleDistributorsTable).values(body).returning();
  res.status(201).json(Api.AdminCreateDistributorResponse.parse(row));
}));
router.patch("/admin/distributors/:id", permit("distributors", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateDistributorParams, req.params, res);
  const body = parse(Api.AdminUpdateDistributorBody.partial(), req.body, res); if (!params || !body) return;
  const [row] = await db.update(wholesaleDistributorsTable).set(body).where(eq(wholesaleDistributorsTable.id, params.id)).returning();
  if (!row) { res.status(404).json({ error: "Distributor not found" }); return; }
  res.json(Api.AdminUpdateDistributorResponse.parse(row));
}));
router.delete("/admin/distributors/:id", permit("distributors", "delete"), route(async (req, res) => {
  const params = parse(Api.AdminDisableDistributorParams, req.params, res); if (!params) return;
  await db.update(wholesaleDistributorsTable).set({ isActive: false }).where(eq(wholesaleDistributorsTable.id, params.id)); res.sendStatus(204);
}));

router.get("/admin/hr/employees", permit("hr", "view"), route(async (req, res) => {
  const query = parse(Api.AdminListEmployeesQueryParams, req.query, res); if (!query) return;
  let rows = await db.select().from(employeesTable).orderBy(employeesTable.id);
  rows = statusFilter(searchFilter(rows, query.search, ["name", "nationalId", "phone", "email", "position", "department"]), query.status);
  parsedJson(Api.AdminListEmployeesResponse, rows, res);
}));
router.post("/admin/hr/employees", permit("hr", "edit"), route(async (req, res) => {
  const rawSalary = req.body?.salary;
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "salary") &&
      (typeof rawSalary !== "number" || !Number.isFinite(rawSalary) || rawSalary <= 0)) {
    res.status(400).json({ error: "Employee salary must be greater than zero" }); return;
  }
  const body = parse(Api.AdminCreateEmployeeBody, req.body, res); if (!body) return;
  if (!Number.isFinite(body.salary) || body.salary <= 0) {
    res.status(400).json({ error: "Employee salary must be greater than zero" }); return;
  }
  if (body.adminUserId != null) {
    const [admin] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).where(eq(adminUsersTable.id, body.adminUserId)).limit(1);
    if (!admin) { res.status(400).json({ error: "Admin user not found" }); return; }
  }
  const [row] = await db.insert(employeesTable).values({ ...body, hireDate: isoDate(body.hireDate) }).returning();
  parsedJson(Api.AdminCreateEmployeeResponse, row, res, 201);
}));
router.patch("/admin/hr/employees/:id", permit("hr", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateEmployeeParams, req.params, res);
  const rawSalary = req.body?.salary;
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "salary") &&
      (typeof rawSalary !== "number" || !Number.isFinite(rawSalary) || rawSalary <= 0)) {
    res.status(400).json({ error: "Employee salary must be greater than zero" }); return;
  }
  const body = parse(Api.AdminUpdateEmployeeBody.partial(), req.body, res); if (!params || !body) return;
  if (body.salary !== undefined && (!Number.isFinite(body.salary) || body.salary <= 0)) {
    res.status(400).json({ error: "Employee salary must be greater than zero" }); return;
  }
  if (body.adminUserId != null) {
    const [admin] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).where(eq(adminUsersTable.id, body.adminUserId)).limit(1);
    if (!admin) { res.status(400).json({ error: "Admin user not found" }); return; }
  }
  const { hireDate, ...employeeValues } = body;
  const values = { ...employeeValues, ...(hireDate ? { hireDate: isoDate(hireDate) } : {}) };
  const [row] = await db.update(employeesTable).set(values).where(eq(employeesTable.id, params.id)).returning();
  if (!row) { res.status(404).json({ error: "Employee not found" }); return; }
  parsedJson(Api.AdminUpdateEmployeeResponse, row, res);
}));
router.delete("/admin/hr/employees/:id", permit("hr", "delete"), route(async (req, res) => {
  const params = parse(Api.AdminDisableEmployeeParams, req.params, res); if (!params) return;
  const [row] = await db.update(employeesTable).set({ isActive: false }).where(eq(employeesTable.id, params.id)).returning({ id: employeesTable.id });
  if (!row) { res.status(404).json({ error: "Employee not found" }); return; }
  res.sendStatus(204);
}));

router.get("/admin/hr/attendance", permit("hr", "view"), route(async (_req, res) => {
  const rows = await db.select().from(attendanceRecordsTable).orderBy(sql`${attendanceRecordsTable.date} desc`, attendanceRecordsTable.id);
  parsedJson(Api.AdminListAttendanceResponse, rows, res);
}));
router.post("/admin/hr/attendance", permit("hr", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateAttendanceBody, req.body, res); if (!body) return;
  if (body.checkInTime != null && body.checkOutTime != null) {
    const toSeconds = (value: string) => {
      const parts = value.split(":").map(Number);
      return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
    };
    if (toSeconds(body.checkOutTime) <= toSeconds(body.checkInTime)) {
      res.status(400).json({ error: "Check-out time must be later than check-in time" }); return;
    }
  }
  const [employee] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.id, body.employeeId)).limit(1);
  if (!employee) { res.status(400).json({ error: "Employee not found" }); return; }
  const [duplicate] = await db.select({ id: attendanceRecordsTable.id }).from(attendanceRecordsTable)
    .where(and(eq(attendanceRecordsTable.employeeId, body.employeeId), eq(attendanceRecordsTable.date, isoDate(body.date)))).limit(1);
  if (duplicate) { res.status(409).json({ error: "Attendance already exists for employee and date" }); return; }
  const [row] = await db.insert(attendanceRecordsTable).values({ ...body, date: isoDate(body.date) }).returning();
  parsedJson(Api.AdminCreateAttendanceResponse, row, res, 201);
}));

router.get("/admin/hr/leave-requests", permit("hr", "view"), route(async (_req, res) => {
  const rows = await db.select().from(leaveRequestsTable).orderBy(sql`${leaveRequestsTable.startDate} desc`, leaveRequestsTable.id);
  parsedJson(Api.AdminListLeaveRequestsResponse, rows, res);
}));
router.post("/admin/hr/leave-requests", permit("hr", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateLeaveRequestBody, req.body, res); if (!body) return;
  if (!validDateRange(body.startDate, body.endDate)) { res.status(400).json({ error: "Leave end date cannot precede start date" }); return; }
  const [employee] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.id, body.employeeId)).limit(1);
  if (!employee) { res.status(400).json({ error: "Employee not found" }); return; }
  const approvedBy = body.status === "pending" ? null : res.locals.admin.id;
  const [row] = await db.insert(leaveRequestsTable).values({
    ...body, startDate: isoDate(body.startDate), endDate: isoDate(body.endDate), approvedBy,
  }).returning();
  parsedJson(Api.AdminCreateLeaveRequestResponse, row, res, 201);
}));
router.patch("/admin/hr/leave-requests/:id", permit("hr", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateLeaveRequestParams, req.params, res);
  const body = parse(Api.AdminUpdateLeaveRequestBody, req.body, res); if (!params || !body) return;
  const [existing] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, params.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Leave request not found" }); return; }
  const startDate = body.startDate ? isoDate(body.startDate) : existing.startDate;
  const endDate = body.endDate ? isoDate(body.endDate) : existing.endDate;
  if (!validDateRange(startDate, endDate)) { res.status(400).json({ error: "Leave end date cannot precede start date" }); return; }
  if (body.employeeId !== undefined) {
    const [employee] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.id, body.employeeId)).limit(1);
    if (!employee) { res.status(400).json({ error: "Employee not found" }); return; }
  }
  const status = body.status ?? existing.status;
  const [row] = await db.update(leaveRequestsTable).set({
    ...body, startDate, endDate, approvedBy: status === "pending" ? null : res.locals.admin.id,
  }).where(eq(leaveRequestsTable.id, params.id)).returning();
  parsedJson(Api.AdminUpdateLeaveRequestResponse, row, res);
}));

router.get("/admin/hr/payroll", permit("hr", "view"), route(async (_req, res) => {
  const rows = await db.select().from(payrollRecordsTable).orderBy(sql`${payrollRecordsTable.year} desc`, sql`${payrollRecordsTable.month} desc`);
  parsedJson(Api.AdminListPayrollResponse, rows, res);
}));
router.post("/admin/hr/payroll", permit("hr", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreatePayrollBody, req.body, res); if (!body) return;
  if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12) {
    res.status(400).json({ error: "Payroll month must be an integer between 1 and 12" }); return;
  }
  if (!Number.isInteger(body.year) || body.year < 1900 || body.year > 2200) {
    res.status(400).json({ error: "Payroll year must be a reasonable integer between 1900 and 2200" }); return;
  }
  if (![body.baseSalary, body.bonuses, body.deductions].every(Number.isFinite) ||
      body.baseSalary < 0 || body.bonuses < 0 || body.deductions < 0) {
    res.status(400).json({ error: "Payroll amounts must be finite and non-negative" }); return;
  }
  const [employee] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.id, body.employeeId)).limit(1);
  if (!employee) { res.status(400).json({ error: "Employee not found" }); return; }
  const netSalary = body.baseSalary + body.bonuses - body.deductions;
  if (netSalary < 0) { res.status(400).json({ error: "Computed net salary cannot be negative" }); return; }
  const row = await createPayrollWithJournal({
    ...body, paymentDate: body.paymentDate ? isoDate(body.paymentDate) : null, netSalary,
  }, res.locals.admin.id);
  parsedJson(Api.AdminCreatePayrollResponse, row, res, 201);
}));

router.get("/admin/finance/expenses", permit("finance", "view"), route(async (_req, res) => {
  const rows = await db.select().from(expensesTable).orderBy(sql`${expensesTable.expenseDate} desc`, expensesTable.id);
  parsedJson(Api.AdminListExpensesResponse, rows, res);
}));
router.post("/admin/finance/expenses", permit("finance", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateExpenseBody, req.body, res); if (!body) return;
  const row = await createExpenseWithJournal(
    { ...body, expenseDate: isoDate(body.expenseDate), createdBy: res.locals.admin.id },
    req.header("idempotency-key"),
  );
  parsedJson(Api.AdminCreateExpenseResponse, row, res, 201);
}));
router.get("/admin/finance/expenses/:id", permit("finance", "view"), route(async (req, res) => {
  const params = parse(Api.AdminGetExpenseParams, req.params, res); if (!params) return;
  const [row] = await db.select().from(expensesTable).where(eq(expensesTable.id, params.id)).limit(1);
  if (!row) { res.status(404).json({ error: "Expense not found" }); return; }
  parsedJson(Api.AdminGetExpenseResponse, row, res);
}));
router.patch("/admin/finance/expenses/:id", permit("finance", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateExpenseParams, req.params, res);
  const body = parse(Api.AdminUpdateExpenseBody.partial(), req.body, res); if (!params || !body) return;
  const [posted] = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(and(
    eq(journalEntriesTable.sourceType, "expense"), eq(journalEntriesTable.sourceId, String(params.id)),
  )).limit(1);
  if (posted) { res.status(409).json({ error: "A posted expense is immutable; reverse its journal entry instead" }); return; }
  const { expenseDate, ...expenseValues } = body;
  const values = { ...expenseValues, ...(expenseDate ? { expenseDate: isoDate(expenseDate) } : {}) };
  const [row] = await db.update(expensesTable).set(values).where(eq(expensesTable.id, params.id)).returning();
  if (!row) { res.status(404).json({ error: "Expense not found" }); return; }
  parsedJson(Api.AdminUpdateExpenseResponse, row, res);
}));
router.delete("/admin/finance/expenses/:id", permit("finance", "delete"), route(async (req, res) => {
  const params = parse(Api.AdminDeleteExpenseParams, req.params, res); if (!params) return;
  const [posted] = await db.select({ id: journalEntriesTable.id }).from(journalEntriesTable).where(and(
    eq(journalEntriesTable.sourceType, "expense"), eq(journalEntriesTable.sourceId, String(params.id)),
  )).limit(1);
  if (posted) { res.status(409).json({ error: "A posted expense cannot be deleted; reverse its journal entry instead" }); return; }
  const [row] = await db.delete(expensesTable).where(eq(expensesTable.id, params.id)).returning({ id: expensesTable.id });
  if (!row) { res.status(404).json({ error: "Expense not found" }); return; }
  res.sendStatus(204);
}));

const purchaseMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
router.post("/admin/finance/purchases/invoice-upload", permit("finance", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminRequestPurchaseInvoiceUploadBody, req.body, res); if (!body) return;
  if (!purchaseMimeTypes.has(body.contentType) || body.size <= 0 || body.size > 10 * 1024 * 1024) {
    res.status(400).json({ error: "Invoice must be PDF or image and 10 MB or smaller" }); return;
  }
  const upload = await objectStorage.createPrivateUpload("purchases");
  parsedJson(Api.AdminRequestPurchaseInvoiceUploadResponse, upload, res);
}));
router.get("/admin/finance/purchases", permit("finance", "view"), route(async (req, res) => {
  const rows = await db.select().from(purchasesTable).orderBy(sql`${purchasesTable.purchaseDate} desc`, purchasesTable.id);
  parsedJson(Api.AdminListPurchasesResponse, rows, res);
}));
router.post("/admin/finance/purchases", permit("finance", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreatePurchaseBody, req.body, res); if (!body) return;
  if (body.invoiceObjectPath && (!body.invoiceObjectPath.startsWith("/objects/purchases/") || body.invoiceObjectPath.includes(".."))) {
    res.status(400).json({ error: "Invoice must use a private purchases object path" }); return;
  }
  const invoiceFields = [body.invoiceObjectPath, body.invoiceContentType, body.invoiceSize];
  if (invoiceFields.some((value) => value != null) && invoiceFields.some((value) => value == null)) {
    res.status(400).json({ error: "Invoice path, content type, and size must be supplied together" }); return;
  }
  if (body.invoiceObjectPath) {
    if (!purchaseMimeTypes.has(body.invoiceContentType!)) {
      res.status(400).json({ error: "Unsupported invoice type" }); return;
    }
    if (body.invoiceSize! <= 0 || body.invoiceSize! > 10 * 1024 * 1024) {
      res.status(400).json({ error: "Invoice must be between 1 byte and 10 MB" }); return;
    }
    try {
      const metadata = await objectStorage.getObjectMetadata(body.invoiceObjectPath);
      if (!purchaseMimeTypes.has(metadata.contentType ?? "") || metadata.contentType !== body.invoiceContentType ||
        metadata.size !== body.invoiceSize) {
        res.status(400).json({ error: "Invoice metadata does not match the uploaded object" }); return;
      }
    } catch {
      res.status(400).json({ error: "Invoice object was not found" }); return;
    }
  }
  const row = await createPurchaseWithJournal({
    ...body, amount: String(body.amount), purchaseDate: body.purchaseDate ? isoDate(body.purchaseDate) : utcDateString(new Date()), createdBy: res.locals.admin.id,
  }, req.header("idempotency-key"));
  parsedJson(Api.AdminCreatePurchaseResponse, row, res, 201);
}));
router.post("/admin/finance/purchase-receipts", permit("finance", "edit"), route(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (typeof body.receiptNumber !== "string" || typeof body.vendorName !== "string" ||
    typeof body.receiptDate !== "string" || !lines.length) {
    res.status(400).json({ error: "Receipt number, vendor, date, and at least one line are required" }); return;
  }
  try {
    const receipt = await createPurchaseReceipt({
      receiptNumber: body.receiptNumber, vendorName: body.vendorName, vendorReference: body.vendorReference == null ? null : String(body.vendorReference),
      purchaseId: body.purchaseId == null ? null : Number(body.purchaseId), receiptDate: isoDate(body.receiptDate),
      paymentStatus: body.paymentStatus as "unpaid" | "paid" | "partial" | undefined,
      paymentSource: body.paymentSource as "company_account" | "owner_account" | undefined,
      paidAmount: body.paidAmount == null ? undefined : body.paidAmount as string | number,
      paymentReference: body.paymentReference == null ? null : String(body.paymentReference),
      createdBy: res.locals.admin.id,
      lines: lines.map((value) => {
        const line = value as Record<string, unknown>;
        const productId = Number(line.productId); const quantity = Number(line.quantity);
        if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1 ||
          (typeof line.unitCost !== "number" && typeof line.unitCost !== "string")) throw new Error("Each receipt line needs a product, positive quantity, and unit cost");
        return { productId, quantity, unitCost: line.unitCost as string | number };
      }),
    });
    res.status(201).json(receipt);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid purchase receipt" }); }
}));
router.get("/admin/finance/purchase-receipts", permit("finance", "view"), route(async (_req, res) => {
  res.json(await db.select().from(purchaseReceiptsTable).orderBy(desc(purchaseReceiptsTable.receiptDate)));
}));
router.post("/admin/finance/purchase-receipts/:id/payments", permit("finance", "edit"), route(async (req, res) => {
  const receiptId = Number(req.params.id);
  const body = req.body as Record<string, unknown>;
  const paymentKey = typeof body.paymentKey === "string" && body.paymentKey.trim()
    ? body.paymentKey.trim() : req.header("idempotency-key");
  if (!Number.isSafeInteger(receiptId) || receiptId < 1 || !paymentKey ||
    typeof body.paymentDate !== "string" || typeof body.amount !== "number" && typeof body.amount !== "string" ||
    body.paymentSource !== "company_account" && body.paymentSource !== "owner_account") {
    res.status(400).json({ error: "Receipt id, payment key, date, positive amount, and payment source are required" }); return;
  }
  try {
    res.status(201).json(await createPurchaseReceiptPayment({
      receiptId, paymentKey, paymentDate: isoDate(body.paymentDate), amount: body.amount as string | number,
      paymentSource: body.paymentSource, paymentReference: body.paymentReference == null ? null : String(body.paymentReference),
      createdBy: res.locals.admin.id,
    }));
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "Purchase receipt payment failed" }); }
}));
router.post("/admin/finance/purchase-receipts/:id/post", permit("finance", "edit"), route(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Invalid receipt id" }); return; }
  try { res.json(await postPurchaseReceipt(id, res.locals.admin.id)); }
  catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "Purchase receipt posting failed" }); }
}));
router.get("/admin/finance/purchases/:id", permit("finance", "view"), route(async (req, res) => {
  const params = parse(Api.AdminGetPurchaseParams, req.params, res); if (!params) return;
  const [row] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, params.id)).limit(1);
  if (!row) { res.status(404).json({ error: "Purchase not found" }); return; }
  parsedJson(Api.AdminGetPurchaseResponse, row, res);
}));
router.get("/admin/finance/purchases/:id/invoice", permit("finance", "view"), route(async (req, res) => {
  const params = parse(Api.AdminGetPurchaseParams, req.params, res); if (!params) return;
  const [row] = await db.select({ path: purchasesTable.invoiceObjectPath, title: purchasesTable.title })
    .from(purchasesTable).where(eq(purchasesTable.id, params.id)).limit(1);
  if (!row) { res.status(404).json({ error: "Purchase not found" }); return; }
  if (!row.path) { res.status(404).json({ error: "This purchase has no invoice" }); return; }
  const file = await objectStorage.getObjectFile(row.path);
  const safeName = row.title.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "purchase-invoice";
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.invoice"`);
  await objectStorage.pipeObject(file, res);
}));
router.post("/admin/finance/purchases/:id/archive", permit("finance", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminArchivePurchaseParams, req.params, res); if (!params) return;
  const [row] = await db.update(purchasesTable).set({ archivedAt: new Date() })
    .where(eq(purchasesTable.id, params.id)).returning();
  if (!row) { res.status(404).json({ error: "Purchase not found" }); return; }
  parsedJson(Api.AdminArchivePurchaseResponse, row, res);
}));

function utcDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}
function nextUtcDate(dateString: string) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
async function financeMetrics(from: string, to: string) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const endExclusive = nextUtcDate(to);
  const [[orders], [expenses]] = await Promise.all([
    db.select({ revenue: sum(ordersTable.total), orderCount: count() }).from(ordersTable)
      .where(and(eq(ordersTable.paymentStatus, "paid"), sql`${ordersTable.status} <> 'cancelled'`, gte(ordersTable.createdAt, start), lt(ordersTable.createdAt, endExclusive))),
    db.select({ value: sum(expensesTable.amount) }).from(expensesTable)
      .where(and(gte(expensesTable.expenseDate, from), lte(expensesTable.expenseDate, to))),
  ]);
  const revenue = Number(orders.revenue ?? 0);
  const expenseTotal = Number(expenses.value ?? 0);
  const paidOrderCount = orders.orderCount;
  return { from, to, revenue, expenses: expenseTotal, netProfit: revenue - expenseTotal, paidOrderCount, averageOrderValue: paidOrderCount ? revenue / paidOrderCount : 0 };
}
router.get("/admin/finance/reports/summary", permit("finance", "view"), route(async (req, res) => {
  const query = parse(Api.AdminGetFinanceSummaryQueryParams, {
    from: typeof req.query.from === "string" ? new Date(`${req.query.from}T00:00:00.000Z`) : req.query.from,
    to: typeof req.query.to === "string" ? new Date(`${req.query.to}T00:00:00.000Z`) : req.query.to,
  }, res); if (!query) return;
  const from = isoDate(query.from); const to = isoDate(query.to);
  if (from > to) { res.status(400).json({ error: "from cannot be after to" }); return; }
  const result = await financeMetrics(from, to);
  parsedJson(Api.AdminGetFinanceSummaryResponse, result, res);
}));
router.get("/admin/finance/reports/monthly", permit("finance", "view"), route(async (_req, res) => {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const months = Array.from({ length: 12 }, (_, index) => {
    const start = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + index, 1));
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const end = new Date(next); end.setUTCDate(0);
    return { month: utcDateString(start).slice(0, 7), from: utcDateString(start), to: utcDateString(end) };
  });
  const rows = await Promise.all(months.map(async (month) => ({ ...await financeMetrics(month.from, month.to), month: month.month })));
  parsedJson(Api.AdminGetFinanceMonthlyResponse, rows, res);
}));

router.get("/admin/accounting/accounts", permit("accounting", "view"), route(async (_req, res) => {
  await ensureStandardAccountingChart();
  const rows = await db.select().from(accountingAccountsTable).orderBy(accountingAccountsTable.code);
  parsedJson(Api.AdminListAccountingAccountsResponse, rows, res);
}));

router.get("/admin/accounting/journal-entries", permit("accounting", "view"), route(async (req, res) => {
  const query = parse(Api.AdminListJournalEntriesQueryParams, {
    from: typeof req.query.from === "string" ? new Date(`${req.query.from}T00:00:00.000Z`) : req.query.from,
    to: typeof req.query.to === "string" ? new Date(`${req.query.to}T00:00:00.000Z`) : req.query.to,
  }, res); if (!query) return;
  const from = query.from ? isoDate(query.from) : undefined;
  const to = query.to ? isoDate(query.to) : undefined;
  if (from && to && from > to) { res.status(400).json({ error: "from cannot be after to" }); return; }
  const conditions = [
    inArray(journalEntriesTable.status, ["posted", "reversed"]),
    from ? gte(journalEntriesTable.entryDate, from) : undefined,
    to ? lte(journalEntriesTable.entryDate, to) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition != null);
  const entries = await db.select().from(journalEntriesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(journalEntriesTable.entryDate), desc(journalEntriesTable.id));
  if (!entries.length) {
    parsedJson(Api.AdminListJournalEntriesResponse, [], res);
    return;
  }
  const entryIds = entries.map((entry) => entry.id);
  const actorIds = [...new Set(entries.flatMap((entry) => [entry.createdBy, entry.postedBy]).filter((id): id is number => id != null))];
  const [lines, actors] = await Promise.all([
    db.select().from(journalEntryLinesTable)
      .where(inArray(journalEntryLinesTable.journalEntryId, entryIds))
      .orderBy(journalEntryLinesTable.journalEntryId, journalEntryLinesTable.lineNumber),
    db.select({ id: adminUsersTable.id, name: adminUsersTable.name, email: adminUsersTable.email })
      .from(adminUsersTable).where(inArray(adminUsersTable.id, actorIds)),
  ]);
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  const result = entries.map((entry) => ({
    ...entry,
    lines: lines.filter((line) => line.journalEntryId === entry.id),
    creator: actorById.get(entry.createdBy),
    poster: entry.postedBy == null ? undefined : actorById.get(entry.postedBy),
  }));
  parsedJson(Api.AdminListJournalEntriesResponse, result, res);
}));

router.post("/admin/accounting/journal-entries", permit("accounting", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateJournalEntryBody, req.body, res); if (!body) return;
  const accounts = await db.select({ id: accountingAccountsTable.id, code: accountingAccountsTable.code })
    .from(accountingAccountsTable).where(inArray(accountingAccountsTable.id, body.lines.map((line) => line.accountId)));
  const accountCodes = new Map(accounts.map((account) => [account.id, account.code]));
  if (accountCodes.size !== new Set(body.lines.map((line) => line.accountId)).size) {
    res.status(400).json({ error: "One or more accounting accounts were not found" }); return;
  }
  const entry = await postJournalEntry({
    entryDate: isoDate(body.entryDate),
    description: body.description,
    createdBy: res.locals.admin.id,
    lines: body.lines.map((line) => ({
      accountCode: accountCodes.get(line.accountId)!,
      debit: line.debit,
      credit: line.credit,
      description: line.description ?? undefined,
    })),
  });
  parsedJson(Api.AdminCreateJournalEntryResponse, entry, res, 201);
}));

router.post(
  "/admin/accounting/journal-entries/:id/reverse",
  permit("accounting", "edit"),
  route(async (req, res) => {
  const params = parse(Api.AdminReverseJournalEntryParams, req.params, res);
  const body = parse(Api.AdminReverseJournalEntryBody, req.body, res); if (!params || !body) return;
  const entry = await reverseJournalEntry(params.id, res.locals.admin.id, body.description, isoDate(body.entryDate));
  parsedJson(Api.AdminReverseJournalEntryResponse, entry, res, 201);
}));

router.get("/admin/accounting/trial-balance", permit("accounting", "view"), route(async (req, res) => {
  const asOf = typeof req.query.as_of === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.as_of)
    ? req.query.as_of
    : null;
  if (!asOf) { res.status(400).json({ error: "as_of is required and must be a date" }); return; }
  const balance = await trialBalance(undefined, asOf);
  parsedJson(Api.AdminGetTrialBalanceResponse, {
    asOf,
    accounts: balance.accounts,
    totalDebit: balance.totals.debit,
    totalCredit: balance.totals.credit,
    isBalanced: balance.totals.difference === "0.0000",
  }, res);
}));

router.get("/admin/manufacturing/batches", permit("manufacturing", "view"), route(async (_req, res) => {
  const rows = await db.select().from(manufacturingBatchesTable).orderBy(sql`${manufacturingBatchesTable.productionDate} desc`, manufacturingBatchesTable.id);
  parsedJson(Api.AdminListManufacturingBatchesResponse, rows, res);
}));
router.post("/admin/manufacturing/batches", permit("manufacturing", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateManufacturingBatchBody, req.body, res); if (!body) return;
  if (body.status === "approved") { res.status(400).json({ error: "Create the batch, add explicit inputs, then approve it" }); return; }
  if (body.expiryDate && !validDateRange(body.productionDate, body.expiryDate)) { res.status(400).json({ error: "Expiry date cannot precede production date" }); return; }
  const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, body.productId)).limit(1);
  if (!product) { res.status(400).json({ error: "Product not found" }); return; }
  const [row] = await db.insert(manufacturingBatchesTable).values({
    ...body, productionDate: isoDate(body.productionDate), expiryDate: body.expiryDate ? isoDate(body.expiryDate) : null,
  }).returning();
  parsedJson(Api.AdminCreateManufacturingBatchResponse, row, res, 201);
}));
router.get("/admin/manufacturing/batches/:id", permit("manufacturing", "view"), route(async (req, res) => {
  const params = parse(Api.AdminGetManufacturingBatchParams, req.params, res); if (!params) return;
  const [row] = await db.select().from(manufacturingBatchesTable).where(eq(manufacturingBatchesTable.id, params.id)).limit(1);
  if (!row) { res.status(404).json({ error: "Manufacturing batch not found" }); return; }
  parsedJson(Api.AdminGetManufacturingBatchResponse, row, res);
}));
router.post("/admin/manufacturing/batches/:id/inputs", permit("manufacturing", "edit"), route(async (req, res) => {
  const batchId = Number(req.params.id);
  const input: unknown[] = Array.isArray(req.body?.lines) ? req.body.lines : [];
  if (!Number.isSafeInteger(batchId) || batchId < 1 || !input.length) { res.status(400).json({ error: "Batch id and input lines are required" }); return; }
  try {
    const lines = input.map((value) => {
      const line = value as Record<string, unknown>;
      const materialProductId = Number(line.materialProductId); const quantity = Number(line.quantity);
      if (!Number.isSafeInteger(materialProductId) || materialProductId < 1 || !Number.isSafeInteger(quantity) || quantity < 1) {
        throw new Error("Each material input needs a product and positive quantity");
      }
      return { materialProductId, quantity };
    });
    res.status(201).json(await addManufacturingInputs(batchId, lines));
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid manufacturing inputs" }); }
}));
router.patch("/admin/manufacturing/batches/:id", permit("manufacturing", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateManufacturingBatchParams, req.params, res);
  const body = parse(Api.AdminUpdateManufacturingBatchBody.partial(), req.body, res); if (!params || !body) return;
  const [existing] = await db.select().from(manufacturingBatchesTable).where(eq(manufacturingBatchesTable.id, params.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Manufacturing batch not found" }); return; }
  if (existing.status === "approved") { res.status(409).json({ error: "Approved manufacturing batches are immutable" }); return; }
  const productionDate = body.productionDate ? isoDate(body.productionDate) : existing.productionDate;
  const expiryDate = body.expiryDate === null ? null : body.expiryDate ? isoDate(body.expiryDate) : existing.expiryDate;
  if (expiryDate && !validDateRange(productionDate, expiryDate)) { res.status(400).json({ error: "Expiry date cannot precede production date" }); return; }
  if (body.productId !== undefined) {
    const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, body.productId)).limit(1);
    if (!product) { res.status(400).json({ error: "Product not found" }); return; }
  }
  const wantsApprove = body.status === "approved";
  if (wantsApprove) {
    const { status: _status, ...updates } = body;
    const row = await approveManufacturingBatch(params.id, res.locals.admin.id, {
      ...updates, status: "quality_check",
      productionDate, expiryDate,
    });
    parsedJson(Api.AdminUpdateManufacturingBatchResponse, row, res);
    return;
  }
  const [updated] = await db.update(manufacturingBatchesTable).set({
    ...body, productionDate, expiryDate,
  }).where(and(eq(manufacturingBatchesTable.id, params.id), sql`${manufacturingBatchesTable.status} <> 'approved'`)).returning();
  if (!updated) { res.status(409).json({ error: "Approved manufacturing batches are immutable" }); return; }
  parsedJson(Api.AdminUpdateManufacturingBatchResponse, updated, res);
}));
router.delete("/admin/manufacturing/batches/:id", permit("manufacturing", "delete"), route(async (req, res) => {
  const params = parse(Api.AdminDeleteManufacturingBatchParams, req.params, res); if (!params) return;
  const [existing] = await db.select({ status: manufacturingBatchesTable.status }).from(manufacturingBatchesTable).where(eq(manufacturingBatchesTable.id, params.id)).limit(1);
  if (existing?.status === "approved") { res.status(409).json({ error: "Approved manufacturing batches are immutable" }); return; }
  const [row] = await db.delete(manufacturingBatchesTable).where(and(eq(manufacturingBatchesTable.id, params.id), sql`${manufacturingBatchesTable.status} <> 'approved'`)).returning({ id: manufacturingBatchesTable.id });
  if (!row) { res.status(404).json({ error: "Manufacturing batch not found" }); return; }
  res.sendStatus(204);
}));

router.get("/admin/exhibitions", permit("exhibitions", "view"), route(async (_req, res) => {
  const rows = await db.select().from(exhibitionsTable).orderBy(sql`${exhibitionsTable.startDate} desc`, exhibitionsTable.id);
  parsedJson(Api.AdminListExhibitionsResponse, rows, res);
}));
router.post("/admin/exhibitions", permit("exhibitions", "edit"), route(async (req, res) => {
  const body = parse(Api.AdminCreateExhibitionBody, req.body, res); if (!body) return;
  if (!validDateRange(body.startDate, body.endDate)) { res.status(400).json({ error: "Exhibition end date cannot precede start date" }); return; }
  const [row] = await db.insert(exhibitionsTable).values({ ...body, startDate: isoDate(body.startDate), endDate: isoDate(body.endDate) }).returning();
  parsedJson(Api.AdminCreateExhibitionResponse, row, res, 201);
}));
router.get("/admin/exhibitions/:id", permit("exhibitions", "view"), route(async (req, res) => {
  const params = parse(Api.AdminGetExhibitionParams, req.params, res); if (!params) return;
  const [row] = await db.select().from(exhibitionsTable).where(eq(exhibitionsTable.id, params.id)).limit(1);
  if (!row) { res.status(404).json({ error: "Exhibition not found" }); return; }
  parsedJson(Api.AdminGetExhibitionResponse, row, res);
}));
router.patch("/admin/exhibitions/:id", permit("exhibitions", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateExhibitionParams, req.params, res);
  const body = parse(Api.AdminUpdateExhibitionBody.partial(), req.body, res); if (!params || !body) return;
  const [existing] = await db.select().from(exhibitionsTable).where(eq(exhibitionsTable.id, params.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Exhibition not found" }); return; }
  const startDate = body.startDate ? isoDate(body.startDate) : existing.startDate;
  const endDate = body.endDate ? isoDate(body.endDate) : existing.endDate;
  if (!validDateRange(startDate, endDate)) { res.status(400).json({ error: "Exhibition end date cannot precede start date" }); return; }
  const [row] = await db.update(exhibitionsTable).set({ ...body, startDate, endDate }).where(eq(exhibitionsTable.id, params.id)).returning();
  parsedJson(Api.AdminUpdateExhibitionResponse, row, res);
}));
router.delete("/admin/exhibitions/:id", permit("exhibitions", "delete"), route(async (req, res) => {
  const params = parse(Api.AdminDeleteExhibitionParams, req.params, res); if (!params) return;
  const [dependent] = await db.select({ id: exhibitionProductsTable.id }).from(exhibitionProductsTable).where(eq(exhibitionProductsTable.exhibitionId, params.id)).limit(1);
  if (dependent) { res.status(409).json({ error: "Exhibition has allocated products" }); return; }
  const [row] = await db.delete(exhibitionsTable).where(eq(exhibitionsTable.id, params.id)).returning({ id: exhibitionsTable.id });
  if (!row) { res.status(404).json({ error: "Exhibition not found" }); return; }
  res.sendStatus(204);
}));
router.get("/admin/exhibitions/:id/products", permit("exhibitions", "view"), route(async (req, res) => {
  const params = parse(Api.AdminListExhibitionProductsParams, req.params, res); if (!params) return;
  const [exhibition] = await db.select({ id: exhibitionsTable.id }).from(exhibitionsTable).where(eq(exhibitionsTable.id, params.id)).limit(1);
  if (!exhibition) { res.status(404).json({ error: "Exhibition not found" }); return; }
  const rows = await db.select({
    id: exhibitionProductsTable.id, exhibitionId: exhibitionProductsTable.exhibitionId,
    productId: exhibitionProductsTable.productId, quantityAllocated: exhibitionProductsTable.quantityAllocated,
    quantitySold: exhibitionProductsTable.quantitySold, productNameAr: productsTable.nameAr,
    productNameEn: productsTable.nameEn, productSku: productsTable.sku,
  }).from(exhibitionProductsTable).innerJoin(productsTable, eq(exhibitionProductsTable.productId, productsTable.id))
    .where(eq(exhibitionProductsTable.exhibitionId, params.id)).orderBy(exhibitionProductsTable.id);
  parsedJson(Api.AdminListExhibitionProductsResponse, rows, res);
}));
router.post("/admin/exhibitions/:id/products", permit("exhibitions", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminCreateExhibitionProductParams, req.params, res);
  const body = parse(Api.AdminCreateExhibitionProductBody, req.body, res); if (!params || !body) return;
  if (body.quantitySold > body.quantityAllocated) { res.status(400).json({ error: "Quantity sold cannot exceed quantity allocated" }); return; }
  const [[exhibition], [product]] = await Promise.all([
    db.select({ id: exhibitionsTable.id }).from(exhibitionsTable).where(eq(exhibitionsTable.id, params.id)).limit(1),
    db.select({ id: productsTable.id, nameAr: productsTable.nameAr, nameEn: productsTable.nameEn, sku: productsTable.sku })
      .from(productsTable).where(eq(productsTable.id, body.productId)).limit(1),
  ]);
  if (!exhibition) { res.status(404).json({ error: "Exhibition not found" }); return; }
  if (!product) { res.status(400).json({ error: "Product not found" }); return; }
  const [duplicate] = await db.select({ id: exhibitionProductsTable.id }).from(exhibitionProductsTable).where(and(
    eq(exhibitionProductsTable.exhibitionId, params.id), eq(exhibitionProductsTable.productId, body.productId),
  )).limit(1);
  if (duplicate) { res.status(409).json({ error: "Product is already allocated to exhibition" }); return; }
  const [row] = await db.insert(exhibitionProductsTable).values({ ...body, exhibitionId: params.id }).returning();
  const response = { ...row, productNameAr: product.nameAr, productNameEn: product.nameEn, productSku: product.sku };
  parsedJson(Api.AdminCreateExhibitionProductResponse, response, res, 201);
}));

router.get("/admin/staff", superOnly, route(async (_req, res) => {
  const rows = await db.select().from(adminUsersTable).orderBy(adminUsersTable.id);
  res.json(Api.AdminListStaffResponse.parse(await Promise.all(rows.map(publicAdmin))));
}));
router.post("/admin/staff", superOnly, route(async (req, res) => {
  const body = parse(Api.AdminCreateStaffBody, req.body, res); if (!body) return;
  const { password, permissionIds = [], ...values } = body;
  const [row] = await db.insert(adminUsersTable).values({
    ...values,
    email: values.email.trim().toLowerCase(),
    name: values.name.trim(),
    jobTitle: values.jobTitle.trim(),
    phone: values.phone.trim(),
    passwordHash: await hashAdminPassword(password),
  }).returning();
  if (permissionIds.length && !row.isSuperAdmin) {
    await db.insert(adminUserPermissionsTable).values(permissionIds.map((permissionId) => ({ adminUserId: row.id, permissionId })));
  }
  res.status(201).json(Api.AdminCreateStaffResponse.parse(await publicAdmin(row)));
}));

async function isSoleSuperAdmin(id: number) {
  const [target] = await db.select({ super: adminUsersTable.isSuperAdmin }).from(adminUsersTable).where(eq(adminUsersTable.id, id)).limit(1);
  if (!target?.super) return false;
  const [result] = await db.select({ value: count() }).from(adminUsersTable)
    .where(and(eq(adminUsersTable.isSuperAdmin, true), eq(adminUsersTable.isActive, true)));
  return result.value === 1;
}

router.patch("/admin/staff/:id", superOnly, route(async (req, res) => {
  const params = parse(Api.AdminUpdateStaffParams, req.params, res);
  const body = parse(Api.AdminUpdateStaffBody, req.body, res); if (!params || !body) return;
  if ((body.isActive === false || body.isSuperAdmin === false) && await isSoleSuperAdmin(params.id)) {
    res.status(409).json({ error: "The sole super administrator cannot be disabled or demoted" }); return;
  }
  const { password, ...values } = body;
  const update = {
    ...values,
    ...(values.email ? { email: values.email.trim().toLowerCase() } : {}),
    ...(values.name ? { name: values.name.trim() } : {}),
    ...(values.jobTitle ? { jobTitle: values.jobTitle.trim() } : {}),
    ...(values.phone ? { phone: values.phone.trim() } : {}),
    ...(password ? { passwordHash: await hashAdminPassword(password) } : {}),
  };
  const [row] = await db.update(adminUsersTable).set(update).where(eq(adminUsersTable.id, params.id)).returning();
  if (!row) { res.status(404).json({ error: "Staff member not found" }); return; }
  if (!row.isActive) await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, row.id));
  res.json(Api.AdminUpdateStaffResponse.parse(await publicAdmin(row)));
}));
router.delete("/admin/staff/:id", superOnly, route(async (req, res) => {
  const params = parse(Api.AdminDisableStaffParams, req.params, res); if (!params) return;
  if (await isSoleSuperAdmin(params.id)) {
    res.status(409).json({ error: "The sole super administrator cannot be disabled or deleted" }); return;
  }
  const [row] = await db.update(adminUsersTable).set({ isActive: false }).where(eq(adminUsersTable.id, params.id)).returning();
  if (!row) { res.status(404).json({ error: "Staff member not found" }); return; }
  await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminUserId, params.id));
  res.sendStatus(204);
}));
router.get("/admin/permissions", superOnly, route(async (_req, res) => {
  const rows = await db.select().from(adminPermissionsTable).orderBy(adminPermissionsTable.module, adminPermissionsTable.action);
  res.json(Api.AdminListPermissionsResponse.parse(rows.map((row) => ({ ...row, key: `${row.module}:${row.action}` }))));
}));
router.put("/admin/staff/:id/permissions", superOnly, route(async (req, res) => {
  const params = parse(Api.AdminSetStaffPermissionsParams, req.params, res);
  const body = parse(Api.AdminSetStaffPermissionsBody, req.body, res); if (!params || !body) return;
  const [user] = await db.select().from(adminUsersTable).where(eq(adminUsersTable.id, params.id)).limit(1);
  if (!user) { res.status(404).json({ error: "Staff member not found" }); return; }
  if (user.isSuperAdmin) { res.status(400).json({ error: "Super administrators implicitly have all permissions" }); return; }
  await db.transaction(async (tx) => {
    await tx.delete(adminUserPermissionsTable).where(eq(adminUserPermissionsTable.adminUserId, user.id));
    if (body.permissionIds.length) {
      await tx.insert(adminUserPermissionsTable).values(body.permissionIds.map((permissionId) => ({ adminUserId: user.id, permissionId })));
    }
  });
  res.json(Api.AdminSetStaffPermissionsResponse.parse(await publicAdmin(user)));
}));

router.get("/public/contracts/by-token/:token", route(async (req, res) => {
  const params = parse(Api.GetPublicContractByTokenParams, req.params, res); if (!params) return;
  const row = await contractBySigningToken(params.token);
  if (!row || row.status === "cancelled") { res.status(404).json({ error: "Signing link is invalid or expired" }); return; }
  res.json(Api.GetPublicContractByTokenResponse.parse(contractPublic(row)));
}));
router.post("/public/contracts/by-token/:token/sign", route(async (req, res) => {
  const params = parse(Api.SignPublicContractParams, req.params, res);
  const body = parse(Api.SignPublicContractBody, req.body, res); if (!params || !body) return;
  if (!safeSignaturePath(body.signaturePath)) { res.status(400).json({ error: "Signature must be a private object path" }); return; }
  const existing = await contractBySigningToken(params.token);
  if (!existing) { res.status(404).json({ error: "Signing link is invalid or expired" }); return; }
  try { assertTransition(existing.status, "final"); } catch (error) { res.status(409).json({ error: (error as Error).message }); return; }
  const downloadToken = newContractToken();
  const [row] = await db.update(distributorContractsTable).set({
    status: "final", buyerSignaturePath: body.signaturePath, buyerSignedName: body.buyerSignedName.trim(),
    buyerSignedAt: new Date(), buyerSignedIp: req.ip, buyerSignedUserAgent: req.get("user-agent") ?? null,
    signingTokenHash: null, signingTokenExpiresAt: null,
    downloadTokenHash: hashContractToken(downloadToken), downloadTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }).where(eq(distributorContractsTable.id, existing.id)).returning();
  const base = process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`;
  res.json({ ...Api.SignPublicContractResponse.parse(contractPublic(row)), downloadToken, downloadUrl: `${base}/api/public/contracts/by-download-token/${downloadToken}/pdf` });
}));
router.get("/public/contracts/by-token/:token/pdf", route(async (req, res) => {
  const params = parse(Api.GetPublicContractPdfParams, req.params, res); if (!params) return;
  const row = await contractBySigningToken(params.token);
  if (!row || row.status === "cancelled") { res.status(404).json({ error: "Signing link is invalid or expired" }); return; }
  const base = process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`;
  const pdf = await createContractPdf(row, `${base}/api/public/contracts/by-token/${params.token}`);
  res.type("application/pdf").setHeader("Content-Disposition", `inline; filename="${row.contractNumber}.pdf"`).send(pdf);
}));
router.get("/public/contracts/by-download-token/:token/pdf", route(async (req, res) => {
  const params = parse(Api.DownloadPublicContractPdfParams, req.params, res); if (!params) return;
  const row = await contractByDownloadToken(params.token);
  if (!row || row.status !== "final") { res.status(404).json({ error: "Download link is invalid or expired" }); return; }
  const base = process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`;
  const pdf = await createContractPdf(row, `${base}/api/public/contracts/by-download-token/${params.token}`);
  res.type("application/pdf").setHeader("Content-Disposition", `attachment; filename="${row.contractNumber}.pdf"`).send(pdf);
}));

export default router;