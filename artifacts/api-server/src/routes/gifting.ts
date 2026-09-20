import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
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
const newCategories = new Set([
  "VIP", "Sample", "Damage", "Marketing", "Tester",
  "B2B_EVALUATION", "TESTER", "VIP_GIFT", "INFLUENCERS", "DAMAGED", "OTHER",
]);

router.post("/admin/gifting-issues", permit("inventory", "edit"), async (req, res, next) => {
  try {
    const rawLines = Array.isArray(req.body?.lines) ? req.body.lines : [{
      productId: req.body?.productId,
      quantity: req.body?.quantity,
    }];
    const isLegacySingleLine = !Array.isArray(req.body?.lines);
    const lines: Array<{ productId: number; quantity: number }> = rawLines.map((line: any) => ({
      productId: Number(line?.productId),
      quantity: Number(line?.quantity),
    }));
    const category = req.body?.category;
    const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
    const recipientName = typeof req.body?.recipientName === "string" ? req.body.recipientName.trim() || null : null;
    const occasion = typeof req.body?.occasion === "string" ? req.body.occasion.trim() || null : null;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const issueDateText = typeof req.body?.issueDate === "string" && req.body.issueDate ? req.body.issueDate : null;
    const productIds = lines.map((line) => line.productId);
    const hasCompleteLegacyPair = req.body?.productId !== undefined && req.body?.quantity !== undefined;
    const hasLinePayload = Array.isArray(req.body?.lines) && req.body.lines.length > 0;
    if ((!hasLinePayload && (!hasCompleteLegacyPair || !isLegacySingleLine)) ||
      (hasLinePayload && hasCompleteLegacyPair) ||
      lines.some((line) => !Number.isSafeInteger(line.productId) || line.productId <= 0 ||
      !Number.isSafeInteger(line.quantity) || line.quantity <= 0) ||
      new Set(productIds).size !== productIds.length ||
      !newCategories.has(category) || !idempotencyKey || idempotencyKey.length > 200 ||
      ((category === "DAMAGED" || category === "OTHER") && (!reason || reason.length > 500)) ||
      (issueDateText && !/^\d{4}-\d{2}-\d{2}$/.test(issueDateText))) {
      return res.status(400).json({ error: "Valid product lines, category, positive quantities, idempotency key, and valid optional date are required; damaged and other movements require a reason" });
    }
    const issueDate = issueDateText ? new Date(`${issueDateText}T12:00:00.000Z`) : new Date();
    if (Number.isNaN(issueDate.getTime())) return res.status(400).json({ error: "Invalid issue date" });
    await ensureStandardAccountingChart();
    const actorId = res.locals.admin.id as number;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"gifting:" + idempotencyKey}, 0))`);
      const canonicalLines = [...lines].sort((a, b) => a.productId - b.productId);
      const operationKey = `manual:${idempotencyKey}:batch`;
      const legacyOperationKey = `manual:${idempotencyKey}`;
      const [existing] = await tx.select().from(giftingIssuesTable)
        .where(sql`${giftingIssuesTable.idempotencyKey} = ${idempotencyKey} OR ${giftingIssuesTable.dedupeKey} = ${operationKey} OR ${giftingIssuesTable.dedupeKey} = ${legacyOperationKey}`)
        .orderBy(giftingIssuesTable.id).limit(1);
      const existingRows = existing
        ? await tx.select().from(giftingIssuesTable)
          .where(inArray(giftingIssuesTable.dedupeKey, isLegacySingleLine
            ? [legacyOperationKey]
            : [operationKey, ...canonicalLines.map((line) => `manual:${idempotencyKey}:line:${line.productId}`)]))
          .orderBy(giftingIssuesTable.productId)
        : [];
      if (existing) {
        const same = existing.category === category &&
          existing.recipientName === recipientName && existing.occasion === occasion &&
          existing.reason === (reason || null) &&
          (!issueDateText || existing.issueDate.toISOString().slice(0, 10) === issueDate.toISOString().slice(0, 10)) &&
          existingRows.length === canonicalLines.length &&
          existingRows.every((row, index) => row.productId === canonicalLines[index].productId && row.quantity === canonicalLines[index].quantity);
        if (!same) throw Object.assign(new Error("Idempotency key was already used with different values"), { status: 409 });
        return existing;
      }
      const sortedIds = canonicalLines.map((line) => line.productId);
      const products = await tx.select().from(productsTable).where(inArray(productsTable.id, sortedIds))
        .orderBy(productsTable.id).for("update");
      if (products.length !== lines.length) throw Object.assign(new Error("Product not found"), { status: 404 });
      const byId = new Map(products.map((product) => [product.id, product]));
      const pricedLines = canonicalLines.map((line) => {
        const product = byId.get(line.productId)!;
        if (product.stockQuantity < line.quantity) throw Object.assign(new Error(`Insufficient stock for product ${line.productId}: ${product.stockQuantity} available`), { status: 409 });
        const unitCost = Number(product.averageCost);
        if (!Number.isFinite(unitCost) || unitCost <= 0) throw Object.assign(new Error("Every product must have a positive average cost before it can be issued"), { status: 409 });
        return { line, product, totalCost: (unitCost * line.quantity).toFixed(4) };
      });
      const combinedCost = pricedLines.reduce((sum: number, item: { totalCost: string }) => sum + Number(item.totalCost), 0).toFixed(4);
      // A batch has one operational identity.  Keep the legacy row identity for
      // the old single-line contract, but never make reconciliation infer a
      // batch from its first gifting_issue row.
      const movementSourceType = isLegacySingleLine ? "gifting_issue" : "gifting_issue_batch";
      const movementSourceId = isLegacySingleLine ? undefined : idempotencyKey;
      const inserted = [];
      for (const [index, item] of pricedLines.entries()) {
        const { line, product, totalCost } = item;
        const [issue] = await tx.insert(giftingIssuesTable).values({
          recipientName, category, occasion, reason: reason || null,
          comment: reason || "", productId: product.id,
          barcode: product.barcode ?? product.sku ?? String(product.id),
          descriptionSnapshot: product.nameAr || product.nameEn,
          quantity: line.quantity, totalCost, issueDate,
          dedupeKey: isLegacySingleLine ? legacyOperationKey : (index === 0 ? operationKey : `manual:${idempotencyKey}:line:${product.id}`),
          idempotencyKey: index === 0 ? idempotencyKey : null, createdBy: actorId,
        }).returning();
        inserted.push(issue);
        const quantityAfter = product.stockQuantity - line.quantity;
        await adjustOperationalBalances(tx, product.id, -line.quantity, product.averageCost, product.stockQuantity);
        await tx.update(productsTable).set({ stockQuantity: quantityAfter }).where(eq(productsTable.id, product.id));
        await tx.insert(inventoryMovementsTable).values({
          productId: product.id, movementType: "decrease", quantityChange: -line.quantity,
          quantityBefore: product.stockQuantity, quantityAfter,
          reason: `Product movement ${category}`, unitCost: product.averageCost, totalCost,
          sourceType: movementSourceType, sourceId: isLegacySingleLine ? String(issue.id) : movementSourceId,
          eventKey: isLegacySingleLine ? `gifting:${idempotencyKey}` : `gifting:${idempotencyKey}:${product.id}`, performedBy: actorId,
        });
      }
      await postJournalEntry({
        entryDate: issueDate.toISOString().slice(0, 10),
        description: `Product movement: ${category}`,
        createdBy: actorId, sourceType: movementSourceType,
        sourceId: isLegacySingleLine ? String(inserted[0].id) : movementSourceId,
        lines: [{ accountCode: "6160", debit: combinedCost }, { accountCode: "1140", credit: combinedCost }],
      }, tx);
      return inserted[0];
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