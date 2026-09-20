import { useState, useEffect } from 'react';
import { 
  useAdminListInvoices, 
  useAdminGetInvoiceQr,
  useAdminCreateReceivablePayment,
  useGetAdminMe,
  getAdminGetInvoiceQrQueryKey,
  getAdminListInvoicesQueryKey,
  type AdminInvoice 
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, QrCode, Printer, AlertCircle, Banknote } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { hasPermission } from '@/lib/permissions';
import { CreateDistributorInvoiceDialog } from '@/components/admin/create-distributor-invoice-dialog';
import { useToast } from '@/hooks/use-toast';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function InvoiceQrDialog({ 
  invoice, 
  open, 
  onOpenChange 
}: { 
  invoice: AdminInvoice | null; 
  open: boolean; 
  onOpenChange: (o: boolean) => void 
}) {
  const { t, lang } = useLanguage();
  
  const { data: qrBlob, isLoading, isError } = useAdminGetInvoiceQr(
    invoice?.id as number,
    { 
      query: { 
        enabled: !!invoice, 
        queryKey: invoice ? getAdminGetInvoiceQrQueryKey(invoice.id) : ['invoice-qr-null']
      }
    }
  );

  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!qrBlob || !(qrBlob instanceof Blob)) return undefined;
    const url = URL.createObjectURL(qrBlob);
    setQrUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [qrBlob]);

  const handlePrint = () => {
    if (qrUrl && invoice) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">
            <head>
              <title>${t('فاتورة ضريبية مبسطة', 'Simplified Tax Invoice')}</title>
              <style>
                body { font-family: 'Tajawal', 'Open Sans', sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; text-align: center; }
                h1 { font-size: 1.2rem; margin-bottom: 5px; }
                p { margin: 5px 0; font-size: 0.9rem; }
                .divider { border-top: 1px dashed #ccc; margin: 15px 0; }
                .row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 5px; font-size: 0.9rem; }
                table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: .8rem; }
                th, td { border-bottom: 1px solid #ddd; padding: 6px 3px; text-align: start; }
                .buyer { text-align: start; background: #f7f7f7; padding: 10px; border-radius: 6px; }
                img { max-width: 200px; height: auto; margin-top: 15px; }
                @media print {
                  body { max-width: 100%; padding: 0; }
                }
              </style>
            </head>
            <body>
              <h1>${t('فاتورة ضريبية مبسطة', 'Simplified Tax Invoice')}</h1>
              <p>${escapeHtml(invoice.sellerName)}</p>
              <p>${t('الرقم الضريبي', 'VAT Number')}: ${escapeHtml(invoice.sellerVatNumber)}</p>
              <div class="divider"></div>
              <div class="row">
                <span>${t('رقم الفاتورة', 'Invoice #')}</span>
                <span>${escapeHtml(invoice.invoiceNumber)}</span>
              </div>
              <div class="row">
                <span>${t('التاريخ', 'Date')}</span>
                <span>${format(new Date(invoice.issueDatetime), 'yyyy-MM-dd HH:mm')}</span>
              </div>
              ${invoice.buyerName ? `
                <div class="divider"></div>
                <div class="buyer">
                  <strong>${t('بيانات المشتري', 'Buyer Details')}</strong>
                  <p>${escapeHtml(invoice.buyerName)}</p>
                  ${invoice.buyerTaxNumber ? `<p>${t('الرقم الضريبي', 'VAT Number')}: ${escapeHtml(invoice.buyerTaxNumber)}</p>` : ''}
                  ${invoice.buyerCommercialRegistrationNumber ? `<p>${t('السجل التجاري', 'Commercial Registration')}: ${escapeHtml(invoice.buyerCommercialRegistrationNumber)}</p>` : ''}
                  ${invoice.buyerAddress ? `<p>${t('العنوان', 'Address')}: ${escapeHtml(invoice.buyerAddress)}</p>` : ''}
                </div>
              ` : ''}
              ${invoice.items.length ? `
                <table>
                  <thead><tr><th>${t('المنتج', 'Product')}</th><th>${t('الكمية', 'Qty')}</th><th>${t('السعر', 'Price')}</th><th>${t('الإجمالي', 'Total')}</th></tr></thead>
                  <tbody>${invoice.items.map((item) => `<tr><td>${escapeHtml(item.productName)}</td><td>${item.quantity}</td><td>${item.unitPrice.toFixed(2)}</td><td>${item.totalAmount.toFixed(2)}</td></tr>`).join('')}</tbody>
                </table>
              ` : ''}
              <div class="divider"></div>
              <div class="row">
                <span>${t('المجموع الفرعي', 'Subtotal')}</span>
                <span>${invoice.subtotal.toFixed(2)}</span>
              </div>
              <div class="row">
                <span>${t('ضريبة القيمة المضافة', 'VAT')}</span>
                <span>${invoice.vatAmount.toFixed(2)}</span>
              </div>
              <div class="row" style="font-weight: bold; font-size: 1.1rem; margin-top: 10px;">
                <span>${t('الإجمالي', 'Total')}</span>
                <span>${invoice.totalAmount.toFixed(2)}</span>
              </div>
              <div class="divider"></div>
              <img src="${qrUrl}" onload="setTimeout(() => { window.print(); window.close(); }, 200);" />
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            {t('رمز الاستجابة السريعة (QR)', 'QR Code')}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-4 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">{t('جاري التحميل...', 'Loading...')}</p>
            </div>
          ) : isError ? (
            <div className="text-destructive flex flex-col items-center space-y-2">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm font-medium">{t('حدث خطأ أثناء جلب رمز QR', 'Error fetching QR code')}</p>
            </div>
          ) : qrUrl ? (
            <>
              <div className="bg-white p-3 rounded-lg shadow-sm border w-48 h-48 flex items-center justify-center">
                <img src={qrUrl} alt="ZATCA QR Code" className="w-full h-full object-contain" />
              </div>
              <Button onClick={handlePrint} className="w-full gap-2" variant="default">
                <Printer className="h-4 w-4" />
                {t('طباعة الفاتورة', 'Print Invoice')}
              </Button>
            </>
          ) : null}
        </div>
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
            <p className="text-2xl font-bold">{invoice?.outstandingAmount.toFixed(2)}</p>
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
          <Button onClick={submit} disabled={mutation.isPending || !paymentDate}>{mutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('تسجيل الدفعة', 'Record payment')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminInvoices() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [receivableStatus, setReceivableStatus] = useState<'all' | 'open' | 'overdue' | 'paid'>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<AdminInvoice | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<AdminInvoice | null>(null);
  const { data: currentUser } = useGetAdminMe();

  const { data: invoices, isLoading, isError } = useAdminListInvoices({
    search: search || undefined,
    channel: 'companies',
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
          <h1 className="text-3xl font-bold tracking-tight">{t('مبيعات الشركات', 'Company Sales')}</h1>
          <p className="text-muted-foreground mt-1">{t('فواتير البيع المرتبطة بالشركات والموزعين', 'Sales invoices linked to companies and distributors')}</p>
        </div>
        {hasPermission(currentUser, 'invoices', 'edit') && <CreateDistributorInvoiceDialog />}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">{t('إجمالي الفواتير', 'Total billed')}</p><p className="mt-1 text-2xl font-bold">{totals.billed.toFixed(2)}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">{t('المحصل', 'Collected')}</p><p className="mt-1 text-2xl font-bold text-emerald-600">{totals.paid.toFixed(2)}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">{t('الرصيد المستحق', 'Outstanding')}</p><p className="mt-1 text-2xl font-bold text-amber-600">{totals.outstanding.toFixed(2)}</p></div>
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

      <div className="border rounded-md bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>{t('رقم الفاتورة', 'Invoice #')}</TableHead>
              <TableHead>{t('رقم الطلب', 'Order ID')}</TableHead>
              <TableHead>{t('الموزع', 'Distributor')}</TableHead>
              <TableHead>{t('الاستحقاق', 'Due date')}</TableHead>
              <TableHead className="text-end font-bold">{t('الإجمالي', 'Total')}</TableHead>
              <TableHead className="text-end">{t('المدفوع', 'Paid')}</TableHead>
              <TableHead className="text-end">{t('المستحق', 'Outstanding')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead className="w-[120px] text-center">{t('إجراءات', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : isError ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-destructive">{t('حدث خطأ أثناء تحميل الفواتير', 'Error loading invoices')}</TableCell></TableRow>
            ) : invoices?.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">{t('لا توجد فواتير مطابقة', 'No invoices found')}</TableCell></TableRow>
            ) : (
              invoices?.map((invoice) => (
                <TableRow key={invoice.id} className="group hover:bg-muted/10 transition-colors">
                  <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                  <TableCell>{invoice.orderNumber ?? <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell>{invoice.distributorName ?? <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className={invoice.dueDate && invoice.outstandingAmount > 0 && invoice.dueDate < new Date().toISOString().slice(0, 10) ? 'font-semibold text-destructive' : ''}>{invoice.dueDate ?? '-'}</TableCell>
                  <TableCell className="text-end font-semibold text-primary">{invoice.totalAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-end text-emerald-600">{invoice.paidAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-end font-semibold">{invoice.outstandingAmount.toFixed(2)}</TableCell>
                  <TableCell><Badge variant={invoice.paymentStatus === 'paid' ? 'secondary' : invoice.paymentStatus === 'partial' ? 'default' : 'outline'}>{invoice.paymentStatus === 'paid' ? t('مسددة', 'Paid') : invoice.paymentStatus === 'partial' ? t('جزئية', 'Partial') : t('غير مسددة', 'Unpaid')}</Badge></TableCell>
                  <TableCell className="text-center whitespace-nowrap">
                    {hasPermission(currentUser, 'invoices', 'edit') && invoice.outstandingAmount > 0 && (
                      <Button variant="ghost" size="icon" onClick={() => setPaymentInvoice(invoice)} title={t('تسجيل دفعة', 'Record payment')}><Banknote className="h-4 w-4" /></Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="hover:text-primary hover:bg-primary/10"
                      onClick={() => setSelectedInvoice(invoice)} 
                      title={t('عرض الفاتورة / QR', 'View Invoice / QR')}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <InvoiceQrDialog 
        invoice={selectedInvoice} 
        open={!!selectedInvoice} 
        onOpenChange={(open) => !open && setSelectedInvoice(null)} 
      />
      <RecordPaymentDialog invoice={paymentInvoice} open={!!paymentInvoice} onOpenChange={(open) => !open && setPaymentInvoice(null)} />
    </div>
  );
}
