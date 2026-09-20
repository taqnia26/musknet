import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db, customersTable, influencersTable, influencerSessionsTable, influencerVisitsTable, influencerCouponsTable, couponsTable, orderAttributionsTable, ordersTable } from "@workspace/db";
import * as Api from "@workspace/api-zod";
import app from "../app";
import { createInfluencerSession, hashInfluencerPassword, influencerFromToken } from "../lib/influencer-auth";

const emails: string[] = [];
const phones: string[] = [];
const ids: number[] = [];

afterEach(async () => {
  if (ids.length) {
    await db.delete(orderAttributionsTable).where(inArray(orderAttributionsTable.influencerId, ids));
    await db.delete(influencerVisitsTable).where(inArray(influencerVisitsTable.influencerId, ids));
    await db.delete(influencerSessionsTable).where(inArray(influencerSessionsTable.influencerId, ids));
    await db.delete(influencersTable).where(inArray(influencersTable.id, ids));
  }
  if (phones.length) await db.delete(customersTable).where(inArray(customersTable.phone, phones));
  ids.length = 0; emails.length = 0; phones.length = 0;
});

async function influencer(active = true) {
  const email = `influencer-${Date.now()}-${Math.random()}@example.com`; emails.push(email);
  const [user] = await db.insert(influencersTable).values({
    name: "Test Influencer", email, passwordHash: await hashInfluencerPassword("correct horse battery"),
    referralCode: `REF${Date.now()}${Math.floor(Math.random() * 1000)}`, commissionRate: 12.5, isActive: active,
  }).returning();
  ids.push(user.id); return user;
}

describe.sequential("influencer auth and referral isolation", () => {
  it("rejects inactive accounts and keeps sessions scoped to their account", async () => {
    const inactive = await influencer(false);
    await request(app).post("/api/influencer/auth/login").send({ email: inactive.email, password: "correct horse battery" }).expect(401);
    const first = await influencer();
    const token = await createInfluencerSession(first.id);
    expect((await influencerFromToken(token))?.id).toBe(first.id);
    expect((await request(app).get("/api/influencer/me").set("Authorization", `Bearer ${token}`).expect(200)).body.email).toBe(first.email);
  });

  it("captures public referrals, sets a durable cookie, and deduplicates a visitor within a day", async () => {
    const user = await influencer();
    const agent = request.agent(app);
    await agent.get(`/api/influencer/capture?ref=${user.referralCode}`).expect(200);
    await agent.get(`/api/influencer/capture?ref=${user.referralCode}`).expect(200);
    const visits = await db.select().from(influencerVisitsTable).where(eq(influencerVisitsTable.influencerId, user.id));
    expect(visits).toHaveLength(1);
    expect(String((await agent.get(`/api/influencer/capture?ref=${user.referralCode}`)).headers["set-cookie"])).toMatch(/musk_referral=/);
  });

  it("does not leak dashboard order data across influencer accounts", async () => {
    const first = await influencer(), second = await influencer();
    const token = await createInfluencerSession(first.id);
    const result = await request(app).get("/api/influencer/dashboard").set("Authorization", `Bearer ${token}`).expect(200);
    expect(result.body.orders).toEqual([]);
    expect(result.body.summary.attributedPaidOrders).toBe(0);
    expect(result.body).not.toHaveProperty(second.email);
  });
});

