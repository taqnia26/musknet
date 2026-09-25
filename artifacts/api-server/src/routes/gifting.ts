import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import { db, giftingIssueReturnsTable, giftingIssuesTable, inventoryBalancesTable, inventoryLocationsTable, inventoryMovementsTable, productsTable } from "@workspace/db";
import { adminFromToken, publicAdmin } from "../lib/admin-auth";
import { permit } from "./admin";
import { adjustOperationalBalances } from "../lib/operations";
import { ensureStandardAccountingChart, postJournalEntry } from "../lib/accounting";

const router: IRouter = Router();
const USED_RETURN_LOCATION_CODE = "B2B_USED_RETURN";
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
    const filters = [isNull(giftingIssuesTable.voidedAt)];
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
    const lines: Array<{ productId: number; quantity: number; stockSource: "normal" | "used_return" | undefined }> = rawLines.map((line: any) => ({
      productId: Number(line?.productId),
      quantity: Number(line?.quantity),
      stockSource: line?.stockSource,
    }));
    const category = req.body?.category;
    const idempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
    const recipientName = typeof req.body?.recipientName === "string" ? req.body.recipientName.trim() || null : null;
    const city = typeof req.body?.city === "string" ? req.body.city.trim() || null : null;
    const country = typeof req.body?.country === "string" ? req.body.country.trim() || null : null;
    const occasion = typeof req.body?.occasion === "string" ? req.body.occasion.trim() || null : null;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const comment = req.body?.comment === undefined
      ? reason || ""
      : typeof req.body.comment === "string" ? req.body.comment.trim() : "";
    const issueDateText = typeof req.body?.issueDate === "string" && req.body.issueDate ? req.body.issueDate : null;
    const productIds = lines.map((line) => line.productId);
    const hasInvalidSource = lines.some((line) => line.stockSource !== undefined && line.stockSource !== "normal" && line.stockSource !== "used_return");
    const normalizedLines = lines.map((line) => ({ ...line, stockSource: line.stockSource ?? "normal" as const }));
    const sourcePairs = normalizedLines.map((line) => `${line.productId}:${line.stockSource}`);
    const hasCompleteLegacyPair = req.body?.productId !== undefined && req.body?.quantity !== undefined;
    const hasLinePayload = Array.isArray(req.body?.lines) && req.body.lines.length > 0;
    if ((!hasLinePayload && (!hasCompleteLegacyPair || !isLegacySingleLine)) ||
      (hasLinePayload && hasCompleteLegacyPair) ||
      lines.some((line) => !Number.isSafeInteger(line.productId) || line.productId <= 0 ||
      !Number.isSafeInteger(line.quantity) || line.quantity <= 0) ||
      hasInvalidSource ||
      (["TESTER", "B2B_EVALUATION"].includes(category) && Array.isArray(req.body?.lines) && lines.some((line) => line.stockSource === undefined)) ||
      (!["TESTER", "B2B_EVALUATION"].includes(category) && normalizedLines.some((line) => line.stockSource === "used_return")) ||
      (req.body?.comment !== undefined && req.body.comment !== null &&
        (typeof req.body.comment !== "string" || req.body.comment.trim().length > 500)) ||
      new Set(sourcePairs).size !== sourcePairs.length ||
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
      const canonicalLines = [...normalizedLines].sort((a, b) => a.productId - b.productId || a.stockSource.localeCompare(b.stockSource));
      const operationKey = `manual:${idempotencyKey}:batch`;
      const legacyOperationKey = `manual:${idempotencyKey}`;
      const batchLineKeys = canonicalLines.flatMap((line) => [
        `manual:${idempotencyKey}:line:${line.productId}:${line.stockSource}`,
        `manual:${idempotencyKey}:line:${line.productId}`,
      ]).filter((key, index, keys) => keys.indexOf(key) === index);
      const [existing] = await tx.select().from(giftingIssuesTable)
        .where(sql`${giftingIssuesTable.idempotencyKey} = ${idempotencyKey} OR ${giftingIssuesTable.dedupeKey} = ${operationKey} OR ${giftingIssuesTable.dedupeKey} = ${legacyOperationKey}`)
        .orderBy(giftingIssuesTable.id).limit(1);
      const existingRows = existing
        ? await tx.select().from(giftingIssuesTable)
          .where(inArray(giftingIssuesTable.dedupeKey, isLegacySingleLine
            ? [legacyOperationKey]
            : [operationKey, ...batchLineKeys]))
          .orderBy(giftingIssuesTable.productId, giftingIssuesTable.stockSource)
        : [];
      if (existing) {
        const same = existing.category === category &&
          existing.recipientName === recipientName && existing.occasion === occasion &&
          existing.city === city && existing.country === country &&
          existing.reason === (reason || null) &&
          existing.comment === comment &&
          (!issueDateText || existing.issueDate.toISOString().slice(0, 10) === issueDate.toISOString().slice(0, 10)) &&
          existingRows.length === canonicalLines.length &&
          existingRows.every((row, index) => row.productId === canonicalLines[index].productId &&
            row.quantity === canonicalLines[index].quantity && row.stockSource === canonicalLines[index].stockSource);
        if (!same) throw Object.assign(new Error("Idempotency key was already used with different values"), { status: 409 });
        return existing;
      }
      const sortedIds = canonicalLines.map((line) => line.productId);
      const products = await tx.select().from(productsTable).where(inArray(productsTable.id, sortedIds))
        .orderBy(productsTable.id).for("update");
      if (products.length !== new Set(productIds).size) throw Object.assign(new Error("Product not found"), { status: 404 });
      const byId = new Map(products.map((product) => [product.id, product]));
      const [usedLocation] = canonicalLines.some((line) => line.stockSource === "used_return")
        ? await tx.select().from(inventoryLocationsTable)
          .where(eq(inventoryLocationsTable.code, USED_RETURN_LOCATION_CODE)).limit(1)
        : [];
      if (canonicalLines.some((line) => line.stockSource === "used_return") && !usedLocation) {
        throw Object.assign(new Error("Used-return inventory location is not configured"), { status: 409 });
      }
      const usedBalances = usedLocation
        ? await tx.select().from(inventoryBalancesTable)
          .where(and(eq(inventoryBalancesTable.locationId, usedLocation.id), inArray(inventoryBalancesTable.productId, sortedIds)))
          .for("update")
        : [];
      const usedByProduct = new Map(usedBalances.map((balance) => [balance.productId, balance]));
      const pricedLines = canonicalLines.map((line) => {
        const product = byId.get(line.productId)!;
        const usedBalance = usedByProduct.get(line.productId);
        const available = line.stockSource === "used_return" ? (usedBalance?.available ?? 0) : product.stockQuantity;
        if (available < line.quantity) throw Object.assign(new Error(`Insufficient ${line.stockSource === "used_return" ? "used-return" : "normal"} stock for product ${line.productId}: ${available} available`), { status: 409 });
        const unitCost = Number(line.stockSource === "used_return" ? (usedBalance?.averageCost ?? product.averageCost) : product.averageCost);
        if (!Number.isFinite(unitCost) || unitCost <= 0) throw Object.assign(new Error("Every product must have a positive average cost before it can be issued"), { status: 409 });
        return { line, product, usedBalance, totalCost: (unitCost * line.quantity).toFixed(4) };
      });
      const combinedCost = pricedLines.reduce((sum: number, item: { totalCost: string }) => sum + Number(item.totalCost), 0).toFixed(4);
      // A batch has one operational identity.  Keep the legacy row identity for
      // the old single-line contract, but never make reconciliation infer a
      // batch from its first gifting_issue row.
      const movementSourceType = isLegacySingleLine ? "gifting_issue" : "gifting_issue_batch";
      const movementSourceId = isLegacySingleLine ? undefined : idempotencyKey;
      const inserted = [];
      for (const [index, item] of pricedLines.entries()) {
        const { line, product, usedBalance, totalCost } = item;
        const [issue] = await tx.insert(giftingIssuesTable).values({
          recipientName, city, country, category, occasion, reason: reason || null,
          comment, productId: product.id,
          barcode: product.barcode ?? product.sku ?? String(product.id),
          descriptionSnapshot: product.nameAr || product.nameEn,
          quantity: line.quantity, stockSource: line.stockSource, totalCost, issueDate,
          dedupeKey: isLegacySingleLine ? legacyOperationKey : (index === 0 ? operationKey : `manual:${idempotencyKey}:line:${product.id}:${line.stockSource}`),
          idempotencyKey: index === 0 ? idempotencyKey : null, createdBy: actorId,
        }).returning();
        inserted.push(issue);
        const quantityBefore = line.stockSource === "used_return" ? (usedBalance?.available ?? 0) : product.stockQuantity;
        const quantityAfter = quantityBefore - line.quantity;
        if (line.stockSource === "used_return") {
          await tx.update(inventoryBalancesTable).set({ available: quantityAfter, updatedAt: new Date() })
            .where(eq(inventoryBalancesTable.id, usedBalance!.id));
        } else {
          await adjustOperationalBalances(tx, product.id, -line.quantity, product.averageCost, product.stockQuantity);
          await tx.update(productsTable).set({ stockQuantity: quantityAfter }).where(eq(productsTable.id, product.id));
        }
        await tx.insert(inventoryMovementsTable).values({
          productId: product.id, movementType: "decrease", quantityChange: -line.quantity,
          quantityBefore, quantityAfter,
          reason: `Product movement ${category}`, unitCost: (line.stockSource === "used_return" ? Number(usedBalance!.averageCost) : Number(product.averageCost)).toFixed(4), totalCost,
          sourceType: line.stockSource === "used_return" ? "b2b_tester_used_return" : movementSourceType,
          sourceId: isLegacySingleLine ? String(issue.id) : movementSourceId,
          eventKey: isLegacySingleLine ? `gifting:${idempotencyKey}` : `gifting:${idempotencyKey}:${product.id}:${line.stockSource}`, performedBy: actorId,
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
router.get("/admin/gifting-issues/tester-availability", permit("inventory", "view"), async (req, res, next) => {
  try {
    const productId = Number(req.query.productId);
    if (!Number.isSafeInteger(productId) || productId <= 0) return res.status(400).json({ error: "Valid productId is required" });
    const [product] = await db.select({ stockQuantity: productsTable.stockQuantity }).from(productsTable)
      .where(eq(productsTable.id, productId)).limit(1);
    if (!product) return res.status(404).json({ error: "Product not found" });
    const [used] = await db.select({ available: inventoryBalancesTable.available })
      .from(inventoryBalancesTable)
      .innerJoin(inventoryLocationsTable, eq(inventoryBalancesTable.locationId, inventoryLocationsTable.id))
      .where(and(eq(inventoryBalancesTable.productId, productId), eq(inventoryLocationsTable.code, USED_RETURN_LOCATION_CODE)))
      .limit(1);
    const usedReturnAvailable = used?.available ?? 0;
    return res.json({
      productId,
      normalAvailable: product.stockQuantity,
      usedReturnAvailable,
      totalAvailable: product.stockQuantity + usedReturnAvailable,
    });
  } catch (error) { return next(error); }
});
router.post("/admin/gifting-issues/:id/return", permit("inventory", "edit"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const quantity = Number(req.body?.quantity);
    const condition = req.body?.condition;
    const returnIdempotencyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0 ||
      (condition !== "new" && condition !== "used") || !returnIdempotencyKey || returnIdempotencyKey.length > 200) {
      return res.status(400).json({ error: "Valid quantity, return condition, and idempotency key are required" });
    }
    await ensureStandardAccountingChart();
    const actorId = res.locals.admin.id as number;
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"gifting-return:" + returnIdempotencyKey}, 0))`);
      await tx.execute(sql`select id from ${giftingIssuesTable} where ${giftingIssuesTable.id} = ${id} for update`);
      const [issue] = await tx.select().from(giftingIssuesTable)
        .where(and(eq(giftingIssuesTable.id, id), isNull(giftingIssuesTable.voidedAt))).limit(1);
      if (!issue) throw Object.assign(new Error("Gifting issue not found"), { status: 404 });
      const [priorReturn] = await tx.select().from(giftingIssueReturnsTable)
        .where(eq(giftingIssueReturnsTable.idempotencyKey, returnIdempotencyKey)).limit(1);
      if (priorReturn) {
        if (priorReturn.issueId !== issue.id || priorReturn.quantity !== quantity || priorReturn.condition !== condition) {
          throw Object.assign(new Error("Return idempotency key was already used with different values"), { status: 409 });
        }
        return priorReturn.responseSnapshot;
      }
      if (issue.category !== "B2B_EVALUATION" && issue.category !== "INFLUENCERS") {
        throw Object.assign(new Error("Only B2B evaluation and influencer issues can be returned"), { status: 409 });
      }
      if (issue.stockSource === "used_return" && condition === "new") {
        throw Object.assign(new Error("An opened tester cannot be returned as new"), { status: 409 });
      }
      if (issue.returnCondition && issue.returnCondition !== condition && issue.returnedQuantity > 0 && issue.returnCondition !== "mixed") {
        if (issue.stockSource === "used_return") {
          throw Object.assign(new Error("An opened tester must keep the opened return condition"), { status: 409 });
        }
      }
      const outstanding = issue.quantity - issue.returnedQuantity;
      if (quantity > outstanding) throw Object.assign(new Error(`Return exceeds outstanding quantity: ${outstanding} available`), { status: 409 });
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, issue.productId)).for("update").limit(1);
      if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
      const unitCost = Number(issue.totalCost) / issue.quantity;
      const returnCost = (unitCost * quantity).toFixed(4);
      let quantityBefore: number;
      let quantityAfter: number;
      if (condition === "new") {
        quantityBefore = product.stockQuantity;
        quantityAfter = quantityBefore + quantity;
        await adjustOperationalBalances(tx, product.id, quantity, unitCost, product.stockQuantity);
        await tx.update(productsTable).set({ stockQuantity: quantityAfter }).where(eq(productsTable.id, product.id));
      } else {
        let [usedLocation] = await tx.select().from(inventoryLocationsTable)
          .where(eq(inventoryLocationsTable.code, USED_RETURN_LOCATION_CODE)).for("update").limit(1);
        if (!usedLocation) {
          [usedLocation] = await tx.insert(inventoryLocationsTable).values({
            name: "تيستر مفتوح (Opened Testers)", code: USED_RETURN_LOCATION_CODE, type: "virtual", isDefault: false, active: true,
          }).returning();
        }
        let [balance] = await tx.select().from(inventoryBalancesTable)
          .where(and(eq(inventoryBalancesTable.productId, product.id), eq(inventoryBalancesTable.locationId, usedLocation.id)))
          .for("update").limit(1);
        if (!balance) {
          [balance] = await tx.insert(inventoryBalancesTable).values({
            productId: product.id, locationId: usedLocation.id, available: 0, averageCost: unitCost.toFixed(4),
          }).returning();
        }
        quantityBefore = balance.available;
        quantityAfter = quantityBefore + quantity;
        const newAverageCost = quantityAfter > 0
          ? (((Number(balance.averageCost) * quantityBefore) + (unitCost * quantity)) / quantityAfter).toFixed(4)
          : unitCost.toFixed(4);
        await tx.update(inventoryBalancesTable).set({ available: quantityAfter, averageCost: newAverageCost, updatedAt: new Date() })
          .where(eq(inventoryBalancesTable.id, balance.id));
      }
      const returnedQuantity = issue.returnedQuantity + quantity;
      const nextReturnCondition = issue.returnCondition && issue.returnCondition !== condition ? "mixed" : condition;
      const returnSourceType = issue.category === "INFLUENCERS" ? "gifting_issue_return" : "b2b_evaluation_return";
      await tx.insert(inventoryMovementsTable).values({
        productId: product.id, movementType: "increase", quantityChange: quantity,
        quantityBefore, quantityAfter, reason: `${issue.category === "INFLUENCERS" ? "Influencer" : "B2B evaluation"} return (${condition})`,
        unitCost: unitCost.toFixed(4), totalCost: returnCost,
        sourceType: returnSourceType,
        sourceId: `${issue.id}:${returnedQuantity}`,
        eventKey: `${issue.category === "INFLUENCERS" ? "gifting" : "b2b"}:return:${issue.id}:${returnedQuantity}:${condition}`,
        performedBy: actorId,
      });
      await postJournalEntry({
        entryDate: new Date().toISOString().slice(0, 10),
        description: `${issue.category === "INFLUENCERS" ? "Influencer" : "B2B evaluation"} return #${issue.id} (${condition})`,
        createdBy: actorId, sourceType: returnSourceType, sourceId: `${issue.id}:${returnedQuantity}`,
        lines: [{ accountCode: "1140", debit: returnCost }, { accountCode: "6160", credit: returnCost }],
      }, tx);
      const [result] = await tx.update(giftingIssuesTable).set({
        returnedQuantity,
        returnCondition: nextReturnCondition,
        returnedAt: returnedQuantity === issue.quantity ? new Date() : null,
      }).where(eq(giftingIssuesTable.id, issue.id)).returning();
      const response = { ...result, quantity, condition };
      await tx.insert(giftingIssueReturnsTable).values({
        issueId: issue.id, idempotencyKey: returnIdempotencyKey, quantity, condition,
        responseSnapshot: response,
      });
      return response;
    });
    return res.json(updated);
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : undefined;
    if (status) return res.status(status).json({ error: (error as Error).message });
    return next(error);
  }
});
router.get("/admin/gifting-issues/:id", permit("inventory", "view"), async (req, res, next) => {
  try {
    const [row] = await db.select().from(giftingIssuesTable).where(and(eq(giftingIssuesTable.id, Number(req.params.id)), isNull(giftingIssuesTable.voidedAt))).limit(1);
    if (!row) return res.status(404).json({ error: "Gifting issue not found" });
    return res.json(row);
  } catch (error) { return next(error); }
});
router.patch("/admin/gifting-issues/:id", permit("inventory", "edit"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const category = req.body?.category;
    const quantity = req.body?.quantity === undefined ? undefined : Number(req.body.quantity);
    const issueDateText = req.body?.issueDate;
    const nullableText = (value: unknown, max: number) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      if (typeof value !== "string" || value.trim().length > max) throw Object.assign(new Error("Invalid movement details"), { status: 400 });
      return value.trim() || null;
    };
    if (!Number.isSafeInteger(id) || id <= 0 || (category !== undefined && !newCategories.has(category)) ||
      (quantity !== undefined && (!Number.isSafeInteger(quantity) || quantity <= 0)) ||
      (issueDateText !== undefined && (typeof issueDateText !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(issueDateText)))) {
      return res.status(400).json({ error: "Invalid movement details" });
    }
    const values = {
      ...(category !== undefined ? { category } : {}),
      ...(quantity !== undefined ? { quantity } : {}),
      ...(issueDateText !== undefined ? { issueDate: new Date(`${issueDateText}T12:00:00.000Z`) } : {}),
      ...(req.body?.recipientName !== undefined ? { recipientName: nullableText(req.body.recipientName, 200) } : {}),
      ...(req.body?.city !== undefined ? { city: nullableText(req.body.city, 120) } : {}),
      ...(req.body?.country !== undefined ? { country: nullableText(req.body.country, 120) } : {}),
      ...(req.body?.occasion !== undefined ? { occasion: nullableText(req.body.occasion, 500) } : {}),
      ...(req.body?.reason !== undefined ? { reason: nullableText(req.body.reason, 500) } : {}),
      ...(req.body?.comment !== undefined ? { comment: nullableText(req.body.comment, 500) ?? "" } : {}),
    };
    if (!Object.keys(values).length) return res.status(400).json({ error: "At least one field is required" });
    if (quantity !== undefined) await ensureStandardAccountingChart();
    const actorId = res.locals.admin.id as number;
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${giftingIssuesTable} where ${giftingIssuesTable.id} = ${id} for update`);
      const [issue] = await tx.select().from(giftingIssuesTable)
        .where(and(eq(giftingIssuesTable.id, id), isNull(giftingIssuesTable.voidedAt))).limit(1);
      if (!issue) return undefined;
      const wasReturnable = issue.category === "B2B_EVALUATION" || issue.category === "INFLUENCERS";
      const isReturnable = category === "B2B_EVALUATION" || category === "INFLUENCERS";
      if (category !== undefined && category !== issue.category && wasReturnable !== isReturnable) {
        throw Object.assign(new Error("A posted movement cannot change between returnable and non-returnable categories"), { status: 409 });
      }
      if (issue.returnedQuantity > 0) {
        throw Object.assign(new Error("A movement cannot be edited after a return"), { status: 409 });
      }

      const quantityDelta = quantity === undefined ? 0 : quantity - issue.quantity;
      if (quantityDelta !== 0) {
        const [product] = await tx.select().from(productsTable)
          .where(eq(productsTable.id, issue.productId)).for("update").limit(1);
        if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
        const unitCost = Number(issue.totalCost) / issue.quantity;
        const adjustmentCost = (Math.abs(quantityDelta) * unitCost).toFixed(4);
        const totalCost = (quantity! * unitCost).toFixed(8);
        const adjustmentId = randomUUID();
        const stockChange = -quantityDelta;
        let quantityBefore = product.stockQuantity;
        let quantityAfter = product.stockQuantity + stockChange;
        if (issue.stockSource === "used_return") {
          const [location] = await tx.select().from(inventoryLocationsTable)
            .where(eq(inventoryLocationsTable.code, USED_RETURN_LOCATION_CODE)).for("update").limit(1);
          const [balance] = location ? await tx.select().from(inventoryBalancesTable)
            .where(and(eq(inventoryBalancesTable.productId, product.id), eq(inventoryBalancesTable.locationId, location.id))).for("update").limit(1) : [];
          quantityBefore = balance?.available ?? 0;
          quantityAfter = quantityBefore + stockChange;
          if (quantityAfter < 0) throw Object.assign(new Error(`Insufficient opened tester stock: ${quantityBefore} available`), { status: 409 });
          if (!balance) throw Object.assign(new Error("Opened tester inventory balance not found"), { status: 409 });
          await tx.update(inventoryBalancesTable).set({ available: quantityAfter, updatedAt: new Date() }).where(eq(inventoryBalancesTable.id, balance.id));
        } else {
          if (quantityAfter < 0) throw Object.assign(new Error(`Insufficient stock: ${product.stockQuantity} available`), { status: 409 });
          await adjustOperationalBalances(tx, product.id, stockChange, unitCost, product.stockQuantity);
          await tx.update(productsTable).set({ stockQuantity: quantityAfter }).where(eq(productsTable.id, product.id));
        }
        await tx.insert(inventoryMovementsTable).values({
          productId: product.id,
          movementType: stockChange > 0 ? "increase" : "decrease",
          quantityChange: stockChange,
          quantityBefore,
          quantityAfter,
          reason: `Quantity correction for product movement #${issue.id}`,
          unitCost: unitCost.toFixed(4),
          totalCost: adjustmentCost,
          sourceType: "gifting_issue_adjustment",
          sourceId: String(issue.id),
          eventKey: `gifting:adjust:${issue.id}:${adjustmentId}`,
          performedBy: actorId,
        });
        await postJournalEntry({
          entryDate: new Date().toISOString().slice(0, 10),
          description: `Quantity correction for product movement #${issue.id}`,
          createdBy: actorId,
          sourceType: "gifting_issue_adjustment",
          sourceId: `${issue.id}:${adjustmentId}`,
          lines: quantityDelta > 0
            ? [{ accountCode: "6160", debit: adjustmentCost }, { accountCode: "1140", credit: adjustmentCost }]
            : [{ accountCode: "1140", debit: adjustmentCost }, { accountCode: "6160", credit: adjustmentCost }],
        }, tx);
        (values as any).totalCost = totalCost;
      }

      const [result] = await tx.update(giftingIssuesTable).set(values as any)
        .where(eq(giftingIssuesTable.id, id)).returning();
      return result;
    });
    if (!updated) return res.status(404).json({ error: "Gifting issue not found" });
    return res.json(updated);
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : undefined;
    if (status) return res.status(status).json({ error: (error as Error).message });
    return next(error);
  }
});
router.delete("/admin/gifting-issues/:id", permit("inventory", "edit"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid movement id" });
    await ensureStandardAccountingChart();
    const actorId = res.locals.admin.id as number;
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from ${giftingIssuesTable} where ${giftingIssuesTable.id} = ${id} for update`);
      const [issue] = await tx.select().from(giftingIssuesTable).where(eq(giftingIssuesTable.id, id)).limit(1);
      if (!issue) throw Object.assign(new Error("Gifting issue not found"), { status: 404 });
      if (issue.voidedAt) return;
      if (issue.returnedQuantity > 0) throw Object.assign(new Error("A partially or fully returned B2B issue cannot be voided"), { status: 409 });
      const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, issue.productId)).for("update").limit(1);
      if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
      const reversalCost = Number(issue.totalCost).toFixed(4);
      let quantityBefore = product.stockQuantity;
      let quantityAfter = product.stockQuantity + issue.quantity;
      if (issue.stockSource === "used_return") {
        const [location] = await tx.select().from(inventoryLocationsTable)
          .where(eq(inventoryLocationsTable.code, USED_RETURN_LOCATION_CODE)).for("update").limit(1);
        const [balance] = location ? await tx.select().from(inventoryBalancesTable)
          .where(and(eq(inventoryBalancesTable.productId, product.id), eq(inventoryBalancesTable.locationId, location.id))).for("update").limit(1) : [];
        if (!balance) throw Object.assign(new Error("Opened tester inventory balance not found"), { status: 409 });
        quantityBefore = balance.available;
        quantityAfter = quantityBefore + issue.quantity;
        await tx.update(inventoryBalancesTable).set({ available: quantityAfter, updatedAt: new Date() }).where(eq(inventoryBalancesTable.id, balance.id));
      } else {
        await adjustOperationalBalances(tx, product.id, issue.quantity, product.averageCost, product.stockQuantity);
        await tx.update(productsTable).set({ stockQuantity: quantityAfter }).where(eq(productsTable.id, product.id));
      }
      await tx.insert(inventoryMovementsTable).values({
        productId: product.id, movementType: "increase", quantityChange: issue.quantity,
         quantityBefore, quantityAfter,
         reason: `Voided product movement #${issue.id}`, unitCost: (Number(issue.totalCost) / issue.quantity).toFixed(4), totalCost: reversalCost,
        sourceType: "gifting_issue_void", sourceId: String(issue.id),
        eventKey: `gifting:void:${issue.id}`, performedBy: actorId,
      });
      await postJournalEntry({
        entryDate: new Date().toISOString().slice(0, 10),
        description: `Void product movement #${issue.id}`,
        createdBy: actorId, sourceType: "gifting_issue_void", sourceId: String(issue.id),
        lines: [{ accountCode: "1140", debit: reversalCost }, { accountCode: "6160", credit: reversalCost }],
      }, tx);
      await tx.update(giftingIssuesTable).set({ voidedAt: new Date(), voidedBy: actorId }).where(eq(giftingIssuesTable.id, id));
    });
    return res.status(204).send();
  } catch (error) {
    const status = typeof (error as any)?.status === "number" ? (error as any).status : undefined;
    if (status) return res.status(status).json({ error: (error as Error).message });
    return next(error);
  }
});
export default router;