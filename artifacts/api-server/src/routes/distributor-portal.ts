import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { and, desc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import * as Api from "@workspace/api-zod";
import {
  companyOrderDecisionsTable,
  companyOrderItemsTable,
  companyOrdersTable,
  db,
  distributorPortalAccountsTable,
  distributorPortalLoginAttemptsTable,
  distributorPortalSessionsTable,
  productsTable,
  wholesaleDistributorsTable,
} from "@workspace/db";
import { ensureAdminSeeded, adminFromToken, permissionsFor } from "../lib/admin-auth";
import {
  DistributorInvoiceConflictError,
  DistributorInvoiceValidationError,
  getCompanyCreditPosition,
  lockDistributorContractSource,
} from "../lib/invoices";
import { createCurrentCompanyInvoiceInTransaction, type CompanyInvoiceInput } from "../lib/company-invoices";
import {
  approvalIssueDates,
  calculateLines,
  companyOrderPublic,
  createReviewSnapshot,
  fingerprint,
  orderSnapshotFingerprint,
  publicCompany,
  readOrderItems,
  resolvePortalTerms,
} from "../lib/distributor-portal";

const router: IRouter = Router();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const submitDistributorPortalItemSchema = Api.SubmitDistributorPortalOrderBody.shape.items.element.strict();
const submitDistributorPortalOrderSchema = Api.SubmitDistributorPortalOrderBody.extend({
  items: submitDistributorPortalItemSchema.array().min(1).max(Api.submitDistributorPortalOrderBodyItemsMax),
}).strict();
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const bearer = (req: Request) => {
  const header = req.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
};
const moneyCents = (value: number | string) => Math.round((Number(value) + Number.EPSILON) * 100);

class PortalError extends Error {
  constructor(readonly status: number, message: string, readonly details?: unknown) {
    super(message);
  }
}

function route(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch((error: unknown) => {
      if (error instanceof PortalError) {
        res.status(error.status).json({ error: error.message, ...(error.details ? { details: error.details } : {}) });
        return;
      }
      next(error);
    });
  };
}

async function derivePassword(password: string, salt: string, cost = 1 << 15) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, 64, { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashDistributorPortalPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = await derivePassword(password, salt);
  return `scrypt$32768$8$1$${salt}$${digest.toString("hex")}`;
}

export function isStrongDistributorPortalPassword(password: string) {
  return password.length >= 12 && password.length <= 256 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
}

