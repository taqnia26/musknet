import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  createShipHeroWebhookSignature,
  isValidShipHeroWebhookSignature,
  type ShipHeroWebhookEventInput,
} from "../lib/shiphero-webhooks";
import { createShipHeroWebhookRouter } from "./shiphero-webhook";

const secret = "route-test-secret";
const body = Buffer.from('{"type": "Unrecognized Event", "timestamp": "2026-08-02T09:00:00Z"}');

function receiver(options: { secret?: string; verifySignature?: typeof isValidShipHeroWebhookSignature } = {}) {
  const saved = new Map<string, ShipHeroWebhookEventInput>();
  const persistEvent = vi.fn(async (event: ShipHeroWebhookEventInput) => {
    if (saved.has(event.messageId)) return false;
    saved.set(event.messageId, event);
    return true;
  });
  const processQueue = vi.fn(async () => 0);
  const app = express();
  app.use(createShipHeroWebhookRouter({
    getSecret: () => options.secret,
    verifySignature: options.verifySignature,
    persistEvent,
    processQueue,
  }));
  return { app, saved, persistEvent, processQueue };
}

function post(app: express.Express, rawBody: Buffer, messageId = "msg-1", signature?: string) {
  return request(app).post("/")
    .set("Content-Type", "application/json")
    .set("X-Shiphero-Message-ID", messageId)
    .set("X-Shiphero-Hmac-Sha256", signature ?? createShipHeroWebhookSignature(rawBody, secret))
    .send(rawBody.toString("utf8"));
}

describe("ShipHero inbound webhook route", () => {
  it("requires configuration before any durable write", async () => {
    const test = receiver();
    await post(test.app, body).expect(503);
    expect(test.persistEvent).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures before attempting to parse or store the body", async () => {
    const test = receiver({ secret });
    await post(test.app, Buffer.from("{not-json"), "msg-bad", "not-base64").expect(401);
    expect(test.persistEvent).not.toHaveBeenCalled();
  });

  it("requires the message ID header and a canonical SHA-256 base64 signature", async () => {
    const test = receiver({ secret });
    await request(test.app).post("/")
      .set("Content-Type", "application/json")
      .set("X-Shiphero-Hmac-Sha256", createShipHeroWebhookSignature(body, secret))
      .send(body).expect(400);
    const signature = createShipHeroWebhookSignature(body, secret);
    await post(test.app, body, "msg-invalid-base64", `${signature.slice(0, -1)}%`).expect(401);
    expect(test.persistEvent).not.toHaveBeenCalled();
  });

  it("verifies exact incoming raw bytes and stores the sanitized event", async () => {
    const verifySignature = vi.fn(isValidShipHeroWebhookSignature);
    const test = receiver({ secret, verifySignature });
    expect(isValidShipHeroWebhookSignature(body, secret, createShipHeroWebhookSignature(body, secret))).toBe(true);
    const response = await post(test.app, body);
    expect(verifySignature).toHaveBeenCalledOnce();
    expect(verifySignature).toHaveBeenCalledWith(body, secret, createShipHeroWebhookSignature(body, secret));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ code: "200", Status: "Success" });
    expect(test.persistEvent).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "msg-1",
      eventType: "Unrecognized Event",
      payload: { type: "Unrecognized Event", timestamp: "2026-08-02T09:00:00Z" },
    }));

    const compact = Buffer.from('{"type":"Unrecognized Event","timestamp":"2026-08-02T09:00:00Z"}');
    await post(test.app, compact, "msg-different-raw", createShipHeroWebhookSignature(body, secret)).expect(401);
  });

  it("durably deduplicates concurrent replays and schedules only the winning insert", async () => {
    const test = receiver({ secret });
    const responses = await Promise.all([
      post(test.app, body).then((response) => response),
      post(test.app, body).then((response) => response),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200]);
    expect(responses.every(response => response.body.Status === "Success")).toBe(true);
    expect(test.persistEvent).toHaveBeenCalledTimes(2);
    await new Promise((resolve) => setImmediate(resolve));
    expect(test.processQueue).toHaveBeenCalledTimes(1);
    expect(test.saved.size).toBe(1);
  });

  it("also authenticates HEAD requests and never inserts a health probe", async () => {
    await request(receiver().app).head("/").expect(503);
    const test = receiver({ secret });
    await request(test.app).head("/").expect(401);
    await request(test.app).head("/")
      .set("x-shiphero-hmac-sha256", createShipHeroWebhookSignature(Buffer.alloc(0), secret)).expect(200);
    expect(test.persistEvent).not.toHaveBeenCalled();
  });
});