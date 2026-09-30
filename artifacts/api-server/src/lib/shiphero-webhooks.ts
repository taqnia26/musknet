import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, eq, or } from "drizzle-orm";
import {
  db,
  ordersTable,
  shipheroDispatchesTable,
  shipheroSettingsTable,
  shipheroWebhookEventsTable,
  shipmentsTable,
} from "@workspace/db";
import { redactShipHeroPayload } from "./shiphero-config";
import { canApplyCarrierShippingStatus, type ShippingStatus } from "./shipping-status";
import { logger } from "./logger";

export const SHIPHERO_WEBHOOK_BODY_LIMIT = 256 * 1024;
export const SHIPHERO_WEBHOOK_SIGNATURE_HEADER = "x-shiphero-hmac-sha256";
export const SHIPHERO_WEBHOOK_MESSAGE_ID_HEADER = "x-shiphero-message-id";

export type ShipHeroWebhookEventInput = {
  messageId: string;
  eventType: string;
  payload: unknown;
};

export type DecodedShipHeroStatusEvent = {
  eventAt: Date | null;
  remoteOrderId: string | null;
  orderNumber: string | null;
  remoteStatus: string | null;
  isSupportedStatusEvent: boolean;
  isInventoryEvent: boolean;
};
export type InitialShipHeroWebhookOutcome =
  | "ignored_inventory_sync_disabled"
  | "ignored_invalid_timestamp"
  | "ignored_unknown"
  | null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function nestedRecords(payload: Record<string, unknown>) {
  const values = [payload.data, payload.shipment, payload.order, payload.fulfillment];
  return values.filter(isRecord);
}

function firstString(objects: Record<string, unknown>[], keys: string[]) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
    }
  }
  return null;
}

function parseTimezoneTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function decodeShipHeroStatusEvent(eventType: string, value: unknown): DecodedShipHeroStatusEvent {
  const payload = isRecord(value) ? value : {};
  const objects = [payload, ...nestedRecords(payload)];
  const normalizedType = eventType.trim().toLowerCase();
  const isInventoryEvent = /inventory|stock|quantity/.test(normalizedType);
  const isSupportedStatusEvent = normalizedType === "order_status" || normalizedType === "shipment update";
  const rawEventAt = firstString(objects, ["created_at", "timestamp"]);
  return {
    eventAt: parseTimezoneTimestamp(rawEventAt),
    remoteOrderId: firstString(objects, ["remoteOrderId", "remote_order_id", "order_id", "orderId", "order_uuid"]),
    orderNumber: firstString(objects, ["orderNumber", "order_number"]),
    remoteStatus: firstString(objects, ["status"]),
    isSupportedStatusEvent,
    isInventoryEvent,
  };
}

export function initialShipHeroWebhookOutcome(decoded: DecodedShipHeroStatusEvent): InitialShipHeroWebhookOutcome {
  if (decoded.isInventoryEvent) return "ignored_inventory_sync_disabled";
  if (!decoded.isSupportedStatusEvent) return "ignored_unknown";
  if (!decoded.eventAt) return "ignored_invalid_timestamp";
  return null;
}

export function mapShipHeroStatus(remoteStatus: string, mappings: Record<string, string>): ShippingStatus | null {
  const direct = mappings[remoteStatus];
  const mapped = direct ?? Object.entries(mappings).find(([name]) => name.toLowerCase() === remoteStatus.toLowerCase())?.[1];
  return mapped === "pending" || mapped === "ready" || mapped === "in_transit" || mapped === "delivered"
    ? mapped
    : null;
}

export function isShipHeroTerminalStatus(remoteStatus: string): boolean {
  return ["cancel", "cancellation", "cancelled", "canceled", "return", "returned"]
    .includes(remoteStatus.trim().toLowerCase());
}

export type ShipHeroStatusDecision = {
  outcome: "applied" | "ignored_stale_timestamp" | "ignored_manually_updated" |
    "ignored_requires_review" | "ignored_stale_status";
  shipmentStatus?: ShippingStatus;
  orderStatus?: "out_for_delivery" | "delivered";
};

