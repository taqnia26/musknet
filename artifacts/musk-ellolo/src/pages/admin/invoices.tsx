import { useState, useEffect, useRef } from 'react';
import { 
  useAdminListInvoices, 
  useAdminGetInvoiceQr,
  useAdminCreateReceivablePayment,
  useAdminUpdateInvoice,
  useAdminArchiveInvoice,
  useAdminListInvoiceEmailDeliveries,
  useAdminSendInvoiceEmail,
  useGetAdminMe,
  getAdminListInvoiceEmailDeliveriesQueryKey,
  getAdminGetInvoiceQrQueryKey,
  getAdminListInvoicesQueryKey,
  type AdminInvoice 
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/hooks/use-language';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Search, QrCode, Printer, AlertCircle, Banknote, 
  MoreHorizontal, Eye, Pen, Mail, Archive 
} from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { hasPermission } from '@/lib/permissions';
import { CreateDistributorInvoiceDialog } from '@/components/admin/create-distributor-invoice-dialog';
import { CreateExhibitionInvoiceDialog } from '@/components/admin/create-exhibition-invoice-dialog';
import { useToast } from '@/hooks/use-toast';

function InvoiceTemplate({
  invoice,
  qrUrl,
  onQrLoad,
}: {
  invoice: AdminInvoice;
  qrUrl: string | null;
  onQrLoad?: () => void;
}) {
  const { t, lang } = useLanguage();
  const grossBeforeDiscount = invoice.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const inclusiveOrderSnapshot = Boolean(invoice.orderNumber) &&
    Math.round(invoice.subtotal * 100) + Math.round(invoice.vatAmount * 100) === Math.round(invoice.totalAmount * 100);
  const vatLabel = invoice.vatAmount > 0
    ? invoice.vatRate !== null && invoice.vatRate !== undefined && invoice.vatRate > 0
      ? t(`ضريبة القيمة المضافة (${invoice.vatRate}%)`, `VAT (${invoice.vatRate}%)`)
      : t('ضريبة القيمة المضافة (مبلغ تاريخي)', 'VAT (historical amount)')
    : invoice.taxTreatment === 'international'
      ? t('ضريبة القيمة المضافة (دولي - 0%)', 'VAT (International — 0%)')
      : invoice.vatRate !== null && invoice.vatRate !== undefined
        ? t(`ضريبة القيمة المضافة (${invoice.vatRate}%)`, `VAT (${invoice.vatRate}%)`)
        : t('ضريبة القيمة المضافة (15%)', 'VAT (15%)');
  return (
    <div id="invoice-print-area" data-testid="invoice-template" className="invoice-sheet bg-white text-[#292728] p-6 sm:p-10 rounded-md shadow-sm border border-stone-200 font-sans mx-auto max-w-4xl relative" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <style>{`
        @media print {
          body, html { height: auto !important; overflow: visible !important; background: #fff !important; }
          body > #root { display: none !important; }
          body * { visibility: hidden !important; }
          [data-radix-portal], [role="dialog"], [data-radix-portal] > div {
            position: static !important; transform: none !important; translate: none !important; overflow: visible !important;
            max-height: none !important; height: auto !important; display: block !important; inset: auto !important;
          }
          [role="dialog"] { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
          #invoice-print-area {
            position: relative !important; left: auto !important; top: auto !important; width: 100% !important; max-width: none !important;
            margin: 0 !important; padding: 4mm !important; border: none !important; box-shadow: none !important; border-radius: 0 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }
          .print-hide { display: none !important; }
          @page { size: A4 portrait; margin: 15mm; }
        }
      `}</style>
      
      {/* Customer on the physical right, seller on the left, with the mark centered. */}
      <div dir="rtl" className="invoice-heading grid gap-5 sm:gap-6 items-start mb-6">
        <div data-testid="invoice-buyer" dir={lang === 'ar' ? 'rtl' : 'ltr'} className="invoice-heading-buyer min-w-0">
          <h3 className="text-xs font-semibold text-stone-500 mb-3">{t('بيانات العميل', 'Customer Details')}</h3>
          <p className="font-semibold text-lg text-[#292728]">{invoice.buyerName || invoice.distributorName || '-'}</p>
          {invoice.buyerAddress && <p className="text-xs sm:text-sm text-gray-600 mt-2 whitespace-pre-wrap leading-relaxed">{invoice.buyerAddress}</p>}
          {invoice.buyerTaxNumber && <p className="text-xs sm:text-sm text-gray-600 mt-2">{t('الرقم الضريبي', 'VAT')}: <span className="font-mono text-gray-900">{invoice.buyerTaxNumber}</span></p>}
          {invoice.buyerCommercialRegistrationNumber && <p className="text-xs sm:text-sm text-gray-600 mt-1">{t('السجل التجاري', 'CR')}: <span className="font-mono text-gray-900">{invoice.buyerCommercialRegistrationNumber}</span></p>}
          {invoice.orderNumber && <p className="mt-3 text-xs text-stone-500">{t('رقم الطلب', 'Order No.')}: <span className="font-mono text-stone-700">{invoice.orderNumber}</span></p>}
        </div>
        <div className="invoice-heading-logo flex flex-col items-center text-center">
          <div className="flex h-20 items-center justify-center">
            <img src={`${import.meta.env.BASE_URL}site-assets/invoice-logo-black.png`} alt="Musk Ellolo" data-testid="invoice-logo-black" className="invoice-logo-black h-auto w-48 sm:w-56 object-contain" />
            <img src={`${import.meta.env.BASE_URL}site-assets/invoice-logo-white.png`} alt="Musk Ellolo" data-testid="invoice-logo-white" className="invoice-logo-white h-auto w-48 sm:w-56 object-contain" />
          </div>
          <h1 data-testid="invoice-title" className="mt-2 text-xl font-semibold tracking-wide text-[#292728]">{t('فاتورة ضريبية', 'Tax Invoice')}</h1>
        </div>
        <div className="invoice-heading-seller min-w-0">
          <div data-testid="invoice-seller" dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-w-0">
            <p className="invoice-seller-name font-semibold text-[#292728]">{invoice.sellerName}</p>
            <p className="mt-2 text-xs text-stone-500">{t('السعودية، الرياض، حي السليمانية', 'Saudi Arabia, Riyadh, Al Sulimaniyah')}</p>
            <p className="mt-2 text-xs text-stone-500">{t('الرقم الضريبي', 'VAT Number')}: <span className="font-mono text-stone-700">{invoice.sellerVatNumber}</span></p>
          </div>
          <div data-testid="invoice-info-card" dir={lang === 'ar' ? 'rtl' : 'ltr'} className="invoice-info-card mt-5 rounded-md border border-stone-200 bg-stone-100 p-4">
            <dl className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-3"><dt className="text-stone-600">{t('رقم الفاتورة', 'Invoice No.')}</dt><dd dir="ltr" className="font-mono font-semibold text-[#292728]">{invoice.invoiceNumber}</dd></div>
              {invoice.exhibitionName && <div className="flex items-baseline justify-between gap-3"><dt className="text-stone-600">{t('المعرض', 'Exhibition')}</dt><dd>{invoice.exhibitionName}</dd></div>}
              {invoice.contractId && <div className="flex items-baseline justify-between gap-3"><dt className="text-stone-600">{t('العقد', 'Contract')}</dt><dd>{invoice.contractNumber || '-'}{invoice.contractType ? ` · ${invoice.contractType}` : ''}</dd></div>}
              <div className="flex items-baseline justify-between gap-3"><dt className="text-stone-600">{t('تاريخ الإصدار', 'Issue Date')}</dt><dd className="font-medium text-[#292728]">{format(new Date(invoice.issueDatetime), 'yyyy-MM-dd')}</dd></div>
              <div className="flex items-baseline justify-between gap-3"><dt className="text-stone-600">{t('تاريخ الاستحقاق', 'Due Date')}</dt><dd className="font-medium text-[#292728]">{invoice.dueDate ? format(new Date(invoice.dueDate), 'yyyy-MM-dd') : '-'}</dd></div>
            </dl>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div data-testid="invoice-items" className="invoice-items rounded-xl overflow-x-auto border border-gray-200 mb-6">
        <table className="w-full text-xs sm:text-sm">
           <thead data-testid="invoice-table-head" className="bg-gray-50">
            <tr>
              <th className="text-start py-3 px-4 sm:px-6 font-bold text-gray-900">{t('المنتج', 'Product')}</th>
              <th className="text-center py-3 px-3 sm:px-4 font-bold text-gray-900">{t('الكمية', 'Qty')}</th>
              <th className="text-end py-3 px-3 sm:px-4 font-bold text-gray-900">{t('سعر الوحدة', 'Unit Price')}</th>
            </tr>
          </thead>
           <tbody data-testid="invoice-table-body" className="divide-y divide-gray-100 bg-white">
            {invoice.items.length > 0 ? (
              invoice.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-3 px-4 sm:px-6 font-medium text-gray-900">{item.productName}</td>
                  <td className="py-3 px-3 sm:px-4 text-center text-gray-600">{item.quantity}</td>
                  <td className="py-3 px-3 sm:px-4 text-end text-gray-600 font-mono"><Money value={item.unitPrice} lang={lang} fractionDigits={2} /></td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="py-8 text-center text-gray-500">{t('لا توجد منتجات', 'No items')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totals & QR */}
      <div data-testid="invoice-summary" className="invoice-summary flex flex-col sm:flex-row justify-between sm:items-end gap-6">
         <div data-testid="invoice-qr-surface" className="invoice-qr-surface w-28 h-28 sm:w-32 sm:h-32 bg-white rounded-xl p-2 border border-gray-200 flex items-center justify-center shadow-sm shrink-0">
          {qrUrl ? (
            <img src={qrUrl} alt="ZATCA QR" data-testid="invoice-qr" onLoad={onQrLoad} className="w-full h-full object-contain" />
          ) : (
            <div className="animate-pulse w-full h-full bg-gray-100 rounded-lg"></div>
          )}
        </div>
        <div className="w-full sm:w-80 space-y-4">
          {invoice.contractId ? (
            <>
              <div className="flex justify-between text-gray-600 px-2 text-sm">
                <span>{t('الإجمالي قبل الخصم (شامل الضريبة)', 'Gross before discount (VAT included)')}</span>
                <span className="font-mono"><Money value={grossBeforeDiscount} lang={lang} fractionDigits={2} /></span>
              </div>
              <div data-testid="invoice-discount" className="flex justify-between text-gray-600 px-2 text-sm">
                <span>{t(`خصم العقد (${invoice.contractDiscountPercent ?? 0}%)`, `Contract discount (${invoice.contractDiscountPercent ?? 0}%)`)}</span>
                <span className="font-mono">-<Money value={invoice.discountAmount ?? 0} lang={lang} fractionDigits={2} /></span>
              </div>
              <div className="flex justify-between text-gray-600 px-2 text-sm">
                <span>{t('صافي المجموع الفرعي بعد الخصم', 'Net subtotal after discount')}</span>
                <span className="font-mono"><Money value={invoice.subtotal} lang={lang} fractionDigits={2} /></span>
              </div>
              <div className="flex justify-between text-gray-600 px-2 text-sm">
                <span>{vatLabel}</span>
                <span className="font-mono"><Money value={invoice.vatAmount} lang={lang} fractionDigits={2} /></span>
              </div>
              {(invoice.shippingAmount ?? 0) > 0 && <div className="flex justify-between text-gray-600 px-2 text-sm">
                <span>{t('الشحن', 'Shipping')}</span>
                <span className="font-mono"><Money value={invoice.shippingAmount!} lang={lang} fractionDigits={2} /></span>
              </div>}
            </>
          ) : (
            <>
              <div className="flex justify-between text-gray-600 px-2 text-sm">
                <span>{t('المجموع الفرعي', 'Subtotal')}</span>
                <span className="font-mono"><Money value={invoice.subtotal} lang={lang} fractionDigits={2} /></span>
              </div>
              <div className="flex justify-between text-gray-600 px-2 text-sm">
                <span>{vatLabel}</span>
                <span className="font-mono"><Money value={invoice.vatAmount} lang={lang} fractionDigits={2} /></span>
              </div>
              {!inclusiveOrderSnapshot && (invoice.shippingAmount ?? 0) > 0 && <div className="flex justify-between text-gray-600 px-2 text-sm">
                <span>{t('الشحن', 'Shipping')}</span>
                <span className="font-mono"><Money value={invoice.shippingAmount!} lang={lang} fractionDigits={2} /></span>
              </div>}
              {!inclusiveOrderSnapshot && <div data-testid="invoice-discount" className="flex justify-between text-gray-600 px-2 text-sm">
                <span>{t('الخصم', 'Discount')}</span>
                <span className="font-mono">-<Money value={invoice.discountAmount ?? 0} lang={lang} fractionDigits={2} /></span>
              </div>}
            </>
          )}
           {invoice.paidAmount > 0 && invoice.paidAmount < invoice.totalAmount && (
            <div className="pt-2 space-y-2 px-2 text-xs sm:text-sm">
              <div className="flex justify-between text-stone-600 font-medium">
                <span>{t('المبلغ المدفوع', 'Amount Paid')}</span>
                <span className="font-mono"><Money value={invoice.paidAmount} lang={lang} fractionDigits={2} /></span>
              </div>
               {invoice.outstandingAmount > 0 && invoice.outstandingAmount < invoice.totalAmount && (
                 <div className="flex justify-between text-stone-700 font-semibold">
                   <span>{t('الرصيد المستحق', 'Amount Due')}</span>
                   <span className="font-mono"><Money value={invoice.outstandingAmount} lang={lang} fractionDigits={2} /></span>
                 </div>
               )}
            </div>
          )}
           <div data-testid="invoice-total-card" className="flex justify-between font-semibold text-base sm:text-lg p-3 sm:p-4 bg-stone-100 rounded-md border border-stone-200">
             <span className="text-[#292728]">{t('الإجمالي', 'Total')}</span>
             <span className="font-mono text-[#292728]"><Money value={invoice.totalAmount} lang={lang} fractionDigits={2} /></span>
           </div>
        </div>
      </div>
      <footer className="invoice-footer" data-testid="invoice-footer">
        <img src={`${import.meta.env.BASE_URL}site-assets/invoice-footer.jpg?v=logo-site-only`} alt={t('شعار مسك اللولو الصغير وموقع muskellolo.com', 'Musk Ellolo small logo and muskellolo.com')} className="w-full h-auto" />
      </footer>
    </div>
  );
}

function InvoicePreviewDialog({ 
  invoice, 
  open, 
  onOpenChange,
  printOnReady = false,
}: { 
  invoice: AdminInvoice | null; 
  open: boolean; 
  onOpenChange: (o: boolean) => void;
  printOnReady?: boolean;
}) {
  const { t } = useLanguage();
  
  const { data: qrBlob } = useAdminGetInvoiceQr(
    invoice?.id as number,
    { 
      query: { 
        enabled: !!invoice, 
        queryKey: invoice ? getAdminGetInvoiceQrQueryKey(invoice.id) : ['invoice-qr-null']
      }
    }
  );

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrReady, setQrReady] = useState(false);
  const hasPrinted = useRef(false);

  useEffect(() => {
    hasPrinted.current = false;
    setQrReady(false);
  }, [invoice?.id, open, printOnReady]);

  useEffect(() => {
    if (!qrBlob || !(qrBlob instanceof Blob)) return undefined;
    const url = URL.createObjectURL(qrBlob);
    setQrUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [qrBlob]);

  useEffect(() => {
    if (!open || !printOnReady || !qrReady || hasPrinted.current) return;
    hasPrinted.current = true;
    const timer = window.setTimeout(() => window.print(), 0);
    return () => window.clearTimeout(timer);
  }, [open, printOnReady, qrReady]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-muted/20 border-none shadow-2xl sm:max-h-[90vh] flex flex-col">
         <div className="print-hide flex justify-between items-center p-4 pe-14 bg-background border-b shrink-0">
          <DialogTitle className="text-lg font-bold">{t('معاينة الفاتورة', 'Invoice Preview')} - {invoice?.invoiceNumber}</DialogTitle>
          <div className="flex gap-2">
            <Button onClick={() => window.print()} variant="outline" size="sm" className="gap-2">
              <Printer className="w-4 h-4" />
              {t('طباعة', 'Print')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>{t('إغلاق', 'Close')}</Button>
          </div>
        </div>
        <div className="p-4 sm:p-8 overflow-y-auto flex-1 print:p-0 print:overflow-visible print:block">
          {invoice && <InvoiceTemplate invoice={invoice} qrUrl={qrUrl} onQrLoad={() => setQrReady(true)} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditInvoiceDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: AdminInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useAdminUpdateInvoice();

  const [dueDate, setDueDate] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerTaxNumber, setBuyerTaxNumber] = useState('');
  const [buyerCR, setBuyerCR] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && invoice) {
      setDueDate(invoice.dueDate ? invoice.dueDate.slice(0, 10) : '');
      setBuyerName(invoice.buyerName || '');
      setBuyerTaxNumber(invoice.buyerTaxNumber || '');
      setBuyerCR(invoice.buyerCommercialRegistrationNumber || '');
      setBuyerAddress(invoice.buyerAddress || '');
      setError(null);
    }
  }, [open, invoice]);

  const submit = () => {
    if (!invoice) return;
    mutation.mutate({
      id: invoice.id,
      data: {
        dueDate: dueDate || null,
        buyerName: buyerName || null,
        buyerTaxNumber: buyerTaxNumber || null,
        buyerCommercialRegistrationNumber: buyerCR || null,
        buyerAddress: buyerAddress || null,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListInvoicesQueryKey() });
        toast({ title: t('تم تحديث الفاتورة بنجاح', 'Invoice updated successfully') });
        onOpenChange(false);
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : t('حدث خطأ', 'An error occurred'));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <DialogHeader className={lang === 'ar' ? 'text-right' : 'text-left'}>
          <DialogTitle>{t('تعديل بيانات الفاتورة', 'Edit Invoice Details')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>{t('اسم المشتري', 'Buyer Name')}</Label>
            <Input data-testid="invoice-edit-buyer-name" value={buyerName} onChange={e => setBuyerName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('الرقم الضريبي', 'VAT Number')}</Label>
              <Input value={buyerTaxNumber} onChange={e => setBuyerTaxNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('السجل التجاري', 'CR Number')}</Label>
              <Input value={buyerCR} onChange={e => setBuyerCR(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('عنوان المشتري', 'Buyer Address')}</Label>
            <Input data-testid="invoice-edit-buyer-address" value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('تاريخ الاستحقاق', 'Due Date')}</Label>
            <Input data-testid="invoice-edit-due-date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel')}</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ التعديلات', 'Save Changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmailInvoiceDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: AdminInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useAdminSendInvoiceEmail();
  const { data: deliveries, isLoading: deliveriesLoading } = useAdminListInvoiceEmailDeliveries(
    invoice?.id as number,
    { query: {
      enabled: open && !!invoice,
      queryKey: invoice ? getAdminListInvoiceEmailDeliveriesQueryKey(invoice.id) : ['invoice-email-deliveries-null'],
    } },
  );

  useEffect(() => {
    if (open) {
      setEmail(deliveries?.[0]?.recipient ?? '');
      setError(null);
    }
  }, [open, invoice?.id, deliveries?.[0]?.recipient]);

  const handleSend = () => {
    if (!invoice || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('أدخل عنوان بريد إلكتروني صالحاً', 'Enter a valid email address'));
      return;
    }
    setError(null);
    mutation.mutate({ id: invoice.id, data: { recipient: email.trim() } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListInvoiceEmailDeliveriesQueryKey(invoice.id) });
        toast({ title: t('تم إرسال الفاتورة بنجاح', 'Invoice sent successfully'), description: email.trim() });
      },
      onError: (sendError) => {
        queryClient.invalidateQueries({ queryKey: getAdminListInvoiceEmailDeliveriesQueryKey(invoice.id) });
        setError(sendError instanceof Error ? sendError.message : t('تعذر إرسال الفاتورة', 'Unable to send invoice'));
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <DialogHeader className={lang === 'ar' ? 'text-right' : 'text-left'}>
          <DialogTitle>{t('إرسال الفاتورة عبر البريد', 'Send Invoice via Email')}</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label>{t('البريد الإلكتروني للمستلم', 'Recipient Email')}</Label>
            <Input 
              type="email" 
              data-testid="invoice-email-recipient"
              placeholder="client@example.com" 
              value={email} 
              onChange={e => {
                setEmail(e.target.value);
                setError(null);
              }}
            />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t('سيُرسل النظام نسخة PDF مطابقة للفاتورة مباشرة إلى المستلم، وسيتم حفظ نتيجة المحاولة.', 'The system will send a matching invoice PDF directly and save the delivery result.')}
          </p>
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-semibold">{t('سجل الإرسال', 'Delivery history')}</p>
            {deliveriesLoading ? (
              <p className="text-sm text-muted-foreground">{t('جاري التحميل...', 'Loading...')}</p>
            ) : deliveries?.length ? deliveries.slice(0, 5).map((delivery) => (
              <div key={delivery.id} className="rounded-md border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{delivery.recipient}</span>
                  <Badge variant={delivery.status === 'sent' ? 'secondary' : 'destructive'}>
                    {delivery.status === 'sent' ? t('تم الإرسال', 'Sent') : t('فشل', 'Failed')}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{format(new Date(delivery.attemptedAt), 'yyyy-MM-dd HH:mm')} · {delivery.sentByName}</p>
                {delivery.errorMessage && <p className="mt-1 text-destructive">{delivery.errorMessage}</p>}
              </div>
            )) : <p className="text-sm text-muted-foreground">{t('لا توجد محاولات سابقة', 'No previous attempts')}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>{t('إغلاق', 'Close')}</Button>
          <Button data-testid="button-send-invoice-email" onClick={handleSend} disabled={!email.trim() || mutation.isPending}>
            {mutation.isPending ? t('جاري الإرسال...', 'Sending...') : deliveries?.length ? t('إعادة الإرسال', 'Send again') : t('إرسال PDF', 'Send PDF')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveInvoiceDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: AdminInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useAdminArchiveInvoice();

  const handleArchive = () => {
    if (!invoice) return;
    mutation.mutate({ id: invoice.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListInvoicesQueryKey() });
        toast({ title: t('تمت أرشفة الفاتورة', 'Invoice archived') });
        onOpenChange(false);
      },
      onError: () => {
        toast({ 
          title: t('حدث خطأ أثناء الأرشفة', 'Error archiving invoice'),
          variant: 'destructive'
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <DialogHeader className={lang === 'ar' ? 'text-right' : 'text-left'}>
          <DialogTitle className="text-destructive flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            {t('أرشفة الفاتورة', 'Archive Invoice')}
          </DialogTitle>
        </DialogHeader>
        <div className="py-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('هل أنت متأكد من أرشفة الفاتورة رقم', 'Are you sure you want to archive invoice #')} <strong className="text-foreground">{invoice?.invoiceNumber}</strong>؟
            <br /><br />
            {t('سيتم إزالتها من القائمة النشطة، ولكن سيتم الاحتفاظ بها في السجل المحاسبي ولن يتم حذفها نهائياً لضمان سلامة الدفاتر.', 'It will be removed from the active list but will be preserved in the accounting history and not permanently deleted, ensuring book integrity.')}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>{t('إلغاء', 'Cancel')}</Button>
          <Button variant="destructive" onClick={handleArchive} disabled={mutation.isPending}>
            {mutation.isPending ? t('جاري الأرشفة...', 'Archiving...') : t('تأكيد الأرشفة', 'Confirm Archive')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: AdminInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useAdminCreateReceivablePayment();
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('bank_transfer');
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && invoice) {
      setAmount(invoice.outstandingAmount.toFixed(2));
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setReference('');
      setPaymentMethod('bank_transfer');
      setPaymentKey(crypto.randomUUID());
      setError(null);
    }
  }, [open, invoice]);

  const submit = () => {
    if (!invoice) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > invoice.outstandingAmount) {
      setError(t('أدخل مبلغاً موجباً لا يتجاوز الرصيد المستحق', 'Enter a positive amount that does not exceed the outstanding balance'));
      return;
    }
    mutation.mutate({
      id: invoice.id,
      data: { paymentKey, paymentDate, amount: numericAmount, paymentMethod, reference: reference.trim() || null },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListInvoicesQueryKey() });
        toast({ title: t('تم تسجيل الدفعة', 'Payment recorded') });
        onOpenChange(false);
      },
      onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : t('تعذر تسجيل الدفعة', 'Unable to record payment')),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <DialogHeader className={lang === 'ar' ? 'text-right' : 'text-left'}>
          <DialogTitle>{t('تسجيل دفعة', 'Record payment')} · {invoice?.invoiceNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-sm text-muted-foreground">{t('الرصيد المستحق', 'Outstanding balance')}</p>
            <p className="text-2xl font-bold">{invoice && <Money value={invoice.outstandingAmount} lang={lang} fractionDigits={2} />}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="receivable-amount">{t('المبلغ', 'Amount')}</Label>
            <Input id="receivable-amount" type="number" min="0.01" step="0.01" max={invoice?.outstandingAmount} value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receivable-date">{t('تاريخ الدفعة', 'Payment date')}</Label>
            <Input id="receivable-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receivable-reference">{t('المرجع', 'Reference')}</Label>
            <Input id="receivable-reference" maxLength={200} placeholder={t('رقم التحويل أو الإيصال', 'Transfer or receipt number')} value={reference} onChange={(event) => setReference(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('طريقة التحصيل', 'Collection method')}</Label>
            <Select value={paymentMethod} onValueChange={(value: 'cash' | 'bank_transfer') => setPaymentMethod(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">{t('تحويل بنكي', 'Bank transfer')}</SelectItem>
                <SelectItem value="cash">{t('نقدي', 'Cash')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel')}</Button>
          <Button onClick={submit} disabled={mutation.isPending || !paymentDate}>{mutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('تسجيل الدفعة', 'Record payment')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceList({ channel = 'companies' }: { channel?: 'companies' | 'online' }) {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [receivableStatus, setReceivableStatus] = useState<'all' | 'open' | 'overdue' | 'paid'>('all');
  
  // Dialog States
  const [previewInvoice, setPreviewInvoice] = useState<AdminInvoice | null>(null);
  const [printOnPreviewOpen, setPrintOnPreviewOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<AdminInvoice | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<AdminInvoice | null>(null);
  const [emailInvoice, setEmailInvoice] = useState<AdminInvoice | null>(null);
  const [archiveInvoice, setArchiveInvoice] = useState<AdminInvoice | null>(null);
  
  const { data: currentUser } = useGetAdminMe();

  const { data: invoices, isLoading, isError } = useAdminListInvoices({
    search: search || undefined,
    channel,
    receivableStatus,
  });
  
  const totals = (invoices ?? []).reduce((summary, invoice) => ({
    billed: summary.billed + invoice.totalAmount,
    paid: summary.paid + invoice.paidAmount,
    outstanding: summary.outstanding + invoice.outstandingAmount,
  }), { billed: 0, paid: 0, outstanding: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{channel === 'online' ? t('فواتير الأفراد', 'Individual Invoices') : t('فواتير الشركات', 'Company Invoices')}</h1>
          <p className="text-muted-foreground mt-1">{channel === 'online'
            ? t('عرض فواتير الطلبات المدفوعة عبر الموقع الإلكتروني فقط', 'Online order invoices only')
            : t('إدارة فواتير الشركات والموزعين فقط', 'Manage distributor invoices only')}</p>
        </div>
        {channel === 'companies' && hasPermission(currentUser, 'invoices', 'edit') && <CreateDistributorInvoiceDialog />}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground font-medium flex items-center gap-2"><Banknote className="h-4 w-4" /> {t('إجمالي الفواتير', 'Total billed')}</p>
          <p className="mt-2 text-2xl font-bold"><Money value={totals.billed} lang={lang} fractionDigits={2} /></p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground font-medium flex items-center gap-2"><Banknote className="h-4 w-4 text-emerald-600" /> {t('المحصل', 'Collected')}</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600"><Money value={totals.paid} lang={lang} fractionDigits={2} /></p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground font-medium flex items-center gap-2"><AlertCircle className="h-4 w-4 text-destructive" /> {t('الرصيد المستحق', 'Outstanding')}</p>
          <p className="mt-2 text-2xl font-bold text-destructive"><Money value={totals.outstanding} lang={lang} fractionDigits={2} /></p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input 
            placeholder={t('بحث برقم الفاتورة أو الطلب أو الموزع...', 'Search by invoice, order, or distributor...')}
            className="pl-9 rtl:pr-9 rtl:pl-3" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={receivableStatus} onValueChange={(value: 'all' | 'open' | 'overdue' | 'paid') => setReceivableStatus(value)}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('كل الفواتير', 'All invoices')}</SelectItem>
            <SelectItem value="open">{t('أرصدة مفتوحة', 'Open balances')}</SelectItem>
            <SelectItem value="overdue">{t('متأخرة السداد', 'Overdue')}</SelectItem>
            <SelectItem value="paid">{t('مسددة', 'Paid')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-md border bg-card shadow-sm">
        <Table className="min-w-[980px]">
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>{t('رقم الفاتورة', 'Invoice #')}</TableHead>
              <TableHead>{t('رقم الطلب', 'Order ID')}</TableHead>
              <TableHead>{channel === 'online' ? t('المشتري', 'Buyer') : t('الموزع', 'Distributor')}</TableHead>
              <TableHead>{t('الاستحقاق', 'Due date')}</TableHead>
              <TableHead className="text-end font-bold">{t('الإجمالي', 'Total')}</TableHead>
              <TableHead className="text-end">{t('المدفوع', 'Paid')}</TableHead>
              <TableHead className="text-end">{t('المستحق', 'Outstanding')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead className="w-[80px] text-center">{t('الإجراءات', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : isError ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-destructive">{t('حدث خطأ أثناء تحميل الفواتير', 'Error loading invoices')}</TableCell></TableRow>
            ) : invoices?.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">{t('لا توجد فواتير مطابقة', 'No invoices found')}</TableCell></TableRow>
            ) : (
              invoices?.map((invoice) => (
                <TableRow key={invoice.id} data-testid={`invoice-row-${invoice.id}`} className="group hover:bg-muted/10 transition-colors">
                  <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                  <TableCell>{invoice.orderNumber ?? <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell>{channel === 'online' ? (invoice.buyerName ?? '-') : (
                    <div>
                      <span>{invoice.distributorName ?? <span className="text-muted-foreground">-</span>}</span>
                      {invoice.contractId && <span className="mt-1 block text-xs text-muted-foreground">{invoice.contractNumber}{invoice.contractType ? ` · ${invoice.contractType}` : ''}</span>}
                    </div>
                  )}</TableCell>
                  <TableCell className={invoice.dueDate && invoice.outstandingAmount > 0 && invoice.dueDate < new Date().toISOString().slice(0, 10) ? 'font-semibold text-destructive' : ''}>{invoice.dueDate ?? '-'}</TableCell>
                  <TableCell className="text-end font-semibold text-primary"><Money value={invoice.totalAmount} lang={lang} fractionDigits={2} /></TableCell>
                  <TableCell className="text-end text-emerald-600"><Money value={invoice.paidAmount} lang={lang} fractionDigits={2} /></TableCell>
                  <TableCell className="text-end font-semibold"><Money value={invoice.outstandingAmount} lang={lang} fractionDigits={2} /></TableCell>
                  <TableCell><Badge variant={invoice.paymentStatus === 'paid' ? 'secondary' : invoice.paymentStatus === 'partial' ? 'default' : 'outline'}>{invoice.paymentStatus === 'paid' ? t('مسددة', 'Paid') : invoice.paymentStatus === 'partial' ? t('جزئية', 'Partial') : t('غير مسددة', 'Unpaid')}</Badge></TableCell>
                  <TableCell className="text-center whitespace-nowrap">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button data-testid={`invoice-actions-${invoice.id}`} variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => {
                          setPrintOnPreviewOpen(false);
                          setPreviewInvoice(invoice);
                        }}>
                          <Eye className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
                          {t('معاينة الفاتورة', 'Preview Invoice')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setPrintOnPreviewOpen(true);
                          setPreviewInvoice(invoice);
                        }}>
                          <Printer className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
                          {t('طباعة', 'Print')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEmailInvoice(invoice)}>
                          <Mail className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
                          {t('إرسال بالبريد', 'Email Invoice')}
                        </DropdownMenuItem>
                        
                        {hasPermission(currentUser, 'invoices', 'edit') && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setEditInvoice(invoice)}>
                              <Pen className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
                              {t('تعديل البيانات', 'Edit Details')}
                            </DropdownMenuItem>
                            {invoice.outstandingAmount > 0 && (
                              <DropdownMenuItem onClick={() => setPaymentInvoice(invoice)}>
                                <Banknote className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
                                {t('تسجيل دفعة', 'Record Payment')}
                              </DropdownMenuItem>
                            )}
                          </>
                        )}

                        {hasPermission(currentUser, 'invoices', 'delete') && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => setArchiveInvoice(invoice)}>
                              <Archive className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
                               {t('حذف من القائمة (أرشفة)', 'Remove from list (archive)')}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <InvoicePreviewDialog
        invoice={previewInvoice}
        open={!!previewInvoice}
        printOnReady={printOnPreviewOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewInvoice(null);
            setPrintOnPreviewOpen(false);
          }
        }}
      />
      <EditInvoiceDialog invoice={editInvoice} open={!!editInvoice} onOpenChange={(open) => !open && setEditInvoice(null)} />
      <EmailInvoiceDialog invoice={emailInvoice} open={!!emailInvoice} onOpenChange={(open) => !open && setEmailInvoice(null)} />
      <RecordPaymentDialog invoice={paymentInvoice} open={!!paymentInvoice} onOpenChange={(open) => !open && setPaymentInvoice(null)} />
      <ArchiveInvoiceDialog invoice={archiveInvoice} open={!!archiveInvoice} onOpenChange={(open) => !open && setArchiveInvoice(null)} />
    </div>
  );
}

export default function AdminInvoices() {
  return <InvoiceList channel="companies" />;
}

export function AdminOnlineInvoices() {
  return <InvoiceList channel="online" />;
}

export function AdminExhibitionInvoices() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<AdminInvoice | null>(null);
  const [print, setPrint] = useState(false);
  const { data: user } = useGetAdminMe();
  const { data: invoices, isLoading, isError } = useAdminListInvoices({ channel: 'exhibitions', search: search || undefined });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold tracking-tight">{t('فواتير المعارض', 'Exhibition Invoices')}</h1>
          <p className="text-muted-foreground mt-1">{t('إصدار وعرض مبيعات المعارض', 'Issue and view exhibition sales')}</p></div>
        {hasPermission(user, 'invoices', 'edit') && <CreateExhibitionInvoiceDialog />}
      </div>
      <div className="relative max-w-md"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="ps-9" aria-label={t('بحث الفواتير', 'Search invoices')} placeholder={t('ابحث برقم الفاتورة أو المعرض أو المشتري', 'Search by invoice, exhibition or buyer')} value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div className="overflow-x-auto rounded-md border bg-card shadow-sm">
        <Table className="min-w-[700px]">
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>{t('رقم الفاتورة', 'Invoice #')}</TableHead>
              <TableHead>{t('المعرض', 'Exhibition')}</TableHead>
              <TableHead>{t('التاريخ', 'Date')}</TableHead>
              <TableHead>{t('المشتري', 'Buyer')}</TableHead>
              <TableHead>{t('الإجمالي', 'Total')}</TableHead>
              <TableHead className="w-[80px] text-center">{t('إجراءات', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6} className="py-12 text-center">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow> :
              isError ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-destructive">{t('تعذر تحميل الفواتير', 'Could not load invoices')}</TableCell></TableRow> :
              !invoices?.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">{t('لا توجد فواتير مطابقة', 'No invoices found')}</TableCell></TableRow> :
              invoices.map(invoice => <TableRow key={invoice.id} data-testid={`exhibition-invoice-${invoice.id}`}>
                <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                <TableCell>{invoice.exhibitionName}</TableCell>
                <TableCell>{invoice.issueDatetime.slice(0, 10)}</TableCell>
                <TableCell>{invoice.buyerName}</TableCell>
                <TableCell><Money value={invoice.totalAmount} lang={lang} fractionDigits={2} /></TableCell>
                <TableCell><div className="flex justify-center gap-1">
                  <Button size="icon" variant="ghost" aria-label={t('معاينة الفاتورة', 'Preview invoice')} onClick={() => { setPrint(false); setPreview(invoice); }}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={t('طباعة الفاتورة', 'Print invoice')} onClick={() => { setPrint(true); setPreview(invoice); }}><Printer className="h-4 w-4" /></Button>
                </div></TableCell>
              </TableRow>)}
          </TableBody>
        </Table>
      </div>
      <InvoicePreviewDialog invoice={preview} open={!!preview} printOnReady={print} onOpenChange={open => { if (!open) { setPreview(null); setPrint(false); } }} />
    </div>
  );
}
