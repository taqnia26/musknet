import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, lt, lte, sql, sum } from "drizzle-orm";
import * as Api from "@workspace/api-zod";
import { db, influencersTable, influencerSessionsTable, influencerVisitsTable, influencerCouponsTable, couponsTable, orderAttributionsTable, ordersTable } from "@workspace/db";
import { createInfluencerSession, hashInfluencerPassword, influencerFromToken, revokeInfluencerSession, verifyInfluencerPassword } from "../lib/influencer-auth";
import { adminFromToken, publicAdmin } from "../lib/admin-auth";

const router = Router();
const bearer = (req: Request) => req.header("authorization")?.replace(/^Bearer /, "");
const asyncRoute = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
function parse<T>(schema: { safeParse(value: unknown): { success: boolean; data?: T; error?: { message: string } } }, value: unknown, res: Response): T | null { const p = schema.safeParse(value); if (!p.success) { res.status(400).json({ error: p.error?.message ?? "Invalid request" }); return null; } return p.data!; }
function range(value: unknown, res: Response) {
  const q = value as Record<string, unknown>; const days = q.rangeDays === undefined ? 30 : Number(q.rangeDays);
  const from = q.from ? new Date(String(q.from)) : undefined, to = q.to ? new Date(String(q.to)) : undefined;
  if (![7, 30, 90].includes(days) || (from && Number.isNaN(from.valueOf())) || (to && Number.isNaN(to.valueOf())) || (from && to && from > to)) { res.status(400).json({ error: "rangeDays must be 7, 30 or 90 and from must precede to" }); return null; }
  return { rangeDays: days, from, to };
}
async function admin(req: Request, res: Response, action: "view" | "edit") {
  const user = await adminFromToken(bearer(req)); if (!user) { res.status(401).json({ error: "Admin authentication required" }); return null; }
  if (!user.isSuperAdmin && !(await publicAdmin(user)).permissions.includes(`influencers:${action}`)) { res.status(403).json({ error: "Insufficient permission" }); return null; }
  return user;
}
function profile(user: typeof influencersTable.$inferSelect) { return { id: user.id, name: user.name, email: user.email, imageUrl: user.imageUrl, referralCode: user.referralCode, commissionRate: user.commissionRate, isActive: user.isActive }; }
type DashboardSummary = { visits: number; attributedPaidOrders: number; sales: number; commission: number; conversionRate: number; averageOrderValue: number };
const change = (current: number, previous: number) => ({ absolute: current - previous, percent: previous === 0 ? null : (current - previous) / Math.abs(previous) });
async function dashboardPeriod(influencerId: number, start: Date, end: Date, includeEnd: boolean) {
  const orderDate = includeEnd ? lte(ordersTable.createdAt, end) : lt(ordersTable.createdAt, end);
  const visitDate = includeEnd ? lte(influencerVisitsTable.createdAt, end) : lt(influencerVisitsTable.createdAt, end);
  const paidWhere = and(eq(orderAttributionsTable.influencerId, influencerId), eq(ordersTable.paymentStatus, "paid"), sql`${ordersTable.status} <> 'cancelled'`, gte(ordersTable.createdAt, start), orderDate);
  const [[orderSummary], [visitSummary], series] = await Promise.all([
    db.select({ orders: count(), sales: sum(ordersTable.total), commission: sum(orderAttributionsTable.commissionAmount) }).from(orderAttributionsTable).innerJoin(ordersTable, eq(orderAttributionsTable.orderId, ordersTable.id)).where(paidWhere),
    db.select({ visits: sql<number>`count(distinct (${influencerVisitsTable.visitorKey}, date(${influencerVisitsTable.createdAt})))` }).from(influencerVisitsTable).where(and(eq(influencerVisitsTable.influencerId, influencerId), gte(influencerVisitsTable.createdAt, start), visitDate)),
    db.select({ day: sql<string>`to_char(date_trunc('day', ${ordersTable.createdAt}), 'YYYY-MM-DD')`, orders: count(), sales: sum(ordersTable.total), commission: sum(orderAttributionsTable.commissionAmount) }).from(orderAttributionsTable).innerJoin(ordersTable, eq(orderAttributionsTable.orderId, ordersTable.id)).where(paidWhere).groupBy(sql`date_trunc('day', ${ordersTable.createdAt})`).orderBy(sql`date_trunc('day', ${ordersTable.createdAt})`),
  ]);
  const attributedPaidOrders = Number(orderSummary?.orders ?? 0);
  const sales = Number(orderSummary?.sales ?? 0);
  const visits = Number(visitSummary?.visits ?? 0);
  const summary: DashboardSummary = {
    visits,
    attributedPaidOrders,
    sales,
    commission: Number(orderSummary?.commission ?? 0),
    conversionRate: visits ? attributedPaidOrders / visits : 0,
    averageOrderValue: attributedPaidOrders ? sales / attributedPaidOrders : 0,
  };
  return { summary, series: series.map(point => ({ ...point, orders: Number(point.orders), sales: Number(point.sales ?? 0), commission: Number(point.commission ?? 0) })) };
}

