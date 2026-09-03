import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, count, desc, eq, gte, ilike, inArray, lt, lte, or, sql, sum } from "drizzle-orm";
import QRCode from "qrcode";
import * as Api from "@workspace/api-zod";
import {
  adminPermissionsTable,
  adminSessionsTable,
  adminUserPermissionsTable,
  adminUsersTable,
  categoriesTable,
  couponsTable,
  customersTable,
  db,
  employeesTable,
  attendanceRecordsTable,
  leaveRequestsTable,
  payrollRecordsTable,
  expensesTable,
  manufacturingBatchesTable,
  exhibitionsTable,
  exhibitionProductsTable,
  inventoryMovementsTable,
  invoicesTable,
  orderAddressesTable,
  orderItemsTable,
  ordersTable,
  productsTable,
  wholesaleDistributorsTable,
  accountingAccountsTable,
  journalEntriesTable,
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
import { updateOrderAndIssueInvoice } from "../lib/invoices";
import {
  AccountingConflictError,
  AccountingNotFoundError,
  AccountingValidationError,
  createExpenseWithJournal,
  createPayrollWithJournal,
  ensureStandardAccountingChart,
  postJournalEntry,
  reverseJournalEntry,
  trialBalance,
} from "../lib/accounting";

const router: IRouter = Router();
const bearer = (req: Request) => {
  const header = req.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
};
const route = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };

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

function permit(module: string, action: "view" | "edit" | "delete") {
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

router.get("/admin/dashboard", permit("dashboard", "view"), route(async (_req, res) => {
  if (res.headersSent) return;
  const [[revenue], [orders], [customers], [products], [lowStock], [pending], [coupons], [distributors]] = await Promise.all([
    db.select({ value: sum(ordersTable.total) }).from(ordersTable).where(eq(ordersTable.paymentStatus, "paid")),
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
  const [row] = await db.insert(productsTable).values(body).returning();
  res.status(201).json(Api.AdminCreateProductResponse.parse(row));
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
  const [existingProduct] = await db.select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.id, params.id))
    .limit(1);
  if (!existingProduct) { res.status(404).json({ error: "Product not found" }); return; }
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
    sequenceNumber: invoicesTable.sequenceNumber,
    invoiceNumber: invoicesTable.invoiceNumber,
    sellerName: invoicesTable.sellerName,
    issueDatetime: invoicesTable.issueDatetime,
    sellerVatNumber: invoicesTable.sellerVatNumber,
    subtotal: invoicesTable.subtotal,
    vatAmount: invoicesTable.vatAmount,
    totalAmount: invoicesTable.totalAmount,
    qrCodeData: invoicesTable.qrCodeData,
    createdAt: invoicesTable.createdAt,
  }).from(invoicesTable)
    .leftJoin(ordersTable, eq(invoicesTable.orderId, ordersTable.id))
    .where(search ? or(
      ilike(invoicesTable.invoiceNumber, `%${search}%`),
      ilike(invoicesTable.sellerName, `%${search}%`),
      ilike(invoicesTable.sellerVatNumber, `%${search}%`),
      ilike(ordersTable.orderNumber, `%${search}%`),
    ) : undefined)
    .orderBy(desc(invoicesTable.sequenceNumber));
  res.json(Api.AdminListInvoicesResponse.parse(rows));
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
  await db.update(couponsTable).set({ isActive: false }).where(eq(couponsTable.id, params.id)); res.sendStatus(204);
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
    sku: productsTable.sku, stockQuantity: productsTable.stockQuantity, isActive: productsTable.isActive,
  }).from(productsTable).orderBy(productsTable.id));
  rows = searchFilter(rows, query.search, ["nameAr", "nameEn", "sku"]);
  if (query.lowStock) rows = rows.filter((row) => row.stockQuantity <= 10);
  res.json(Api.AdminListInventoryResponse.parse(rows));
}));
router.get("/admin/inventory/:id/movements", permit("inventory", "view"), route(async (req, res) => {
  const params = parse(Api.AdminListInventoryMovementsParams, req.params, res); if (!params) return;
  const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, params.id)).limit(1);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  const movements = await db.select().from(inventoryMovementsTable)
    .where(eq(inventoryMovementsTable.productId, params.id))
    .orderBy(sql`${inventoryMovementsTable.createdAt} desc`, sql`${inventoryMovementsTable.id} desc`);
  res.json(Api.AdminListInventoryMovementsResponse.parse(movements));
}));

