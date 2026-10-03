import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import {
  getAdminListInvoicesQueryKey, getAdminListProductsQueryKey, getAdminListInventoryQueryKey,
  getAdminListJournalEntriesQueryKey, getAdminGetTrialBalanceQueryKey, getAdminGetFinanceSummaryQueryKey,
  useAdminCreateIndividualInvoice, useAdminListProducts, useAdminQuoteIndividualInvoiceDiscount, type AdminInvoice,
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { quantityInputClass } from '@/lib/quantity-input';
import { Money } from '@/components/money';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { SaleDiscountFields, emptySaleDiscount, saleDiscountPayload, useSaleDiscountPreview, validateSaleDiscount } from '@/components/admin/sale-discount-fields';
import { sortProductsForSelection } from '@/lib/product-sort';
import { IndividualInvoiceAddress, emptyInvoiceAddress, formatInvoiceAddress } from './individual-invoice-address';

type Line = { productId: string; quantity: number; unitPrice: number };
const emptyLine = (): Line => ({ productId: '', quantity: 1, unitPrice: 0 });
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const saudiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const validDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const isCents = (n: number) => Number.isFinite(n) && n > 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

export function CreateIndividualInvoiceDialog({ onCreated }: { onCreated?: (invoice: AdminInvoice) => void }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [address, setAddress] = useState(emptyInvoiceAddress);
  const buyerAddress = formatInvoiceAddress(address, lang);
  const [issueDate, setIssueDate] = useState(saudiToday);
  const [dueDate, setDueDate] = useState('');
  const [collected, setCollected] = useState(false);
  const [paymentDate, setPaymentDate] = useState(saudiToday);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [discountForm, setDiscountForm] = useState(emptySaleDiscount);
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const failedSig = useRef<string | null>(null);
  const ambiguousSig = useRef<string | null>(null);
  const [ambiguous, setAmbiguous] = useState(false);
  const mutation = useAdminCreateIndividualInvoice();
  const pending = mutation.isPending;

  const { data: products, isLoading, isError, refetch } = useAdminListProducts(undefined, {
    query: { enabled: open, queryKey: getAdminListProductsQueryKey(), staleTime: 0, refetchOnMount: 'always' },
  });
  useEffect(() => { if (open) void refetch(); }, [open, refetch]);

  const catalog = useMemo(() => sortProductsForSelection(
    (products ?? []).filter(p => p.isActive && p.stockQuantity > 0), lang), [products, lang]);

  const totals = useMemo(() => {
    const gross = round(lines.reduce((s, l) => s + round(l.unitPrice * l.quantity), 0));
    const net = round(lines.reduce((s, l) => s + round(round(l.unitPrice * l.quantity) / 1.15), 0));
    return { net, vat: round(gross - net), gross };
  }, [lines]);

  const quoteDiscount = useAdminQuoteIndividualInvoiceDiscount();
  const discountPreview = useSaleDiscountPreview(quoteDiscount.mutateAsync, totals.gross, discountForm, open);
  const reset = () => {
    setDiscountForm(emptySaleDiscount);
    setBuyerName(''); setBuyerPhone(''); setAddress(emptyInvoiceAddress()); setIssueDate(saudiToday()); setDueDate('');
    setCollected(false); setPaymentDate(saudiToday()); setPaymentMethod('cash'); setLines([emptyLine()]);
    setErrors([]); setServerError(''); setKey(crypto.randomUUID()); failedSig.current = null; ambiguousSig.current = null; setAmbiguous(false);
  };
  const updateLine = (i: number, patch: Partial<Line>) => setLines(c => c.map((l, j) => j === i ? { ...l, ...patch } : l));

  const validate = () => {
    const e: string[] = [];
    const dp = validateSaleDiscount(discountForm, t);
    if (dp) e.push(dp);
    const today = saudiToday();
    if (!buyerName.trim()) e.push(t('اسم المشتري مطلوب', 'Buyer name is required'));
    if (buyerPhone.trim() && (buyerPhone.length > 40 || !/^(?=(?:\D*\d){8,15}\D*$)\+?[\d ().-]+$/.test(buyerPhone.trim())))
      e.push(t('الجوال يجب أن يحتوي 8 إلى 15 رقماً', 'Phone must contain 8–15 digits'));
    if (buyerName.trim().length > 250) e.push(t('اسم المشتري لا يتجاوز 250 حرفاً', 'Buyer name must be at most 250 characters'));
    if (buyerAddress.trim().length > 1000) e.push(t('العنوان لا يتجاوز 1000 حرف', 'Address must be at most 1000 characters'));
    if (address.country === 'SA' && address.shortCode.trim() && !/^[A-Z]{4}[0-9]{4}$/.test(address.shortCode.trim()))
      e.push(t('العنوان المختصر يتكون من أربعة أحرف ثم أربعة أرقام', 'Short address must have four letters followed by four digits'));
    if (!validDate(issueDate) || issueDate > today) e.push(t('تاريخ الإصدار يجب أن يكون تاريخاً صحيحاً وغير مستقبلي', 'Issue date must be a valid, non-future date'));
    if (dueDate && (!validDate(dueDate) || (validDate(issueDate) && dueDate < issueDate))) e.push(t('تاريخ الاستحقاق يجب أن يكون صحيحاً وليس قبل الإصدار', 'Due date must be valid and not before the issue date'));
    if (collected && (!validDate(paymentDate) || paymentDate > today || (validDate(issueDate) && paymentDate < issueDate))) e.push(t('تاريخ التحصيل يجب أن يكون بين تاريخ الإصدار واليوم', 'Payment date must be between the issue date and today'));
    if (lines.some(l => !l.productId)) e.push(t('اختر منتجاً لكل بند', 'Select a product for every item'));
    if (new Set(lines.map(l => l.productId).filter(Boolean)).size !== lines.filter(l => l.productId).length) e.push(t('لا يمكن تكرار المنتج', 'Products cannot be repeated'));
    lines.forEach(l => {
      const p = catalog.find(x => String(x.id) === l.productId);
      if (!l.productId) return;
      if (!Number.isSafeInteger(l.quantity) || l.quantity < 1) e.push(t('الكمية يجب أن تكون عدداً صحيحاً موجباً', 'Quantity must be a positive whole number'));
      else if (p && l.quantity > p.stockQuantity) e.push(t(`الكمية تتجاوز المخزون المتاح (${p.stockQuantity})`, `Quantity exceeds available stock (${p.stockQuantity})`));
      if (!isCents(l.unitPrice)) e.push(t('سعر الوحدة يجب أن يكون موجباً بحد أقصى منزلتين عشريتين', 'Unit price must be positive with at most two decimals'));
    });
    return [...new Set(e)];
  };

  const submit = () => {
    if (pending) return;
    setServerError('');
    const e = validate();
    setErrors(e);
    if (e.length) return;
    const data = {
      buyerName: buyerName.trim(),
      buyerPhone: buyerPhone.trim() || null,
      buyerAddress: buyerAddress.trim() || null,
      buyerTaxNumber: null,
      issueDate,
      ...(dueDate ? { dueDate } : {}),
      ...(collected ? { collected: { paymentDate, paymentMethod } } : {}),
      items: lines.map(l => ({ productId: Number(l.productId), quantity: l.quantity, unitPrice: round(l.unitPrice) })),
      ...saleDiscountPayload(discountForm),
    };
    const sig = JSON.stringify(data);
    let creationKey = key;
    if (ambiguousSig.current !== null && ambiguousSig.current !== sig) {
      setServerError(t('فشل الحفظ السابق غير مؤكد وقد تكون الفاتورة صدرت. أعد البيانات كما كانت وأعد المحاولة قبل أي تعديل، أو تحقق من قائمة الفواتير.', 'The previous save is unconfirmed and the invoice may have been issued. Restore the original details and retry before editing, or check the invoice list.'));
      return;
    }
    if (failedSig.current !== null && failedSig.current !== sig) { creationKey = crypto.randomUUID(); setKey(creationKey); }
    mutation.mutate({ data: { creationKey, ...data } }, {
      onSuccess: invoice => {
        failedSig.current = null;
        const keys = [getAdminListInvoicesQueryKey(), getAdminListProductsQueryKey(), getAdminListInventoryQueryKey(),
          getAdminListJournalEntriesQueryKey(), getAdminGetTrialBalanceQueryKey(), getAdminGetFinanceSummaryQueryKey()];
        keys.forEach(queryKey => client.invalidateQueries({ queryKey }));
        toast({ title: t('تم إصدار الفاتورة المباشرة', 'Direct invoice issued'), description: invoice.invoiceNumber });
        setOpen(false); reset();
        onCreated?.(invoice);
      },
      onError: err => {
        failedSig.current = sig;
        const m = err instanceof Error ? err.message : '';
        const status = (err as { status?: unknown } | null)?.status;
        const definite = typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
        if (!definite) {
          ambiguousSig.current = sig; setAmbiguous(true);
          setServerError(t('تعذر تأكيد نتيجة الحفظ وقد تكون الفاتورة صدرت. أعد المحاولة بنفس البيانات (نفس المفتاح) قبل أي تعديل.', 'The save result could not be confirmed and the invoice may have been issued. Retry with the same details (same key) before editing.'));
          return;
        }
        ambiguousSig.current = null; setAmbiguous(false);
        if (/tax|vat/i.test(m)) { setErrors([t('الرقم الضريبي يجب أن يتكون من 15 رقماً', 'VAT number must be exactly 15 digits')]); return; }
        setServerError(lang === 'ar'
          ? /stock|balance|insufficient/i.test(m) ? 'المخزون المتاح لا يكفي لإصدار الفاتورة. حدّث الكميات وحاول مجدداً'
            : /date/i.test(m) ? 'إحدى التواريخ غير صالحة'
            : /creation key/i.test(m) ? 'تم تعديل الطلب، أعد المحاولة'
            : 'تعذر إصدار الفاتورة. تحقق من البيانات وحاول مجدداً'
          : m || 'Could not issue invoice. Check the details and retry.');
      },
    });
  };

  const selectCls = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-2';
  return <Dialog open={open} onOpenChange={next => { if (pending) return; setOpen(next); if (!next && !ambiguous) reset(); }}>
    <DialogTrigger asChild><Button data-testid="button-create-individual-invoice"><Plus className="me-2 h-4 w-4" />{t('إضافة فاتورة مباشرة', 'Add Direct Invoice')}</Button></DialogTrigger>
    <DialogContent dir={lang === 'ar' ? 'rtl' : 'ltr'} showCloseButton={!pending} aria-busy={pending}
      onInteractOutside={ev => { if (pending) ev.preventDefault(); }} onEscapeKeyDown={ev => { if (pending) ev.preventDefault(); }}
      className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader className={lang === 'ar' ? 'text-right' : 'text-left'}>
        <DialogTitle>{t('فاتورة مباشرة لفرد', 'Direct Individual Invoice')}</DialogTitle>
        <DialogDescription>{t('فاتورة مستقلة بدون طلب أو شحنة. الأسعار شاملة ضريبة القيمة المضافة 15%.', 'Standalone invoice with no order or shipment. Prices include 15% VAT.')}</DialogDescription>
      </DialogHeader>
      <fieldset disabled={pending} className="space-y-5 min-w-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="individual-invoice-buyer">{t('اسم المشتري', 'Buyer name')}</Label><Input id="individual-invoice-buyer" required maxLength={250} value={buyerName} onChange={e => setBuyerName(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="individual-invoice-phone">{t('جوال المشتري (اختياري)', 'Buyer phone (optional)')}</Label><Input id="individual-invoice-phone" data-testid="individual-invoice-phone" type="tel" dir="ltr" maxLength={40} value={buyerPhone} onChange={e => setBuyerPhone(e.target.value.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))))} /><p className="text-xs text-muted-foreground">{t('يحفظ في الفاتورة فقط، دون إنشاء حساب أو ربطه بعميل.', 'Saved on this invoice only; no customer account is created or linked.')}</p></div>
          <IndividualInvoiceAddress value={address} onChange={setAddress} />
          <div className="space-y-2"><Label htmlFor="individual-invoice-issue">{t('تاريخ الإصدار', 'Issue date')}</Label><Input id="individual-invoice-issue" type="date" max={saudiToday()} value={issueDate} onChange={e => setIssueDate(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="individual-invoice-due">{t('تاريخ الاستحقاق (اختياري)', 'Due date (optional)')}</Label><Input id="individual-invoice-due" type="date" min={issueDate} value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
        </div>
        <div className="rounded-md border p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4" checked={collected} onChange={e => setCollected(e.target.checked)} />{t('تم التحصيل بالكامل (افتراضياً غير محصلة)', 'Collected in full (default: unpaid)')}</label>
          {collected && <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="individual-invoice-paydate">{t('تاريخ التحصيل', 'Payment date')}</Label><Input id="individual-invoice-paydate" type="date" min={issueDate} max={saudiToday()} value={paymentDate} onChange={e => setPaymentDate(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="individual-invoice-method">{t('طريقة التحصيل', 'Payment method')}</Label><select id="individual-invoice-method" className={selectCls} value={paymentMethod} onChange={e => { if (e.target.value === 'cash' || e.target.value === 'bank_transfer') setPaymentMethod(e.target.value); }}><option value="cash">{t('نقدي (مبلغ مستلم فعلياً)', 'Cash (actually collected)')}</option><option value="bank_transfer">{t('تحويل بنكي', 'Bank transfer')}</option><option value="apple_pay" disabled>{t('Apple Pay — غير مفعّل', 'Apple Pay — not enabled')}</option><option value="tabby" disabled>{t('تابي — غير مفعّل', 'Tabby — not enabled')}</option><option value="tamara" disabled>{t('تمارا — غير مفعّل', 'Tamara — not enabled')}</option></select><p className="text-xs text-muted-foreground">{t('خانات الدفع الإلكتروني مجهزة فقط حتى الربط؛ لا تسجل تحصيلاً إلا لمبلغ مستلم فعلياً.', 'Online payment fields are prepared only until setup; record a collection only for money actually received.')}</p></div>
          </div>}
        </div>
        <div className="flex items-center justify-between gap-2"><Label>{t('بنود الفاتورة', 'Invoice items')}</Label>
          <Button type="button" size="sm" variant="outline" disabled={isLoading || isError || lines.length >= 100} onClick={() => setLines(c => [...c, emptyLine()])}><Plus className="me-1 h-4 w-4" />{t('إضافة بند', 'Add item')}</Button></div>
        {isLoading && <div className="space-y-2" aria-busy="true"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
        {isError && <div role="alert" className="flex items-center justify-between gap-2 text-sm text-destructive"><span>{t('تعذر تحميل المنتجات', 'Could not load products')}</span><Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>{t('إعادة المحاولة', 'Retry')}</Button></div>}
        {!isLoading && !isError && catalog.length === 0 && <p role="status" className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{t('لا توجد منتجات نشطة متوفرة في المخزون', 'No active products in stock')}</p>}
        {!isLoading && !isError && catalog.length > 0 && lines.map((line, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(6rem,8rem)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(6rem,8rem)_120px_auto]">
          <select aria-label={t('المنتج', 'Product')} className={`${selectCls} col-span-3 sm:col-span-1`} value={line.productId} onChange={e => { const p = catalog.find(x => String(x.id) === e.target.value); updateLine(index, { productId: e.target.value, unitPrice: p?.price ?? 0, quantity: 1 }); }}>
            <option value="">{t('اختر المنتج', 'Select product')}</option>
            {catalog.map(p => <option key={p.id} value={p.id} disabled={lines.some((l, i) => i !== index && l.productId === String(p.id))}>{(lang === 'ar' ? p.nameAr : p.nameEn)} ({p.stockQuantity})</option>)}
          </select>
          <div className="min-w-0 space-y-2">
            <Label htmlFor={`individual-invoice-quantity-${index}`}>{t('الكمية', 'Quantity')}</Label>
            <Input id={`individual-invoice-quantity-${index}`} className={quantityInputClass} type="number" min="1" step="1" max={catalog.find(x => String(x.id) === line.productId)?.stockQuantity} aria-label={t('الكمية', 'Quantity')} value={line.quantity} onChange={e => updateLine(index, { quantity: Number(e.target.value) })} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label className="block text-xs leading-5" htmlFor={`individual-invoice-price-${index}`}>{t('سعر الوحدة شامل الضريبة', 'Unit price including VAT')}</Label>
            <Input id={`individual-invoice-price-${index}`} type="number" min="0.01" step="0.01" aria-label={t('سعر الوحدة شامل الضريبة', 'Unit price including VAT')} value={line.unitPrice || ''} onChange={e => updateLine(index, { unitPrice: Number(e.target.value) })} />
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label={t('حذف البند', 'Remove item')} disabled={lines.length === 1} onClick={() => setLines(c => c.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
        </div>)}
        <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/20 p-3 text-center text-sm">
          <div>{t('المجموع قبل الضريبة', 'Subtotal before VAT')}<strong className="block"><Money value={totals.net} lang={lang} fractionDigits={2} /></strong></div>
          <div>{t('ضريبة القيمة المضافة المشمولة (15%)', 'VAT included (15%)')}<strong className="block"><Money value={totals.vat} lang={lang} fractionDigits={2} /></strong></div>
          <div>{t('الإجمالي', 'Total')}<strong className="block"><Money value={totals.gross} lang={lang} fractionDigits={2} /></strong></div>
        </div>
        <div data-testid="notice-stock-deduction" role="note" className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-stone-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t('عند الحفظ يُخصم المخزون فوراً من المنتجات المحددة (وليس حجزاً)، ولا يُنشأ طلب ولا شحنة.', 'On save, stock is deducted immediately from the selected products (not reserved). No order or shipment is created.')}</p>
        </div>
        <SaleDiscountFields idPrefix="invoice" form={discountForm} onChange={setDiscountForm} preview={discountPreview} disabled={pending} />
        {errors.length > 0 && <ul role="alert" className="list-disc ps-5 text-sm text-destructive">{errors.map(m => <li key={m}>{m}</li>)}</ul>}
        {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
        <Button className="w-full" data-testid="button-submit-individual-invoice" onClick={submit} disabled={pending || isLoading || isError || catalog.length === 0}>{pending ? t('جاري الحفظ...', 'Saving...') : t('حفظ وإصدار الفاتورة', 'Save and issue invoice')}</Button>
      </fieldset>
    </DialogContent>
  </Dialog>;
}