const orderStatusRank: Record<string, number> = {
  pending_review: 0,
  preparing: 0,
  out_for_delivery: 1,
  delivered: 2,
};

export function decideShipHeroStatusApplication(input: {
  eventAt: Date;
  shipmentStatus: string;
  orderStatus: string;
  shipmentManuallyUpdatedAt: Date | null;
  orderManuallyUpdatedAt: Date | null;
  latestAppliedAt: Date | null;
  targetShipmentStatus: ShippingStatus;
}): ShipHeroStatusDecision {
  if (input.latestAppliedAt && input.eventAt.getTime() <= input.latestAppliedAt.getTime()) {
    return { outcome: "ignored_stale_timestamp" };
  }
  if (
    (input.shipmentManuallyUpdatedAt && input.shipmentManuallyUpdatedAt.getTime() > input.eventAt.getTime()) ||
    (input.orderManuallyUpdatedAt && input.orderManuallyUpdatedAt.getTime() > input.eventAt.getTime())
  ) {
    return { outcome: "ignored_manually_updated" };
  }
  if (["cancelled", "returned", "pending_payment"].includes(input.orderStatus)) {
    return { outcome: "ignored_requires_review" };
  }
  if (!canApplyCarrierShippingStatus(input.shipmentStatus, input.targetShipmentStatus)) {
    return { outcome: "ignored_stale_status" };
  }

  const milestone = input.targetShipmentStatus === "in_transit"
    ? "out_for_delivery"
    : input.targetShipmentStatus === "delivered"
      ? "delivered"
      : null;
  const orderStatus = milestone && orderStatusRank[input.orderStatus] !== undefined &&
      orderStatusRank[milestone] > orderStatusRank[input.orderStatus]
    ? milestone
    : undefined;

  return {
    outcome: "applied",
    shipmentStatus: input.targetShipmentStatus,
    ...(orderStatus ? { orderStatus } : {}),
  };
}

export function createShipHeroWebhookSignature(rawBody: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("base64");
}

export function isValidShipHeroWebhookSignature(rawBody: Buffer, secret: string, signature: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const supplied = Buffer.from(signature, "base64");
  if (supplied.length !== 32 || supplied.toString("base64") !== signature) return false;
  const expected = Buffer.from(createShipHeroWebhookSignature(rawBody, secret), "base64");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

const identityKey = "_shipheroProcessingIdentity";

function storedIdentity(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload[identityKey])) return null;
  const identity = payload[identityKey];
  return {
    orderNumber: typeof identity.orderNumber === "string" ? identity.orderNumber : null,
    remoteOrderId: typeof identity.remoteOrderId === "string" ? identity.remoteOrderId : null,
  };
}

async function persistProcessingResult(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  eventId: number,
  outcome: string,
  detail: string | null,
  eventAt: Date | null,
) {
  await tx.update(shipheroWebhookEventsTable).set({
    outcome,
    detail,
    eventAt,
    processedAt: new Date(),
  }).where(eq(shipheroWebhookEventsTable.id, eventId));
}

