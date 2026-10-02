import { describe, expect, it } from 'vitest';
import { distributorOrderTotals } from './distributor-order-totals';

describe('distributor order estimates', () => {
  it('extracts included VAT instead of adding it to catalog prices', () => {
    expect(distributorOrderTotals([{ unitPrice: 100, quantity: 1 }], 10, 15)).toEqual({
      listSubtotal: 100, discountAmount: 10, subtotal: 78.26, vatAmount: 11.74, totalAmount: 90,
    });
  });
  it('matches international totals and rounds each invoice line in cents', () => {
    expect(distributorOrderTotals([{ unitPrice: 100, quantity: 1 }], 10, 0)).toMatchObject({
      subtotal: 90, vatAmount: 0, totalAmount: 90,
    });
    expect(distributorOrderTotals([
      { unitPrice: 0.05, quantity: 1 }, { unitPrice: 0.05, quantity: 1 },
    ], 10, 15)).toEqual({
      listSubtotal: 0.1, discountAmount: 0, subtotal: 0.08, vatAmount: 0.02, totalAmount: 0.1,
    });
  });
});