router.post("/influencer/auth/login", asyncRoute(async (req, res) => {
  const body = parse(Api.InfluencerLoginBody, req.body, res); if (!body) return;
  const [user] = await db.select().from(influencersTable).where(eq(influencersTable.email, body.email.toLowerCase())).limit(1);
  if (!user || !user.isActive || !(await verifyInfluencerPassword(body.password, user.passwordHash))) { res.status(401).json({ error: "Invalid email or password" }); return; }
  res.json({ token: await createInfluencerSession(user.id), influencer: profile(user) });
}));
router.post("/influencer/auth/logout", asyncRoute(async (req, res) => { const token = bearer(req); if (token) await revokeInfluencerSession(token); res.sendStatus(204); }));
router.get("/influencer/me", asyncRoute(async (req, res) => { const user = await influencerFromToken(bearer(req)); if (!user) { res.status(401).json({ error: "Influencer authentication required" }); return; } res.json(profile(user)); }));

router.get("/influencer/dashboard", asyncRoute(async (req, res) => {
  const user = await influencerFromToken(bearer(req)); if (!user) { res.status(401).json({ error: "Influencer authentication required" }); return; }
  const dateRange = range(req.query, res); if (!dateRange) return;
  const end = dateRange.to ?? new Date(), start = dateRange.from ?? new Date(end.getTime() - (dateRange.rangeDays ?? 30) * 86400000);
  const previousEnd = start, previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
  const [currentPeriod, previousPeriod] = await Promise.all([
    dashboardPeriod(user.id, start, end, true),
    dashboardPeriod(user.id, previousStart, previousEnd, false),
  ]);
  const changes = Object.fromEntries((Object.keys(currentPeriod.summary) as (keyof DashboardSummary)[]).map(key => [key, change(currentPeriod.summary[key], previousPeriod.summary[key])]));
  const codes = await db.select({ id: couponsTable.id, code: couponsTable.code, discountType: couponsTable.discountType, discountValue: couponsTable.discountValue, isActive: couponsTable.isActive, usageLimit: couponsTable.usageLimit, timesUsed: couponsTable.timesUsed, attributedUses: sql<number>`count(${ordersTable.id})` }).from(influencerCouponsTable).innerJoin(couponsTable, eq(influencerCouponsTable.couponId, couponsTable.id)).leftJoin(orderAttributionsTable, and(eq(orderAttributionsTable.influencerId, user.id), eq(orderAttributionsTable.source, "coupon"))).leftJoin(ordersTable, and(eq(ordersTable.id, orderAttributionsTable.orderId), eq(ordersTable.couponCode, couponsTable.code), eq(ordersTable.paymentStatus, "paid"))).where(eq(influencerCouponsTable.influencerId, user.id)).groupBy(couponsTable.id);
  const orders = await db.select({ orderNumber: ordersTable.orderNumber, total: ordersTable.total, commission: orderAttributionsTable.commissionAmount, source: orderAttributionsTable.source, status: ordersTable.paymentStatus, createdAt: ordersTable.createdAt }).from(orderAttributionsTable).innerJoin(ordersTable, eq(orderAttributionsTable.orderId, ordersTable.id)).where(and(eq(orderAttributionsTable.influencerId, user.id), gte(ordersTable.createdAt, start), lte(ordersTable.createdAt, end), eq(ordersTable.paymentStatus, "paid"), sql`${ordersTable.status} <> 'cancelled'`)).orderBy(desc(ordersTable.createdAt)).limit(100);
  res.json({ range: { from: start.toISOString(), to: end.toISOString() }, previousRange: { from: previousStart.toISOString(), to: previousEnd.toISOString() }, summary: currentPeriod.summary, previousSummary: previousPeriod.summary, changes, series: currentPeriod.series, previousSeries: previousPeriod.series, referralUrl: `/?ref=${encodeURIComponent(user.referralCode)}`, codes, orders });
}));

