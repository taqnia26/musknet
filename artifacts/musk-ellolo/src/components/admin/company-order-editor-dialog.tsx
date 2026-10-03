import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAdminGetCompanyOrderEditor,
  useAdminSaveCompanyOrderEditor,
  useAdminListProducts,
  getAdminGetCompanyOrderEditorQueryKey,
  type CompanyOrderEditInput,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
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
import { AddressEditor, EditHistory, INVALIDATE_PREFIXES, errorMessage, isAmbiguous, newKey, normalizeAddress, validateAddress } from './order-editor-dialog';


type FormLine = { productId: number; productName?: string; quantity: string; unitPrice: string };
type FormState = {
  expectedUpdatedAt: string;
  items: FormLine[];
  contactName: string;
  contactPhone: string;
  orderAddress: CompanyOrderEditInput['orderAddress'];
  discountMode: 'contract' | 'custom';
  discountPercent: string;
  discountReason: string;
  adminNotes: string;
};

function toForm(v: CompanyOrderEditInput): FormState {
  return {
    expectedUpdatedAt: v.expectedUpdatedAt,
    items: v.items.map((i) => ({ productId: i.productId, productName: i.productName, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })),
    contactName: v.contactName,
    contactPhone: v.contactPhone,
    orderAddress: { ...v.orderAddress },
    discountMode: v.discountOverride ? 'custom' : 'contract',
    discountPercent: String(v.discountOverride?.percent ?? 0),
    discountReason: v.discountOverride?.reason ?? '',
    adminNotes: v.adminNotes ?? '',
  };
}

