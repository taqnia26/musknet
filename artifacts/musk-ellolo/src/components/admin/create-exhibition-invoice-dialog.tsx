import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { getAdminListInvoicesQueryKey, getAdminListExhibitionProductsQueryKey, useAdminCreateExhibitionInvoice, useAdminListExhibitions, useAdminListExhibitionProducts } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Money } from '@/components/money';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Line = { productId: string; quantity: number; unitPrice: number };
const emptyLine = (): Line => ({ productId: '', quantity: 1, unitPrice: 0 });
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function CreateExhibitionInvoiceDialog() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [exhibitionId, setExhibitionId] = useState('');
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [buyerName, setBuyerName] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerTaxNumber, setBuyerTaxNumber] = useState('');
  const [buyerCR, setBuyerCR] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState('');
  const { data: exhibitions, isLoading: loadingExhibitions, isError: exhibitionsError, refetch: refetchExhibitions } = useAdminListExhibitions();
  const { data: allocations, isLoading: loadingAllocations, isError: allocationsError } = useAdminListExhibitionProducts(Number(exhibitionId), { query: { enabled: open && !!exhibitionId, queryKey: getAdminListExhibitionProductsQueryKey(Number(exhibitionId)) } });
  useEffect(() => { if (open) void refetchExhibitions(); }, [open, refetchExhibitions]);
  const mutation = useAdminCreateExhibitionInvoice();
  const exhibition = exhibitions?.find(e => String(e.id) === exhibitionId);
  const totals = useMemo(() => {
    const grossTotal = round(lines.reduce((sum, line) => sum + round(line.unitPrice * line.quantity), 0));
    const subtotal = round(lines.reduce((sum, line) => {
      const grossLine = round(line.unitPrice * line.quantity);
      return sum + round(grossLine / 1.15);
    }, 0));
    const vat = round(grossTotal - subtotal);
    return { subtotal, vat, total: grossTotal };
  }, [lines]);
  const reset = () => {
    setExhibitionId(''); setBuyerName(''); setBuyerAddress(''); setBuyerTaxNumber(''); setBuyerCR('');
    setSaleDate(new Date().toISOString().slice(0, 10)); setPaymentMethod('cash');
    setLines([emptyLine()]); setKey(crypto.randomUUID()); setError('');
  };
  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines(current => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  const submit = () => {
    setError('');
    if (!exhibition || !buyerName.trim() || !saleDate || lines.some(l => !l.productId || !Number.isSafeInteger(l.quantity) || l.quantity < 1 || !Number.isFinite(l.unitPrice) || l.unitPrice <= 0 || round(l.unitPrice) !== l.unitPrice)) {
      setError(t('أدخل المعرض والتاريخ والمشتري وبنوداً بكميات وأسعار صالحة', 'Enter an exhibition, date, buyer and valid item quantities and prices')); return;
    }
    if (new Set(lines.map(l => l.productId)).size !== lines.length) {
      setError(t('لا يمكن تكرار المنتج', 'Products cannot be repeated')); return;
    }
    if (saleDate < exhibition.startDate.slice(0, 10) || saleDate > exhibition.endDate.slice(0, 10) ||
      lines.some(l => l.quantity > (allocations?.find(a => String(a.productId) === l.productId)?.quantityAllocated ?? 0) - (allocations?.find(a => String(a.productId) === l.productId)?.quantitySold ?? 0))) {
      setError(t('تحقق من تاريخ المعرض والكميات المتبقية المخصصة', 'Check the exhibition dates and remaining allocated quantities')); return;
    }
    mutation.mutate({ data: {
      creationKey: key, exhibitionId: Number(exhibitionId), saleDate, buyerName: buyerName.trim(),
      buyerAddress: buyerAddress.trim() || null, buyerTaxNumber: buyerTaxNumber.trim() || null,
      buyerCommercialRegistrationNumber: buyerCR.trim() || null, paymentMethod,
      items: lines.map(l => ({ productId: Number(l.productId), quantity: l.quantity, unitPrice: l.unitPrice })),
    } }, {
      onSuccess: invoice => {
        client.invalidateQueries({ queryKey: getAdminListInvoicesQueryKey() });
        client.invalidateQueries({ queryKey: getAdminListExhibitionProductsQueryKey(Number(exhibitionId)) });
        toast({ title: t('تم إصدار فاتورة المعرض', 'Exhibition invoice issued'), description: invoice.invoiceNumber });
        setOpen(false); reset();
      },
      onError: err => {
        const message = err instanceof Error ? err.message : '';
        setError(lang === 'ar'
          ? /allocation|allocated/i.test(message) ? 'الكمية المطلوبة تتجاوز الكمية المتبقية للمعرض'
            : /stock|balance/i.test(message) ? 'المخزون المتاح لا يكفي لإصدار الفاتورة'
            : /date|cancelled/i.test(message) ? 'تاريخ البيع خارج فترة المعرض أو أن المعرض ملغى'
            : /creation key/i.test(message) ? 'استخدم مفتاح طلب جديداً بعد تعديل الفاتورة'
            : 'تعذر إصدار الفاتورة. تحقق من البيانات وحاول مجدداً'
          : message || 'Could not issue invoice. Check the details and retry.');
      },
    });
  };
  return <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next && !mutation.isPending) reset(); }}>
    <DialogTrigger asChild><Button data-testid="button-create-exhibition-invoice"><Plus className="me-2 h-4 w-4" />{t('إضافة فاتورة معرض', 'Add Exhibition Invoice')}</Button></DialogTrigger>
    <DialogContent dir={lang === 'ar' ? 'rtl' : 'ltr'} className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader className={lang === 'ar' ? 'text-right' : 'text-left'}><DialogTitle>{t('فاتورة مبيعات معرض', 'Exhibition Sales Invoice')}</DialogTitle></DialogHeader>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="exhibition-invoice-exhibition">{t('المعرض', 'Exhibition')}</Label>
            <select id="exhibition-invoice-exhibition" className="h-10 w-full rounded-md border border-input bg-background px-3" value={exhibitionId} onChange={e => { setExhibitionId(e.target.value); setLines([emptyLine()]); }}>
              <option value="">{loadingExhibitions ? t('جاري التحميل...', 'Loading...') : t('اختر المعرض', 'Select exhibition')}</option>
              {exhibitions?.filter(e => e.status !== 'cancelled').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></div>
          <div className="space-y-2"><Label htmlFor="exhibition-invoice-date">{t('تاريخ البيع', 'Sale date')}</Label><Input id="exhibition-invoice-date" type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="exhibition-invoice-buyer">{t('اسم المشتري', 'Buyer name')}</Label><Input id="exhibition-invoice-buyer" value={buyerName} onChange={e => setBuyerName(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="exhibition-invoice-method">{t('طريقة التحصيل', 'Payment method')}</Label><select id="exhibition-invoice-method" className="h-10 w-full rounded-md border border-input bg-background px-3" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as 'cash' | 'bank_transfer')}><option value="cash">{t('نقدي', 'Cash')}</option><option value="bank_transfer">{t('تحويل بنكي', 'Bank transfer')}</option></select></div>
          <div className="space-y-2"><Label htmlFor="exhibition-invoice-address">{t('عنوان المشتري', 'Buyer address')}</Label><Input id="exhibition-invoice-address" value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="exhibition-invoice-vat">{t('الرقم الضريبي (اختياري)', 'VAT number (optional)')}</Label><Input id="exhibition-invoice-vat" value={buyerTaxNumber} onChange={e => setBuyerTaxNumber(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="exhibition-invoice-cr">{t('السجل التجاري (اختياري)', 'CR number (optional)')}</Label><Input id="exhibition-invoice-cr" value={buyerCR} onChange={e => setBuyerCR(e.target.value)} /></div>
        </div>
        <div className="flex items-center justify-between gap-2"><Label>{t('بنود الفاتورة', 'Invoice items')}</Label><Button type="button" size="sm" variant="outline" onClick={() => setLines(current => [...current, emptyLine()])}><Plus className="me-1 h-4 w-4" />{t('إضافة بند', 'Add item')}</Button></div>
        {lines.map((line, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_90px_120px_auto]">
          <select aria-label={t('المنتج', 'Product')} className="col-span-3 h-10 min-w-0 rounded-md border border-input bg-background px-2 sm:col-span-1" value={line.productId} onChange={e => {
            const allocation = allocations?.find(a => String(a.productId) === e.target.value);
            updateLine(index, { productId: e.target.value, unitPrice: allocation?.productPrice ?? 0 });
          }} disabled={!exhibitionId || loadingAllocations}>
            <option value="">{t('اختر المنتج المخصص', 'Select allocated product')}</option>
            {allocations?.filter(a => a.quantityAllocated > a.quantitySold).map(a => <option key={a.id} value={a.productId} disabled={lines.some((l, i) => i !== index && l.productId === String(a.productId))}>{lang === 'ar' ? a.productNameAr : a.productNameEn} ({a.quantityAllocated - a.quantitySold})</option>)}
          </select>
          <Input type="number" min="1" step="1" aria-label={t('الكمية', 'Quantity')} value={line.quantity} onChange={e => updateLine(index, { quantity: Number(e.target.value) })} />
          <Input type="number" min="0.01" step="0.01" aria-label={t('سعر الوحدة شامل الضريبة', 'Unit price including VAT')} value={line.unitPrice || ''} onChange={e => updateLine(index, { unitPrice: Number(e.target.value) })} />
          <Button type="button" size="icon" variant="ghost" aria-label={t('حذف البند', 'Remove item')} disabled={lines.length === 1} onClick={() => setLines(current => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
        </div>)}
        {(exhibitionsError || allocationsError) && <p role="alert" className="text-sm text-destructive">{t('تعذر تحميل المعارض أو المنتجات المخصصة. حاول إعادة فتح النافذة.', 'Could not load exhibitions or allocations. Please reopen the form.')}</p>}
        <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/20 p-3 text-center text-sm">
          <div>{t('المجموع قبل الضريبة', 'Subtotal before VAT')}<strong className="block"><Money value={totals.subtotal} lang={lang} fractionDigits={2} /></strong></div>
          <div>{t('ضريبة القيمة المضافة المشمولة (15%)', 'VAT included (15%)')}<strong className="block"><Money value={totals.vat} lang={lang} fractionDigits={2} /></strong></div>
          <div>{t('الإجمالي', 'Total')}<strong className="block"><Money value={totals.total} lang={lang} fractionDigits={2} /></strong></div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" onClick={submit} disabled={mutation.isPending || loadingAllocations || exhibitionsError || allocationsError}>{mutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ وإصدار الفاتورة', 'Save and issue invoice')}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}