import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AdminWalletBilling, { hasSupplierInvoice, WalletBalanceCards } from './wallet-billing';

const state = vi.hoisted(() => ({
  lang: 'ar' as 'ar' | 'en',
  editing: false,
  loading: false,
  error: false,
  purchases: [] as any[],
}));

vi.mock('@/hooks/use-language', () => ({ useLanguage: () => ({
  lang: state.lang, t: (ar: string, en: string) => state.lang === 'ar' ? ar : en,
}) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@workspace/api-client-react', () => ({
  useGetAdminMe: () => ({ data: { isSuperAdmin: false, permissions: state.editing ? ['finance:view', 'finance:edit'] : ['finance:view'] } }),
  useAdminGetBillingSettings: () => ({
    data: state.loading || state.error ? undefined : {
      preferredPaymentMethod: 'bank_transfer', bankName: state.editing ? 'Private Bank' : null,
      accountHolder: state.editing ? 'Private Holder' : null, iban: state.editing ? 'SA1234567890123456789012' : null,
      accountNumber: state.editing ? '123456789' : null, companyName: 'Musk',
      invoiceEmail: 'billing@example.com',
    },
    isLoading: state.loading, isError: state.error, refetch: vi.fn(),
  }),
  useAdminUpdateBillingSettings: () => ({ isPending: false, mutate: vi.fn() }),
  getAdminGetBillingSettingsQueryKey: () => ['billing'],
  useAdminListPurchases: () => ({ data: state.purchases, isLoading: state.loading, isError: state.error, refetch: vi.fn() }),
}));

const render = () => renderToStaticMarkup(<AdminWalletBilling />);

describe('wallet billing presentation', () => {
  it.each(['ar', 'en'] as const)('keeps section order, separate balance cards, and unavailable platform tables in %s', lang => {
    state.lang = lang;
    state.editing = false;
    state.loading = false;
    state.error = false;
    state.purchases = [];
    const html = render();
    expect(html.match(/data-testid="card-balance-/g)).toHaveLength(3);
    expect(html).toContain('md:grid-cols-3');
    expect(html.indexOf('data-testid="wallet-balances"')).toBeLessThan(html.indexOf('data-testid="billing-settings"'));
    expect(html.indexOf('data-testid="billing-settings"')).toBeLessThan(html.indexOf('data-testid="platform-subscriptions"'));
    expect(html.indexOf('data-testid="platform-subscriptions"')).toBeLessThan(html.indexOf('data-testid="platform-invoices"'));
    expect(html.indexOf('data-testid="platform-invoices"')).toBeLessThan(html.indexOf('data-testid="supplier-invoices"'));
    expect(html).toContain(lang === 'ar' ? 'غير متاح' : 'Unavailable');
    expect(html).toContain('md:hidden');
    expect(html).toContain('md:block');
    expect(html).not.toContain('Private Bank');
    expect(html).not.toContain('button-edit-bank');
  });

  it('keeps bank fields and editing controls exclusive to finance editors', () => {
    state.editing = true;
    const html = render();
    expect(html).toContain('Private Bank');
    expect(html).toContain('button-edit-bank');
    expect(html).toContain('SA1234567890123456789012');
  });

  it('offers download only for supported, attached, active local documents', () => {
    const base = { amount: '30', purchaseDate: '2026-09-01', title: 'Local purchase' };
    state.purchases = [
      { ...base, id: 1, invoiceObjectPath: '/objects/purchases/1', invoiceContentType: 'application/pdf' },
      { ...base, id: 2, invoiceObjectPath: null, invoiceContentType: 'application/pdf' },
      { ...base, id: 3, invoiceObjectPath: '/objects/purchases/3', invoiceContentType: 'text/plain' },
      { ...base, id: 4, archivedAt: '2026-09-02', invoiceObjectPath: '/objects/purchases/4', invoiceContentType: 'application/pdf' },
    ];
    expect(state.purchases.filter(hasSupplierInvoice)).toHaveLength(1);
    const html = render();
    expect(html).toContain('button-download-1');
    expect(html).toContain('button-mobile-download-1');
    expect(html).not.toContain('button-download-2');
    expect(html).not.toContain('button-download-3');
    expect(html).not.toContain('button-download-4');
  });

  it('shows loading and error status without fabricating bank details', () => {
    state.lang = 'ar';
    state.purchases = [];
    state.loading = true;
    expect(render()).toContain('جارٍ تحميل إعدادات الفوترة');
    state.loading = false;
    state.error = true;
    expect(render()).toContain('تعذر تحميل إعدادات الفوترة');
    state.error = false;
  });

  it('uses theme tokens for balance cards in either language', () => {
    for (const lang of ['ar', 'en'] as const) {
      state.lang = lang;
      const html = renderToStaticMarkup(<WalletBalanceCards t={(ar, en) => lang === 'ar' ? ar : en} />);
      expect(html).toContain('bg-primary/10');
      expect(html).toContain('text-muted-foreground');
    }
  });
});