router.get("/influencer/capture", asyncRoute(async (req, res) => {
  const referral = typeof req.query.ref === "string" ? req.query.ref.trim() : ""; if (referral.length < 2) { res.status(400).json({ error: "ref is required" }); return; }
  const [user] = await db.select().from(influencersTable).where(and(eq(influencersTable.referralCode, referral.toUpperCase()), eq(influencersTable.isActive, true))).limit(1);
  if (!user) { res.status(404).json({ error: "Unknown referral code" }); return; }
  const visitorKey = String(req.cookies?.musk_visitor ?? randomBytes(16).toString("hex"));
  const [existingVisit] = await db.select({ id: influencerVisitsTable.id }).from(influencerVisitsTable).where(and(eq(influencerVisitsTable.influencerId, user.id), eq(influencerVisitsTable.visitorKey, visitorKey), gte(influencerVisitsTable.createdAt, new Date(Date.now() - 86400000)))).limit(1);
  if (!existingVisit) await db.insert(influencerVisitsTable).values({ influencerId: user.id, visitorKey, landingPath: typeof req.query.path === "string" ? req.query.path : "/" });
  res.cookie("musk_visitor", visitorKey, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 30 * 86400000, path: "/" });
  res.cookie("musk_referral", user.referralCode, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 30 * 86400000, path: "/" });
  res.json({ referralCode: user.referralCode });
}));

