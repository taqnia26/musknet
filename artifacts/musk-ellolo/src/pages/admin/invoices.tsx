import { useState, useEffect, useRef } from 'react';
import { formatInvoiceNumber } from '@workspace/invoice-document/core';
import { 
  useAdminListInvoices, 
  useAdminGetInvoiceQr,
  useAdminCreateReceivablePayment,
  useAdminUpdateInvoice,
  useAdminArchiveInvoice,
  useAdminCancelCompanyInvoice,
  useAdminListInvoiceEmailDeliveries,
  useAdminSendInvoiceEmail,
  adminDownloadInvoicePdf,
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
  Search, Printer, AlertCircle, Banknote,
  MoreHorizontal, Eye, Pen, Mail, Archive 
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { hasPermission } from '@/lib/permissions';
import { CreateCompanyInvoiceDialog } from '@/components/admin/create-company-invoice-dialog';
import { CreateIndividualInvoiceDialog } from '@/components/admin/create-individual-invoice-dialog';
import { CreateExhibitionInvoiceDialog } from '@/components/admin/create-exhibition-invoice-dialog';
import { useToast } from '@/hooks/use-toast';
import { formatRiyadhBusinessDate } from '@/lib/riyadh-business-date';
import { SharedInvoicePreview } from '@/components/admin/shared-invoice-preview';

export function InvoicePreviewDialog({ 
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
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const documentRef = useRef<HTMLIFrameElement>(null);
  const [documentReady, setDocumentReady] = useState(false);
  const printDocument = () => {
    if (documentReady) documentRef.current?.contentWindow?.print();
  };
  
  const { data: qrBlob } = useAdminGetInvoiceQr(
    invoice?.id ?? 0,
    { 
      query: { 
        enabled: !!invoice && invoice.historical !== 'yes' && !invoice.cancelledAt,
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
    setDocumentReady(false);
  }, [invoice?.id, open, printOnReady]);

  useEffect(() => {
    if (!qrBlob || !(qrBlob instanceof Blob)) {setQrUrl(null);return undefined;}
    const url = URL.createObjectURL(qrBlob);
    setQrUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [qrBlob,invoice?.id]);

  useEffect(() => {
    if (!open || !printOnReady || !documentReady || (invoice?.historical !== 'yes' && !invoice?.cancelledAt && !qrReady) || hasPrinted.current) return;
    hasPrinted.current = true;
    const timer = window.setTimeout(() => documentRef.current?.contentWindow?.print(), 0);
    return () => window.clearTimeout(timer);
  }, [open, printOnReady, qrReady, documentReady, invoice?.historical, invoice?.cancelledAt]);

  const downloadPdf = async () => {
    if (!invoice || invoice.cancelledAt || downloading) return;
    setDownloading(true);
    try {
      const pdf = await adminDownloadInvoicePdf(invoice.id, lang);
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${formatInvoiceNumber(invoice.invoiceNumber).replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast({ title: t('تعذر تنزيل الفاتورة', 'Could not download invoice'), variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-muted/20 border-none shadow-2xl sm:max-h-[90vh] flex flex-col">
         <div className="print-hide flex justify-between items-center p-4 pe-14 bg-background border-b shrink-0">
          <DialogTitle className="text-lg font-bold">{t('معاينة الفاتورة', 'Invoice Preview')} - {formatInvoiceNumber(invoice?.invoiceNumber)}</DialogTitle>
          <div className="flex gap-2">
             <Button onClick={downloadPdf} variant="outline" size="sm" disabled={downloading || !invoice || !!invoice.cancelledAt}>
               {downloading ? t('جارٍ التنزيل...', 'Downloading...') : t('تنزيل PDF', 'Download PDF')}
             </Button>
            <Button onClick={printDocument} disabled={!documentReady||(invoice?.historical!=='yes'&&!invoice?.cancelledAt&&!qrReady)} variant="outline" size="sm" className="gap-2">
              <Printer className="w-4 h-4" />
              {t('طباعة', 'Print')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>{t('إغلاق', 'Close')}</Button>
          </div>
        </div>
        <div className="p-4 sm:p-8 overflow-y-auto flex-1 print:p-0 print:overflow-visible print:block">
          {invoice && <SharedInvoicePreview invoice={invoice} qrUrl={qrUrl} documentRef={documentRef} onReady={(ready) => {
            setDocumentReady(ready);
            setQrReady(ready&&!!qrUrl);
          }} />}
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
    invoice?.id ?? 0,
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
    mutation.mutate({ id: invoice.id, data: { recipient: email.trim(), language: lang } }, {
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
            {t('هل أنت متأكد من أرشفة الفاتورة رقم', 'Are you sure you want to archive invoice #')} <strong className="text-foreground">{formatInvoiceNumber(invoice?.invoiceNumber)}</strong>؟
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

function CancelCompanyInvoiceDialog({ invoice, onClose }: { invoice: AdminInvoice | null; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useAdminCancelCompanyInvoice();
  const submitting = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); }, [invoice?.id]);
  const close = () => { if (!submitting.current) onClose(); };
  return <Dialog open={!!invoice} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent dir={lang === 'ar' ? 'rtl' : 'ltr'} showCloseButton={false} aria-busy={mutation.isPending}
      onEscapeKeyDown={e => { if (submitting.current) e.preventDefault(); }}
      onInteractOutside={e => { if (submitting.current) e.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>{t('هل تريد إلغاء الفاتورة؟', 'Do you want to cancel the invoice?')}</DialogTitle>
        <DialogDescription><bdi>{formatInvoiceNumber(invoice?.invoiceNumber)}</bdi> — {t('ستُعكس القيود والمخزون وتُؤرشف الفاتورة تلقائياً، دون حذف أصلها أو رد أموال.', 'Accounting and inventory will be reversed and the invoice automatically archived, without deleting the original or refunding money.')}</DialogDescription>
      </DialogHeader>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={mutation.isPending} onClick={close}>{t('تراجع', 'Back')}</Button>
        <Button variant="destructive" disabled={mutation.isPending} onClick={() => {
          if (!invoice || submitting.current) return;
          submitting.current = true;
          setError('');
          mutation.mutate({ id: invoice.id, data: { reason: 'إلغاء الفاتورة بتأكيد المستخدم من لوحة الإدارة' } }, {
            onSuccess: () => { void queryClient.invalidateQueries(); toast({ title: t('أُلغيت الفاتورة وأُرشفت', 'Invoice cancelled and archived') }); onClose(); },
            onError: e => setError(e instanceof Error ? e.message : t('تعذر الإلغاء', 'Cancellation failed')),
            onSettled: () => { submitting.current = false; },
          });
        }}>{t('تأكيد', 'Confirm')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
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
          <DialogTitle>{t('تسجيل دفعة', 'Record payment')} · {formatInvoiceNumber(invoice?.invoiceNumber)}</DialogTitle>
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
  const [cancelInvoice, setCancelInvoice] = useState<AdminInvoice | null>(null);
  
  const { data: currentUser } = useGetAdminMe();

  const { data: invoices, isLoading, isError } = useAdminListInvoices({
    search: search || undefined,
    channel,
    receivableStatus,
  });
  
  const totals = (invoices ?? []).reduce((summary, invoice) => ({
    billed: summary.billed + (invoice.cancelledAt ? 0 : invoice.totalAmount),
    paid: summary.paid + invoice.paidAmount,
    outstanding: summary.outstanding + invoice.outstandingAmount,
  }), { billed: 0, paid: 0, outstanding: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{channel === 'online' ? t('فواتير الأفراد', 'Individual Invoices') : t('فواتير الشركات', 'Company Invoices')}</h1>
          <p className="text-muted-foreground mt-1">{channel === 'online'
            ? t('الفواتير المباشرة اليدوية وفواتير طلبات الموقع المدفوعة', 'Manual direct invoices and paid website invoices')
            : t('إدارة فواتير الشركات والموزعين فقط', 'Manage distributor invoices only')}</p>
        </div>
        {channel === 'companies' && hasPermission(currentUser, 'invoices', 'edit') && <CreateCompanyInvoiceDialog />}
        {channel === 'online' && hasPermission(currentUser, 'invoices', 'edit') && <CreateIndividualInvoiceDialog onCreated={invoice => { setSearch(''); setReceivableStatus('all'); setPrintOnPreviewOpen(false); setPreviewInvoice(invoice); }} />}
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
                  <TableCell className="font-medium">
                    {formatInvoiceNumber(invoice.invoiceNumber)}
                    {invoice.cancelledAt && <span className="block text-xs text-destructive">{t('ملغاة', 'Cancelled')} · {invoice.cancellationReason} · {invoice.cancelledByName ?? `#${invoice.cancelledByAdminId}`} · {format(new Date(invoice.cancelledAt), 'yyyy-MM-dd HH:mm')}</span>}
                    {invoice.historical === 'yes' && <>
                      <Badge variant="outline" className="ms-2">{t('تسجيل سابق', 'Prior record')}</Badge>
                      {invoice.originalInvoiceNumber && <span className="mt-1 block text-xs font-normal text-muted-foreground">{t('رقم الفاتورة الأصلية', 'Original invoice')}: {invoice.originalInvoiceNumber}</span>}
                    </>}
                  </TableCell>
                  <TableCell>{invoice.orderNumber ?? <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell>{channel === 'online' ? (invoice.buyerName ?? '-') : (
                    <div>
                      <span>{invoice.distributorName ?? <span className="text-muted-foreground">-</span>}</span>
                      {(invoice.contractId || invoice.uploadedContractFileId) && <span className="mt-1 block text-xs text-muted-foreground">{invoice.contractNumber || (invoice.uploadedContractFileId ? t(`ملف عقد #${invoice.uploadedContractFileId}`, `Contract file #${invoice.uploadedContractFileId}`) : '-')}{invoice.contractType ? ` · ${invoice.contractType}` : ''}</span>}
                    </div>
                  )}</TableCell>
                  <TableCell className={invoice.dueDate && invoice.outstandingAmount > 0 && invoice.dueDate < new Date().toISOString().slice(0, 10) ? 'font-semibold text-destructive' : ''}>{invoice.dueDate ?? '-'}</TableCell>
                  <TableCell className="text-end font-semibold text-primary"><Money value={invoice.totalAmount} lang={lang} fractionDigits={2} /></TableCell>
                  <TableCell className="text-end text-emerald-600"><Money value={invoice.paidAmount} lang={lang} fractionDigits={2} /></TableCell>
                  <TableCell className="text-end font-semibold"><Money value={invoice.outstandingAmount} lang={lang} fractionDigits={2} /></TableCell>
                  <TableCell><Badge variant={invoice.cancelledAt ? 'destructive' : invoice.paymentStatus === 'paid' ? 'secondary' : invoice.paymentStatus === 'partial' ? 'default' : 'outline'}>{invoice.cancelledAt ? t('ملغاة', 'Cancelled') : invoice.paymentStatus === 'paid' ? t('مسددة', 'Paid') : invoice.paymentStatus === 'partial' ? t('جزئية', 'Partial') : t('غير مسددة', 'Unpaid')}</Badge></TableCell>
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
                        {!invoice.cancelledAt && <DropdownMenuItem onClick={() => setEmailInvoice(invoice)}>
                          <Mail className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
                          {t('إرسال بالبريد', 'Email Invoice')}
                        </DropdownMenuItem>}
                        
                        {!invoice.cancelledAt && hasPermission(currentUser, 'invoices', 'edit') && (
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
                        {(channel === 'companies' || invoice.individual) && !invoice.cancelledAt && invoice.paidAmount === 0 && hasPermission(currentUser, 'invoices', 'delete') &&
                          <DropdownMenuItem className="text-destructive" onClick={() => setCancelInvoice(invoice)}>{t('إلغاء الفاتورة', 'Cancel invoice')}</DropdownMenuItem>}

                        {(!invoice.distributorId && !invoice.individual || !!invoice.cancelledAt) && hasPermission(currentUser, 'invoices', 'delete') && (
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
      <CancelCompanyInvoiceDialog invoice={cancelInvoice} onClose={() => setCancelInvoice(null)} />
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
                <TableCell className="font-medium">{formatInvoiceNumber(invoice.invoiceNumber)}</TableCell>
                <TableCell>{invoice.exhibitionName}</TableCell>
                <TableCell>{formatRiyadhBusinessDate(invoice.issueDatetime)}</TableCell>
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
