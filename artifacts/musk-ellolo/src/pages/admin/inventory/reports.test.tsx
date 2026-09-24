import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AdminInventoryReports from './reports';

const fixture = vi.hoisted(() => ({
  lang: 'ar' as 'ar' | 'en',
  loading: false,
  empty: false,
}));

vi.mock('@/hooks/use-language', () => ({
  useLanguage: () => ({
    lang: fixture.lang,
    t: (ar: string, en: string) => fixture.lang === 'ar' ? ar : en,
  }),
}));

vi.mock('@/components/ui/tabs', async () => {
  const { createElement } = await import('react');
  const Wrap = ({ children }: { children: React.ReactNode }) => createElement('div', null, children);
  return { Tabs: Wrap, TabsList: Wrap, TabsTrigger: Wrap, TabsContent: Wrap };
});

vi.mock('@workspace/api-client-react', () => {
  const state = (data: unknown) => ({
    data: fixture.empty ? null : data,
    isLoading: fixture.loading,
    isError: false,
  });
  return {
    useGetInventoryValuationReport: () => state([{ locationId: 12, location: 'Main', operationalType: 'warehouse', quantity: 1234, value: 5678 }]),
    useGetInventoryAgingReport: () => state([{ productId: 42, locationId: 12, available: 3, updatedAt: '2026-09-20T00:00:00Z', ageDays: 99 }]),
    useGetInventoryAuditReport: () => state({ items: [{ id: 8, createdAt: '2026-09-20T10:00:00Z', productId: 42, quantityChange: -4, sourceType: 'order', sourceId: 55, performerName: null, performedBy: 7 }] }),
    useGetInventoryReconciliationReport: () => state({ operationalValue: 5678, accountingInventoryValue: 5600, difference: 78, unlinkedMovements: [1], unlinkedInventoryJournals: [] }),
    getGetInventoryValuationReportQueryKey: () => [],
    getGetInventoryAgingReportQueryKey: () => [],
    getGetInventoryAuditReportQueryKey: () => [],
    getGetInventoryReconciliationReportQueryKey: () => [],
  };
});

describe('inventory reports direction', () => {
  it.each(['ar', 'en'] as const)('keeps %s table order, heading alignment and isolated values', (lang) => {
    fixture.lang = lang;
    fixture.loading = false;
    fixture.empty = false;
    const html = renderToStaticMarkup(<AdminInventoryReports />);
    expect(html).toContain(`dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`);
    const tables = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/g)].map(([table]) => table);
    expect(tables).toHaveLength(3);
    for (const table of tables) {
      expect(table).toContain(`dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`);
      expect(table).toContain('min-w-[');
      expect(table).toContain('text-start');
      expect(table).toContain('dir="ltr"');
      expect(table.indexOf('<thead')).toBeLessThan(table.indexOf('<tbody'));
    }
    expect(tables[0]).toMatch(/<th[^>]*text-end[^>]*>.*?Total Value|<th[^>]*text-end[^>]*>.*?القيمة الإجمالية/);
    expect(tables[0]).toMatch(/<td[^>]*text-end[^>]*>.*?aria-label="5,678/);
    expect(tables[0].indexOf(lang === 'ar' ? 'رمز الموقع' : 'Location ID')).toBeLessThan(tables[0].indexOf(lang === 'ar' ? 'القيمة الإجمالية' : 'Total Value'));
    expect(tables[0]).toContain('>1,234</span>');
    expect(tables[0]).toContain('aria-label="5,678');
    expect(tables[1]).toContain('>2026-09-20</span>');
    expect(tables[2]).toContain('>-4</span>');
    expect(tables[2]).toContain('>order #55</span>');
    expect(html).toContain(lang === 'ar' ? 'القيمة التشغيلية' : 'Operational Value');
    expect(html).toContain('dir="ltr"');
  });

  it('renders loading and empty states without changing table layout or export behavior', () => {
    fixture.lang = 'ar';
    fixture.loading = true;
    expect(renderToStaticMarkup(<AdminInventoryReports />)).toContain('جاري التحميل');
    fixture.loading = false;
    fixture.empty = true;
    const html = renderToStaticMarkup(<AdminInventoryReports />);
    expect(html).toContain('لا توجد بيانات');
    expect(html).toContain('لا توجد بيانات راكدة');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('<table');
    fixture.empty = false;
  });
});