export async function verifyDistributorPortalPassword(password: string, encoded: string) {
  const [algorithm, costString, rString, pString, salt, expectedHex, extra] = encoded.split("$");
  const cost = Number(costString);
  const r = Number(rString);
  const p = Number(pString);
  if (algorithm !== "scrypt" || !Number.isInteger(cost) || cost < 16384 || cost > 65536 ||
    r !== 8 || p !== 1 || !salt || !/^[0-9a-f]{128}$/i.test(expectedHex ?? "") || extra !== undefined) return false;
  const actual = await derivePassword(password, salt, cost);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const dummyPasswordHashPromise = hashDistributorPortalPassword("UnavailableAccount1!");
async function dummyPasswordCheck(password: string) {
  return verifyDistributorPortalPassword(password, await dummyPasswordHashPromise);
}

function loginKeys(email: string, ip: string) {
  return [...new Set([
    `email:${createHash("sha256").update(email).digest("hex")}`,
    `ip:${createHash("sha256").update(ip).digest("hex")}`,
  ])].map((key) => createHash("sha256").update(key).digest("hex"));
}

async function isLoginBlocked(keys: string[]) {
  const rows = await db.select({ keyHash: distributorPortalLoginAttemptsTable.keyHash })
    .from(distributorPortalLoginAttemptsTable)
    .where(and(inArray(distributorPortalLoginAttemptsTable.keyHash, keys),
      gt(distributorPortalLoginAttemptsTable.blockedUntil, new Date())))
    .limit(1);
  return rows.length > 0;
}

async function recordLoginFailure(keys: string[]) {
  const resetBefore = new Date(Date.now() - LOGIN_WINDOW_MS);
  for (const keyHash of keys) {
    await db.execute(sql`
      insert into distributor_portal_login_attempts (key_hash, failures, window_started_at, blocked_until)
      values (${keyHash}, 1, now(), null)
      on conflict (key_hash) do update set
        failures = case
          when distributor_portal_login_attempts.window_started_at <= ${resetBefore} then 1
          else distributor_portal_login_attempts.failures + 1
        end,
        window_started_at = case
          when distributor_portal_login_attempts.window_started_at <= ${resetBefore} then now()
          else distributor_portal_login_attempts.window_started_at
        end,
        blocked_until = case
          when (case when distributor_portal_login_attempts.window_started_at <= ${resetBefore}
            then 1 else distributor_portal_login_attempts.failures + 1 end) >= ${LOGIN_MAX_FAILURES}
          then now() + interval '15 minutes'
          else null
        end
    `);
  }
}

async function clearLoginFailures(keys: string[]) {
  await db.delete(distributorPortalLoginAttemptsTable)
    .where(inArray(distributorPortalLoginAttemptsTable.keyHash, keys));
}

async function requirePortalSession(req: Request, res: Response, next: NextFunction) {
  try {
    const token = bearer(req);
    if (!token) {
      res.status(401).json({ error: "Distributor portal authentication required" });
      return;
    }
    const [row] = await db.select({
      session: distributorPortalSessionsTable,
      account: distributorPortalAccountsTable,
      company: wholesaleDistributorsTable,
    }).from(distributorPortalSessionsTable)
      .innerJoin(distributorPortalAccountsTable, eq(distributorPortalSessionsTable.accountId, distributorPortalAccountsTable.id))
      .innerJoin(wholesaleDistributorsTable, eq(distributorPortalAccountsTable.distributorId, wholesaleDistributorsTable.id))
      .where(and(
        eq(distributorPortalSessionsTable.tokenHash, tokenHash(token)),
        gt(distributorPortalSessionsTable.expiresAt, new Date()),
        eq(distributorPortalAccountsTable.enabled, true),
        eq(wholesaleDistributorsTable.isActive, true),
      )).limit(1);
    if (!row) {
      res.status(401).json({ error: "Distributor portal session is invalid or revoked" });
      return;
    }
    res.locals.distributorPortal = {
      accountId: row.account.id,
      sessionId: row.session.id,
      tokenHash: row.session.tokenHash,
      expiresAt: row.session.expiresAt,
      company: row.company,
    };
    next();
  } catch (error) {
    next(error);
  }
}

function portalCompany(res: Response) {
  return res.locals.distributorPortal.company as typeof wholesaleDistributorsTable.$inferSelect;
}

router.post("/distributor-portal/session/login", route(async (req, res) => {
  const parsed = Api.LoginDistributorPortalBody.strict().safeParse(req.body);
  if (!parsed.success) throw new PortalError(400, "Invalid login input");
  const email = parsed.data.email.trim().toLowerCase();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const keys = loginKeys(email, ip);
  if (await isLoginBlocked(keys)) throw new PortalError(429, "Too many failed login attempts. Try again later.");
  const [row] = await db.select({
    account: distributorPortalAccountsTable,
    company: wholesaleDistributorsTable,
  }).from(distributorPortalAccountsTable)
    .innerJoin(wholesaleDistributorsTable, eq(distributorPortalAccountsTable.distributorId, wholesaleDistributorsTable.id))
    .where(eq(distributorPortalAccountsTable.email, email)).limit(1);
  const matches = row
    ? await verifyDistributorPortalPassword(parsed.data.password, row.account.passwordHash)
    : await dummyPasswordCheck(parsed.data.password);
  if (!row || !matches || !row.account.enabled || !row.company.isActive) {
    await recordLoginFailure(keys);
    throw new PortalError(401, "Email or password is incorrect, or portal access is disabled.");
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
   await db.transaction(async (tx) => {
     await lockDistributorContractSource(tx, row.company.id);
     const [fresh] = await tx.select({ account: distributorPortalAccountsTable, company: wholesaleDistributorsTable })
       .from(distributorPortalAccountsTable)
       .innerJoin(wholesaleDistributorsTable, eq(distributorPortalAccountsTable.distributorId, wholesaleDistributorsTable.id))
       .where(eq(distributorPortalAccountsTable.id, row.account.id)).limit(1);
     if (!fresh?.account.enabled || !fresh.company.isActive || fresh.account.email !== email ||
       fresh.account.passwordHash !== row.account.passwordHash) {
       throw new PortalError(401, "Email or password is incorrect, or portal access is disabled.");
     }
     await tx.insert(distributorPortalSessionsTable).values({
       accountId: fresh.account.id,
       tokenHash: tokenHash(token),
       expiresAt,
     });
  });
   await clearLoginFailures(keys);
  res.json(Api.LoginDistributorPortalResponse.parse({
    token,
    expiresAt,
    company: publicCompany(row.company),
  }));
}));

router.get("/distributor-portal/session", requirePortalSession, route(async (_req, res) => {
  const current = res.locals.distributorPortal;
  res.json(Api.GetDistributorPortalSessionResponse.parse({
    expiresAt: current.expiresAt,
    company: publicCompany(portalCompany(res)),
  }));
}));

router.delete("/distributor-portal/session", requirePortalSession, route(async (_req, res) => {
  const current = res.locals.distributorPortal;
  const result = await db.delete(distributorPortalSessionsTable)
    .where(eq(distributorPortalSessionsTable.id, current.sessionId))
    .returning({ id: distributorPortalSessionsTable.id });
  res.json(Api.RevokeDistributorPortalSessionResponse.parse({ revokedSessions: result.length }));
}));

router.get("/distributor-portal/catalog", requirePortalSession, route(async (_req, res) => {
  const company = portalCompany(res);
  const [context, rows] = await Promise.all([
    resolvePortalTerms(db, company),
    db.select({
      id: productsTable.id,
      nameAr: productsTable.nameAr,
      nameEn: productsTable.nameEn,
      distributorNameOverride: productsTable.distributorNameOverride,
      invoiceNameAr: productsTable.invoiceNameAr,
      invoiceNameEn: productsTable.invoiceNameEn,
      sku: productsTable.sku,
      distributorImageOverride: productsTable.distributorImageOverride,
      images: productsTable.images,
      price: productsTable.price,
      stockQuantity: productsTable.stockQuantity,
    }).from(productsTable).where(and(
      eq(productsTable.showOnDistributors, true),
      eq(productsTable.isActive, true),
      eq(productsTable.sellable, true),
    )).orderBy(productsTable.id),
  ]);
  const catalog = rows.map((product) => {
    const firstImage = Array.isArray(product.images) && product.images.length > 0
      ? (product.images[0] as { url?: string })?.url ?? null : null;
    return {
      id: product.id,
      nameAr: product.distributorNameOverride?.trim() || product.invoiceNameAr?.trim() || product.nameAr,
      nameEn: product.invoiceNameEn?.trim() || product.nameEn,
      sku: product.sku,
      image: product.distributorImageOverride || firstImage,
      unitPrice: product.price,
      stockQuantity: product.stockQuantity,
    };
  });
  res.json(Api.GetDistributorPortalCatalogResponse.parse({
    company: publicCompany(company),
    terms: context.terms,
    discountPercent: context.terms.discountPercent,
    vatRate: context.terms.vatRate,
    catalog,
  }));
}));

router.post("/distributor-portal/orders", requirePortalSession, route(async (req, res) => {
  const parsed = submitDistributorPortalOrderSchema.safeParse(req.body);
  if (!parsed.success) throw new PortalError(400, "Invalid company order input");
  const itemsInput = parsed.data.items;
  if (new Set(itemsInput.map((item) => item.productId)).size !== itemsInput.length) {
    throw new PortalError(400, "Each catalog product may appear only once per order.");
  }
  const company = portalCompany(res);
  const result = await db.transaction(async (tx) => {
    await lockDistributorContractSource(tx, company.id);
    const [activeSession] = await tx.select({ id: distributorPortalSessionsTable.id })
      .from(distributorPortalSessionsTable)
      .innerJoin(distributorPortalAccountsTable, eq(distributorPortalSessionsTable.accountId, distributorPortalAccountsTable.id))
      .where(and(
        eq(distributorPortalSessionsTable.id, res.locals.distributorPortal.sessionId),
        gt(distributorPortalSessionsTable.expiresAt, new Date()),
        eq(distributorPortalAccountsTable.distributorId, company.id),
        eq(distributorPortalAccountsTable.enabled, true),
      )).limit(1);
    if (!activeSession) throw new PortalError(401, "Distributor portal session is invalid or revoked.");
    const [existing] = await tx.select().from(companyOrdersTable).where(and(
      eq(companyOrdersTable.distributorId, company.id),
      eq(companyOrdersTable.idempotencyKey, parsed.data.idempotencyKey),
    )).limit(1);
    if (existing) {
      const oldItems = await readOrderItems(tx, existing.id);
      const sameItems = fingerprint(oldItems.map(({ productId, quantity }) => ({ productId, quantity }))) ===
        fingerprint(itemsInput);
      if (!sameItems) throw new PortalError(409, "This idempotency key was already used for different order items.");
      return { order: await companyOrderPublic(tx, existing), replay: true };
    }
    const [freshCompany] = await tx.select().from(wholesaleDistributorsTable)
      .where(and(eq(wholesaleDistributorsTable.id, company.id), eq(wholesaleDistributorsTable.isActive, true)))
      .limit(1);
    if (!freshCompany) throw new PortalError(403, "This company is not currently active.");
    const termsContext = await resolvePortalTerms(tx, freshCompany);
    const products = await tx.select().from(productsTable).where(and(
      inArray(productsTable.id, itemsInput.map((item) => item.productId)),
      eq(productsTable.showOnDistributors, true),
      eq(productsTable.isActive, true),
      eq(productsTable.sellable, true),
    ));
    if (products.length !== itemsInput.length) {
      throw new PortalError(400, "One or more products are unavailable in the distributor catalog.");
    }
    const lines = calculateLines(products, itemsInput, termsContext.terms);
    const subtotalCents = lines.reduce((sum, line) => sum + moneyCents(line.subtotal), 0);
    const discountCents = lines.reduce((sum, line) =>
      sum + moneyCents(line.unitPrice) * line.quantity - moneyCents(line.subtotal) - moneyCents(line.vatAmount), 0);
    const vatCents = lines.reduce((sum, line) => sum + moneyCents(line.vatAmount), 0);
    const totalCents = lines.reduce((sum, line) => sum + moneyCents(line.totalAmount), 0);
    const totals = {
      subtotal: subtotalCents / 100,
      discountAmount: discountCents / 100,
      vatAmount: vatCents / 100,
      totalAmount: totalCents / 100,
    };
    const stockAtSubmission = products.map((product) => ({
        productId: product.id,
        quantity: itemsInput.find((item) => item.productId === product.id)!.quantity,
        stockQuantity: product.stockQuantity,
      })).sort((a, b) => a.productId - b.productId);
    const snapshotTerms = {
      ...termsContext.terms,
      _stockAtSubmission: stockAtSubmission,
    };
    const snapshotFingerprint = orderSnapshotFingerprint(termsContext.terms, lines, totals, stockAtSubmission);
    const temporaryNumber = `pending-${randomBytes(16).toString("hex")}`;
    const [created] = await tx.insert(companyOrdersTable).values({
      orderNumber: temporaryNumber,
      distributorId: company.id,
      idempotencyKey: parsed.data.idempotencyKey,
      contractId: termsContext.terms.contractId,
      uploadedContractFileId: termsContext.terms.uploadedContractFileId,
      snapshotTerms,
      snapshotTotals: totals,
      snapshotFingerprint,
    }).returning();
    const orderNumber = `CO-${String(created.id).padStart(8, "0")}`;
    const [order] = await tx.update(companyOrdersTable).set({ orderNumber }).where(eq(companyOrdersTable.id, created.id)).returning();
    await tx.insert(companyOrderItemsTable).values(lines.map((line) => ({
      companyOrderId: order.id,
      ...line,
      unitPrice: line.unitPrice.toFixed(2),
      subtotal: line.subtotal.toFixed(2),
      vatAmount: line.vatAmount.toFixed(2),
      totalAmount: line.totalAmount.toFixed(2),
    })));
    // Deliberately no invoice creation, stock movement, reservation, payment, or journal entry here.
    return { order: await companyOrderPublic(tx, order), replay: false };
  });
  res.status(result.replay ? 200 : 201).json(Api.SubmitDistributorPortalOrderResponse.parse(result.order));
}));

router.get("/distributor-portal/orders", requirePortalSession, route(async (_req, res) => {
  const company = portalCompany(res);
  const rows = await db.select().from(companyOrdersTable)
    .where(eq(companyOrdersTable.distributorId, company.id))
    .orderBy(desc(companyOrdersTable.createdAt), desc(companyOrdersTable.id));
  const orders = await Promise.all(rows.map((order) => companyOrderPublic(db, order)));
  res.json(Api.ListDistributorPortalOrdersResponse.parse(orders));
}));

router.get("/distributor-portal/orders/:orderId", requirePortalSession, route(async (req, res) => {
  const params = Api.GetDistributorPortalOrderParams.safeParse(req.params);
  if (!params.success) throw new PortalError(400, "Invalid order id");
  const company = portalCompany(res);
  const [order] = await db.select().from(companyOrdersTable).where(and(
    eq(companyOrdersTable.id, params.data.orderId),
    eq(companyOrdersTable.distributorId, company.id),
  )).limit(1);
  if (!order) throw new PortalError(404, "Company order not found");
  res.json(Api.GetDistributorPortalOrderResponse.parse(await companyOrderPublic(db, order)));
}));

async function requireAdminPermission(req: Request, res: Response, action: "view" | "edit") {
  await ensureAdminSeeded();
  const token = bearer(req);
  const admin = await adminFromToken(token);
  if (!admin) {
    res.status(401).json({ error: "Admin authentication required" });
    return null;
  }
  const permissions = await permissionsFor(admin.id, admin.isSuperAdmin);
  if (!admin.isSuperAdmin && !permissions.includes(`company-orders:${action}`)) {
    res.status(403).json({ error: "Insufficient permission" });
    return null;
  }
  return admin;
}

function adminRoute(action: "view" | "edit", handler: (req: Request, res: Response, admin: NonNullable<Awaited<ReturnType<typeof adminFromToken>>>) => Promise<void>) {
  return route(async (req, res) => {
    const admin = await requireAdminPermission(req, res, action);
    if (admin) await handler(req, res, admin);
  });
}

router.get("/admin/company-orders", adminRoute("view", async (req, res) => {
  const query = Api.ListAdminCompanyOrdersQueryParams.safeParse(req.query);
  if (!query.success) throw new PortalError(400, "Invalid company-order filters");
  const filters = [];
  if (query.data.status) filters.push(eq(companyOrdersTable.status, query.data.status));
  if (query.data.search?.trim()) {
    const search = `%${query.data.search.trim()}%`;
    const companyIds = await db.select({ id: wholesaleDistributorsTable.id }).from(wholesaleDistributorsTable)
      .where(ilike(wholesaleDistributorsTable.companyName, search));
    filters.push(or(
      ilike(companyOrdersTable.orderNumber, search),
      ...(companyIds.length ? [inArray(companyOrdersTable.distributorId, companyIds.map((row) => row.id))] : []),
    )!);
  }
  const where = filters.length ? and(...filters) : undefined;
  const [rows, countResult] = await Promise.all([
    db.select().from(companyOrdersTable).where(where)
      .orderBy(desc(companyOrdersTable.createdAt), desc(companyOrdersTable.id)).limit(500),
    db.select({ total: sql<number>`count(*)::int` }).from(companyOrdersTable).where(where),
  ]);
  const orders = await Promise.all(rows.map((order) => companyOrderPublic(db, order)));
  res.json(Api.ListAdminCompanyOrdersResponse.parse({ orders, total: countResult[0]?.total ?? 0 }));
}));

async function getCompanyOrderForReview(orderId: number) {
  return db.transaction(async (tx) => {
    const [unlocked] = await tx.select().from(companyOrdersTable).where(eq(companyOrdersTable.id, orderId)).limit(1);
    if (!unlocked) throw new PortalError(404, "Company order not found");
    await lockDistributorContractSource(tx, unlocked.distributorId);
    await tx.execute(sql`select id from ${wholesaleDistributorsTable} where id = ${unlocked.distributorId} for update`);
    const [order] = await tx.select().from(companyOrdersTable).where(eq(companyOrdersTable.id, orderId)).limit(1);
    if (!order) throw new PortalError(404, "Company order not found");
    const [company] = await tx.select().from(wholesaleDistributorsTable)
      .where(eq(wholesaleDistributorsTable.id, order.distributorId)).limit(1);
    if (!company) throw new PortalError(404, "Company not found");
    return createReviewSnapshot(tx, order, company);
  });
}

router.get("/admin/company-orders/:orderId/review", adminRoute("view", async (req, res) => {
  const params = Api.GetAdminCompanyOrderReviewParams.safeParse(req.params);
  if (!params.success) throw new PortalError(400, "Invalid company order id");
  const review = await getCompanyOrderForReview(params.data.orderId);
  res.json(Api.GetAdminCompanyOrderReviewResponse.parse(review));
}));

router.post("/admin/company-orders/:orderId/decision", adminRoute("edit", async (req, res, admin) => {
  const params = Api.DecideAdminCompanyOrderParams.safeParse(req.params);
  const body = Api.DecideAdminCompanyOrderBody.strict().safeParse(req.body);
  if (!params.success || !body.success) throw new PortalError(400, "Invalid company-order decision input");
  if (body.data.decision === "reject" && (body.data.reason?.trim().length ?? 0) < 10) {
    throw new PortalError(400, "A written rejection reason between 10 and 500 characters is required.");
  }

  const outcome = await db.transaction(async (tx) => {
    const [unlocked] = await tx.select().from(companyOrdersTable)
      .where(eq(companyOrdersTable.id, params.data.orderId)).limit(1);
    if (!unlocked) throw new PortalError(404, "Company order not found");
    await lockDistributorContractSource(tx, unlocked.distributorId);
    await tx.execute(sql`select id from ${wholesaleDistributorsTable} where id = ${unlocked.distributorId} for update`);
    await tx.execute(sql`select id from ${companyOrdersTable} where id = ${params.data.orderId} for update`);
    const [order] = await tx.select().from(companyOrdersTable).where(eq(companyOrdersTable.id, params.data.orderId)).limit(1);
    if (!order) throw new PortalError(404, "Company order not found");
    const [company] = await tx.select().from(wholesaleDistributorsTable)
      .where(eq(wholesaleDistributorsTable.id, order.distributorId)).limit(1);
    if (!company) throw new PortalError(404, "Company not found");

    if (order.status === "approved" && order.invoiceId) {
      const review = await createReviewSnapshot(tx, order, company);
      return { order, review, invoiceId: order.invoiceId, alreadyDecided: true };
    }
    if (order.status !== "pending_review") {
      throw new PortalError(409, `Company order is already ${order.status}.`);
    }
    const creationKey = `company-order:${String(order.id).padStart(10, "0")}`;
    if (body.data.decision === "approve") {
      // Match the invoice issuer's lock order: company, order, creation key,
      // product rows in ascending ID, then invoice-number lock in the issuer.
      await tx.execute(sql`select pg_advisory_xact_lock(7521, hashtext(${creationKey}))`);
      const productRows = await tx.select({ productId: companyOrderItemsTable.productId })
        .from(companyOrderItemsTable).where(eq(companyOrderItemsTable.companyOrderId, order.id));
      for (const productId of [...new Set(productRows.map((item) => item.productId))].sort((a, b) => a - b)) {
        await tx.execute(sql`select id from ${productsTable} where id = ${productId} for update`);
      }
    }
    const review = await createReviewSnapshot(tx, order, company);
    if (review.reviewFingerprint !== body.data.expectedReviewFingerprint) {
      throw new PortalError(409, "Company order terms, credit, prices, stock, or outstanding exposure changed. Review the refreshed values before deciding.", { review });
    }
    if (review.hasMeaningfulChanges && !body.data.acknowledgeChanges) {
      throw new PortalError(409, "Current order terms differ from the submitted snapshot. Explicitly acknowledge the updated values before deciding.", { review });
    }
    if (body.data.decision === "reject") {
      const reason = body.data.reason!.trim();
      const decisionAt = new Date();
      const [updated] = await tx.update(companyOrdersTable).set({
        status: "rejected",
        reviewedByAdminId: admin.id,
        decisionAt,
        decisionReason: reason,
        reviewSnapshot: review,
      }).where(and(eq(companyOrdersTable.id, order.id), eq(companyOrdersTable.status, "pending_review"))).returning();
      if (!updated) throw new PortalError(409, "Company order was decided by another reviewer.");
      await tx.insert(companyOrderDecisionsTable).values({
        companyOrderId: order.id,
        decision: "reject",
        actorAdminId: admin.id,
        decidedAt: decisionAt,
        reason,
        reviewSnapshot: review,
        changesAcknowledged: body.data.acknowledgeChanges,
      });
      return { order: updated, review, invoiceId: null, alreadyDecided: false };
    }
    if (review.blockReasons.length) {
      throw new PortalError(409, "Company order cannot be approved until all blocking conditions are resolved.", { review });
    }
    // Re-read exposure under the company lock. Pending orders intentionally do
    // not count as receivables; only non-cancelled invoices net of collections do.
    const creditContext = await resolvePortalTerms(tx, company);
    const creditPosition = await getCompanyCreditPosition(
      tx,
      order.distributorId,
      creditContext.contract ?? creditContext.file,
      moneyCents(review.currentTotals.totalAmount),
    );
    if (!creditPosition.allowed) {
      const latest = await createReviewSnapshot(tx, order, company);
      throw new PortalError(409, "Available company credit changed or is not approved.", { review: latest });
    }
    const issueDates = approvalIssueDates(review.currentTerms);
    const invoiceInput: CompanyInvoiceInput = {
      creationKey,
      issueDate: issueDates.issueDate,
      dueDate: issueDates.dueDate,
      distributorId: order.distributorId,
      contractId: review.currentTerms.contractId ?? undefined,
      uploadedContractFileId: review.currentTerms.uploadedContractFileId ?? undefined,
      items: review.currentItems.map(({ productId, quantity, unitPrice }) => ({ productId, quantity, unitPrice })),
    };
    let invoice: Awaited<ReturnType<typeof createCurrentCompanyInvoiceInTransaction>>;
    try {
      invoice = await createCurrentCompanyInvoiceInTransaction(tx, invoiceInput, admin.id);
    } catch (error) {
      if (error instanceof DistributorInvoiceConflictError || error instanceof DistributorInvoiceValidationError) {
        const latest = await createReviewSnapshot(tx, order, company);
        throw new PortalError(409, error.message, { review: latest });
      }
      throw error;
    }
    const decisionAt = new Date();
    const [updated] = await tx.update(companyOrdersTable).set({
      status: "approved",
      reviewedByAdminId: admin.id,
      decisionAt,
      decisionReason: body.data.reason?.trim() || null,
      invoiceId: invoice.id,
      reviewSnapshot: review,
    }).where(and(eq(companyOrdersTable.id, order.id), eq(companyOrdersTable.status, "pending_review"))).returning();
    if (!updated) throw new PortalError(409, "Company order was decided by another reviewer.");
    await tx.insert(companyOrderDecisionsTable).values({
      companyOrderId: order.id,
      decision: "approve",
      actorAdminId: admin.id,
      decidedAt: decisionAt,
      reason: body.data.reason?.trim() || null,
      reviewSnapshot: review,
      changesAcknowledged: body.data.acknowledgeChanges,
    });
    return { order: updated, review, invoiceId: invoice.id, alreadyDecided: false };
  });
  res.json(Api.DecideAdminCompanyOrderResponse.parse({
    order: await companyOrderPublic(db, outcome.order),
    invoiceId: outcome.invoiceId,
    review: outcome.review,
    changesAcknowledged: body.data.acknowledgeChanges,
  }));
}));

function strongPasswordError(password: string) {
  return isStrongDistributorPortalPassword(password)
    ? null
    : "Password must be 12–256 characters and include uppercase, lowercase, a number, and a symbol.";
}

function normalizedEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

router.put("/admin/distributor-portal/accounts/:companyId", adminRoute("edit", async (req, res) => {
  const params = Api.UpdateAdminDistributorPortalAccountParams.safeParse(req.params);
  const body = Api.UpdateAdminDistributorPortalAccountBody.strict().safeParse(req.body);
  if (!params.success || !body.success) throw new PortalError(400, "Invalid distributor portal account input");
  const companyId = params.data.companyId;
  const [company] = await db.select({ id: wholesaleDistributorsTable.id, email: wholesaleDistributorsTable.email })
    .from(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, companyId)).limit(1);
  if (!company) throw new PortalError(404, "Company not found");
  const [existing] = await db.select().from(distributorPortalAccountsTable)
    .where(eq(distributorPortalAccountsTable.distributorId, companyId)).limit(1);
  const emailInput = body.data.email ?? existing?.email ?? company.email ?? "";
  const email = normalizedEmail(emailInput);
  if (!email) throw new PortalError(400, "A valid account email is required.");
  if (body.data.password) {
    const passwordError = strongPasswordError(body.data.password);
    if (passwordError) throw new PortalError(400, passwordError);
  }
  if (!existing && !body.data.password) {
    throw new PortalError(400, "A strong initial password is required when creating a portal account.");
  }
  if (!existing && !body.data.enabled) {
    // Setup can be staged disabled, but the credentials must still be set explicitly.
  }
  const passwordHash = body.data.password ? await hashDistributorPortalPassword(body.data.password) : undefined;
  try {
    const saved = await db.transaction(async (tx) => {
      await lockDistributorContractSource(tx, companyId);
      const [account] = existing
        ? await tx.update(distributorPortalAccountsTable).set({
          email,
          enabled: body.data.enabled,
          ...(passwordHash ? { passwordHash } : {}),
          updatedAt: new Date(),
        }).where(eq(distributorPortalAccountsTable.id, existing.id)).returning()
        : await tx.insert(distributorPortalAccountsTable).values({
          distributorId: companyId,
          email,
          passwordHash: passwordHash!,
          enabled: body.data.enabled,
        }).returning();
      let revokedSessions = 0;
      if (existing && (!body.data.enabled || passwordHash || existing.email !== email)) {
        const deleted = await tx.delete(distributorPortalSessionsTable)
          .where(eq(distributorPortalSessionsTable.accountId, account.id))
          .returning({ id: distributorPortalSessionsTable.id });
        revokedSessions = deleted.length;
      }
      return { account, revokedSessions };
    });
    res.json(Api.UpdateAdminDistributorPortalAccountResponse.parse({
      companyId,
      email: saved.account.email,
      enabled: saved.account.enabled,
      createdAt: saved.account.createdAt,
      updatedAt: saved.account.updatedAt,
    }));
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      throw new PortalError(409, "This portal email is already assigned to another distributor.");
    }
    throw error;
  }
}));

