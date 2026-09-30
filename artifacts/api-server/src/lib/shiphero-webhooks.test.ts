import { describe, expect, it } from "vitest";
import {
  decodeShipHeroStatusEvent,
  decideShipHeroStatusApplication,
  createShipHeroWebhookSignature,
  initialShipHeroWebhookOutcome,
  isShipHeroTerminalStatus,
  isValidShipHeroWebhookSignature,
  mapShipHeroStatus,
} from "./shiphero-webhooks";

const at = (value: string) => new Date(value);

describe("ShipHero webhook decoding and status processing rules", () => {
  it("decodes generic and official shipment events only from explicit statuses and timezone timestamps", () => {
    const generic = decodeShipHeroStatusEvent("order_status", {
      created_at: "2026-08-02T12:00:00+03:00",
      order_number: "ME-123",
      status: "On the way",
    });
    expect(generic).toMatchObject({
      eventAt: at("2026-08-02T09:00:00Z"),
      orderNumber: "ME-123",
      remoteStatus: "On the way",
      isSupportedStatusEvent: true,
    });

    const official = decodeShipHeroStatusEvent("Shipment Update", {
      timestamp: "2026-08-02T09:00:00Z",
      fulfillment: { order_uuid: "remote-1234", status: "Delivered" },
    });
    expect(official).toMatchObject({
      remoteOrderId: "remote-1234",
      remoteStatus: "Delivered",
      isSupportedStatusEvent: true,
    });
    expect(decodeShipHeroStatusEvent("order_status", { timestamp: "2026-08-02T09:00:00" }).eventAt).toBeNull();
  });

  it("keeps unknown and inventory event types inert", () => {
    const timestamp = "2026-08-02T09:00:00Z";
    expect(initialShipHeroWebhookOutcome(decodeShipHeroStatusEvent("Inventory Change", { timestamp })))
      .toBe("ignored_inventory_sync_disabled");
    expect(initialShipHeroWebhookOutcome(decodeShipHeroStatusEvent("Unrecognized Event", { timestamp })))
      .toBe("ignored_unknown");
    expect(initialShipHeroWebhookOutcome(decodeShipHeroStatusEvent("Unrecognized Event", {})))
      .toBe("ignored_unknown");
    expect(initialShipHeroWebhookOutcome(decodeShipHeroStatusEvent("order_status", {})))
      .toBe("ignored_invalid_timestamp");
  });

  it("maps only explicitly configured partner status names", () => {
    expect(mapShipHeroStatus("Label Ready", {})).toBeNull();
    expect(mapShipHeroStatus("Label Ready", { "Label Ready": "ready" })).toBe("ready");
    expect(mapShipHeroStatus("delivered", { delivered: "cancelled" })).toBeNull();
  });

  it("routes explicit provider cancellation and return statuses to review instead of applying them", () => {
    expect(isShipHeroTerminalStatus("Cancelled")).toBe(true);
    expect(isShipHeroTerminalStatus("returned")).toBe(true);
    expect(isShipHeroTerminalStatus("in_transit")).toBe(false);
  });

  const input = {
    eventAt: at("2026-08-02T09:00:00Z"),
    shipmentStatus: "ready",
    orderStatus: "preparing",
    shipmentManuallyUpdatedAt: null,
    orderManuallyUpdatedAt: null,
    latestAppliedAt: null,
    targetShipmentStatus: "in_transit" as const,
  };

  it("applies forward-only milestones and does not downgrade current order status", () => {
    expect(decideShipHeroStatusApplication(input)).toEqual({
      outcome: "applied",
      shipmentStatus: "in_transit",
      orderStatus: "out_for_delivery",
    });
    expect(decideShipHeroStatusApplication({
      ...input,
      shipmentStatus: "ready",
      orderStatus: "delivered",
    })).toEqual({ outcome: "applied", shipmentStatus: "in_transit" });
    expect(decideShipHeroStatusApplication({
      ...input,
      orderStatus: "cancelled",
    }).outcome).toBe("ignored_requires_review");
    expect(decideShipHeroStatusApplication({
      ...input,
      orderStatus: "returned",
    }).outcome).toBe("ignored_requires_review");
    expect(decideShipHeroStatusApplication({
      ...input,
      orderStatus: "pending_payment",
    }).outcome).toBe("ignored_requires_review");
    expect(decideShipHeroStatusApplication({
      ...input,
      shipmentStatus: "delivered",
      targetShipmentStatus: "in_transit",
    }).outcome).toBe("ignored_stale_status");
  });

  it("protects newer manual updates and rejects stale or equal event timestamps", () => {
    expect(decideShipHeroStatusApplication({
      ...input,
      orderManuallyUpdatedAt: at("2026-08-02T09:00:00.001Z"),
    }).outcome).toBe("ignored_manually_updated");
    expect(decideShipHeroStatusApplication({
      ...input,
      shipmentManuallyUpdatedAt: at("2026-08-02T09:00:00.001Z"),
    }).outcome).toBe("ignored_manually_updated");
    expect(decideShipHeroStatusApplication({
      ...input,
      latestAppliedAt: at("2026-08-02T09:00:00Z"),
    }).outcome).toBe("ignored_stale_timestamp");
  });

  it("applies sequential delayed forward events without treating mutable update time as a manual override", () => {
    const readyToTransitAt = at("2024-03-02T10:00:00Z");
    const transit = decideShipHeroStatusApplication({
      ...input,
      eventAt: readyToTransitAt,
      shipmentManuallyUpdatedAt: null,
      orderManuallyUpdatedAt: null,
      latestAppliedAt: null,
      shipmentStatus: "ready",
      orderStatus: "preparing",
      targetShipmentStatus: "in_transit",
    });
    expect(transit).toMatchObject({ outcome: "applied", shipmentStatus: "in_transit", orderStatus: "out_for_delivery" });

    const delivered = decideShipHeroStatusApplication({
      ...input,
      eventAt: at("2024-03-02T10:01:00Z"),
      shipmentManuallyUpdatedAt: null,
      orderManuallyUpdatedAt: null,
      latestAppliedAt: readyToTransitAt,
      shipmentStatus: "in_transit",
      orderStatus: "out_for_delivery",
      targetShipmentStatus: "delivered",
    });
    expect(delivered).toMatchObject({ outcome: "applied", shipmentStatus: "delivered", orderStatus: "delivered" });
  });

  it("validates canonical base64 SHA-256 HMAC signatures against exact raw bytes", () => {
    const raw = Buffer.from('{"type":"order_status", "status":"ready"}');
    const signature = createShipHeroWebhookSignature(raw, "test-secret");
    expect(isValidShipHeroWebhookSignature(raw, "test-secret", signature)).toBe(true);
    expect(isValidShipHeroWebhookSignature(Buffer.from('{"type":"order_status","status":"ready"}'), "test-secret", signature)).toBe(false);
    expect(isValidShipHeroWebhookSignature(raw, "test-secret", `${signature.slice(0, -1)}!`)).toBe(false);
  });
});