export type ShippingLabelRequest = {
  referenceNumber: string;
  recipientName: string;
  recipientPhone: string;
  destinationCity: string;
  destinationAddress: string | null;
  serviceMethod: string;
};

export type ShippingLabelResult = {
  carrierShipmentId: string;
  trackingNumber: string;
  labelUrl: string | null;
  actualCost: number | null;
};

export class CarrierConfigurationError extends Error {}
export class CarrierRequestError extends Error {}

const cleanBaseUrl = (value: string) => value.replace(/\/+$/, "");

export async function createSmsaShippingLabel(
  apiBaseUrl: string | null,
  input: ShippingLabelRequest,
): Promise<ShippingLabelResult> {
  const apiKey = process.env.SMSA_API_KEY;
  if (!apiBaseUrl || !apiKey) {
    throw new CarrierConfigurationError("SMSA integration requires an API base URL and SMSA_API_KEY");
  }

  let response: Response;
  try {
    response = await fetch(`${cleanBaseUrl(apiBaseUrl)}/shipments`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": `shipment:${input.referenceNumber}`,
      },
      body: JSON.stringify({
        referenceNumber: input.referenceNumber,
        service: input.serviceMethod,
        recipient: {
          name: input.recipientName,
          phone: input.recipientPhone,
          city: input.destinationCity,
          address: input.destinationAddress,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new CarrierRequestError(error instanceof Error ? error.message : "SMSA request failed");
  }

  if (!response.ok) {
    throw new CarrierRequestError(`SMSA returned HTTP ${response.status}`);
  }

  const payload = await response.json() as Record<string, unknown>;
  const carrierShipmentId = typeof payload.shipmentId === "string" ? payload.shipmentId : null;
  const trackingNumber = typeof payload.trackingNumber === "string" ? payload.trackingNumber : null;
  if (!carrierShipmentId || !trackingNumber) {
    throw new CarrierRequestError("SMSA response did not include shipmentId and trackingNumber");
  }
  const actualCost = typeof payload.actualCost === "number" && payload.actualCost >= 0
    ? payload.actualCost
    : null;
  return {
    carrierShipmentId,
    trackingNumber,
    labelUrl: typeof payload.labelUrl === "string" ? payload.labelUrl : null,
    actualCost,
  };
}