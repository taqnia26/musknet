import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { db, giftingIssuesTable } from "@workspace/db";
import { adminFromToken, publicAdmin } from "../lib/admin-auth";
import { permit } from "./admin";

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
router.get("/admin/gifting-issues/:id", permit("inventory", "view"), async (req, res, next) => {
  try {
    const [row] = await db.select().from(giftingIssuesTable).where(eq(giftingIssuesTable.id, Number(req.params.id))).limit(1);
    if (!row) return res.status(404).json({ error: "Gifting issue not found" });
    return res.json(row);
  } catch (error) { return next(error); }
});
export default router;