router.get("/admin/distributor-portal/accounts/:companyId", adminRoute("view", async (req, res) => {
  const params = Api.GetAdminDistributorPortalAccountParams.safeParse(req.params);
  if (!params.success) throw new PortalError(400, "Invalid company id");
  const companyId = params.data.companyId;
  const [company] = await db.select({ id: wholesaleDistributorsTable.id })
    .from(wholesaleDistributorsTable).where(eq(wholesaleDistributorsTable.id, companyId)).limit(1);
  if (!company) throw new PortalError(404, "Company not found");
  const [account] = await db.select().from(distributorPortalAccountsTable)
    .where(eq(distributorPortalAccountsTable.distributorId, companyId)).limit(1);
  res.json(Api.GetAdminDistributorPortalAccountResponse.parse(account ? {
    companyId,
    exists: true,
    email: account.email,
    enabled: account.enabled,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  } : {
    companyId,
    exists: false,
    email: null,
    enabled: null,
    createdAt: null,
    updatedAt: null,
  }));
}));

router.post("/admin/distributor-portal/accounts/:companyId/revoke-sessions", adminRoute("edit", async (req, res) => {
  const params = Api.RevokeAdminDistributorPortalSessionsParams.safeParse(req.params);
  if (!params.success) throw new PortalError(400, "Invalid company id");
  const [account] = await db.select({ id: distributorPortalAccountsTable.id })
    .from(distributorPortalAccountsTable)
    .where(eq(distributorPortalAccountsTable.distributorId, params.data.companyId)).limit(1);
  if (!account) throw new PortalError(404, "Distributor portal account not found");
  const revoked = await db.delete(distributorPortalSessionsTable)
    .where(eq(distributorPortalSessionsTable.accountId, account.id))
    .returning({ id: distributorPortalSessionsTable.id });
  res.json(Api.RevokeAdminDistributorPortalSessionsResponse.parse({ revokedSessions: revoked.length }));
}));

export default router;