export function canSelectOrderStatus(
  order: { orderSource?: string | null; status: string },
  next: string,
) {
  if (order.orderSource !== 'phone' || next === order.status) return true;
  const allowed: Record<string, readonly string[]> = {
    pending_review: ['preparing', 'cancelled'],
    preparing: ['out_for_delivery', 'cancelled'],
    out_for_delivery: ['delivered'],
  };
  return allowed[order.status]?.includes(next) ?? false;
}