async function processEventRow(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  event: typeof shipheroWebhookEventsTable.$inferSelect,
) {
  const decoded = decodeShipHeroStatusEvent(event.eventType, event.payload);
  const initialOutcome = initialShipHeroWebhookOutcome(decoded);
  if (initialOutcome) {
    const detail = initialOutcome === "ignored_invalid_timestamp"
      ? "Event timestamp is missing or invalid."
      : null;
    await persistProcessingResult(tx, event.id, initialOutcome, detail, decoded.eventAt);
    return;
  }
  if (!decoded.eventAt) {
    await persistProcessingResult(tx, event.id, "ignored_invalid_timestamp", "Event timestamp is missing or invalid.", null);
    return;
  }
  if (!decoded.remoteStatus) {
    await persistProcessingResult(tx, event.id, "ignored_unmapped_status", "No partner shipment status was provided.", decoded.eventAt);
    return;
  }
  if (isShipHeroTerminalStatus(decoded.remoteStatus)) {
    await persistProcessingResult(tx, event.id, "ignored_requires_review", "Provider terminal status requires financial review.", decoded.eventAt);
    return;
  }
  if (!decoded.remoteOrderId && !decoded.orderNumber) {
    await persistProcessingResult(tx, event.id, "ignored_unrelated_order", "No dispatch identity was provided.", decoded.eventAt);
    return;
  }

  const clauses = [
    ...(decoded.remoteOrderId ? [eq(shipheroDispatchesTable.remoteOrderId, decoded.remoteOrderId)] : []),
    ...(decoded.orderNumber ? [eq(shipheroDispatchesTable.orderNumber, decoded.orderNumber)] : []),
  ];
  const dispatchRows = await tx.select().from(shipheroDispatchesTable).where(or(...clauses));
  const dispatchMatches = dispatchRows.filter((dispatch) =>
    (!decoded.remoteOrderId || dispatch.remoteOrderId === decoded.remoteOrderId) &&
    (!decoded.orderNumber || dispatch.orderNumber === decoded.orderNumber));
  if (dispatchMatches.length !== 1) {
    await persistProcessingResult(tx, event.id, "ignored_unrelated_order", "Event did not match one saved dispatch.", decoded.eventAt);
    return;
  }
  const dispatch = dispatchMatches[0];
  if (
    dispatch.status !== "sent" &&
    !(dispatch.status === "uncertain" && Boolean(dispatch.remoteOrderId) && decoded.remoteOrderId === dispatch.remoteOrderId)
  ) {
    await persistProcessingResult(tx, event.id, "ignored_not_dispatched", "Dispatch is not confirmed as sent.", decoded.eventAt);
    return;
  }

  // All mutations take locks in the same order: order, then its shipment.
  const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, dispatch.orderId)).for("update");
  if (!order) {
    await persistProcessingResult(tx, event.id, "ignored_unrelated_order", "Saved dispatch order no longer exists.", decoded.eventAt);
    return;
  }
  const [shipment] = await tx.select().from(shipmentsTable)
    .where(eq(shipmentsTable.orderId, order.id)).for("update");
  if (!shipment) {
    await persistProcessingResult(tx, event.id, "ignored_no_shipment", "No shipment is linked to the dispatched order.", decoded.eventAt);
    return;
  }

  const [settings] = await tx.select({ statusMappings: shipheroSettingsTable.statusMappings })
    .from(shipheroSettingsTable).where(eq(shipheroSettingsTable.id, "main"));
  const target = mapShipHeroStatus(decoded.remoteStatus, settings?.statusMappings ?? {});
  if (!target) {
    await persistProcessingResult(tx, event.id, "ignored_unmapped_status", null, decoded.eventAt);
    return;
  }

  const allApplied = await tx.select({
    eventAt: shipheroWebhookEventsTable.eventAt,
    payload: shipheroWebhookEventsTable.payload,
  }).from(shipheroWebhookEventsTable).where(eq(shipheroWebhookEventsTable.outcome, "applied"));
  const identity = { orderNumber: dispatch.orderNumber, remoteOrderId: dispatch.remoteOrderId };
  const latestAppliedAt = allApplied
    .filter((prior) => {
      const priorIdentity = storedIdentity(prior.payload);
      return priorIdentity && (
        (priorIdentity.orderNumber !== null && priorIdentity.orderNumber === identity.orderNumber) ||
        (priorIdentity.remoteOrderId !== null && priorIdentity.remoteOrderId === identity.remoteOrderId)
      );
    })
    .reduce<Date | null>((latest, prior) =>
      prior.eventAt && (!latest || prior.eventAt.getTime() > latest.getTime()) ? prior.eventAt : latest, null);
  const decision = decideShipHeroStatusApplication({
    eventAt: decoded.eventAt,
    shipmentStatus: shipment.status,
    orderStatus: order.status,
    shipmentManuallyUpdatedAt: shipment.statusManuallyUpdatedAt,
    orderManuallyUpdatedAt: order.statusManuallyUpdatedAt,
    latestAppliedAt,
    targetShipmentStatus: target,
  });
  if (decision.outcome !== "applied") {
    await persistProcessingResult(tx, event.id, decision.outcome, null, decoded.eventAt);
    return;
  }

  await tx.update(shipmentsTable).set({
    status: decision.shipmentStatus!,
    ...(decision.shipmentStatus === "in_transit" && !shipment.shippedAt ? { shippedAt: decoded.eventAt } : {}),
    ...(decision.shipmentStatus === "delivered" ? { deliveredAt: decoded.eventAt } : {}),
  }).where(eq(shipmentsTable.id, shipment.id));
  if (decision.orderStatus) {
    await tx.update(ordersTable).set({ status: decision.orderStatus })
      .where(eq(ordersTable.id, order.id));
  }
  const originalPayload = isRecord(event.payload) ? event.payload : { payload: event.payload };
  const payloadWithIdentity = {
    ...originalPayload,
    [identityKey]: identity,
  };
  await tx.update(shipheroWebhookEventsTable).set({
    outcome: "applied",
    detail: null,
    eventAt: decoded.eventAt,
    processedAt: new Date(),
    payload: redactShipHeroPayload(payloadWithIdentity),
  }).where(eq(shipheroWebhookEventsTable.id, event.id));
}

