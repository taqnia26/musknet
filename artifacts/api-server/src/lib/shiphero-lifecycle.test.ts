import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { db, customersTable, ordersTable, shipheroDispatchesTable, shipheroWebhookEventsTable } from "@workspace/db";
import { updateOrderAndIssueInvoice } from "./invoices";
import { createShipHeroWebhookRouter } from "../routes/shiphero-webhook";
import { createShipHeroWebhookSignature } from "./shiphero-webhooks";
import { SHIPHERO_PARTNER_CONTRACT_CONFIRMED, redactShipHeroPayload, shipHeroReadiness } from "./shiphero-config";

describe("ShipHero installation safety and actual durable records", () => {
  const unique = randomUUID();
  const number = `SHIPHERO-TEST-${unique}`;
  const messageId = `shiphero-test-${unique}`;
  let orderId: number;
  let customerId: number;
  beforeAll(async () => {
    const [customer] = await db.insert(customersTable).values({
      name: "ShipHero disposable test fixture", phone: `test-${unique}`,
    }).returning();
    customerId = customer.id;
    const [order] = await db.insert(ordersTable).values({
      userId: customerId, orderNumber: number, subtotal: 0, shippingCost: 0,
      discount: 0, tax: 0, total: 0, address: "{}", shippingMethod: "regular",
      paymentMethod: "test", paymentStatus: "pending", status: "pending_review",
    }).returning();
    orderId = order.id;
  });
  afterAll(async () => {
    await db.delete(shipheroWebhookEventsTable).where(eq(shipheroWebhookEventsTable.messageId, messageId));
    if (orderId) {
      await db.delete(shipheroDispatchesTable).where(eq(shipheroDispatchesTable.orderId, orderId));
      await db.delete(ordersTable).where(eq(ordersTable.id, orderId));
    }
    if (customerId) await db.delete(customersTable).where(eq(customersTable.id, customerId));
  });
  it("does not enqueue creation/review; entering preparing queues exactly once", async () => {
    await updateOrderAndIssueInvoice(orderId, { adminNotes: "Test review only" }, {});
    expect(await db.select().from(shipheroDispatchesTable).where(eq(shipheroDispatchesTable.orderId, orderId))).toHaveLength(0);
    await updateOrderAndIssueInvoice(orderId, { status: "preparing" }, {});
    await updateOrderAndIssueInvoice(orderId, { status: "preparing" }, {});
    const dispatches = await db.select().from(shipheroDispatchesTable).where(eq(shipheroDispatchesTable.orderId, orderId));
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].orderNumber).toBe(number);
    expect(["queued", "blocked"]).toContain(dispatches[0].status);
    expect(dispatches[0].remoteOrderId).toBeNull();
  });
  it("has no credential or saved-setting bypass for the pending partner example", () => {
    expect(SHIPHERO_PARTNER_CONTRACT_CONFIRMED).toBe(false);
    expect(shipHeroReadiness({
      SHIPHERO_ACCESS_TOKEN: "fixture-token", SHIPHERO_MERCHANT_ID: "fixture-merchant",
      SHIPHERO_WAREHOUSE_ID: "fixture-warehouse", SHIPHERO_WEBHOOK_SECRET: "fixture-secret",
    }).configured).toBe(false);
    expect(redactShipHeroPayload({
      customer_account_id: "fixture-merchant", line_items: [{ warehouse_id: "fixture-warehouse", sku: "confirmed-test" }],
    }, {})).toEqual({
      customer_account_id: "[environment value]", line_items: [{ warehouse_id: "[environment value]", sku: "confirmed-test" }],
    });
  });
  it("uses the real database uniqueness constraint for concurrent signed replays", async () => {
    const secret = "disposable-fixture-only";
    const raw = '{"type":"inventory_zero","timestamp":"2026-10-01T12:00:00Z","quantity":0}';
    const app = express();
    app.use(createShipHeroWebhookRouter({ getSecret: () => secret, processQueue: async () => 0 }));
    const post = () => request(app).post("/")
      .set("Content-Type", "application/json").set("X-Shiphero-Message-ID", messageId)
      .set("x-shiphero-hmac-sha256", createShipHeroWebhookSignature(Buffer.from(raw), secret)).send(raw);
    const results = await Promise.all([post(), post()]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(await db.select().from(shipheroWebhookEventsTable).where(and(
      eq(shipheroWebhookEventsTable.messageId, messageId), eq(shipheroWebhookEventsTable.eventType, "inventory_zero"),
    ))).toHaveLength(1);
  });
});