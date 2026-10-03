import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAdminGetOrderEditor,
  useAdminSaveOrderEditor,
  useAdminListProducts,
  getAdminGetOrderEditorQueryKey,
  type OrderEditInput,
  type OrderEditAudit,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, History, Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Money } from '@/components/money';
import { sortProductsForSelection } from '@/lib/product-sort';

const PICKUP_FEE = 25;
const VAT_RATE = 0.15;
export const INVALIDATE_PREFIXES = [
  '/api/admin/orders', '/api/admin/inventory', '/api/admin/products', '/api/admin/accounting',
  '/api/admin/journal', '/api/admin/finance', '/api/admin/shipments', '/api/admin/shipping', '/api/admin/invoices',
  '/api/admin/company-orders', '/api/admin/distributors', '/api/admin/receivables',
];

type FormLine = { productId: number; productName?: string; quantity: string; unitPrice: string };
type FormState = Omit<OrderEditInput, 'requestKey' | 'items' | 'shippingCost' | 'discountOverride'> & {
  items: FormLine[];
  shippingCost: string;
  discountPercent: string;
  discountReason: string;
};

export function newKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function toForm(v: OrderEditInput): FormState {
  return {
    expectedUpdatedAt: v.expectedUpdatedAt,
    items: v.items.map((i) => ({ productId: i.productId, productName: i.productName, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })),
    customerName: v.customerName,
    customerPhone: v.customerPhone,
    orderAddress: { ...v.orderAddress },
    fulfillmentMethod: v.fulfillmentMethod,
    shippingMethod: v.shippingMethod,
    paymentMethod: v.paymentMethod,
    shippingCost: String(v.shippingCost ?? 0),
    couponCode: v.couponCode,
    discountPercent: String(v.discountOverride?.percent ?? 0),
    discountReason: v.discountOverride?.reason ?? '',
    adminNotes: v.adminNotes,
  };
}

export function errorMessage(e: unknown, fallback: string) {
  const err = e as { data?: { error?: string }; message?: string };
  return err?.data?.error ?? err?.message ?? fallback;
}

export function isAmbiguous(e: unknown) {
  const err = e as { status?: number; response?: unknown; data?: unknown };
  return !err || (err.status === undefined && err.data === undefined) || (typeof err.status === 'number' && err.status >= 500);
}

type AddressValue = OrderEditInput['orderAddress'];
type Translate = (ar: string, en: string) => string;

export function validateAddress(a: AddressValue, requireSaudiCode: boolean, t: Translate): string | null {
  const country = (a.country ?? 'SA').trim();
  if (!country) return t('اختر الدولة أو اكتب اسمها', 'Select or enter the country');
  if (country === 'SA') {
    if (requireSaudiCode && !(a.nationalAddressShortCode ?? '').trim()) return t('الرمز المختصر للعنوان الوطني مطلوب', 'National address short code is required');
    return null;
  }
  if (![a.city, a.district, a.street, a.buildingNo].every((v) => (v ?? '').trim())) return t('أكمل المدينة والحي والشارع ورقم المبنى', 'Complete city, district, street and building number');
  return null;
}

export function normalizeAddress(a: AddressValue): AddressValue {
  const trim = (v: string | null | undefined) => (v ?? '').trim();
  if ((a.country ?? 'SA') === 'SA') return { ...a, country: 'SA', nationalAddressShortCode: trim(a.nationalAddressShortCode) || null };
  return {
    ...a, country: trim(a.country), city: trim(a.city), district: trim(a.district), street: trim(a.street), buildingNo: trim(a.buildingNo),
    postalCode: trim(a.postalCode) || null, additionalNumber: trim(a.additionalNumber) || null, additionalInfo: trim(a.additionalInfo) || null,
  };
}

