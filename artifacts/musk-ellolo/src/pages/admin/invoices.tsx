import { useState, useEffect } from 'react';
import { 
  useAdminListInvoices, 
  useAdminGetInvoiceQr,
  getAdminGetInvoiceQrQueryKey,
  type AdminInvoice 
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, QrCode, Printer, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';

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
                .row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.9rem; }
                img { max-width: 200px; height: auto; margin-top: 15px; }
                @media print {
                  body { max-width: 100%; padding: 0; }
                }
              </style>
            </head>
            <body>
              <h1>${t('فاتورة ضريبية مبسطة', 'Simplified Tax Invoice')}</h1>
              <p>${invoice.sellerName}</p>
              <p>${t('الرقم الضريبي', 'VAT Number')}: ${invoice.sellerVatNumber}</p>
              <div class="divider"></div>
              <div class="row">
                <span>${t('رقم الفاتورة', 'Invoice #')}</span>
                <span>${invoice.invoiceNumber}</span>
              </div>
              <div class="row">
                <span>${t('التاريخ', 'Date')}</span>
                <span>${format(new Date(invoice.issueDatetime), 'yyyy-MM-dd HH:mm')}</span>
              </div>
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

export default function AdminInvoices() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<AdminInvoice | null>(null);

  const { data: invoices, isLoading, isError } = useAdminListInvoices({ search: search || undefined });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('الفواتير الضريبية', 'Tax Invoices')}</h1>
          <p className="text-muted-foreground mt-1">{t('سجل الفواتير الضريبية المبسطة ZATCA', 'ZATCA Simplified Tax Invoices log')}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input 
            placeholder={t('بحث برقم الفاتورة أو الطلب...', 'Search by invoice or order number...')} 
            className="pl-9 rtl:pr-9 rtl:pl-3" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-md bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>{t('رقم الفاتورة', 'Invoice #')}</TableHead>
              <TableHead>{t('رقم الطلب', 'Order ID')}</TableHead>
              <TableHead>{t('التاريخ', 'Date')}</TableHead>
              <TableHead className="text-end">{t('المبلغ غير شامل الضريبة', 'Subtotal')}</TableHead>
              <TableHead className="text-end">{t('الضريبة', 'VAT')}</TableHead>
              <TableHead className="text-end font-bold">{t('الإجمالي', 'Total')}</TableHead>
              <TableHead className="w-[100px] text-center">{t('إجراءات', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : isError ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-destructive">{t('حدث خطأ أثناء تحميل الفواتير', 'Error loading invoices')}</TableCell></TableRow>
            ) : invoices?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">{t('لا توجد فواتير مطابقة', 'No invoices found')}</TableCell></TableRow>
            ) : (
              invoices?.map((invoice) => (
                <TableRow key={invoice.id} className="group hover:bg-muted/10 transition-colors">
                  <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                  <TableCell>{invoice.orderNumber ?? <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell>{format(new Date(invoice.issueDatetime), 'yyyy-MM-dd HH:mm')}</TableCell>
                  <TableCell className="text-end">{invoice.subtotal.toFixed(2)}</TableCell>
                  <TableCell className="text-end">{invoice.vatAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-end font-semibold text-primary">{invoice.totalAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-center">
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
    </div>
  );
}
