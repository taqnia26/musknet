import { Router, type IRouter, type Request, type RequestHandler, type Response, type NextFunction } from "express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, productsTable, productionPlansTable } from "@workspace/db";
import * as Api from "@workspace/api-zod";
import { inventoryReorderSuggestions } from "../lib/operations";

type Guard = (module: string, action: "view" | "edit" | "delete") => RequestHandler;
type Status = typeof productionPlansTable.$inferSelect.status;
const transitions: Record<string, string[]> = {
  future: ["planning", "cancelled"],
  planning: ["future", "under_review", "on_hold", "cancelled"],
  under_review: ["planning", "approved", "on_hold", "cancelled"],
  approved: ["under_review", "scheduled", "on_hold", "cancelled"],
  scheduled: ["approved", "in_production", "on_hold", "cancelled"],
  in_production: ["completed", "on_hold"],
  on_hold: ["planning", "under_review", "approved", "scheduled", "in_production", "cancelled"],
  completed: [],
  cancelled: [],
};
const route = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
const idOf = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  return raw && /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(id) ? id : null;
};
const stamp = (date: Date | null) => date?.toISOString() ?? null;
const calendarDate = (value: Date | string | null | undefined) =>
  value ? value instanceof Date ? value.toISOString().slice(0, 10) : value : null;