export function AddressEditor({ idPrefix, value, original, onChange, disabled, t }: {
  idPrefix: string; value: AddressValue; original: AddressValue; onChange: (next: AddressValue) => void; disabled: boolean; t: Translate;
}) {
  const country = value.country ?? 'SA';
  const isSaudi = country === 'SA';
  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });
  const switchCountry = (mode: string) => {
    if (mode === 'SA') {
      // Return to the stored Saudi record so hidden historical fields are preserved.
      onChange((original.country ?? 'SA') === 'SA' ? { ...original } : { ...value, country: 'SA' });
    } else if (isSaudi) {
      onChange({ ...value, country: (original.country ?? 'SA') !== 'SA' ? original.country : '', city: '', district: '', street: '', buildingNo: '', postalCode: null, additionalNumber: null, additionalInfo: null, nationalAddressShortCode: null });
    }
  };
  const field = (key: 'city' | 'district' | 'street' | 'buildingNo' | 'postalCode' | 'additionalNumber' | 'additionalInfo', label: string, ltr = false) => (
    <div className="space-y-2" key={key}>
      <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
      <Input id={`${idPrefix}-${key}`} dir={ltr ? 'ltr' : undefined} value={(value[key] as string | null | undefined) ?? ''} onChange={(e) => set({ [key]: e.target.value })} disabled={disabled} data-testid={`input-${idPrefix}-${key}`} />
    </div>
  );
  return (
    <>
      <div className="space-y-2">
        <Label>{t('الدولة', 'Country')}</Label>
        <Select value={isSaudi ? 'SA' : 'other'} onValueChange={switchCountry} disabled={disabled}>
          <SelectTrigger aria-label={t('الدولة', 'Country')} data-testid={`select-${idPrefix}-country`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="SA">{t('السعودية', 'Saudi Arabia')}</SelectItem>
            <SelectItem value="other">{t('دولة أخرى', 'Other country')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isSaudi ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-short-code`}>{t('الرمز المختصر للعنوان الوطني', 'National address short code')}</Label>
          <Input id={`${idPrefix}-short-code`} dir="ltr" value={value.nationalAddressShortCode ?? ''} onChange={(e) => set({ nationalAddressShortCode: e.target.value })} disabled={disabled} data-testid={`input-${idPrefix}-short-code`} />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-country-name`}>{t('رمز الدولة بحرفين (مثل AE) *', 'Two-letter country code (e.g. AE) *')}</Label>
          <Input id={`${idPrefix}-country-name`} value={country} maxLength={2} onChange={(e) => set({ country: e.target.value.toUpperCase() })} disabled={disabled} data-testid={`input-${idPrefix}-country-name`} />
        </div>
      )}
      {isSaudi ? (
        <p className="text-xs text-muted-foreground md:col-span-2">{t('تُحفظ تفاصيل العنوان السابقة المخزنة كما هي دون عرضها أو تعديلها.', 'Previously stored address details are preserved unchanged and hidden.')}</p>
      ) : (
        <>
          {field('city', t('المدينة *', 'City *'))}
          {field('district', t('الحي *', 'District *'))}
          {field('street', t('الشارع *', 'Street *'))}
          {field('buildingNo', t('رقم المبنى *', 'Building number *'), true)}
          {field('postalCode', t('الرمز البريدي (اختياري)', 'Postal code (optional)'), true)}
          {field('additionalNumber', t('الرقم الإضافي (اختياري)', 'Additional number (optional)'), true)}
          <div className="md:col-span-2">{field('additionalInfo', t('معلومات إضافية (اختياري)', 'Additional information (optional)'))}</div>
        </>
      )}
    </>
  );
}