describe("paid metrics and attribution invariants", () => {
  it("stores the commission snapshot independently of later account changes", async () => {
    const user = await influencer();
    const phone = `+9665${Date.now()}${Math.floor(Math.random() * 10)}`; phones.push(phone);
    const [customer] = await db.insert(customersTable).values({ name: "Attribution Test", phone }).returning();
    const [order] = await db.insert(ordersTable).values({ userId: customer.id, orderNumber: `TEST-${Date.now()}`, subtotal: 100, shippingCost: 0, discount: 0, tax: 0, total: 100, status: "new", paymentStatus: "paid", address: "{}", shippingMethod: "standard", paymentMethod: "card" }).returning();
    await db.insert(orderAttributionsTable).values({ orderId: order.id, influencerId: user.id, source: "referral", commissionRate: 12.5, commissionAmount: 12.5 });
    await db.update(influencersTable).set({ commissionRate: 20 }).where(eq(influencersTable.id, user.id));
    const [snapshot] = await db.select().from(orderAttributionsTable).where(eq(orderAttributionsTable.orderId, order.id));
    expect(snapshot.commissionRate).toBe(12.5);
    expect(snapshot.commissionAmount).toBe(12.5);
    await db.delete(ordersTable).where(eq(ordersTable.id, order.id));
  });

  it("enforces one attribution row per order, preventing double count", async () => {
    const user = await influencer();
    const phone = `+9665${Date.now()}${Math.floor(Math.random() * 10)}`; phones.push(phone);
    const [customer] = await db.insert(customersTable).values({ name: "Attribution Test", phone }).returning();
    const [order] = await db.insert(ordersTable).values({ userId: customer.id, orderNumber: `TEST-${Date.now()}`, subtotal: 50, shippingCost: 0, discount: 0, tax: 0, total: 50, address: "{}", shippingMethod: "standard", paymentMethod: "card" }).returning();
    await db.insert(orderAttributionsTable).values({ orderId: order.id, influencerId: user.id, source: "coupon", commissionRate: 12.5, commissionAmount: 6.25 });
    await expect(db.insert(orderAttributionsTable).values({ orderId: order.id, influencerId: user.id, source: "referral", commissionRate: 12.5, commissionAmount: 6.25 })).rejects.toThrow();
    await db.delete(ordersTable).where(eq(ordersTable.id, order.id));
  });

  it("validates patch payloads, including empty and out-of-range values, at the contract boundary", () => {
    expect(Api.InfluencerPatchBody.safeParse({}).success).toBe(true);
    expect(Api.InfluencerPatchBody.safeParse({ password: "short" }).success).toBe(false);
    expect(Api.InfluencerPatchBody.safeParse({ commissionRate: 101 }).success).toBe(false);
    expect(Api.InfluencerPatchBody.safeParse({ isActive: "false" }).success).toBe(false);
  });

  it("rejects commission rates outside 0-100 before persistence", () => {
    expect(Api.InfluencerPatchBody.safeParse({ commissionRate: -0.01 }).success).toBe(false);
    expect(Api.InfluencerPatchBody.safeParse({ commissionRate: 100.01 }).success).toBe(false);
    expect(Api.InfluencerPatchBody.safeParse({ commissionRate: 0 }).success).toBe(true);
    expect(Api.InfluencerPatchBody.safeParse({ commissionRate: 100 }).success).toBe(true);
  });

  it("models coupon ownership as a single persisted association", async () => {
    const first = await influencer(), second = await influencer();
    const [coupon] = await db.insert(couponsTable).values({ code: `TEST${Date.now()}`, discountType: "percentage", discountValue: 10 }).returning();
    await db.insert(influencerCouponsTable).values({ influencerId: first.id, couponId: coupon.id });
    const links = await db.select().from(influencerCouponsTable).where(eq(influencerCouponsTable.couponId, coupon.id));
    expect(links).toHaveLength(1);
    expect(links[0].influencerId).toBe(first.id);
    await db.delete(couponsTable).where(eq(couponsTable.id, coupon.id));
    void second;
  });

  it("counts paid orders only in dashboard metrics and preserves attribution source", async () => {
    const user = await influencer();
    const phone = `+9665${Date.now()}${Math.floor(Math.random() * 10)}`; phones.push(phone);
    const [customer] = await db.insert(customersTable).values({ name: "Metrics Test", phone }).returning();
    const common = { userId: customer.id, shippingCost: 0, discount: 0, tax: 0, address: "{}", shippingMethod: "standard", paymentMethod: "card" };
    const [paid] = await db.insert(ordersTable).values({ ...common, orderNumber: `PAID-${Date.now()}`, subtotal: 100, total: 100, paymentStatus: "paid" }).returning();
    const [pending] = await db.insert(ordersTable).values({ ...common, orderNumber: `PENDING-${Date.now()}`, subtotal: 200, total: 200, paymentStatus: "pending" }).returning();
    await db.insert(orderAttributionsTable).values([
      { orderId: paid.id, influencerId: user.id, source: "coupon", commissionRate: 12.5, commissionAmount: 12.5 },
      { orderId: pending.id, influencerId: user.id, source: "referral", commissionRate: 12.5, commissionAmount: 25 },
    ]);
    const token = await createInfluencerSession(user.id);
    const result = await request(app).get("/api/influencer/dashboard").set("Authorization", `Bearer ${token}`).expect(200);
    expect(result.body.summary.attributedPaidOrders).toBe(1);
    expect(result.body.summary.sales).toBe(100);
    expect(result.body.orders).toHaveLength(1);
    expect(result.body.orders[0].source).toBe("coupon");
    await db.delete(ordersTable).where(inArray(ordersTable.id, [paid.id, pending.id]));
  });

  it("compares the selected dashboard range with the immediately preceding equivalent range", async () => {
    const user = await influencer();
    const phone = `+9665${Date.now()}${Math.floor(Math.random() * 10)}`; phones.push(phone);
    const [customer] = await db.insert(customersTable).values({ name: "Comparison Test", phone }).returning();
    const now = Date.now();
    const common = { userId: customer.id, shippingCost: 0, discount: 0, tax: 0, address: "{}", shippingMethod: "standard", paymentMethod: "card", paymentStatus: "paid" as const };
    const [currentOrder] = await db.insert(ordersTable).values({ ...common, orderNumber: `CURRENT-${now}`, subtotal: 200, total: 200, createdAt: new Date(now - 5 * 86400000) }).returning();
    const [previousOrder] = await db.insert(ordersTable).values({ ...common, orderNumber: `PREVIOUS-${now}`, subtotal: 100, total: 100, createdAt: new Date(now - 35 * 86400000) }).returning();
    await db.insert(orderAttributionsTable).values([
      { orderId: currentOrder.id, influencerId: user.id, source: "referral", commissionRate: 10, commissionAmount: 20 },
      { orderId: previousOrder.id, influencerId: user.id, source: "referral", commissionRate: 10, commissionAmount: 10 },
    ]);
    await db.insert(influencerVisitsTable).values([
      { influencerId: user.id, visitorKey: `current-a-${now}`, landingPath: "/", createdAt: new Date(now - 5 * 86400000) },
      { influencerId: user.id, visitorKey: `current-b-${now}`, landingPath: "/", createdAt: new Date(now - 4 * 86400000) },
      { influencerId: user.id, visitorKey: `previous-${now}`, landingPath: "/", createdAt: new Date(now - 35 * 86400000) },
    ]);

    const token = await createInfluencerSession(user.id);
    const result = await request(app).get("/api/influencer/dashboard?rangeDays=30").set("Authorization", `Bearer ${token}`).expect(200);

    expect(result.body.summary.sales).toBe(200);
    expect(result.body.previousSummary.sales).toBe(100);
    expect(result.body.changes.sales).toEqual({ absolute: 100, percent: 1 });
    expect(result.body.changes.visits).toEqual({ absolute: 1, percent: 1 });
    expect(result.body.changes.conversionRate.absolute).toBeCloseTo(-0.5);
    expect(result.body.series).toHaveLength(1);
    expect(result.body.previousSeries).toHaveLength(1);
    await db.delete(ordersTable).where(inArray(ordersTable.id, [currentOrder.id, previousOrder.id]));
  });
});