export async function persistShipHeroWebhookEvent(input: ShipHeroWebhookEventInput): Promise<boolean> {
  const safeInput = redactShipHeroPayload(input) as ShipHeroWebhookEventInput;
  const result = await db.insert(shipheroWebhookEventsTable).values({
    messageId: safeInput.messageId,
    eventType: safeInput.eventType,
    payload: safeInput.payload,
    outcome: "received",
  }).onConflictDoNothing({ target: shipheroWebhookEventsTable.messageId }).returning({
    id: shipheroWebhookEventsTable.id,
  });
  return result.length > 0;
}

async function processOneQueuedShipHeroWebhook(): Promise<boolean> {
  let selectedId: number | null = null;
  try {
    await db.transaction(async (tx) => {
      const [event] = await tx.select().from(shipheroWebhookEventsTable)
        .where(eq(shipheroWebhookEventsTable.outcome, "received"))
        .orderBy(asc(shipheroWebhookEventsTable.receivedAt), asc(shipheroWebhookEventsTable.id))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!event) return;
      selectedId = event.id;
      await processEventRow(tx, event);
    });
  } catch {
    if (selectedId !== null) {
      try {
        await db.update(shipheroWebhookEventsTable).set({
          outcome: "processing_error",
          detail: "Processing failed; manual review required.",
          processedAt: new Date(),
        }).where(and(
          eq(shipheroWebhookEventsTable.id, selectedId),
          eq(shipheroWebhookEventsTable.outcome, "received"),
        ));
      } catch {
        // Keep the original processing failure private; a later operational retry can inspect durable state.
      }
    }
    logger.error("ShipHero webhook event processing failed");
  }
  return selectedId !== null;
}

let queueRunning = false;
export async function processShipHeroWebhookQueue(maxEvents = 100): Promise<number> {
  if (queueRunning) return 0;
  queueRunning = true;
  try {
    let processed = 0;
    while (processed < maxEvents && await processOneQueuedShipHeroWebhook()) processed += 1;
    return processed;
  } finally {
    queueRunning = false;
  }
}

let workerTimer: NodeJS.Timeout | null = null;
export function startShipHeroWebhookWorker(intervalMs = 2_000): () => void {
  if (workerTimer) return () => stopShipHeroWebhookWorker();
  void processShipHeroWebhookQueue();
  workerTimer = setInterval(() => void processShipHeroWebhookQueue(), intervalMs);
  workerTimer.unref();
  return () => stopShipHeroWebhookWorker();
}

export function stopShipHeroWebhookWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}