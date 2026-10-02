import { AccountingConflictError } from './accounting';

const phoneTransitions: Record<string, readonly string[]> = {
  pending_review: ['preparing', 'cancelled'],
  preparing: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
  returned: [],
};

export function assertPhoneOrderTransition(current: string, next?: string) {
  if (next === undefined || next === current) return;
  if (!phoneTransitions[current]?.includes(next)) {
    throw new AccountingConflictError('Phone orders must follow review, preparation, out for delivery, then delivered');
  }
}

export function orderInvoiceIsDue(
  order: { orderSource: string | null; status: string; paymentStatus: string },
  values: { status?: string; paymentStatus?: string },
) {
  return order.orderSource === 'phone'
    ? (values.status ?? order.status) === 'delivered'
    : (values.paymentStatus ?? order.paymentStatus) === 'paid';
}