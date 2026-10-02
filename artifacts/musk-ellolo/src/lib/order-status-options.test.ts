import { describe, expect, it } from 'vitest';
import { canSelectOrderStatus } from './order-status-options';

describe('phone order status controls', () => {
  it('allows only the next stage, repeat selections, and cancellation before departure', () => {
    expect(canSelectOrderStatus({ orderSource: 'phone', status: 'pending_review' }, 'preparing')).toBe(true);
    expect(canSelectOrderStatus({ orderSource: 'phone', status: 'pending_review' }, 'delivered')).toBe(false);
    expect(canSelectOrderStatus({ orderSource: 'phone', status: 'preparing' }, 'out_for_delivery')).toBe(true);
    expect(canSelectOrderStatus({ orderSource: 'phone', status: 'preparing' }, 'cancelled')).toBe(true);
    expect(canSelectOrderStatus({ orderSource: 'phone', status: 'out_for_delivery' }, 'cancelled')).toBe(false);
    expect(canSelectOrderStatus({ orderSource: 'phone', status: 'out_for_delivery' }, 'delivered')).toBe(true);
    expect(canSelectOrderStatus({ orderSource: 'phone', status: 'delivered' }, 'delivered')).toBe(true);
    expect(canSelectOrderStatus({ orderSource: 'phone', status: 'delivered' }, 'preparing')).toBe(false);
  });

  it('does not restrict other existing sources or historical orders', () => {
    for (const orderSource of [undefined, null, 'admin', 'storefront']) {
      expect(canSelectOrderStatus({ orderSource, status: 'pending_review' }, 'delivered')).toBe(true);
    }
  });
});