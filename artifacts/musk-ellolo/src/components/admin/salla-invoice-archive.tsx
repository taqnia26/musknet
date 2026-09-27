import { useRef, useState } from 'react';
import {
  getAdminListSallaInvoicesQueryKey,
  useAdminImportSallaInvoices,
  useAdminListSallaInvoices,
  useGetAdminMe,
  type SallaArchivedInvoice,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, MoreHorizontal } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function SallaInvoiceArchive() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { data: user } = useGetAdminMe();
  const [fromDate, setFromDate] = useState('2010-01-01');
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SallaArchivedInvoice | null>(null);
  const stop = useRef(false);
  const importPage = useAdminImportSallaInvoices();
  const archive = useAdminListSallaInvoices({ page, search: search || undefined }, {
    query: { queryKey: getAdminListSallaInvoicesQueryKey({ page, search: search || undefined }), staleTime: 15000, refetchOnMount: 'always' },
  });

  async function startImport() {
    if (!fromDate || !toDate || fromDate > toDate || running) {
      setError(t('اختر فترة صحيحة للاستيراد', 'Choose a valid import date range'));
      return;
    }
    stop.current = false;
    setRunning(true);
    setError('');
    let nextPage: number | null = 1;
    let created = 0;
    let skipped = 0;
    try {
      while (nextPage !== null && !stop.current) {
        const result = await importPage.mutateAsync({ data: { fromDate, toDate, page: nextPage } });
        created += result.imported;
        skipped += result.skipped;
        setProgress(t(
          `الصفحة ${result.page} من ${result.totalPages} · أضيف ${created} · موجود مسبقًا ${skipped}`,
          `Page ${result.page} of ${result.totalPages} · imported ${created} · already present ${skipped}`,
        ));
        await queryClient.invalidateQueries({ queryKey: getAdminListSallaInvoicesQueryKey() });
        nextPage = result.nextPage;
      }
      if (stop.current) setProgress(t('توقف الاستيراد. إعادة التشغيل آمنة ولن تكرر الفواتير.', 'Import stopped. It is safe to restart without duplicating invoices.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('تعذر استيراد هذه الصفحة', 'Could not import this page'));
      setProgress(t(`تم حفظ ${created} فاتورة قبل التوقف. يمكن إعادة المحاولة بأمان.`, `${created} invoices saved before the error. It is safe to retry.`));
    } finally {
      setRunning(false);
    }
  }

  const canImport = hasPermission(user, 'invoices', 'edit') && hasPermission(user, 'integrations', 'edit');
  const money = (amount: number, currency: string) => `${amount.toFixed(2)} ${currency}`;

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6" aria-label={t('أرشيف فواتير سلة', 'Salla invoice archive')}>
      <div>
        <h2 className="text-xl font-semibold">{t('أرشيف فواتير سلة القديمة', 'Historical Salla invoice archive')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('نسخ مرجعية من سلة؛ لا تصدر فاتورة جديدة ولا تغير المخزون أو المحاسبة. ملف PDF الأصلي غير مشمول حاليًا.',
            'Read-only Salla records; no new invoice, stock movement or accounting entry. Original PDFs are not included yet.')}
        </p>
      </div>
      {canImport && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="salla-from">{t('من تاريخ', 'From date')}</Label>
            <Input id="salla-from" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} disabled={running} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="salla-to">{t('إلى تاريخ', 'To date')}</Label>
            <Input id="salla-to" type="date" value={toDate} onChange={e => setToDate(e.target.value)} disabled={running} />
          </div>
          <Button onClick={startImport} disabled={running}>
            {running ? t('جاري الاستيراد...', 'Importing...') : t('استيراد من سلة', 'Import from Salla')}
          </Button>
          {running && <Button variant="outline" onClick={() => { stop.current = true; }}>{t('إيقاف بعد الصفحة الحالية', 'Stop after current page')}</Button>}
        </div>
      )}
      {progress && <p className="text-sm" role="status">{progress}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Input
        className="max-w-sm"
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        maxLength={100}
        placeholder={t('بحث برقم الفاتورة أو طلب سلة', 'Search invoice or Salla order number')}
        aria-label={t('بحث في أرشيف سلة', 'Search Salla archive')}
      />
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('رقم الفاتورة', 'Invoice number')}</TableHead>
              <TableHead>{t('التاريخ', 'Date')}</TableHead>
              <TableHead>{t('نوع المستند', 'Document type')}</TableHead>
              <TableHead>{t('طلب سلة', 'Salla order')}</TableHead>
              <TableHead>{t('الإجمالي الأصلي', 'Original total')}</TableHead>
              <TableHead>{t('إجراءات', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {archive.isLoading && <TableRow><TableCell colSpan={6}>{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>}
            {archive.isError && <TableRow><TableCell colSpan={6} className="text-destructive">{t('تعذر تحميل الأرشيف', 'Could not load the archive')}</TableCell></TableRow>}
            {archive.data?.items.length === 0 && <TableRow><TableCell colSpan={6}>{t('لا توجد فواتير مستوردة', 'No imported invoices')}</TableCell></TableRow>}
            {archive.data?.items.map(invoice => (
              <TableRow key={invoice.id}>
                <TableCell className="font-mono">{invoice.invoiceNumber || invoice.sallaInvoiceId}</TableCell>
                <TableCell>{invoice.issuedOn}</TableCell>
                <TableCell>{invoice.invoiceType}</TableCell>
                <TableCell className="font-mono">{invoice.sallaOrderId}</TableCell>
                <TableCell>{money(invoice.total, invoice.currency)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('إجراءات الفاتورة', 'Invoice actions')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => setSelected(invoice)}><Eye className="me-2 h-4 w-4" />{t('عرض التفاصيل', 'View details')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {archive.data && archive.data.total > archive.data.pageSize && (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('السابق', 'Previous')}</Button>
          <span className="text-sm">{page} / {Math.ceil(archive.data.total / archive.data.pageSize)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(archive.data.total / archive.data.pageSize)} onClick={() => setPage(p => p + 1)}>{t('التالي', 'Next')}</Button>
        </div>
      )}
      <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('فاتورة سلة الأصلية', 'Original Salla invoice')} {selected?.invoiceNumber || selected?.sallaInvoiceId}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <p>{t('رقم الطلب', 'Order')}: {selected.sallaOrderId} · {t('التاريخ', 'Date')}: {selected.issuedOn}</p>
              <p>{t('النوع', 'Type')}: {selected.invoiceType}</p>
              {selected.invoiceReferenceId && <p>{t('مرجع الفاتورة', 'Invoice reference')}: {selected.invoiceReferenceId}</p>}
              {selected.paymentMethod && <p>{t('طريقة الدفع', 'Payment method')}: {selected.paymentMethod}</p>}
              {selected.items.map((item, index) => (
                <div className="flex justify-between gap-4 border-b pb-2" key={`${item.sku ?? item.name}-${index}`}>
                  <span>{item.name} {item.sku && `(${item.sku})`} × {item.quantity}</span>
                  <span>{money(item.total, selected.currency)}</span>
                </div>
              ))}
              <p>{t('المجموع الفرعي', 'Subtotal')}: {money(selected.subtotal, selected.currency)}</p>
              <p>{t('الشحن', 'Shipping')}: {money(selected.shippingCost, selected.currency)}</p>
              <p>{t('رسوم الدفع عند الاستلام', 'Cash-on-delivery fee')}: {money(selected.codCost, selected.currency)}</p>
              <p>{t('الخصم', 'Discount')}: {money(selected.discount, selected.currency)}</p>
              <p>{t('الضريبة', 'VAT')}{selected.vatPercent != null && ` (${selected.vatPercent}%)`}: {money(selected.vatAmount, selected.currency)}</p>
              <p className="font-semibold">{t('الإجمالي', 'Total')}: {money(selected.total, selected.currency)}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}