export function CompanyOrderEditorDialog({ orderId, open, onOpenChange }: { orderId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const editor = useAdminGetCompanyOrderEditor(orderId, {
    query: { enabled: open, queryKey: getAdminGetCompanyOrderEditorQueryKey(orderId), staleTime: 0, gcTime: 0, refetchOnWindowFocus: false },
  });
  const { data: products } = useAdminListProducts({ status: 'active' });
  const save = useAdminSaveCompanyOrderEditor();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addProductId, setAddProductId] = useState('');
  const inFlight = useRef(false);
  const pendingKey = useRef<{ key: string; payload: string } | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!open) { setForm(null); setError(null); pendingKey.current = null; initialized.current = false; return; }
    if (editor.data && !editor.isFetching && !initialized.current) {
      initialized.current = true;
      setForm(toForm(editor.data.values));
    }
  }, [open, editor.data, editor.isFetching]);

  const productOptions = useMemo(() => sortProductsForSelection(products ?? [], lang), [products, lang]);
  const saving = save.isPending;
  const eligible = editor.data?.eligible ?? false;
  const locked = saving || !eligible;
  const contractPercent = editor.data?.contractDiscountPercent ?? 0;

  const update = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const updateLine = (i: number, patch: Partial<FormLine>) => setForm((f) => (f ? { ...f, items: f.items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) } : f));

  const preview = useMemo(() => {
    if (!form) return null;
    const subtotal = form.items.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
    const pct = form.discountMode === 'contract' ? contractPercent : Math.min(100, Math.max(0, Number(form.discountPercent) || 0));
    const discount = Math.round(subtotal * pct) / 100;
    const total = Math.round((subtotal - discount) * 100) / 100;
    return { subtotal, pct, discount, total, grand: total };
  }, [form, contractPercent]);

  const validate = (f: FormState): string | null => {
    if (f.items.length === 0) return t('أضف منتجاً واحداً على الأقل', 'Add at least one product');
    for (const l of f.items) {
      const q = Number(l.quantity); const p = Number(l.unitPrice);
      if (!Number.isInteger(q) || q < 1) return t('الكمية يجب أن تكون عدداً صحيحاً موجباً', 'Quantity must be a positive whole number');
      if (!Number.isFinite(p) || p < 0.01) return t('سعر الوحدة يجب أن يكون أكبر من صفر', 'Unit price must be greater than zero');
    }
    if (!f.contactName.trim()) return t('اسم جهة الاتصال مطلوب', 'Contact name is required');
    if (f.contactPhone.trim().length < 8) return t('رقم الجوال غير صالح', 'Phone number is invalid');
    const addressProblem = validateAddress(f.orderAddress, true, t);
    if (addressProblem) return addressProblem;
    if (f.discountMode === 'custom') {
      const pct = Number(f.discountPercent);
      if (f.discountPercent.trim() === '' || !Number.isFinite(pct) || pct < 0 || pct > 100) return t('نسبة الخصم بين 0 و100', 'Discount percent must be 0 to 100');
      const r = f.discountReason.trim().length;
      if (r < 10 || r > 500) return t('سبب الخصم المخصص مطلوب (10 إلى 500 حرف)، حتى لو كانت النسبة 0', 'Custom discount reason is required (10 to 500 characters), even at 0%');
    }
    return null;
  };

  const submit = () => {
    if (!form || !eligible || inFlight.current || saving) return;
    setError(null);
    const problem = validate(form);
    if (problem) { setError(problem); return; }
    const body: Omit<CompanyOrderEditInput, 'requestKey'> = {
      expectedUpdatedAt: form.expectedUpdatedAt,
      items: form.items.map((l) => ({ productId: l.productId, ...(l.productName ? { productName: l.productName } : {}), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      contactName: form.contactName.trim(),
      contactPhone: form.contactPhone.trim(),
      orderAddress: normalizeAddress(form.orderAddress),
      discountOverride: form.discountMode === 'custom' ? { percent: Number(form.discountPercent), reason: form.discountReason.trim() } : null,
      adminNotes: form.adminNotes.trim() || null,
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
        toast({ title: t('تم حفظ تعديلات طلب الشركة', 'Company order changes saved'), description: editor.data?.orderNumber });
        onOpenChange(false);
      },
      onError: (e) => {
        const ambiguous = isAmbiguous(e);
        if (!ambiguous) pendingKey.current = null;
        setError(errorMessage(e, t('تعذر حفظ التعديلات', 'Unable to save changes')) +
          (ambiguous ? ` ${t('قد يكون الحفظ قد تم. إعادة المحاولة بدون تغيير ستستخدم نفس مفتاح الطلب ولن تكرر التعديل.', 'The save may have completed. Retrying without changes reuses the same request key and will not duplicate the edit.')}` : ''));
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
            <span>{t('تعديل طلب شركة', 'Edit company order')}</span>
            <span dir="ltr" className="text-base text-muted-foreground" data-testid="text-company-editor-order-number">{editor.data?.orderNumber ?? `#${orderId}`}</span>
          </DialogTitle>
          <DialogDescription>{t('لا يغيّر هذا النموذج الشركة أو العقد أو رقم الطلب أو حالته.', 'This form does not change the company, contract, order number or status.')}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-6" data-testid="company-order-editor-scroll">
          {editor.isLoading || (open && !form && !editor.isError) ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}
            </div>
          ) : editor.isError || !form ? (
            <div role="alert" className="flex flex-col items-center gap-3 py-10 text-destructive">
              <AlertCircle className="h-8 w-8" />
              <p>{errorMessage(editor.error, t('تعذر تحميل بيانات التعديل', 'Could not load editor data'))}</p>
              <Button variant="outline" onClick={() => editor.refetch()} data-testid="button-retry-company-editor">{t('إعادة المحاولة', 'Retry')}</Button>
            </div>
          ) : (
            <>
              {!eligible && (
                <div role="alert" data-testid="text-company-editor-blocked" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{editor.data?.blockedReason ?? t('لا يمكن تعديل هذا الطلب', 'This order cannot be edited')}</span>
                </div>
              )}

              <fieldset disabled={locked} className="space-y-6">
                <section className="space-y-3">
                  <h3 className="font-semibold">{t('المنتجات', 'Products')}</h3>
                  {form.items.map((l, i) => (
                    <div key={l.productId} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_40px] items-end gap-2 rounded-md border p-3">
                      <p className="text-sm font-medium break-words">{productLabel(l)}</p>
                      <div className="space-y-1">
                        <Label htmlFor={`co-qty-${i}`} className="text-xs">{t('الكمية', 'Quantity')}</Label>
                        <Input id={`co-qty-${i}`} type="number" min={1} step={1} value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} data-testid={`input-co-qty-${l.productId}`} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`co-price-${i}`} className="text-xs">{t('سعر الوحدة', 'Unit price')}</Label>
                        <Input id={`co-price-${i}`} type="number" min={0.01} step="0.01" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} data-testid={`input-co-price-${l.productId}`} />
                      </div>
                      <Button type="button" variant="ghost" size="icon" aria-label={t('حذف المنتج', 'Remove product')} disabled={form.items.length === 1 || locked}
                        onClick={() => update({ items: form.items.filter((_, idx) => idx !== i) })} data-testid={`button-co-remove-${l.productId}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Select value={addProductId} onValueChange={setAddProductId} disabled={locked}>
                      <SelectTrigger className="min-w-0 flex-1" aria-label={t('اختر منتجاً للإضافة', 'Select product to add')} data-testid="select-co-add-product">
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
                    <Button type="button" variant="outline" onClick={addProduct} disabled={!addProductId || locked} data-testid="button-co-add-product">
                      <Plus className="me-1 h-4 w-4" />{t('إضافة', 'Add')}
                    </Button>
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <h3 className="font-semibold md:col-span-2">{t('جهة الاتصال لهذا الطلب فقط', 'Contact for this order only')}</h3>
                  <div className="space-y-2">
                    <Label htmlFor="co-contact-name">{t('اسم جهة الاتصال', 'Contact name')}</Label>
                    <Input id="co-contact-name" value={form.contactName} onChange={(e) => update({ contactName: e.target.value })} data-testid="input-co-contact-name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="co-contact-phone">{t('جوال جهة الاتصال', 'Contact phone')}</Label>
                    <Input id="co-contact-phone" dir="ltr" type="tel" value={form.contactPhone} onChange={(e) => update({ contactPhone: e.target.value })} data-testid="input-co-contact-phone" />
                  </div>
                  <p className="text-xs text-muted-foreground md:col-span-2">{t('لا يتم تعديل بيانات الشركة أو عقدها.', 'Company and contract records are not changed.')}</p>
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <h3 className="font-semibold md:col-span-2">{t('عنوان الطلب', 'Order address')}</h3>
                  <AddressEditor idPrefix="co-address" value={form.orderAddress} original={editor.data?.values.orderAddress ?? form.orderAddress}
                    onChange={(next) => update({ orderAddress: next })} disabled={locked} t={t} />
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <h3 className="font-semibold md:col-span-2">{t('الخصم والملاحظات', 'Discount and notes')}</h3>
                  <div className="space-y-2 md:col-span-2">
                    <Label>{t('مصدر الخصم', 'Discount source')}</Label>
                    <Select value={form.discountMode} onValueChange={(v) => update({ discountMode: v as FormState['discountMode'] })} disabled={locked}>
                      <SelectTrigger aria-label={t('مصدر الخصم', 'Discount source')} data-testid="select-co-discount-mode"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contract">{t(`نسبة العقد الحالية (${contractPercent}%)`, `Current contract percent (${contractPercent}%)`)}</SelectItem>
                        <SelectItem value="custom">{t('نسبة مخصصة تستبدل نسبة العقد', 'Custom percent replacing the contract')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{t('النسبة المخصصة تحل محل نسبة العقد ولا تُضاف إليها.', 'A custom percent replaces the contract percent; it is not added to it.')}</p>
                  </div>
                  {form.discountMode === 'custom' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="co-discount-percent">{t('النسبة المخصصة (%)', 'Custom percent (%)')}</Label>
                        <Input id="co-discount-percent" type="number" min={0} max={100} step="0.01" value={form.discountPercent} onChange={(e) => update({ discountPercent: e.target.value })} data-testid="input-co-discount-percent" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="co-discount-reason">{t('سبب الخصم (10 إلى 500 حرف) *', 'Discount reason (10 to 500 characters) *')}</Label>
                        <Input id="co-discount-reason" maxLength={500} value={form.discountReason} onChange={(e) => update({ discountReason: e.target.value })} data-testid="input-co-discount-reason" />
                      </div>
                    </>
                  )}
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="co-admin-notes">{t('ملاحظات داخلية', 'Internal notes')}</Label>
                    <Textarea id="co-admin-notes" maxLength={2000} value={form.adminNotes} onChange={(e) => update({ adminNotes: e.target.value })} data-testid="input-co-admin-notes" />
                  </div>
                </section>
              </fieldset>

              {preview && (
                <section className="rounded-md border bg-muted/20 p-4 space-y-2" aria-label={t('معاينة الإجماليات', 'Totals preview')} data-testid="section-co-preview">
                  <h3 className="font-semibold">{t('معاينة تقديرية للإجماليات (للقراءة فقط)', 'Estimated totals preview (read-only)')}</h3>
                  <dl className="grid grid-cols-2 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">{t('المنتجات', 'Products')}</dt><dd className="text-end"><Money value={preview.subtotal} lang={lang} fractionDigits={2} /></dd>
                    <dt className="text-muted-foreground">{t(`الخصم (${preview.pct}%)`, `Discount (${preview.pct}%)`)}</dt><dd className="text-end">-<Money value={preview.discount} lang={lang} fractionDigits={2} /></dd>
                    <dt className="text-muted-foreground">{t('بعد الخصم', 'After discount')}</dt><dd className="text-end"><Money value={preview.total} lang={lang} fractionDigits={2} /></dd>
                    <dt className="text-muted-foreground">{t('الضريبة', 'Tax')}</dt><dd className="text-end">{t('مشمولة وفق العقد؛ لا تتغير بتغيير عنوان التسليم', 'Included under contract terms; delivery address does not change tax')}</dd>
                    <dt className="font-semibold">{t('الإجمالي التقديري', 'Estimated total')}</dt><dd className="text-end font-semibold" data-testid="text-co-preview-total"><Money value={preview.grand} lang={lang} fractionDigits={2} /></dd>
                  </dl>
                  <p className="text-xs text-muted-foreground">{t('الإجماليات النهائية يحسبها الخادم عند الحفظ.', 'Final totals are calculated by the server on save.')}</p>
                </section>
              )}

              <EditHistory history={editor.data?.history ?? []} lang={lang} t={t} />
            </>
          )}
        </div>

        <div className="shrink-0 border-t px-4 sm:px-6 py-3 space-y-2">
          {error && <p role="alert" className="text-sm text-destructive" data-testid="text-co-edit-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)} data-testid="button-co-cancel-edit">{t('إلغاء', 'Cancel')}</Button>
            <Button type="button" onClick={submit} disabled={!form || !eligible || saving} data-testid="button-co-save-edit">
              {saving ? t('جاري الحفظ...', 'Saving...') : t('حفظ التعديلات', 'Save changes')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