const validCost = (value: string) => /^\d{1,15}(?:\.\d{1,4})?$/.test(value);
function validPlanDetails(details: {
  productName: string; category: string; productType: string;
  manufacturingCountry: string; factory: string; estimatedCost: string;
  targetLaunchDate: string | null; targetProductionDate: string | null;
}) {
  return [details.productName, details.category, details.productType, details.manufacturingCountry, details.factory]
    .every(value => value.trim().length > 0)
    && validCost(details.estimatedCost)
    && (!details.targetLaunchDate || !details.targetProductionDate || details.targetLaunchDate >= details.targetProductionDate);
}
function serialize(row: typeof productionPlansTable.$inferSelect) {
  return {
    ...row,
    fundingStatus: row.securedAt ? "secured" : row.approvedAt ? "pending" : "not_requested",
    approvedAt: stamp(row.approvedAt),
    securedAt: stamp(row.securedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function error(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}
async function productExists(id: number | null | undefined) {
  if (id == null) return true;
  return (await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.id, id)).limit(1)).length > 0;
}

export function createProductionPlansRouter(permit: Guard): IRouter {
  const router: IRouter = Router();

  router.get("/admin/production/catalog-products", permit("manufacturing", "view"), route(async (_req, res) => {
    const rows = await db.select({ id: productsTable.id, nameAr: productsTable.nameAr, nameEn: productsTable.nameEn })
      .from(productsTable)
      .where(and(eq(productsTable.isActive, true), eq(productsTable.operationalType, "finished_good")))
      .orderBy(productsTable.nameAr);
    res.json(Api.AdminListProductionCatalogProductsResponse.parse(rows));
  }));

  router.get("/admin/production/plans", permit("manufacturing", "view"), route(async (_req, res) => {
    const rows = await db.select().from(productionPlansTable).orderBy(desc(productionPlansTable.createdAt), desc(productionPlansTable.id));
    res.json(Api.AdminListProductionPlansResponse.parse(rows.map(serialize)));
  }));

  router.post("/admin/production/plans", permit("manufacturing", "edit"), route(async (req, res) => {
    const parsed = Api.AdminCreateProductionPlanBody.strict().safeParse(req.body);
    if (!parsed.success) { error(res, 400, parsed.error.message); return; }
    const input = parsed.data;
    if (!["future", "planning", "under_review"].includes(input.status)) {
      error(res, 400, "Create a plan before requesting approval"); return;
    }
    if (!validPlanDetails({
      ...input,
      targetLaunchDate: calendarDate(input.targetLaunchDate),
      targetProductionDate: calendarDate(input.targetProductionDate),
    })) { error(res, 400, "Complete the plan details and keep launch on or after production"); return; }
    if (!await productExists(input.productId)) { error(res, 400, "Product does not exist"); return; }
    const [row] = await db.insert(productionPlansTable).values({
      ...input,
      productName: input.productName.trim(),
      category: input.category.trim(),
      productType: input.productType.trim(),
      manufacturingCountry: input.manufacturingCountry.trim(),
      factory: input.factory.trim(),
      notes: input.notes?.trim() ?? "",
      targetLaunchDate: calendarDate(input.targetLaunchDate),
      targetProductionDate: calendarDate(input.targetProductionDate),
      productId: input.productId ?? null,
      createdBy: (res.locals.admin as { id: number }).id,
    }).returning();
    res.status(201).json(Api.AdminCreateProductionPlanResponse.parse(serialize(row)));
  }));

  router.patch("/admin/production/plans/:id", permit("manufacturing", "edit"), route(async (req, res) => {
    const id = idOf(req.params.id);
    if (!id) { error(res, 400, "Invalid plan id"); return; }
    const parsed = Api.AdminUpdateProductionPlanBody.strict().safeParse(req.body);
    if (!parsed.success || !Object.keys(req.body ?? {}).length) {
      error(res, 400, parsed.success ? "At least one change is required" : parsed.error.message); return;
    }
    const input = parsed.data;
    if (!await productExists(input.productId)) { error(res, 400, "Product does not exist"); return; }
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(productionPlansTable).where(eq(productionPlansTable.id, id)).for("update");
      if (!existing) return { status: 404, message: "Plan not found" } as const;
      if (["completed", "cancelled"].includes(existing.status)) return { status: 409, message: "Closed plans cannot be edited" } as const;
      const status: Status = input.status ?? existing.status;
      if (!validPlanDetails({
        productName: input.productName ?? existing.productName,
        category: input.category ?? existing.category,
        productType: input.productType ?? existing.productType,
        manufacturingCountry: input.manufacturingCountry ?? existing.manufacturingCountry,
        factory: input.factory ?? existing.factory,
        estimatedCost: input.estimatedCost ?? existing.estimatedCost,
        targetLaunchDate: input.targetLaunchDate === undefined ? existing.targetLaunchDate : calendarDate(input.targetLaunchDate),
        targetProductionDate: input.targetProductionDate === undefined ? existing.targetProductionDate : calendarDate(input.targetProductionDate),
      })) return { status: 400, message: "Complete the plan details and keep launch on or after production" } as const;
      if (status !== existing.status && !transitions[existing.status]?.includes(status)) {
        return { status: 409, message: "Invalid production status change" } as const;
      }
      const sensitive = ["productId", "productName", "category", "productType", "plannedQuantity", "estimatedCost"] as const;
      if (existing.approvedAt && sensitive.some(key => input[key] !== undefined && input[key] !== existing[key])) {
        return { status: 409, message: "Change funding details before approval, not after it" } as const;
      }
      if (existing.securedAt && ["planning", "under_review"].includes(status)) {
        return { status: 409, message: "Financed plans cannot return to review" } as const;
      }
      if (["scheduled", "in_production", "completed"].includes(status) && !existing.securedAt) {
        return { status: 409, message: "Finance must confirm funds before production is scheduled" } as const;
      }
      const firstApproval = status === "approved" && !existing.approvedAt;
      if (firstApproval && Number(input.estimatedCost ?? existing.estimatedCost) <= 0) {
        return { status: 400, message: "An estimated cost is needed before finance can secure funds" } as const;
      }
      const resetApproval = !!existing.approvedAt && !existing.securedAt && ["future", "planning", "under_review"].includes(status);
      const { targetLaunchDate, targetProductionDate, ...fields } = input;
      const [row] = await tx.update(productionPlansTable).set({
        ...fields,
        ...(input.productName !== undefined ? { productName: input.productName.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category.trim() } : {}),
        ...(input.productType !== undefined ? { productType: input.productType.trim() } : {}),
        ...(input.manufacturingCountry !== undefined ? { manufacturingCountry: input.manufacturingCountry.trim() } : {}),
        ...(input.factory !== undefined ? { factory: input.factory.trim() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
        ...(targetLaunchDate !== undefined ? { targetLaunchDate: calendarDate(targetLaunchDate) } : {}),
        ...(targetProductionDate !== undefined ? { targetProductionDate: calendarDate(targetProductionDate) } : {}),
        ...(firstApproval ? { approvedAt: new Date() } : {}),
        ...(resetApproval ? { approvedAt: null } : {}),
        updatedAt: new Date(),
      }).where(eq(productionPlansTable.id, id)).returning();
      return { row } as const;
    });
    if ("message" in result && typeof result.status === "number") { error(res, result.status, result.message); return; }
    res.json(Api.AdminUpdateProductionPlanResponse.parse(serialize(result.row)));
  }));

  router.get("/admin/finance/production-funding", permit("finance", "view"), route(async (_req, res) => {
    const rows = await db.select().from(productionPlansTable)
      .where(inArray(productionPlansTable.status, ["approved", "scheduled", "in_production", "on_hold"]))
      .orderBy(desc(productionPlansTable.approvedAt), desc(productionPlansTable.id));
    res.json(Api.AdminListProductionFundingResponse.parse(rows.filter(row => row.approvedAt).map(serialize)));
  }));

  router.post("/admin/production/plans/:id/secure-funds", permit("finance", "edit"), route(async (req, res) => {
    const id = idOf(req.params.id);
    if (!id) { error(res, 400, "Invalid plan id"); return; }
    const parsed = Api.AdminSecureProductionFundsBody.strict().safeParse(req.body);
    if (!parsed.success) { error(res, 400, parsed.error.message); return; }
    const result = await db.transaction(async (tx) => {
      const [plan] = await tx.select().from(productionPlansTable).where(eq(productionPlansTable.id, id)).for("update");
      if (!plan) return { status: 404, message: "Plan not found" } as const;
      if (plan.status !== "approved" || !plan.approvedAt || plan.securedAt) {
        return { status: 409, message: "Only an approved, unfunded plan can be secured" } as const;
      }
      const [row] = await tx.update(productionPlansTable).set({
        securedAt: new Date(),
        securedBy: (res.locals.admin as { id: number }).id,
        fundingNote: parsed.data.note?.trim() ?? null,
        updatedAt: new Date(),
      }).where(and(eq(productionPlansTable.id, id), isNull(productionPlansTable.securedAt))).returning();
      return { row } as const;
    });
    if ("message" in result && typeof result.status === "number") { error(res, result.status, result.message); return; }
    res.json(Api.AdminSecureProductionFundsResponse.parse(serialize(result.row)));
  }));

  router.get("/admin/production/reorder-alerts", permit("manufacturing", "view"), route(async (_req, res) => {
    const [suggestions, products, active] = await Promise.all([
      inventoryReorderSuggestions(false, true),
      db.select({
        id: productsTable.id, nameAr: productsTable.nameAr, nameEn: productsTable.nameEn,
        operationalType: productsTable.operationalType, sellable: productsTable.sellable,
      }).from(productsTable),
      db.select({ id: productionPlansTable.id, productId: productionPlansTable.productId })
        .from(productionPlansTable)
        .where(inArray(productionPlansTable.status, ["future", "planning", "under_review", "approved", "scheduled", "in_production", "on_hold"])),
    ]);
    const byId = new Map(products.map(product => [product.id, product]));
    const alerts = suggestions.filter(item => item.status !== "ok").map(item => ({
      ...item,
      product: byId.get(item.productId),
      activePlanIds: active.filter(plan => plan.productId === item.productId).map(plan => plan.id),
    })).filter(item => item.product?.operationalType === "finished_good" && item.product.sellable)
      .map(({ product, ...item }) => ({ ...item, nameAr: product!.nameAr, nameEn: product!.nameEn }));
    res.json(Api.AdminListProductionReorderAlertsResponse.parse(alerts));
  }));

  return router;
}