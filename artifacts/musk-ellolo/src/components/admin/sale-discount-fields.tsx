import { useEffect, useRef, useState } from 'react';
import type { SaleDiscountQuote, SaleDiscountQuoteInput } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Money } from '@/components/money';

export type SaleDiscountForm = { coupon: string; percent: string; reason: string };
export const emptySaleDiscount: SaleDiscountForm = { coupon: '', percent: '', reason: '' };

const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/;

export function parsePercent(raw: string): number | null {
  const v = raw.trim();
  if (!v) return 0;
  if (!PERCENT_RE.test(v)) return null;
  const n = Number(v);
  return n >= 0 && n <= 100 ? n : null;
}

/** Returns an error message or null; also used to guard submit. */
export function validateSaleDiscount(f: SaleDiscountForm, t: (ar: string, en: string) => string): string | null {
  const percent = parsePercent(f.percent);
  if (percent === null) return t('نسبة الخصم من 0 إلى 100 بحد أقصى منزلتين عشريتين', 'Discount percent must be 0 to 100 with at most two decimals');
  if (f.coupon.trim().length > 100) return t('رمز الكوبون طويل جداً', 'Coupon code is too long');
  if (percent > 0) {
    const len = f.reason.trim().length;
    if (len < 10 || len > 500) return t('سبب الخصم مطلوب من 10 إلى 500 حرف', 'Discount reason is required (10 to 500 characters)');
  }
  return null;
}

export function saleDiscountPayload(f: SaleDiscountForm) {
  const percent = parsePercent(f.percent) ?? 0;
  const coupon = f.coupon.trim();
  return {
    ...(coupon ? { couponCode: coupon } : {}),
    ...(percent > 0 ? { discountOverride: { percent, reason: f.reason.trim() } } : {}),
  };
}

type QuoteFn = (vars: { data: SaleDiscountQuoteInput }) => Promise<SaleDiscountQuote>;

export function useSaleDiscountPreview(quote: QuoteFn, productSubtotal: number, form: SaleDiscountForm, enabled: boolean) {
  const quoteRef = useRef(quote);
  quoteRef.current = quote;
  const latest = useRef(0);
  const [state, setState] = useState<{ key: string; quote: SaleDiscountQuote | null; error: string | null; loading: boolean }>({ key: '', quote: null, error: null, loading: false });
  const percent = parsePercent(form.percent);
  const coupon = form.coupon.trim();
  const active = enabled && percent !== null && productSubtotal > 0 && (coupon !== '' || percent > 0);
  const key = `${productSubtotal}|${coupon}|${percent}`;

  useEffect(() => {
    latest.current += 1;
    const id = latest.current;
    if (!active) { setState({ key, quote: null, error: null, loading: false }); return; }
    setState({ key, quote: null, error: null, loading: true });
    const handle = window.setTimeout(() => {
      quoteRef.current({ data: { productSubtotal, ...(coupon ? { couponCode: coupon } : {}), manualDiscountPercent: percent ?? 0 } })
        .then((q) => { if (id === latest.current) setState({ key, quote: q, error: null, loading: false }); })
        .catch((e: unknown) => {
          if (id !== latest.current) return;
          const data = (e as { data?: { error?: unknown } | null } | null)?.data;
          const msg = data && typeof data.error === 'string' ? data.error : e instanceof Error ? e.message : '';
          setState({ key, quote: null, error: msg || 'error', loading: false });
        });
    }, 450);
    return () => window.clearTimeout(handle);
  }, [active, key, productSubtotal, coupon, percent]);

  // A quote is only valid for the exact inputs it was requested with.
  const current = state.key === key;
  return { active, quote: current ? state.quote : null, error: current ? state.error : null, loading: active && (!current || state.loading) };
}

export function SaleDiscountFields({ form, onChange, preview, idPrefix, disabled }: {
  form: SaleDiscountForm;
  onChange: (next: SaleDiscountForm) => void;
  preview: ReturnType<typeof useSaleDiscountPreview>;
  idPrefix: string;
  disabled?: boolean;
}) {
  const { t, lang } = useLanguage();
  const percent = parsePercent(form.percent);
  const q = preview.quote;
  return (
    <div className="space-y-3 rounded-md border p-3" data-testid={`${idPrefix}-discount-section`}>
      <p className="text-sm font-medium">{t('الخصم على المنتجات (اختياري)', 'Product discount (optional)')}</p>
      <p className="text-xs text-muted-foreground">{t('يُطبق الكوبون أولاً ثم النسبة اليدوية على المتبقي. لا يشمل الخصم الشحن ولا رسوم الاستلام.', 'The coupon applies first, then the manual percent on the remainder. Shipping and the pickup fee are never discounted.')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-coupon`}>{t('كوبون', 'Coupon code')}</Label>
          <Input id={`${idPrefix}-coupon`} data-testid={`input-${idPrefix}-coupon`} maxLength={100} disabled={disabled} value={form.coupon} onChange={(e) => onChange({ ...form, coupon: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-percent`}>{t('نسبة خصم يدوية %', 'Manual discount %')}</Label>
          <Input id={`${idPrefix}-percent`} data-testid={`input-${idPrefix}-percent`} inputMode="decimal" disabled={disabled} aria-invalid={percent === null} value={form.percent} onChange={(e) => onChange({ ...form, percent: e.target.value })} />
        </div>
      </div>
      {percent !== null && percent > 0 && (
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-reason`}>{t('سبب الخصم (10 إلى 500 حرف)', 'Discount reason (10 to 500 characters)')}</Label>
          <Textarea id={`${idPrefix}-reason`} data-testid={`input-${idPrefix}-reason`} maxLength={500} rows={2} disabled={disabled} value={form.reason} onChange={(e) => onChange({ ...form, reason: e.target.value })} />
        </div>
      )}
      {preview.active && (
        <div className="text-sm space-y-1" aria-live="polite" data-testid={`${idPrefix}-discount-preview`}>
          {preview.loading ? <p className="text-muted-foreground">{t('جاري احتساب الخصم...', 'Calculating discount...')}</p>
            : preview.error ? <p role="alert" className="text-destructive">{preview.error}</p>
            : q ? <>
              <div className="flex justify-between"><span>{t('مجموع المنتجات', 'Products subtotal')}</span><Money value={q.productSubtotal} lang={lang} fractionDigits={2} /></div>
              <div className="flex justify-between"><span>{t('خصم الكوبون', 'Coupon discount')}{q.couponCode ? ` (${q.couponCode})` : ''}</span><span>-<Money value={q.couponDiscountAmount} lang={lang} fractionDigits={2} /></span></div>
              <div className="flex justify-between"><span>{t(`خصم يدوي (${q.manualDiscountPercent}%)`, `Manual discount (${q.manualDiscountPercent}%)`)}</span><span>-<Money value={q.manualDiscountAmount} lang={lang} fractionDigits={2} /></span></div>
              <div className="flex justify-between font-semibold border-t pt-1"><span>{t('المنتجات بعد الخصم (دون رسوم)', 'Products after discounts (excl. fees)')}</span><Money value={q.productsTotal} lang={lang} fractionDigits={2} /></div>
            </> : null}
        </div>
      )}
    </div>
  );
}
