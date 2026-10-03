import { describe, expect, it } from 'vitest';
import { orderSummaryHtml } from './order-documents';

describe('non-tax order summary', () => {
  it('escapes all order and customer text and preserves the non-tax notice', () => {
    const html = orderSummaryHtml('L-<script>', [['العميل', '<img onerror="alert(1)">']], [
      { name: '<script>alert(1)</script>', quantity: 2, price: 12.5, total: 25 },
    ], true);
    expect(html).toContain('ليس فاتورة ضريبية ولا إثبات سداد');
    expect(html).toContain('dir="rtl"');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('25.00');
  });
  it('supports a self-contained English download without remote assets', () => {
    const html = orderSummaryHtml('CO-00000001', [['Total', 0]], [], false);
    expect(html).toContain('not a tax invoice or proof of payment');
    expect(html).toContain('dir="ltr"');
    expect(html).not.toContain('https://');
  });
});