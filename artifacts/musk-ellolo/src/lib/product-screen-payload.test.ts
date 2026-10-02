import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { productScreenPayload } from './product-screen-payload';

describe('product screen inventory boundary', () => {
  const values = {
    nameAr: 'منتج', price: 125, compareAtPrice: 150,
    stockQuantity: 37, reorderPoint: 9, targetStockQuantity: 80,
  };

  it('omits existing stock and thresholds instead of overwriting stored values', () => {
    expect(productScreenPayload(values).update).toEqual({
      nameAr: 'منتج', price: 125, compareAtPrice: 150,
    });
    expect(values.stockQuantity).toBe(37);
    expect(values.reorderPoint).toBe(9);
    expect(values.targetStockQuantity).toBe(80);
  });

  it('creates without opening stock while leaving threshold defaults to the server', () => {
    expect(productScreenPayload(values).create).toEqual({
      nameAr: 'منتج', price: 125, compareAtPrice: 150, stockQuantity: 0,
    });
  });

  it('removes only the three quantity controls and keeps compare-at price and stock display', () => {
    const page = readFileSync(new URL('../pages/admin/products.tsx', import.meta.url), 'utf8');
    for (const field of ['stockQuantity', 'reorderPoint', 'targetStockQuantity']) {
      expect(page).not.toContain(`name="${field}"`);
    }
    expect(page).toContain('name="compareAtPrice"');
    expect(page).toContain('product.stockQuantity.toLocaleString');
    expect(page).toContain('data: payload.create');
    expect(page).toContain('= payload.update');
  });
});