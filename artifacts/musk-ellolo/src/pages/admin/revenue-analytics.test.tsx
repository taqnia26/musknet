import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminRevenueAnalytics from './revenue-analytics';

const state = vi.hoisted(() => ({ lang: 'ar' as 'ar' | 'en' }));

vi.mock('@/hooks/use-language', () => ({
  useLanguage: () => ({
    lang: state.lang,
    t: (ar: string, en: string) => state.lang === 'ar' ? ar : en,
  }),
}));

vi.mock('@workspace/api-client-react', () => ({
  getGetAdminRevenueAnalyticsQueryKey: () => ['revenue'],
  useGetAdminRevenueAnalytics: () => ({
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    data: {
      period: { from: '2026-09-01', to: '2026-09-07' },
      previousPeriod: { from: '2026-08-25', to: '2026-08-31' },
      summary: { totalRevenue: 1234.5, onlineRevenue: 234.5, companyRevenue: 1000, onlineOrders: 2, companyInvoices: 1, activeCompanies: 1, changePct: 10 },
      previousSummary: { totalRevenue: 1122 },
      trend: [{ date: '2026-09-01', onlineRevenue: 234.5, companyRevenue: 1000, totalRevenue: 1234.5 }],
      byCompany: [{ companyId: 1, companyName: 'Test Company', revenue: 1000, previousRevenue: 900, invoices: 1, sharePct: 100, changePct: 11 }],
      productMovements: {
        online: [{ productId: 1, nameAr: 'منتج', nameEn: 'Product', sku: 'SITE-001', quantity: 2, transactions: 1 }],
        companies: [],
      },
      shipping: Object.fromEntries(['total', 'domestic', 'international', 'online', 'companies'].map(key => [
        key, { shippedCount: 1, shipmentCount: 1, quantity: 2, actualCost: 45.5, collectedCost: 30, netCost: 15.5 },
      ])),
    },
  }),
}));

describe('detailed revenue dashboard currency bindings', () => {
  it.each(['ar', 'en'] as const)('keeps SKU separate from monetary values in %s', lang => {
    state.lang = lang;
    const html = renderToStaticMarkup(<AdminRevenueAnalytics />);
    const symbol = lang === 'ar' ? 'saudi-riyal-symbol.svg' : '>SAR</span>';
    for (const testId of ['card-total-revenue', 'card-online-revenue', 'card-company-revenue', 'table-company-revenue', 'table-shipping-financials']) {
      const section = html.slice(html.indexOf(`data-testid="${testId}"`));
      expect(section).toContain(symbol);
    }
    expect(html).toContain('1,234.5');
    expect(html).toContain('45.5');
    expect(html).toContain('SITE-001');
    expect(html).not.toContain('SITE-001 ريال');
    expect(html).not.toContain('SITE-001 SAR');
    expect(html).not.toContain('lucide-dollar-sign');
  });
});