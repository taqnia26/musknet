import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import * as Api from "@workspace/api-zod";
import { adminFromToken, ensureAdminSeeded, permissionsFor } from "../lib/admin-auth";
import {
  cancelSalesReturn, completeSalesReturn, createSalesReturn, getSalesReturn, listReturnSources, listSalesReturns,
  SalesReturnError, updateSalesReturn, type ReturnSourceType,
} from "../lib/sales-returns";

const router: IRouter = Router();
// Scope authentication to this feature; never intercept storefront or other admin routers.
router.use("/admin/sales-returns", async (req, res, next) => {
  try {
    await ensureAdminSeeded();
    const header = req.header("authorization");
    const admin = await adminFromToken(header?.startsWith("Bearer ") ? header.slice(7) : undefined);
    if (!admin) { res.status(401).json({ error: "Admin authentication required" }); return; }
    res.locals.admin = admin;
    res.locals.permissions = await permissionsFor(admin.id, admin.isSuperAdmin);
    next();
  } catch (error) { next(error); }
});
function allowed(res: Response, module: string, action: "view" | "edit") {
  return res.locals.admin.isSuperAdmin || res.locals.permissions.includes(`${module}:${action}`);
}
function checkAccess(res: Response, source: ReturnSourceType, action: "view" | "edit") {
  const module = source === "individual" ? "orders" : "company-orders";
  if (!allowed(res, "inventory", "view") || !allowed(res, module, "view") ||
      !allowed(res, "inventory", action) || !allowed(res, module, action))
    throw new SalesReturnError(403, "لا تملك صلاحية المخزون والطلب الأصلي المطلوبة لهذا الإجراء");
}
function route(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch((error) => {
      if (error instanceof SalesReturnError) res.status(error.status).json({ error: error.message });
      else next(error);
    });
  };
}
function parsed<T>(schema: { safeParse(v: unknown): { success: boolean; data?: T } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new SalesReturnError(400, "مدخلات سجل المرتجع غير صالحة");
  return result.data!;
}
function idOf(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new SalesReturnError(400, "رقم المرتجع غير صالح");
  return id;
}
function revision(value: string | Date) { return value instanceof Date ? value.toISOString() : value; }

router.get("/admin/sales-returns/sources", route(async (req, res) => {
  const query = parsed(Api.ListSalesReturnSourcesQueryParams, {
    ...req.query, ...(typeof req.query.sourceId === "string" ? { sourceId: Number(req.query.sourceId) } : {}),
  });
  checkAccess(res, query.sourceType, "view");
  res.json(Api.ListSalesReturnSourcesResponse.parse(await listReturnSources(query.sourceType, query.search, query.sourceId)));
}));
router.get("/admin/sales-returns", route(async (req, res) => {
  const query = parsed(Api.ListSalesReturnsQueryParams, req.query);
  if (!allowed(res, "inventory", "view")) throw new SalesReturnError(403, "صلاحية عرض المخزون مطلوبة");
  const sources = (["individual", "company"] as const).filter((source) => allowed(res, source === "individual" ? "orders" : "company-orders", "view"));
  res.json(Api.ListSalesReturnsResponse.parse(await listSalesReturns(sources, query.search, query.status)));
}));
router.post("/admin/sales-returns", route(async (req, res) => {
  const input = parsed(Api.CreateSalesReturnBody, req.body);
  checkAccess(res, input.sourceType, "edit");
  res.status(201).json(Api.CreateSalesReturnResponse.parse(await createSalesReturn(input, res.locals.admin.id)));
}));
router.get("/admin/sales-returns/:id", route(async (req, res) => {
  const record = await getSalesReturn(idOf(req));
  checkAccess(res, record.sourceType, "view");
  res.json(Api.GetSalesReturnResponse.parse(record));
}));
router.put("/admin/sales-returns/:id", route(async (req, res) => {
  const id = idOf(req);
  const input = parsed(Api.UpdateSalesReturnBody, req.body);
  const record = await getSalesReturn(id);
  checkAccess(res, record.sourceType, "edit");
  res.json(Api.UpdateSalesReturnResponse.parse(await updateSalesReturn(id, input, revision(input.expectedUpdatedAt))));
}));
router.post("/admin/sales-returns/:id/complete", route(async (req, res) => {
  const id = idOf(req);
  const input = parsed(Api.CompleteSalesReturnBody, req.body);
  const record = await getSalesReturn(id);
  checkAccess(res, record.sourceType, "edit");
  res.json(Api.CompleteSalesReturnResponse.parse(await completeSalesReturn(id, revision(input.expectedUpdatedAt), res.locals.admin.id)));
}));
router.post("/admin/sales-returns/:id/cancel", route(async (req, res) => {
  const id = idOf(req);
  const input = parsed(Api.CancelSalesReturnBody, req.body);
  const record = await getSalesReturn(id);
  checkAccess(res, record.sourceType, "edit");
  res.json(Api.CancelSalesReturnResponse.parse(await cancelSalesReturn(id, revision(input.expectedUpdatedAt))));
}));

export default router;