router.post("/admin/influencers", asyncRoute(async (req, res) => { if (!await admin(req, res, "edit")) return; const body = parse(Api.CreateInfluencerBody, req.body, res); if (!body) return; const extra = req.body as { imageUrl?: string | null; isActive?: boolean }; try { const [created] = await db.insert(influencersTable).values({ name: body.name, email: body.email.toLowerCase(), referralCode: body.referralCode.toUpperCase(), imageUrl: extra.imageUrl ?? null, commissionRate: body.commissionRate ?? 10, isActive: extra.isActive ?? true, passwordHash: await hashInfluencerPassword(body.password) }).returning(); res.status(201).json(profile(created)); } catch { res.status(409).json({ error: "Email or referral code already exists" }); } }));
router.get("/admin/influencers", asyncRoute(async (req, res) => {
  if (!await admin(req, res, "view")) return;
  const users = await db.select().from(influencersTable);
  const output = await Promise.all(users.map(async (u) => {
    const [p] = await db.select({
      orders: count(),
      sales: sum(ordersTable.total),
      commission: sum(orderAttributionsTable.commissionAmount),
      lastOrderAt: sql<Date | null>`max(${ordersTable.createdAt})`,
      couponOrders: sql<number>`count(*) filter (where ${orderAttributionsTable.source} = 'coupon')`,
      referralOrders: sql<number>`count(*) filter (where ${orderAttributionsTable.source} = 'referral')`,
    })
      .from(orderAttributionsTable)
      .innerJoin(ordersTable, eq(orderAttributionsTable.orderId, ordersTable.id))
      .where(and(eq(orderAttributionsTable.influencerId, u.id), eq(ordersTable.paymentStatus, "paid"), sql`${ordersTable.status} <> 'cancelled'`));
    const [visitSummary] = await db.select({
      visits: sql<number>`count(distinct (${influencerVisitsTable.visitorKey}, date(${influencerVisitsTable.createdAt})))`,
    }).from(influencerVisitsTable).where(eq(influencerVisitsTable.influencerId, u.id));
    const links = await db.select({ couponId: influencerCouponsTable.couponId })
      .from(influencerCouponsTable)
      .where(eq(influencerCouponsTable.influencerId, u.id));
    const orders = Number(p?.orders ?? 0);
    const sales = Number(p?.sales ?? 0);
    const visits = Number(visitSummary?.visits ?? 0);
    return {
      ...profile(u),
      couponIds: links.map((link) => link.couponId),
      performance: {
        orders,
        sales,
        commission: Number(p?.commission ?? 0),
        visits,
        conversionRate: visits ? orders / visits : 0,
        averageOrderValue: orders ? sales / orders : 0,
        lastOrderAt: p?.lastOrderAt?.toISOString() ?? null,
        couponOrders: Number(p?.couponOrders ?? 0),
        referralOrders: Number(p?.referralOrders ?? 0),
      },
    };
  }));
  res.json(output);
}));
router.get("/admin/influencers/:id", asyncRoute(async (req, res) => { if (!await admin(req, res, "view")) return; const [u] = await db.select().from(influencersTable).where(eq(influencersTable.id, Number(req.params.id))); if (!u) { res.status(404).json({ error: "Not found" }); return; } const links = await db.select({ couponId: influencerCouponsTable.couponId }).from(influencerCouponsTable).where(eq(influencerCouponsTable.influencerId, u.id)); res.json({ ...profile(u), couponIds: links.map((link) => link.couponId) }); }));
router.patch("/admin/influencers/:id", asyncRoute(async (req, res) => { if (!await admin(req, res, "edit")) return; if (!req.body || Object.keys(req.body).length === 0) { res.status(400).json({ error: "At least one field is required" }); return; } const body = parse(Api.InfluencerPatchBody, req.body, res); if (!body) return; const influencerId = Number(req.params.id); const { password, ...rest } = body; const values = { ...rest, ...(password ? { passwordHash: await hashInfluencerPassword(password) } : {}), ...(rest.email ? { email: rest.email.toLowerCase() } : {}), ...(rest.referralCode ? { referralCode: rest.referralCode.toUpperCase() } : {}) }; try { const [u] = await db.update(influencersTable).set(values).where(eq(influencersTable.id, influencerId)).returning(); if (!u) { res.status(404).json({ error: "Not found" }); return; } if (password || rest.isActive === false) await db.delete(influencerSessionsTable).where(eq(influencerSessionsTable.influencerId, influencerId)); const links = await db.select({ couponId: influencerCouponsTable.couponId }).from(influencerCouponsTable).where(eq(influencerCouponsTable.influencerId, u.id)); res.json({ ...profile(u), couponIds: links.map((link) => link.couponId) }); } catch { res.status(409).json({ error: "Email or referral code already exists" }); } }));
router.post("/admin/influencers/:id/coupons", asyncRoute(async (req, res) => { if (!await admin(req, res, "edit")) return; const couponId = Number((req.body as Record<string, unknown>)?.couponId); if (!Number.isInteger(couponId) || couponId < 1) { res.status(400).json({ error: "couponId is required" }); return; } const [i] = await db.select({ id: influencersTable.id }).from(influencersTable).where(eq(influencersTable.id, Number(req.params.id))); const [c] = await db.select({ id: couponsTable.id }).from(couponsTable).where(eq(couponsTable.id, couponId)); const [owner] = await db.select({ influencerId: influencerCouponsTable.influencerId }).from(influencerCouponsTable).where(eq(influencerCouponsTable.couponId, couponId)); if (!i || !c) { res.status(404).json({ error: "Influencer or coupon not found" }); return; } if (owner) { res.status(409).json({ error: "Coupon is already owned by an influencer" }); return; } const [link] = await db.insert(influencerCouponsTable).values({ influencerId: i.id, couponId: c.id }).returning(); res.status(201).json(link); }));
router.delete("/admin/influencers/:id/coupons/:couponId", asyncRoute(async (req, res) => { if (!await admin(req, res, "edit")) return; await db.delete(influencerCouponsTable).where(and(eq(influencerCouponsTable.influencerId, Number(req.params.id)), eq(influencerCouponsTable.couponId, Number(req.params.couponId)))); res.sendStatus(204); }));
export default router;