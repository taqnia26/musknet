import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CarrierConfigurationError,
  CarrierRequestError,
  createSmsaShippingLabel,
} from "./shipping-carriers";

const request = {
  referenceNumber: "ME-100",
  recipientName: "Test Customer",
  recipientPhone: "966500000000",
  destinationCity: "Riyadh",
  destinationAddress: "Olaya",
  serviceMethod: "standard",
};

describe("SMSA shipping carrier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SMSA_API_KEY;
  });

  it("fails explicitly when the integration is incomplete", async () => {
    await expect(createSmsaShippingLabel(null, request)).rejects.toBeInstanceOf(CarrierConfigurationError);
  });

  it("creates a normalized label and sends an idempotency key", async () => {
    process.env.SMSA_API_KEY = "test-only";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      shipmentId: "carrier-1",
      trackingNumber: "TRACK-1",
      labelUrl: "https://carrier.example/labels/1",
      actualCost: 24.5,
    }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createSmsaShippingLabel("https://carrier.example/", request)).resolves.toEqual({
      carrierShipmentId: "carrier-1",
      trackingNumber: "TRACK-1",
      labelUrl: "https://carrier.example/labels/1",
      actualCost: 24.5,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://carrier.example/shipments",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "shipment:ME-100" }),
      }),
    );
  });

  it("turns incomplete carrier responses into retryable failures", async () => {
    process.env.SMSA_API_KEY = "test-only";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    await expect(createSmsaShippingLabel("https://carrier.example", request))
      .rejects.toBeInstanceOf(CarrierRequestError);
  });
});