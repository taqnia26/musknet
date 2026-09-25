import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getAdminListInvoicesQueryKey,
  useAdminCreateHistoricalInvoice,
  useAdminListDistributors,
  useAdminReconcileHistoricalInvoice,
  type HistoricalCompanyInvoiceInput,
  type HistoricalInvoiceReview,
} from '@workspace/api-client-react';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Line = { id: string; productName: string; sku: string; quantity: string; unitPrice: string; subtotal: string; vatAmount: string; totalAmount: string };
type Payment = { id: string; paymentKey: string; paymentDate: string; amount: string; paymentMethod: 'cash' | 'bank_transfer'; reference: string };
type Form = {
  distributorId: string; invoiceNumber: string; issueDate: string; dueDate: string;
  buyerName: string; buyerTaxNumber: string; buyerAddress: string; buyerCommercialRegistrationNumber: string;
  sellerName: string; sellerVatNumber: string; taxTreatment: 'domestic' | 'international';
  subtotal: string; discountAmount: string; vatAmount: string; totalAmount: string;
};

const blankLine = (): Line => ({ id: crypto.randomUUID(), productName: '', sku: '', quantity: '1', unitPrice: '', subtotal: '', vatAmount: '0', totalAmount: '' });
const blankPayment = (): Payment => ({ id: crypto.randomUUID(), paymentKey: crypto.randomUUID(), paymentDate: '', amount: '', paymentMethod: 'bank_transfer', reference: '' });
const blankForm = (): Form => ({
  distributorId: '', invoiceNumber: '', issueDate: '', dueDate: '',
  buyerName: '', buyerTaxNumber: '', buyerAddress: '', buyerCommercialRegistrationNumber: '',
  sellerName: '', sellerVatNumber: '', taxTreatment: 'domestic',
  subtotal: '', discountAmount: '0', vatAmount: '0', totalAmount: '',
});
const cents = (value: string) => Math.round(Number(value) * 100);
const money = (value: number) => (value / 100).toFixed(2);
const validMoney = (value: string, positive = false) => value.trim() !== '' && Number.isFinite(Number(value)) && (positive ? Number(value) > 0 : Number(value) >= 0) && Math.round(Number(value) * 100) === Number(value) * 100;
const dateValid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00`));

export function CreateHistoricalInvoiceDialog() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(blankForm);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [creationKey, setCreationKey] = useState(() => crypto.randomUUID());
  const [review, setReview] = useState<{ revision: number; result: HistoricalInvoiceReview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const { data: distributors, isLoading: distributorsLoading, isError: distributorsError, refetch: retryDistributors } = useAdminListDistributors();
  const reconcile = useAdminReconcileHistoricalInvoice();
  const create = useAdminCreateHistoricalInvoice();

  const changed = () => {
    revision.current += 1;
    setCreationKey(crypto.randomUUID());
    setPayments(current => current.map(payment => ({ ...payment, paymentKey: crypto.randomUUID() })));
    setReview(null);
    setError(null);
  };
  const updateForm = (update: Partial<Form>) => { changed(); setForm(current => ({ ...current, ...update })); };
  const updateLine = (id: string, update: Partial<Line>) => {
    changed();
    setLines(current => current.map(line => line.id === id ? { ...line, ...update } : line));
  };
  const updatePayment = (id: string, update: Partial<Payment>) => {
    changed();
    setPayments(current => current.map(payment => payment.id === id ? { ...payment, ...update } : payment));
  };
  const reset = () => {
    revision.current += 1;
    setForm(blankForm()); setLines([blankLine()]); setPayments([]);
    setCreationKey(crypto.randomUUID()); setReview(null); setError(null);
  };

  const lineNet = lines.reduce((sum, line) => sum + (validMoney(line.subtotal) ? cents(line.subtotal) : 0), 0);
  const lineVat = lines.reduce((sum, line) => sum + (validMoney(line.vatAmount) ? cents(line.vatAmount) : 0), 0);
  const lineGross = lines.reduce((sum, line) => sum + (validMoney(line.totalAmount) ? cents(line.totalAmount) : 0), 0);
  const paid = payments.reduce((sum, payment) => sum + (validMoney(payment.amount) ? cents(payment.amount) : 0), 0);
  const subtotalDifference = lineNet - (validMoney(form.subtotal) ? cents(form.subtotal) : 0);
  const vatDifference = lineVat - (validMoney(form.vatAmount) ? cents(form.vatAmount) : 0);
  const totalDifference = (validMoney(form.subtotal) ? cents(form.subtotal) : 0)
    + (validMoney(form.vatAmount) ? cents(form.vatAmount) : 0)
    - (validMoney(form.totalAmount) ? cents(form.totalAmount) : 0);
  const grossDifference = lines.reduce((sum, line) => sum + (validMoney(line.unitPrice) && Number.isSafeInteger(Number(line.quantity)) ? cents(line.unitPrice) * Number(line.quantity) : 0), 0)
    - (validMoney(form.discountAmount) ? cents(form.discountAmount) : 0) - (validMoney(form.totalAmount) ? cents(form.totalAmount) : 0);

  const buildPayload = (): HistoricalCompanyInvoiceInput | null => {
    if (!form.distributorId || !(distributors ?? []).some(distributor => String(distributor.id) === form.distributorId)
      || !form.invoiceNumber.trim() || form.invoiceNumber.trim().length > 100
      || !dateValid(form.issueDate) || !dateValid(form.dueDate)
      || !form.buyerName.trim() || !form.sellerName.trim() || !form.sellerVatNumber.trim()
      || !validMoney(form.subtotal) || !validMoney(form.discountAmount) || !validMoney(form.vatAmount) || !validMoney(form.totalAmount, true)
      || lines.length < 1 || lines.length > 100
      || lines.some(line => !line.productName.trim() || line.productName.trim().length > 200
        || !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) < 1 || !line.quantity.trim()
        || !validMoney(line.unitPrice) || !validMoney(line.subtotal) || !validMoney(line.vatAmount) || !validMoney(line.totalAmount)
        || cents(line.subtotal) + cents(line.vatAmount) !== cents(line.totalAmount))
      || payments.some(payment => !dateValid(payment.paymentDate) || !validMoney(payment.amount, true) || payment.reference.length > 200)
      || subtotalDifference !== 0 || vatDifference !== 0 || lineGross !== cents(form.totalAmount) || totalDifference !== 0 || grossDifference !== 0 || paid > cents(form.totalAmount)) {
      setError(t('تحقق من الحقول والتواريخ والمبالغ. يجب أن تتطابق البنود والإجماليات، وألا تتجاوز الدفعات الإجمالي.', 'Check fields, dates and amounts. Lines and totals must balance, and payments cannot exceed the total.'));
      return null;
    }
    return {
      creationKey, distributorId: Number(form.distributorId), invoiceNumber: form.invoiceNumber.trim(),
      issueDate: form.issueDate, dueDate: form.dueDate,
      buyerName: form.buyerName.trim(), buyerTaxNumber: form.buyerTaxNumber.trim() || null,
      buyerAddress: form.buyerAddress.trim() || null,
      buyerCommercialRegistrationNumber: form.buyerCommercialRegistrationNumber.trim() || null,
      sellerName: form.sellerName.trim(), sellerVatNumber: form.sellerVatNumber.trim(),
      taxTreatment: form.taxTreatment, subtotal: Number(form.subtotal), discountAmount: Number(form.discountAmount),
      vatAmount: Number(form.vatAmount), totalAmount: Number(form.totalAmount),
      items: lines.map(line => ({
        productName: line.productName.trim(), sku: line.sku.trim() || null,
        quantity: Number(line.quantity), unitPrice: Number(line.unitPrice),
        subtotal: Number(line.subtotal), vatAmount: Number(line.vatAmount), totalAmount: Number(line.totalAmount),
      })),
      payments: payments.map(payment => ({
        paymentKey: payment.paymentKey, paymentDate: payment.paymentDate, amount: Number(payment.amount),
        paymentMethod: payment.paymentMethod, reference: payment.reference.trim() || null,
      })),
    };
  };

  const preview = async () => {
    setError(null);
    const data = buildPayload();
    if (!data) return;
    const currentRevision = revision.current;
    setReview(null);
    try {
      const result = await reconcile.mutateAsync({ data });
      if (revision.current === currentRevision) setReview({ revision: currentRevision, result });
    } catch (cause) {
      if (revision.current === currentRevision) setError(cause instanceof Error ? cause.message : t('تعذرت المراجعة', 'Review failed'));
    }
  };
  const save = async () => {
    if (!review || review.revision !== revision.current || review.result.conflicts.length || reconcile.isPending || create.isPending) return;
    setError(null);
    const data = buildPayload();
    if (!data) return;
    try {
      const result = await create.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getAdminListInvoicesQueryKey() });
      toast({ title: t('تم تسجيل الفاتورة التاريخية', 'Historical invoice recorded'), description: result.invoiceNumber });
      setOpen(false);
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('تعذر حفظ الفاتورة. يمكنك إعادة المحاولة بالمفاتيح نفسها.', 'Could not save. You can retry with the same keys.'));
      setReview(null); // A fresh server check is required before retrying a failed save.
    }
  };

  const field = (key: keyof Form, ar: string, en: string, type = 'text') => (
    <div className="space-y-1.5" key={key}>
      <Label htmlFor={`historical-${key}`}>{t(ar, en)}</Label>
      <Input id={`historical-${key}`} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined}
        dir={type === 'number' || type === 'date' ? 'ltr' : undefined}
        value={form[key]} onChange={event => updateForm({ [key]: event.target.value })} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={next => { if ((reconcile.isPending || create.isPending) && !next) return; setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild><Button variant="outline" data-testid="button-create-historical-invoice"><Plus className="me-2 h-4 w-4" />{t('تسجيل فاتورة تاريخية', 'Record Historical Invoice')}</Button></DialogTrigger>
      <DialogContent dir={lang === 'ar' ? 'rtl' : 'ltr'} className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto">
        <DialogHeader className={lang === 'ar' ? 'text-right' : 'text-left'}>
          <DialogTitle>{t('تسجيل فاتورة مبيعات شركة سابقة', 'Record a Past Company Sales Invoice')}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t('أدخل القيم كما تظهر في السجل الأصلي. راجع التعارضات مع الخادم قبل الحفظ.', 'Enter the exact values from the original record. Check server conflicts before saving.')}</p>
        </DialogHeader>
        <fieldset disabled={reconcile.isPending || create.isPending} className="min-w-0 space-y-6 py-2">
          <section className="space-y-4">
            <h3 className="border-b pb-2 text-sm font-semibold">{t('هوية الفاتورة', 'Invoice identity')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('الشركة', 'Company')}</Label>
                <Select value={form.distributorId} onValueChange={value => {
                  const distributor = distributors?.find(item => String(item.id) === value);
                  updateForm({
                    distributorId: value, buyerName: distributor?.companyName ?? '',
                    buyerTaxNumber: distributor?.taxNumber ?? '',
                    buyerAddress: distributor?.address ?? '',
                    buyerCommercialRegistrationNumber: distributor?.commercialRegistrationNumber ?? '',
                  });
                }}>
                  <SelectTrigger><SelectValue placeholder={t('اختر الشركة', 'Select company')} /></SelectTrigger>
                  <SelectContent>{(distributors ?? []).map(item => <SelectItem key={item.id} value={String(item.id)}>{item.companyName}</SelectItem>)}</SelectContent>
                </Select>
                {distributorsLoading && <div className="h-4 w-36 animate-pulse rounded bg-muted" />}
                {distributorsError && <Button size="sm" variant="outline" onClick={() => retryDistributors()}>{t('إعادة تحميل الشركات', 'Retry loading companies')}</Button>}
              </div>
              {field('invoiceNumber', 'رقم الفاتورة الأصلي', 'Original invoice number')}
              {field('issueDate', 'تاريخ الإصدار الأصلي', 'Original issue date', 'date')}
              {field('dueDate', 'تاريخ الاستحقاق', 'Due date', 'date')}
              <div className="space-y-1.5">
                <Label>{t('المعاملة الضريبية', 'Tax treatment')}</Label>
                <Select value={form.taxTreatment} onValueChange={value => updateForm({ taxTreatment: value as Form['taxTreatment'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="domestic">{t('محلي', 'Domestic')}</SelectItem><SelectItem value="international">{t('دولي', 'International')}</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </section>
          <section className="space-y-4">
            <h3 className="border-b pb-2 text-sm font-semibold">{t('بيانات المشتري والبائع وقت الإصدار', 'Buyer and seller at issue date')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('buyerName', 'اسم المشتري', 'Buyer name')}
              {field('sellerName', 'اسم البائع', 'Seller name')}
              {field('buyerTaxNumber', 'الرقم الضريبي للمشتري', 'Buyer VAT number')}
              {field('sellerVatNumber', 'الرقم الضريبي للبائع', 'Seller VAT number')}
              {field('buyerCommercialRegistrationNumber', 'السجل التجاري للمشتري', 'Buyer commercial registration')}
              {field('buyerAddress', 'عنوان المشتري', 'Buyer address')}
            </div>
          </section>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 border-b pb-2">
              <h3 className="text-sm font-semibold">{t('البنود الأصلية', 'Original lines')}</h3>
              <Button type="button" variant="outline" size="sm" disabled={lines.length >= 100} onClick={() => { changed(); setLines(current => [...current, blankLine()]); }}><Plus className="me-1 h-4 w-4" />{t('إضافة بند', 'Add line')}</Button>
            </div>
            {lines.map((line, index) => (
              <div key={line.id} className="rounded-lg border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between"><span className="text-sm font-medium">{t('بند', 'Line')} {index + 1}</span><Button type="button" variant="ghost" size="icon" aria-label={t('حذف البند', 'Remove line')} disabled={lines.length === 1} onClick={() => { changed(); setLines(current => current.filter(item => item.id !== line.id)); }}><Trash2 className="h-4 w-4" /></Button></div>
                <div className="grid gap-3 sm:grid-cols-2">{([
                  ['productName', 'اسم المنتج', 'Product name', 'text'],
                  ['sku', 'رمز المنتج (اختياري)', 'SKU (optional)', 'text'],
                  ['quantity', 'الكمية', 'Quantity', 'number'],
                  ['unitPrice', 'سعر الوحدة', 'Unit price', 'number'],
                  ['subtotal', 'الصافي', 'Net', 'number'],
                  ['vatAmount', 'الضريبة', 'VAT', 'number'],
                  ['totalAmount', 'الإجمالي', 'Gross', 'number'],
                ] as const).map(([key, ar, en, type]) => (
                  <div className="space-y-1" key={key}><Label htmlFor={`historical-line-${line.id}-${key}`}>{t(ar, en)}</Label>
                    <Input id={`historical-line-${line.id}-${key}`} type={type} min={type === 'number' ? 0 : undefined} step={key === 'quantity' ? 1 : type === 'number' ? '0.01' : undefined}
                      dir={type === 'number' ? 'ltr' : undefined} value={line[key]} onChange={event => updateLine(line.id, { [key]: event.target.value })} /></div>
                ))}</div>
              </div>
            ))}
          </section>
          <section className="space-y-4">
            <h3 className="border-b pb-2 text-sm font-semibold">{t('الإجماليات المسجلة', 'Recorded totals')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">{field('subtotal', 'المجموع الفرعي', 'Subtotal', 'number')}{field('discountAmount', 'الخصم', 'Discount', 'number')}{field('vatAmount', 'الضريبة', 'VAT', 'number')}{field('totalAmount', 'المبلغ الإجمالي', 'Total', 'number')}</div>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="mb-2 font-semibold">{t('مراجعة الفروقات · ر.س', 'Difference check · SAR')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <span>{t('صافي البنود − المجموع الفرعي', 'Line net − subtotal')}: <b dir="ltr">{money(subtotalDifference)}</b></span>
                <span>{t('ضريبة البنود − الضريبة', 'Line VAT − VAT')}: <b dir="ltr">{money(vatDifference)}</b></span>
                <span>{t('سعر البنود قبل الخصم − الخصم − الإجمالي', 'Line prices before discount − discount − total')}: <b dir="ltr">{money(grossDifference)}</b></span>
                <span>{t('الصافي + الضريبة − الإجمالي', 'Net + VAT − total')}: <b dir="ltr">{money(totalDifference)}</b></span>
                <span>{t('المدفوع', 'Paid')}: <b dir="ltr">{money(paid)}</b></span>
                <span>{t('المتبقي', 'Outstanding')}: <b dir="ltr">{money((validMoney(form.totalAmount) ? cents(form.totalAmount) : 0) - paid)}</b></span>
              </div>
            </div>
          </section>
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 border-b pb-2"><h3 className="text-sm font-semibold">{t('دفعات سابقة', 'Past payments')}</h3><Button type="button" size="sm" variant="outline" onClick={() => { changed(); setPayments(current => [...current, blankPayment()]); }}><Plus className="me-1 h-4 w-4" />{t('إضافة دفعة', 'Add payment')}</Button></div>
            {payments.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t('لا توجد دفعات مسجلة لهذه الفاتورة.', 'No payments recorded for this invoice.')}</p>}
            {payments.map((payment, index) => (
              <div key={payment.id} className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between"><span className="text-sm font-medium">{t('دفعة', 'Payment')} {index + 1}</span><Button type="button" variant="ghost" size="icon" aria-label={t('حذف الدفعة', 'Remove payment')} onClick={() => { changed(); setPayments(current => current.filter(item => item.id !== payment.id)); }}><Trash2 className="h-4 w-4" /></Button></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label htmlFor={`payment-date-${payment.id}`}>{t('تاريخ الدفع', 'Payment date')}</Label><Input id={`payment-date-${payment.id}`} dir="ltr" type="date" value={payment.paymentDate} onChange={event => updatePayment(payment.id, { paymentDate: event.target.value })} /></div>
                  <div className="space-y-1"><Label htmlFor={`payment-amount-${payment.id}`}>{t('المبلغ', 'Amount')}</Label><Input id={`payment-amount-${payment.id}`} dir="ltr" type="number" min="0.01" step="0.01" value={payment.amount} onChange={event => updatePayment(payment.id, { amount: event.target.value })} /></div>
                  <div className="space-y-1"><Label>{t('طريقة الدفع', 'Method')}</Label><Select value={payment.paymentMethod} onValueChange={value => updatePayment(payment.id, { paymentMethod: value as Payment['paymentMethod'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bank_transfer">{t('تحويل بنكي', 'Bank transfer')}</SelectItem><SelectItem value="cash">{t('نقداً', 'Cash')}</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1"><Label htmlFor={`payment-ref-${payment.id}`}>{t('المرجع (اختياري)', 'Reference (optional)')}</Label><Input id={`payment-ref-${payment.id}`} value={payment.reference} onChange={event => updatePayment(payment.id, { reference: event.target.value })} /></div>
                </div>
              </div>
            ))}
          </section>
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {review && review.revision === revision.current && (
            <div role="status" className="space-y-2 rounded-lg border bg-muted/20 p-4 text-sm">
              <p className="font-semibold">{t('نتيجة مراجعة الخادم', 'Server reconciliation')}</p>
              {review.result.conflicts.length ? <div className="text-destructive"><p className="font-medium">{t('تعارضات تمنع الحفظ', 'Conflicts block saving')}</p><ul className="list-inside list-disc">{review.result.conflicts.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : <p className="text-primary">{t('لا توجد تعارضات. يمكنك الحفظ.', 'No conflicts. Ready to save.')}</p>}
              {review.result.warnings.length > 0 && <div className="text-amber-800"><p className="font-medium">{t('تنبيهات', 'Warnings')}</p><ul className="list-inside list-disc">{review.result.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
            </div>
          )}
        </fieldset>
        <DialogFooter className="gap-2 border-t pt-4">
          <Button type="button" variant="outline" disabled={reconcile.isPending || create.isPending} onClick={() => { setOpen(false); reset(); }}>{t('إلغاء', 'Cancel')}</Button>
          <Button type="button" variant="secondary" disabled={distributorsLoading || distributorsError || reconcile.isPending || create.isPending} onClick={preview}>{reconcile.isPending ? t('جارٍ التحقق...', 'Checking...') : t('مراجعة مع الخادم', 'Review with server')}</Button>
          <Button type="button" disabled={create.isPending || reconcile.isPending || !review || review.revision !== revision.current || review.result.conflicts.length > 0} onClick={save}>{create.isPending ? t('جارٍ الحفظ...', 'Saving...') : t('حفظ الفاتورة', 'Save invoice')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}