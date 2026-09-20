export const shippingStatuses = [
  "pending",
  "ready",
  "in_transit",
  "delivered",
  "returned",
  "cancelled",
] as const;

export type ShippingStatus = (typeof shippingStatuses)[number];

const transitions: Record<ShippingStatus, readonly ShippingStatus[]> = {
  pending: ["ready", "cancelled"],
  ready: ["in_transit", "cancelled"],
  in_transit: ["delivered", "returned"],
  delivered: ["returned"],
  returned: [],
  cancelled: [],
};

export class ShippingStatusTransitionError extends Error {
  constructor(public readonly from: string, public readonly to: string) {
    super(`Invalid shipment status transition from '${from}' to '${to}'. Allowed next statuses: ${transitions[from as ShippingStatus]?.join(", ") || "none"}`);
    this.name = "ShippingStatusTransitionError";
  }
}

export function canTransitionShippingStatus(from: string, to: string) {
  return (transitions[from as ShippingStatus] ?? []).includes(to as ShippingStatus);
}

export function canApplyCarrierShippingStatus(from: string, to: string) {
  const forwardRank: Partial<Record<ShippingStatus, number>> = {
    pending: 0,
    ready: 1,
    in_transit: 2,
    delivered: 3,
  };
  if (from === to || from === "cancelled" || from === "returned") return false;
  if (to === "returned") return from === "in_transit" || from === "delivered";
  if (to === "cancelled") return from === "pending" || from === "ready";
  const fromRank = forwardRank[from as ShippingStatus];
  const toRank = forwardRank[to as ShippingStatus];
  return fromRank !== undefined && toRank !== undefined && toRank > fromRank;
}

export function assertShippingStatusTransition(from: string, to: string) {
  if (!canTransitionShippingStatus(from, to)) {
    throw new ShippingStatusTransitionError(from, to);
  }
}
