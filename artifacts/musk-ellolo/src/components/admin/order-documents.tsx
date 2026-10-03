import { useState } from 'react';
import { adminGetOrder, adminListInvoices, adminDownloadInvoicePdf, getAdminCompanyOrderReview, useAdminListInvoices, getAdminListInvoicesQueryKey } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { getAdminToken } from '@/lib/auth-token';
import { InvoicePreviewDialog } from '@/pages/admin/invoices';
import type { AdminInvoice } from '@workspace/api-client-react';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function orderSummaryHtml(title: string, fields: [string, unknown][], items: { name: string; quantity: number; price: number; total: number }[], ar: boolean) {
  return `<!doctype html><html lang="${ar ? 'ar' : 'en'}" dir="${ar ? 'rtl' : 'ltr'}"><meta charset="utf-8"><title>${escape(title)}</title><style>body{font:16px Arial,sans-serif;color:#222;max-width:900px;margin:35px auto;padding:20px}h1{font-size:24px}.notice{border:2px solid #555;padding:12px}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:10px;border:1px solid #ccc;text-align:start}tr{break-inside:avoid}@page{size:A4;margin:15mm}</style><body><h1>MUSK ELLOLO — ${escape(title)}</h1><p class="notice">${ar ? 'ملخص طلب — ليس فاتورة ضريبية ولا إثبات سداد' : 'Order summary — not a tax invoice or proof of payment'}</p>${fields.map(([k,v]) => `<p><strong>${escape(k)}:</strong> ${escape(v)}</p>`).join('')}<table><thead><tr>${(ar ? ['المنتج','الكمية','سعر الوحدة (ر.س)','الإجمالي (ر.س)'] : ['Product','Quantity','Unit price (SAR)','Total (SAR)']).map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${items.map(x=>`<tr><td>${escape(x.name)}</td><td>${x.quantity}</td><td>${x.price.toFixed(2)}</td><td>${x.total.toFixed(2)}</td></tr>`).join('')}</tbody></table></body></html>`;
}

export function OrderDocuments({ orderId, canViewInvoice, company = false, invoiceId }: { orderId: number; canViewInvoice: boolean; company?: boolean; invoiceId?: number | null }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<AdminInvoice | null>(null);
  const invoiceParams = { channel: company ? 'companies' as const : 'online' as const };
  const invoiceQuery = useAdminListInvoices(invoiceParams, { query: { queryKey: getAdminListInvoicesQueryKey(invoiceParams), enabled: canViewInvoice, staleTime: 0 } });
  const invoiceAvailable = invoiceQuery.data?.some(x => (company ? x.id === invoiceId : x.orderId === orderId) && !x.cancelledAt);
  const run = async (action: 'print' | 'download' | 'invoice' | 'printInvoice') => {
    if (busy) return;
    const win = action === 'print' ? window.open('', '_blank') : null;
    if (action === 'print' && !win) { toast({ title: t('اسمح بفتح نافذة الطباعة', 'Allow the print window'), variant: 'destructive' }); return; }
    if (win) { win.opener = null; win.document.body.textContent = t('جاري تحميل الطلب…', 'Loading order…'); }
    setBusy(true);
    try {
      const options = { headers: { Authorization: `Bearer ${getAdminToken() ?? ''}` } };
      const review = company ? await getAdminCompanyOrderReview(orderId, options) : null;
      const detail = company ? null : await adminGetOrder(orderId, options);
      const order = detail ?? {
        orderNumber: review!.order.orderNumber, status: review!.order.status,
        customer: { name: review!.company.companyName, phone: '' },
        orderAddress: { country: null, nationalAddressShortCode: null, city: null, district: null, street: null, buildingNo: null },
        shippingCost: null, total: review!.order.totalAmount,
        items: review!.order.items.map(x => ({ productName: x.productName, quantity: x.quantity, unitPrice: x.unitPrice, totalPrice: x.totalAmount })),
      };
      let blob: Blob;
      let name: string;
      if (action === 'invoice' || action === 'printInvoice') {
        const invoices = await adminListInvoices({ channel: company ? 'companies' : 'online' }, options);
        const invoice = invoices.find(x => (company ? x.id === review!.order.invoiceId : x.orderId === orderId) && !x.cancelledAt);
        if (!invoice) throw new Error(t('لم تصدر فاتورة لهذا الطلب بعد. لا يصدر هذا الزر فاتورة جديدة.', 'No invoice has been issued for this order. This action never issues an invoice.'));
        if (action === 'printInvoice') { setPreview(invoice); return; }
        blob = await adminDownloadInvoicePdf(invoice.id, lang, options);
        name = `${invoice.invoiceNumber}.pdf`;
      } else {
        const a = order.orderAddress;
        const html = orderSummaryHtml(order.orderNumber, [
          [t('رقم الطلب','Order'), order.orderNumber],
          [t('العميل','Customer'), order.customer.name],
          [t('الجوال','Phone'), order.customer.phone],
          [t('الحالة المسجلة','Recorded status'), order.status],
          ...(!company ? [
            [t('عنوان الطلب','Order address'), [a.country,a.nationalAddressShortCode,a.city,a.district,a.street,a.buildingNo].filter(Boolean).join(' — ')] as [string, unknown],
            [t('رسوم التسليم/الاستلام (ر.س)','Delivery/pickup fee (SAR)'), order.shippingCost] as [string, unknown],
          ] : [[t('الأسعار','Prices'), t('لقطة الطلب عند الإرسال، وليست القيم المعدلة عند الاعتماد','Submitted order snapshot, not revised approval values')] as [string, unknown]]),
          [t('الإجمالي (ر.س)','Total (SAR)'), order.total],
        ], order.items.map(x => ({ name: x.productName, quantity: x.quantity, price: x.unitPrice, total: x.totalPrice })), lang === 'ar');
        if (win) { win.document.open(); win.document.write(html); win.document.close(); win.focus(); win.print(); return; }
        blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        name = `${order.orderNumber}-summary.html`;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = name.replace(/[^a-zA-Z0-9_.-]/g, '-'); document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) { win?.close(); toast({ title: t('تعذر فتح المستند','Could not open document'), description: error instanceof Error ? error.message : undefined, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return <><div className="flex flex-wrap gap-2">
    <Button size="sm" variant="outline" disabled={busy} onClick={() => run('print')}>{t('طباعة ملخص الطلب','Print order summary')}</Button>
    <Button size="sm" variant="outline" disabled={busy} onClick={() => run('download')}>{t('تنزيل الملخص HTML','Download summary HTML')}</Button>
    {canViewInvoice && <Button size="sm" variant="outline" disabled={busy || !invoiceAvailable} onClick={() => run('invoice')}>{t('تنزيل الفاتورة الصادرة PDF','Download issued invoice PDF')}</Button>}
    {canViewInvoice && <Button size="sm" variant="outline" disabled={busy || !invoiceAvailable} onClick={() => run('printInvoice')}>{t('طباعة الفاتورة الصادرة','Print issued invoice')}</Button>}
    {canViewInvoice && !invoiceAvailable && <p className="w-full text-xs text-muted-foreground">{invoiceQuery.isError ? t('تعذر التحقق من الفاتورة','Could not verify invoice availability') : invoiceQuery.isLoading ? t('جاري التحقق من الفاتورة…','Checking invoice…') : t('لا توجد فاتورة صادرة متاحة لهذا الطلب بعد.','No issued invoice is available for this order yet.')}</p>}
  </div><InvoicePreviewDialog invoice={preview} open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }} printOnReady /></>;
}