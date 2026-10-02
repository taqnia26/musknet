import { describe, expect, it } from 'vitest';
import { assertPhoneOrderTransition, orderInvoiceIsDue } from './phone-order-policy';

describe('phone order issuance and status policy', () => {
  it('issues on delivery, not on creation or early collection, including delivery while unpaid', () => {
    const phone = { orderSource: 'phone', status: 'pending_review', paymentStatus: 'pending' };
    expect(orderInvoiceIsDue(phone, {})).toBe(false);
    expect(orderInvoiceIsDue(phone, { paymentStatus: 'paid' })).toBe(false);
    expect(orderInvoiceIsDue(phone, { status: 'preparing', paymentStatus: 'paid' })).toBe(false);
    expect(orderInvoiceIsDue(phone, { status: 'delivered' })).toBe(true);
  });

  it('preserves the existing issuance timing for every other source including history', () => {
    for (const orderSource of [null, 'storefront', 'admin']) {
      const order = { orderSource, status: 'pending_review', paymentStatus: 'pending' };
      expect(orderInvoiceIsDue(order, { paymentStatus: 'paid' })).toBe(true);
      expect(orderInvoiceIsDue(order, { status: 'delivered' })).toBe(false);
    }
  });

  it('allows only the agreed stages and rejects skipped or regressing stages', () => {
    const statuses = ['pending_review', 'preparing', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'pending_payment'];
    const transitions: Record<string, string[]> = {
      pending_review: ['preparing', 'cancelled'],
      preparing: ['out_for_delivery', 'cancelled'],
      out_for_delivery: ['delivered'],
    };
    for (const current of statuses) for (const next of statuses) {
      const allowed = current === next || transitions[current]?.includes(next);
      if (allowed) expect(() => assertPhoneOrderTransition(current, next)).not.toThrow();
      else expect(() => assertPhoneOrderTransition(current, next)).toThrow();
    }
    expect(() => assertPhoneOrderTransition('pending_review', 'delivered')).toThrow();
    expect(() => assertPhoneOrderTransition('delivered', 'preparing')).toThrow();
  });
});