async function adjustInventory(productId: number, stockQuantity: number, reason: string, performedBy: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${productsTable} where ${productsTable.id} = ${productId} for update`);
    const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    if (!product) return null;
    const quantityBefore = product.stockQuantity;
    const quantityChange = stockQuantity - quantityBefore;
    const movementType = quantityChange > 0 ? "increase" : quantityChange < 0 ? "decrease" : "adjustment";
    const [updated] = await tx.update(productsTable).set({ stockQuantity }).where(eq(productsTable.id, productId)).returning({
      id: productsTable.id, nameAr: productsTable.nameAr, nameEn: productsTable.nameEn,
      sku: productsTable.sku, stockQuantity: productsTable.stockQuantity, isActive: productsTable.isActive,
    });
    const [movement] = await tx.insert(inventoryMovementsTable).values({
      productId,
      movementType,
      quantityChange,
      quantityBefore,
      quantityAfter: stockQuantity,
      reason,
      performedBy,
    }).returning();
    return { item: updated, movement };
  });
}

async function handleInventoryAdjustment(
  params: { id: number },
  body: { stockQuantity: number; reason: string },
  res: Response,
  response: { parse(value: unknown): unknown },
) {
  const reason = body.reason.trim();
  if (!reason) { res.status(400).json({ error: "Adjustment reason is required" }); return; }
  const result = await adjustInventory(params.id, body.stockQuantity, reason, res.locals.admin.id);
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
  rows = statusFilter(searchFilter(rows, query.search, ["companyName", "contactName", "email", "phone", "city"]), query.status);
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
  const body = parse(Api.AdminCreateEmployeeBody, req.body, res); if (!body) return;
  if (body.adminUserId != null) {
    const [admin] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable).where(eq(adminUsersTable.id, body.adminUserId)).limit(1);
    if (!admin) { res.status(400).json({ error: "Admin user not found" }); return; }
  }
  const [row] = await db.insert(employeesTable).values({ ...body, hireDate: isoDate(body.hireDate) }).returning();
  parsedJson(Api.AdminCreateEmployeeResponse, row, res, 201);
}));
router.patch("/admin/hr/employees/:id", permit("hr", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateEmployeeParams, req.params, res);
  const body = parse(Api.AdminUpdateEmployeeBody.partial(), req.body, res); if (!params || !body) return;
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
      .where(and(eq(ordersTable.paymentStatus, "paid"), gte(ordersTable.createdAt, start), lt(ordersTable.createdAt, endExclusive))),
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
  res.json(rows);
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
router.patch("/admin/manufacturing/batches/:id", permit("manufacturing", "edit"), route(async (req, res) => {
  const params = parse(Api.AdminUpdateManufacturingBatchParams, req.params, res);
  const body = parse(Api.AdminUpdateManufacturingBatchBody.partial(), req.body, res); if (!params || !body) return;
  const [existing] = await db.select().from(manufacturingBatchesTable).where(eq(manufacturingBatchesTable.id, params.id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Manufacturing batch not found" }); return; }
  const productionDate = body.productionDate ? isoDate(body.productionDate) : existing.productionDate;
  const expiryDate = body.expiryDate === null ? null : body.expiryDate ? isoDate(body.expiryDate) : existing.expiryDate;
  if (expiryDate && !validDateRange(productionDate, expiryDate)) { res.status(400).json({ error: "Expiry date cannot precede production date" }); return; }
  if (body.productId !== undefined) {
    const [product] = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, body.productId)).limit(1);
    if (!product) { res.status(400).json({ error: "Product not found" }); return; }
  }
  const [row] = await db.update(manufacturingBatchesTable).set({ ...body, productionDate, expiryDate })
    .where(eq(manufacturingBatchesTable.id, params.id)).returning();
  parsedJson(Api.AdminUpdateManufacturingBatchResponse, row, res);
}));
router.delete("/admin/manufacturing/batches/:id", permit("manufacturing", "delete"), route(async (req, res) => {
  const params = parse(Api.AdminDeleteManufacturingBatchParams, req.params, res); if (!params) return;
  const [row] = await db.delete(manufacturingBatchesTable).where(eq(manufacturingBatchesTable.id, params.id)).returning({ id: manufacturingBatchesTable.id });
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
    ...values, email: values.email.trim().toLowerCase(), passwordHash: await hashAdminPassword(password),
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

export default router;