export function EditHistory({ history, lang, t }: { history: OrderEditAudit[]; lang: string; t: Translate }) {
  return (
    <section className="space-y-3" data-testid="section-edit-history">
      <h3 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4" />{t('سجل التعديلات', 'Edit history')}</h3>
      {history.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{t('لا توجد تعديلات سابقة على هذا الطلب.', 'No previous edits on this order.')}</p>
      ) : history.map((h) => (
        <details key={h.id} className="rounded-md border p-3" data-testid={`row-edit-history-${h.id}`}>
          <summary className="cursor-pointer text-sm">
            <span className="font-medium">{h.actorName}</span>
            <span className="text-muted-foreground"> — {new Date(h.editedAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB')}</span>
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div><p className="mb-1 text-xs font-medium text-muted-foreground">{t('قبل', 'Before')}</p><SnapshotView value={h.beforeSnapshot} /></div>
            <div><p className="mb-1 text-xs font-medium text-muted-foreground">{t('بعد', 'After')}</p><SnapshotView value={h.afterSnapshot} /></div>
          </div>
        </details>
      ))}
    </section>
  );
}

export function SnapshotView({ value }: { value: Record<string, unknown> }) {
  return (
    <pre dir="ltr" className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function OrderEditorDialog({ orderId, open, onOpenChange }: { orderId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editor = useAdminGetOrderEditor(orderId, {
    query: { enabled: open, queryKey: getAdminGetOrderEditorQueryKey(orderId), staleTime: 0, gcTime: 0, refetchOnWindowFocus: false },
  });
  const { data: products } = useAdminListProducts({ status: 'active' });
  const save = useAdminSaveOrderEditor();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addProductId, setAddProductId] = useState('');
  const inFlight = useRef(false);
  const pendingKey = useRef<{ key: string; payload: string } | null>(null);
  const initializedAt = useRef<number>(0);

  useEffect(() => {
    if (!open) { setForm(null); setError(null); pendingKey.current = null; initializedAt.current = 0; return; }
    if (editor.data && editor.dataUpdatedAt !== initializedAt.current && !editor.isFetching && initializedAt.current === 0) {
      initializedAt.current = editor.dataUpdatedAt;
      setForm(toForm(editor.data.values));
    }
  }, [open, editor.data, editor.dataUpdatedAt, editor.isFetching]);

  const productOptions = useMemo(() => sortProductsForSelection(products ?? [], lang), [products, lang]);
  const saving = save.isPending;
  const eligible = editor.data?.eligible ?? false;
  const locked = saving || !eligible;

  const update = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));
    const updateLine = (i: number, patch: Partial<FormLine>) => setForm((f) => (f ? { ...f, items: f.items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) } : f));

  const preview = useMemo(() => {
    if (!form) return null;
    const subtotal = form.items.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
    const pct = Math.min(100, Math.max(0, Number(form.discountPercent) || 0));
    const discount = Math.round(subtotal * pct) / 100;
    const shipping = form.fulfillmentMethod === 'pickup' ? PICKUP_FEE : Number(form.shippingCost) || 0;
    const total = Math.round((subtotal - discount + shipping) * 100) / 100;
    const vatApplies = form.fulfillmentMethod === 'pickup' || (form.orderAddress.country ?? 'SA') === 'SA';
    const vat = !vatApplies ? 0 : Math.round((total - total / (1 + VAT_RATE)) * 100) / 100;
    return { subtotal, discount, shipping, total, vat };
  }, [form]);

  const isSaudi = (form?.orderAddress.country ?? 'SA') === 'SA';

  const validate = (f: FormState): string | null => {
    if (f.items.length === 0) return t('أضف منتجاً واحداً على الأقل', 'Add at least one product');
    for (const l of f.items) {
      const q = Number(l.quantity); const p = Number(l.unitPrice);
      if (!Number.isInteger(q) || q < 1) return t('الكمية يجب أن تكون عدداً صحيحاً موجباً', 'Quantity must be a positive whole number');
      if (!Number.isFinite(p) || p < 0.01) return t('سعر الوحدة يجب أن يكون أكبر من صفر', 'Unit price must be greater than zero');
    }
    if (!f.customerName.trim()) return t('اسم العميل مطلوب', 'Customer name is required');
    if (f.customerPhone.trim().length < 8) return t('رقم الجوال غير صالح', 'Phone number is invalid');
    const addressProblem = validateAddress(f.orderAddress, f.fulfillmentMethod === 'delivery', t);
    if (addressProblem) return addressProblem;
    if (f.fulfillmentMethod === 'delivery') { const c = Number(f.shippingCost); if (!Number.isFinite(c) || c < 0) return t('رسوم التوصيل غير صالحة', 'Invalid delivery charge'); }
    const pct = Number(f.discountPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return t('نسبة الخصم بين 0 و100', 'Discount percent must be 0 to 100');
    if (pct > 0 && !f.discountReason.trim()) return t('اذكر سبب الخصم اليدوي', 'Enter a reason for the manual discount');
    return null;
  };

  const submit = () => {
    if (!form || !eligible || inFlight.current || saving) return;
    setError(null);
    const problem = validate(form);
    if (problem) { setError(problem); return; }
    const pct = Number(form.discountPercent) || 0;
    const body: Omit<OrderEditInput, 'requestKey'> = {
      expectedUpdatedAt: form.expectedUpdatedAt,
      items: form.items.map((l) => ({ productId: l.productId, ...(l.productName ? { productName: l.productName } : {}), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim(),
      orderAddress: normalizeAddress(form.orderAddress),
      fulfillmentMethod: form.fulfillmentMethod,
      shippingMethod: form.shippingMethod,
      paymentMethod: form.paymentMethod,
      shippingCost: form.fulfillmentMethod === 'pickup' ? PICKUP_FEE : Number(form.shippingCost),
      couponCode: form.couponCode?.trim() || null,
      discountOverride: pct > 0 ? { percent: pct, reason: form.discountReason.trim() } : { percent: 0 },
      adminNotes: form.adminNotes?.trim() || null,
    };
    const payload = JSON.stringify(body);
    if (!pendingKey.current || pendingKey.current.payload !== payload) pendingKey.current = { key: newKey(), payload };
    const requestKey = pendingKey.current.key;
    inFlight.current = true;
    save.mutate({ id: orderId, data: { ...body, requestKey } }, {
      onSuccess: () => {
        pendingKey.current = null;
        queryClient.invalidateQueries({
          predicate: (q) => typeof q.queryKey[0] === 'string' && INVALIDATE_PREFIXES.some((p) => (q.queryKey[0] as string).startsWith(p)),
        });
        toast({ title: t('تم حفظ تعديلات الطلب', 'Order changes saved'), description: `#${editor.data?.orderNumber ?? orderId}` });
        onOpenChange(false);
      },
      onError: (e) => {
        if (!isAmbiguous(e)) pendingKey.current = null;
        setError(errorMessage(e, t('تعذر حفظ التعديلات', 'Unable to save changes')) +
          (isAmbiguous(e) ? ` ${t('قد يكون الحفظ قد تم. إعادة المحاولة بدون تغيير ستستخدم نفس مفتاح الطلب ولن تكرر التعديل.', 'The save may have completed. Retrying without changes reuses the same request key and will not duplicate the edit.')}` : ''));
      },
      onSettled: () => { inFlight.current = false; },
    });
  };

  const addProduct = () => {
    if (!form || !addProductId) return;
    const p = productOptions.find((x) => String(x.id) === addProductId);
    if (!p || form.items.some((l) => l.productId === p.id)) return;
    update({ items: [...form.items, { productId: p.id, productName: lang === 'ar' ? p.nameAr : p.nameEn, quantity: '1', unitPrice: String(p.price) }] });
    setAddProductId('');
  };

  const productLabel = (l: FormLine) => {
    const p = productOptions.find((x) => x.id === l.productId);
    return p ? (lang === 'ar' ? p.nameAr : p.nameEn) : l.productName ?? `#${l.productId}`;
  };

  const history: OrderEditAudit[] = editor.data?.history ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && saving) return; onOpenChange(next); }}>
      <DialogContent
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="max-w-4xl max-h-[90vh] max-h-[90dvh] flex flex-col gap-0 p-0 overflow-hidden"
        onEscapeKeyDown={(e) => { if (saving) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (saving) e.preventDefault(); }}
        onInteractOutside={(e) => { if (saving) e.preventDefault(); }}
      >
        <DialogHeader className={`shrink-0 px-4 sm:px-6 py-4 border-b ${lang === 'ar' ? 'text-right' : 'text-left'}`}>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span>{t('تعديل الطلب', 'Edit order')}</span>
            <span dir="ltr" className="text-base text-muted-foreground" data-testid="text-editor-order-number">#{editor.data?.orderNumber ?? orderId}</span>
          </DialogTitle>
          <DialogDescription>{t('لا يغيّر هذا النموذج حالة الطلب أو العميل المرتبط أو رقم الطلب.', 'This form does not change order status, linked customer, or order number.')}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-6" data-testid="order-editor-scroll">
          {editor.isLoading || (open && !form && !editor.isError) ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}
            </div>
          ) : editor.isError || !form ? (
            <div role="alert" className="flex flex-col items-center gap-3 py-10 text-destructive">
              <AlertCircle className="h-8 w-8" />
              <p>{errorMessage(editor.error, t('تعذر تحميل بيانات التعديل', 'Could not load editor data'))}</p>
              <Button variant="outline" onClick={() => editor.refetch()} data-testid="button-retry-editor">{t('إعادة المحاولة', 'Retry')}</Button>
            </div>
          ) : (
            <>
              {!eligible && (
                <div role="alert" data-testid="text-editor-blocked" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{editor.data?.blockedReason ?? t('لا يمكن تعديل هذا الطلب', 'This order cannot be edited')}</span>
                </div>
              )}

              <fieldset disabled={locked} className="space-y-6">
                <section className="space-y-3">
                  <h3 className="font-semibold">{t('المنتجات', 'Products')}</h3>
                  {form.items.map((l, i) => (
                    <div key={l.productId} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_40px] items-end gap-2 rounded-md border p-3">
                      <p className="text-sm font-medium break-words" data-testid={`text-edit-line-${l.productId}`}>{productLabel(l)}</p>
                      <div className="space-y-1">
                        <Label htmlFor={`edit-qty-${i}`} className="text-xs">{t('الكمية', 'Quantity')}</Label>
                        <Input id={`edit-qty-${i}`} type="number" min={1} step={1} value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} data-testid={`input-edit-qty-${l.productId}`} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`edit-price-${i}`} className="text-xs">{t('سعر الوحدة', 'Unit price')}</Label>
                        <Input id={`edit-price-${i}`} type="number" min={0.01} step="0.01" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} data-testid={`input-edit-price-${l.productId}`} />
                      </div>
                      <Button type="button" variant="ghost" size="icon" aria-label={t('حذف المنتج', 'Remove product')} disabled={form.items.length === 1 || locked}
                        onClick={() => update({ items: form.items.filter((_, idx) => idx !== i) })} data-testid={`button-remove-line-${l.productId}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Select value={addProductId} onValueChange={setAddProductId} disabled={locked}>
                      <SelectTrigger className="min-w-0 flex-1" aria-label={t('اختر منتجاً للإضافة', 'Select product to add')} data-testid="select-add-product">
                        <SelectValue placeholder={t('اختر منتجاً للإضافة', 'Select product to add')} />
                      </SelectTrigger>
                      <SelectContent>
                        {productOptions.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)} disabled={form.items.some((l) => l.productId === p.id)}>
                            {lang === 'ar' ? p.nameAr : p.nameEn} ({p.stockQuantity})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={addProduct} disabled={!addProductId || locked} data-testid="button-add-product">
                      <Plus className="me-1 h-4 w-4" />{t('إضافة', 'Add')}
                    </Button>
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <h3 className="font-semibold md:col-span-2">{t('بيانات العميل لهذا الطلب فقط', 'Customer details for this order only')}</h3>
                  <div className="space-y-2">
                    <Label htmlFor="edit-customer-name">{t('الاسم', 'Name')}</Label>
                    <Input id="edit-customer-name" value={form.customerName} onChange={(e) => update({ customerName: e.target.value })} data-testid="input-edit-customer-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-customer-phone">{t('الجوال', 'Phone')}</Label>
                    <Input id="edit-customer-phone" dir="ltr" type="tel" value={form.customerPhone} onChange={(e) => update({ customerPhone: e.target.value })} data-testid="input-edit-customer-phone" />
                  </div>
                  <p className="text-xs text-muted-foreground md:col-span-2">{t('لا يتم تعديل ملف العميل الأساسي.', 'The customer profile itself is not changed.')}</p>
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <h3 className="font-semibold md:col-span-2">{t('العنوان والتسليم', 'Address and fulfillment')}</h3>
                  <AddressEditor idPrefix="edit-address" value={form.orderAddress} original={editor.data?.values.orderAddress ?? form.orderAddress}
                    onChange={(next) => update({ orderAddress: next })} disabled={locked} t={t} />
                  <div className="space-y-2">
                    <Label>{t('طريقة التسليم', 'Fulfillment')}</Label>
                    <Select value={form.fulfillmentMethod} onValueChange={(v) => update({ fulfillmentMethod: v as FormState['fulfillmentMethod'] })} disabled={locked}>
                      <SelectTrigger aria-label={t('طريقة التسليم', 'Fulfillment')} data-testid="select-edit-fulfillment"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="delivery">{t('توصيل', 'Delivery')}</SelectItem>
                        <SelectItem value="pickup">{t('استلام من موقعنا', 'Pickup from our location')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('طريقة الشحن', 'Shipping method')}</Label>
                    <Select value={form.shippingMethod} onValueChange={(v) => update({ shippingMethod: v as FormState['shippingMethod'] })} disabled={locked}>
                      <SelectTrigger aria-label={t('طريقة الشحن', 'Shipping method')} data-testid="select-edit-shipping"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin-standard">{t('توصيل قياسي', 'Standard delivery')}</SelectItem>
                        <SelectItem value="regular">{t('شحن عادي', 'Regular shipping')}</SelectItem>
                        <SelectItem value="refrigerated">{t('مبرد', 'Refrigerated')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.fulfillmentMethod === 'pickup' ? (
                    <p className="text-xs text-muted-foreground md:col-span-2" data-testid="text-edit-pickup-fee">{t(`رسوم الاستلام ثابتة ${PICKUP_FEE} ريال شاملة الضريبة.`, `Pickup fee is a fixed ${PICKUP_FEE} SAR including VAT.`)}</p>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="edit-shipping-cost">{t('رسوم التوصيل (شاملة الضريبة)', 'Delivery charge (VAT included)')}</Label>
                      <Input id="edit-shipping-cost" type="number" min={0} step="0.01" value={form.shippingCost} onChange={(e) => update({ shippingCost: e.target.value })} data-testid="input-edit-shipping-cost" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>{t('طريقة الدفع', 'Payment method')}</Label>
                    <Select value={form.paymentMethod} onValueChange={(v) => update({ paymentMethod: v as FormState['paymentMethod'] })} disabled={locked}>
                      <SelectTrigger aria-label={t('طريقة الدفع', 'Payment method')} data-testid="select-edit-payment"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">{t('الدفع عند الاستلام', 'Cash on delivery')}</SelectItem>
                        <SelectItem value="bank-transfer">{t('تحويل بنكي', 'Bank transfer')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t('لا يتم تفعيل أي دفع إلكتروني أو تسجيل تحصيل من هنا.', 'No online payment is activated and no collection is recorded here.')}</p>
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <h3 className="font-semibold md:col-span-2">{t('الخصومات والملاحظات', 'Discounts and notes')}</h3>
                  <div className="space-y-2">
                    <Label htmlFor="edit-coupon">{t('كود الكوبون', 'Coupon code')}</Label>
                    <Input id="edit-coupon" dir="ltr" value={form.couponCode ?? ''} onChange={(e) => update({ couponCode: e.target.value })} data-testid="input-edit-coupon" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-discount-percent">{t('خصم يدوي (%)', 'Manual discount (%)')}</Label>
                    <Input id="edit-discount-percent" type="number" min={0} max={100} step="0.01" value={form.discountPercent} onChange={(e) => update({ discountPercent: e.target.value })} data-testid="input-edit-discount-percent" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="edit-discount-reason">{t('سبب الخصم اليدوي', 'Manual discount reason')}</Label>
                    <Input id="edit-discount-reason" value={form.discountReason} onChange={(e) => update({ discountReason: e.target.value })} data-testid="input-edit-discount-reason" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="edit-admin-notes">{t('ملاحظات داخلية', 'Internal notes')}</Label>
                    <Textarea id="edit-admin-notes" value={form.adminNotes ?? ''} onChange={(e) => update({ adminNotes: e.target.value })} data-testid="input-edit-admin-notes" />
                  </div>
                </section>
              </fieldset>

              {preview && (
                <section className="rounded-md border bg-muted/20 p-4 space-y-2" aria-label={t('معاينة الإجماليات', 'Totals preview')} data-testid="section-edit-preview">
                  <h3 className="font-semibold">{t('معاينة تقديرية للإجماليات (للقراءة فقط)', 'Estimated totals preview (read-only)')}</h3>
                  <dl className="grid grid-cols-2 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">{t('المنتجات', 'Products')}</dt><dd className="text-end"><Money value={preview.subtotal} lang={lang} fractionDigits={2} /></dd>
                    <dt className="text-muted-foreground">{t('الخصم اليدوي', 'Manual discount')}</dt><dd className="text-end">-<Money value={preview.discount} lang={lang} fractionDigits={2} /></dd>
                    <dt className="text-muted-foreground">{t('التوصيل / الاستلام', 'Delivery / pickup')}</dt><dd className="text-end"><Money value={preview.shipping} lang={lang} fractionDigits={2} /></dd>
                    <dt className="font-semibold">{t('الإجمالي التقديري', 'Estimated total')}</dt><dd className="text-end font-semibold" data-testid="text-edit-preview-total"><Money value={preview.total} lang={lang} fractionDigits={2} /></dd>
                    <dt className="text-muted-foreground">{(form.fulfillmentMethod === 'pickup' || isSaudi) ? t('منها ضريبة القيمة المضافة 15%', 'Of which VAT 15%') : t('ضريبة القيمة المضافة (0% خارج السعودية)', 'VAT (0% outside Saudi Arabia)')}</dt><dd className="text-end"><Money value={preview.vat} lang={lang} fractionDigits={2} /></dd>
                  </dl>
                  <p className="text-xs text-muted-foreground">{t('خصم الكوبون والإجماليات النهائية يحسبها الخادم عند الحفظ.', 'Coupon discount and final totals are calculated by the server on save.')}</p>
                </section>
              )}

              <EditHistory history={history} lang={lang} t={t} />
            </>
          )}
        </div>

        <div className="shrink-0 border-t px-4 sm:px-6 py-3 space-y-2">
          {error && <p role="alert" className="text-sm text-destructive" data-testid="text-edit-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)} data-testid="button-cancel-edit">{t('إلغاء', 'Cancel')}</Button>
            <Button type="button" onClick={submit} disabled={!form || !eligible || saving} data-testid="button-save-edit">
              {saving ? t('جاري الحفظ...', 'Saving...') : t('حفظ التعديلات', 'Save changes')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
