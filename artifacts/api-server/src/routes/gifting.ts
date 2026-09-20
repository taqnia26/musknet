import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db, giftingIssuesTable, inventoryMovementsTable, productsTable } from "@workspace/db";
import { adminFromToken, publicAdmin } from "../lib/admin-auth";
import { permit } from "./admin";
import { adjustOperationalBalances } from "../lib/operations";
import { ensureStandardAccountingChart, postJournalEntry } from "../lib/accounting";

const router: IRouter = Router();
router.use("/admin/gifting-issues", async (req, res, next) => {
  try {
    const token = req.header("authorization")?.startsWith("Bearer ") ? req.header("authorization")!.slice(7) : undefined;
    const user = await adminFromToken(token);
    if (!user) return res.status(401).json({ error: "Admin authentication required" });
    res.locals.admin = user;
    res.locals.permissions = (await publicAdmin(user)).permissions;
    return next();
  } catch (error) { return next(error); }
});
router.get("/admin/gifting-issues", permit("inventory", "view"), async (req, res, next) => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const filters = [];
    if (category) filters.push(eq(giftingIssuesTable.category, category as "VIP"));
    if (search) filters.push(ilike(giftingIssuesTable.recipientName, `%${search}%`));
    const rows = await db.select().from(giftingIssuesTable).where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(giftingIssuesTable.importedAt), desc(giftingIssuesTable.id));
    const [summary] = await db.select({
      rows: sql<number>`count(*)::int`, units: sql<number>`coalesce(sum(${giftingIssuesTable.quantity}),0)::int`,
      totalCost: sql<string>`coalesce(sum(${giftingIssuesTable.totalCost}),0)::numeric`,
    }).from(giftingIssuesTable).where(filters.length ? and(...filters) : undefined);
    res.json({ rows, summary });
  } catch (error) { next(error); }
});
const newCategories = new Set(["B2B_EVALUATION", "TESTER", "VIP_GIFT", "INFLUENCERS"]);

router.post("/admin/gifting-issues", permit("inventory", "edit"), async (req, res, next) => {
  try {
    const productId = Number(req.body?.productId);
    const quantity = Number(req.body?.quantity);
    const category = req.body?.category;
    const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
    const recipientName = typeof req.body?.recipientName === "string" ? req.body.recipientName.trim() || null : null;
    const occasion = typeof req.body?.occasion === "string" ? req.body.occasion.trim() || null : null;
    const issueDateText = typeof req.body?.issueDate === "string" && req.body.issueDate ? req.body.issueDate : null;
    if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0 ||
      !newCategories.has(category) || !idempotencyKey || idempotencyKey.length > 200 ||
      (issueDateText && !/^\d{4}-\d{2}-\d{2}$/.test(issueDateText))) {
      return res.status(400).json({ error: "A product, valid use, positive quantity, idempotency key, and valid optional date are required" });
    }
    const issueDate = issueDateText ? new Date(`${issueDateText}T12:00:00.000Z`) : new Date();
    if (Number.isNaN(issueDate.getTime())) return res.status(400).json({ error: "Invalid issue date" });
    await ensureStandardAccountingChart();
    const actorId = res.locals.admin.id as number;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"gifting:" + idempotencyKey}, 0))`);
      const [existing] = await tx.select().from(giftingIssuesTable)
        .where(eq(giftingIssuesTable.idempotencyKey, idempotencyKey)).limit(1);
      if (existing) {
        const same = existing.productId === productId && existing.quantity === quantity && existing.category === category &&
          existing.recipientName === recipientName && existing.occasion === occasion &&
          existing.issueDate.toISOString().slice(0, 10) === issueDate.toISOString().slice(0, 10);
        if (!same) throw Object.assign(new Error("Idempotency key was already used with different values"), { status: 409 });
        return existing;
      }
      await tx.execute(sql`select id from ${productsTable} where ${productsTable.id} = ${productId} for update`);
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
      if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
      if (product.stockQuantity < quantity) throw Object.assign(new Error(`Insufficient stock: ${product.stockQuantity} available`), { status: 409 });
      const unitCost = Number(product.averageCost);
      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        throw Object.assign(new Error("Product must have a positive average cost before it can be issued"), { status: 409 });
      }
      const totalCost = (unitCost * quantity).toFixed(4);
      const [issue] = await tx.insert(giftingIssuesTable).values({
        recipientName, category, occasion, productId,
        barcode: product.barcode ?? product.sku ?? String(product.id),
        descriptionSnapshot: product.nameAr || product.nameEn,
        quantity, totalCost, issueDate,
        dedupeKey: `manual:${idempotencyKey}`, idempotencyKey, createdBy: actorId,
      }).returning();
      const quantityAfter = product.stockQuantity - quantity;
      await adjustOperationalBalances(tx, product.id, -quantity, product.averageCost, product.stockQuantity);
      await tx.update(productsTable).set({ stockQuantity: quantityAfter }).where(eq(productsTable.id, product.id));
      await tx.insert(inventoryMovementsTable).values({
        productId, movementType: "decrease", quantityChange: -quantity,
        quantityBefore: product.stockQuantity, quantityAfter,
        reason: `Gifting issue ${category}`, unitCost: product.averageCost, totalCost,
        sourceType: "gifting_issue", sourceId: String(issue.id),
        eventKey: `gifting:${idempotencyKey}`, performedBy: actorId,
      });
      await postJournalEntry({
        entryDate: issueDate.toISOString().slice(0, 10),
        description: `Gifts and testers: ${product.nameEn}`,
        createdBy: actorId, sourceType: "gifting_issue", sourceId: String(issue.id),
        lines: [{ accountCode: "6160", debit: totalCost }, { accountCode: "1140", credit: totalCost }],
      }, tx);
      return issue;
    });
    return res.status(201).json(result);
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : undefined;
    if (status) return res.status(status).json({ error: (error as Error).message });
    return next(error);
  }
});
router.get("/admin/gifting-issues/:id", permit("inventory", "view"), async (req, res, next) => {
  try {
    const [row] = await db.select().from(giftingIssuesTable).where(eq(giftingIssuesTable.id, Number(req.params.id))).limit(1);
    if (!row) return res.status(404).json({ error: "Gifting issue not found" });
    return res.json(row);
  } catch (error) { return next(error); }
});
export default router;