import { useState } from 'react';
import { OrderDocuments } from '@/components/admin/order-documents';
import { CompanyOrderEditorDialog } from '@/components/admin/company-order-editor-dialog';
import { useGetAdminMe } from '@workspace/api-client-react';
import { hasPermission } from '@/lib/permissions';
import { useQueryClient } from '@tanstack/react-query';
import { getAdminListInvoicesQueryKey } from '@workspace/api-client-react';
import { Link } from 'wouter';
import {
  getGetAdminCompanyOrderReviewQueryKey,
  getListAdminCompanyOrdersQueryKey,
  useDecideAdminCompanyOrder,
  useGetAdminCompanyOrderReview,
  useListAdminCompanyOrders,
  type DistributorPortalTerms,
  type ListAdminCompanyOrdersStatus,
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Search } from 'lucide-react';

const money = (n: number | null | undefined, lang: string) =>
  n == null ? '-' : `\u2066${lang === 'ar' ? 'ر.س' : 'SAR'} ${new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}\u2069`;
const errMsg = (e: unknown, f: string) => { const c = e as { data?: { error?: string }; message?: string }; return c?.data?.error ?? c?.message ?? f; };
type T = (a: string, e: string) => string;
const statusLabel = (s: string, t: T) => s === 'approved' ? t('معتمد', 'Approved') : s === 'rejected' ? t('مرفوض', 'Rejected') : t('قيد المراجعة', 'Pending review');
const statusClass = (s: string) => s === 'approved' ? 'bg-success text-success-foreground' : s === 'rejected' ? 'bg-destructive text-destructive-foreground' : 'bg-primary/20 text-foreground';

const termRows = (x: DistributorPortalTerms, lang: string, t: T): [string, string][] => [
  [t('الخصم', 'Discount'), `${x.discountPercent}%`],
  [t('المعاملة الضريبية', 'Tax treatment'), x.taxTreatment === 'domestic' ? t('محلي', 'Domestic') : t('دولي', 'International')],
  [t('ضريبة القيمة المضافة', 'VAT rate'), `${x.vatRate}%`],
  [t('شروط السداد', 'Payment terms'), x.paymentTerm ? `${x.paymentTerm}${x.paymentDays != null ? ` / ${x.paymentDays}` : ''}` : '-'],
  [t('الحد الأدنى للطلب', 'Minimum order'), money(x.minOrderValue, lang)],
  [t('حد الائتمان', 'Credit limit'), money(x.creditLimit, lang)],
  [t('اعتماد الائتمان', 'Credit approved'), x.creditLimitApproved ? t('نعم', 'Yes') : t('لا', 'No')],
  [t('العقد', 'Contract'), x.contractNumber ?? (x.contractId ? `#${x.contractId}` : '-')],
];

function Review({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: currentUser } = useGetAdminMe();
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useGetAdminCompanyOrderReview(id, { query: { queryKey: getGetAdminCompanyOrderReviewQueryKey(id), staleTime: 0, refetchOnWindowFocus: true } });
  const decide = useDecideAdminCompanyOrder();
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const r = q.data;
  const pending = r?.order.status === 'pending_review';
  const blocked = (r?.blockReasons.length ?? 0) > 0;

  const submit = (decision: 'approve' | 'reject') => {
    if (!r) return;
    decide.mutate({ orderId: id, data: { decision, reason: decision === 'reject' ? reason.trim() : null, expectedReviewFingerprint: r.reviewFingerprint, acknowledgeChanges: ack } }, {
      onSuccess: (res) => {
        qc.invalidateQueries({ queryKey: getListAdminCompanyOrdersQueryKey() });
        qc.invalidateQueries({ queryKey: getAdminListInvoicesQueryKey().slice(0, 1) });
        qc.invalidateQueries({ predicate: (k) => /invoice|shipping|inventory|distributor/i.test(String(k.queryKey[0] ?? '')) });
        // The review is the audited pre-decision snapshot; the order is the
        // committed result. Keep the snapshot but display the final decision.
        qc.setQueryData(getGetAdminCompanyOrderReviewQueryKey(id), { ...res.review, order: res.order });
        toast({ title: decision === 'approve' ? t('تم اعتماد الطلب', 'Order approved') : t('تم رفض الطلب', 'Order rejected'), description: res.invoiceId ? `${t('الفاتورة', 'Invoice')} #${res.invoiceId}` : undefined });
        setRejecting(false);
      },
      onError: (err) => {
        const e = err as { status?: number; data?: { details?: { review?: unknown } } };
        if (e?.status === 409 && e.data?.details?.review) qc.setQueryData(getGetAdminCompanyOrderReviewQueryKey(id), e.data.details.review);
        else qc.invalidateQueries({ queryKey: getGetAdminCompanyOrderReviewQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListAdminCompanyOrdersQueryKey() });
        setAck(false);
        toast({ title: e?.status === 409 ? t('تغير الطلب، تم تحديث المراجعة', 'Order changed; review refreshed') : t('تعذر تنفيذ القرار', 'Decision failed'), description: errMsg(err, t('راجع القيم المحدثة ثم أعد القرار', 'Review the updated values and decide again')), variant: 'destructive' });
      },
    });
  };

  const snap = r ? termRows(r.snapshotTerms, lang, t) : [];
  const cur = r ? termRows(r.currentTerms, lang, t) : [];
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto" data-testid="dialog-company-order-review">
        <DialogHeader><DialogTitle>{r ? `${t('مراجعة الطلب', 'Review order')} ${r.order.orderNumber}` : t('مراجعة الطلب', 'Review order')}</DialogTitle></DialogHeader>
        {q.isLoading && <Skeleton className="h-64 w-full" />}
        {q.isError && <div><p className="text-destructive text-sm">{errMsg(q.error, t('تعذر تحميل المراجعة', 'Could not load review'))}</p><Button size="sm" variant="outline" className="mt-2" onClick={() => q.refetch()}>{t('إعادة المحاولة', 'Retry')}</Button></div>}
        {r && (
          <div className="space-y-5 text-sm">
            <OrderDocuments orderId={id} company invoiceId={r.order.invoiceId} canViewInvoice={hasPermission(currentUser, 'invoices', 'view')} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-semibold">{r.company.companyName}</p><p className="text-muted-foreground">{r.company.contactName} {r.company.email ? `- ${r.company.email}` : ''}</p></div>
              <Badge className={statusClass(r.order.status)}>{statusLabel(r.order.status, t)}</Badge>
            </div>

            {blocked && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3" data-testid="block-reasons"><p className="mb-1 flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" />{t('أسباب منع الاعتماد', 'Approval blocked')}</p><ul className="list-disc ps-5">{r.blockReasons.map((b) => <li key={b}>{b}</li>)}</ul></div>}
            {pending && r.hasMeaningfulChanges && <div className="rounded-md border border-primary/50 bg-primary/10 p-3"><p className="font-semibold">{t('تغيرت الأسعار أو الشروط منذ إرسال الطلب. قارن القيم أدناه.', 'Prices or terms changed since submission. Compare the values below.')}</p></div>}

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-md border p-3"><p className="mb-2 font-semibold">{t('الشروط عند الإرسال', 'Terms at submission')}</p><dl className="space-y-1">{snap.map(([k, v], i) => <div key={k} className={`flex justify-between gap-2 ${v !== cur[i][1] ? 'font-bold text-destructive' : ''}`}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
              <section className="rounded-md border p-3"><p className="mb-2 font-semibold">{t('الشروط الحالية', 'Current terms')}</p><dl className="space-y-1">{cur.map(([k, v], i) => <div key={k} className={`flex justify-between gap-2 ${v !== snap[i][1] ? 'font-bold text-destructive' : ''}`}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></section>
            </div>

            <section className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader><TableRow><TableHead>{t('المنتج', 'Product')}</TableHead><TableHead>{t('الكمية', 'Qty')}</TableHead><TableHead>{t('السعر المرسل', 'Submitted unit')}</TableHead><TableHead>{t('السعر الحالي', 'Current unit')}</TableHead><TableHead>{t('الإجمالي المرسل', 'Submitted total')}</TableHead><TableHead>{t('الإجمالي الحالي', 'Current total')}</TableHead></TableRow></TableHeader>
                <TableBody>{r.order.items.map((i) => {
                  const c = r.currentItems.find((x) => x.productId === i.productId);
                  const diff = !c || c.unitPrice !== i.unitPrice || c.quantity !== i.quantity;
                  return <TableRow key={i.productId} className={diff ? 'bg-destructive/5' : ''}><TableCell>{lang === 'ar' ? i.productName : i.productNameEn}</TableCell><TableCell>{i.quantity}</TableCell><TableCell>{money(i.unitPrice, lang)}</TableCell><TableCell>{c ? money(c.unitPrice, lang) : t('غير متاح', 'Unavailable')}</TableCell><TableCell>{money(i.totalAmount, lang)}</TableCell><TableCell>{c ? money(c.totalAmount, lang) : '-'}</TableCell></TableRow>;
                })}</TableBody>
              </Table>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-md border p-3 space-y-1">
                <p className="mb-1 font-semibold">{t('الإجماليات', 'Totals')} ({t('المرسلة / الحالية', 'submitted / current')})</p>
                {([[t('المجموع', 'Subtotal'), r.order.subtotal, r.currentTotals.subtotal], [t('الخصم', 'Discount'), r.order.discountAmount, r.currentTotals.discountAmount], [t('الضريبة', 'VAT'), r.order.vatAmount, r.currentTotals.vatAmount], [t('الإجمالي', 'Total'), r.order.totalAmount, r.currentTotals.totalAmount]] as [string, number, number][]).map(([k, a, b]) => (
                  <div key={k} className={`flex justify-between gap-2 ${a !== b ? 'font-bold text-destructive' : ''}`}><span>{k}</span><span>{money(a, lang)} / {money(b, lang)}</span></div>
                ))}
              </section>
              <section className="rounded-md border p-3 space-y-1">
                <p className="mb-1 font-semibold">{t('الائتمان', 'Credit')}</p>
                <div className="flex justify-between"><span>{t('الحد', 'Limit')}</span><span>{money(r.credit.limit, lang)}</span></div>
                <div className="flex justify-between"><span>{t('المستحق حالياً', 'Outstanding')}</span><span>{money(r.credit.outstanding, lang)}</span></div>
                <div className="flex justify-between"><span>{t('المتاح قبل الطلب', 'Available before')}</span><span>{money(r.credit.availableBefore, lang)}</span></div>
                <div className="flex justify-between font-semibold"><span>{t('المتاح بعد الطلب', 'Available after')}</span><span>{money(r.credit.availableAfter, lang)}</span></div>
              </section>
            </div>

            {!pending && <div className="rounded-md bg-muted p-3">{(r.order.reviewedByName || r.order.reviewedByAdminId != null) && <p>{t('المراجع', 'Reviewed by')}: {r.order.reviewedByName ?? `user#${r.order.reviewedByAdminId}`}</p>}{r.order.decisionAt && <p>{t('وقت القرار', 'Decided at')}: <span dir="ltr">{new Date(r.order.decisionAt).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB')}</span></p>}{r.order.decisionReason && <p>{t('سبب القرار', 'Decision reason')}: {r.order.decisionReason}</p>}{r.order.invoiceId && <p>{t('الفاتورة المرتبطة', 'Linked invoice')}: <span data-testid="text-order-invoice">#{r.order.invoiceId}</span> - <Link href="/admin/sales/companies" className="underline" data-testid="link-company-sales">{t('عرض مبيعات الشركات', 'View company sales')}</Link></p>}</div>}

            {pending && (
              <div className="space-y-3 border-t pt-3">
                {r.hasMeaningfulChanges && <label className="flex items-start gap-2"><Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} data-testid="checkbox-ack-changes" /><span>{t('أقرّ بمراجعة القيم المتغيرة وأوافق على اعتماد الطلب بالقيم الحالية.', 'I reviewed the changed values and accept approving with the current values.')}</span></label>}
                {rejecting && <div className="space-y-1"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={t('سبب الرفض (10 أحرف على الأقل)', 'Rejection reason (min 10 characters)')} data-testid="input-reject-reason" /><p className="text-xs text-muted-foreground">{reason.trim().length}/500</p></div>}
                <div className="flex flex-wrap justify-end gap-2">
                  {rejecting ? (
                    <>
                      <Button variant="outline" onClick={() => setRejecting(false)}>{t('رجوع', 'Back')}</Button>
                      <Button variant="destructive" disabled={reason.trim().length < 10 || decide.isPending} onClick={() => submit('reject')} data-testid="button-confirm-reject">{t('تأكيد الرفض', 'Confirm rejection')}</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" className="text-destructive" onClick={() => setRejecting(true)} data-testid="button-reject-order">{t('رفض', 'Reject')}</Button>
                      <Button disabled={blocked || decide.isPending || (r.hasMeaningfulChanges && !ack)} onClick={() => submit('approve')} data-testid="button-approve-order">{decide.isPending ? t('جاري التنفيذ...', 'Working...') : t('اعتماد وإنشاء الفاتورة', 'Approve and invoice')}</Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminCompanyOrders() {
  const { t, lang } = useLanguage();
  const [status, setStatus] = useState<'all' | ListAdminCompanyOrdersStatus>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const { data: currentUser } = useGetAdminMe();
  const canEdit = hasPermission(currentUser, 'company-orders', 'edit');
  const params = { ...(status !== 'all' ? { status } : {}), ...(search.trim() ? { search: search.trim() } : {}) };
  const q = useListAdminCompanyOrders(params, { query: { queryKey: getListAdminCompanyOrdersQueryKey(params), staleTime: 15_000 } });
  const orders = q.data?.orders ?? [];
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold tracking-tight">{t('طلبات الشركات', 'Company orders')}</h1><p className="text-muted-foreground mt-1">{t('مراجعة طلبات بوابة الموزعين واعتمادها أو رفضها', 'Review, approve or reject distributor portal orders')}</p></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative max-w-sm flex-1"><Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="ps-9" placeholder={t('بحث برقم الطلب أو الشركة...', 'Search order or company...')} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-company-orders" /></div>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} data-testid="select-company-order-status">
          <option value="all">{t('كل الحالات', 'All statuses')}</option>
          <option value="pending_review">{t('قيد المراجعة', 'Pending review')}</option>
          <option value="approved">{t('معتمد', 'Approved')}</option>
          <option value="rejected">{t('مرفوض', 'Rejected')}</option>
        </select>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>{t('رقم الطلب', 'Order')}</TableHead><TableHead>{t('الشركة', 'Company')}</TableHead><TableHead>{t('التاريخ', 'Date')}</TableHead><TableHead>{t('الإجمالي', 'Total')}</TableHead><TableHead>{t('الحالة', 'Status')}</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {q.isLoading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>)
              : q.isError ? <TableRow><TableCell colSpan={6} className="py-10 text-center"><p className="text-destructive">{errMsg(q.error, t('تعذر تحميل الطلبات', 'Could not load orders'))}</p><Button size="sm" variant="outline" className="mt-2" onClick={() => q.refetch()}>{t('إعادة المحاولة', 'Retry')}</Button></TableCell></TableRow>
              : orders.length === 0 ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">{t('لا توجد طلبات مطابقة', 'No matching orders')}</TableCell></TableRow>
              : orders.map((o) => (
                <TableRow key={o.id} data-testid={`row-company-order-${o.id}`}>
                  <TableCell className="font-medium" dir="ltr">{o.orderNumber}</TableCell>
                  <TableCell>{o.companyName}</TableCell>
                  <TableCell dir="ltr">{new Date(o.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB')}</TableCell>
                  <TableCell>{money(o.totalAmount, lang)}</TableCell>
                  <TableCell><Badge className={statusClass(o.status)}>{statusLabel(o.status, t)}</Badge></TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => setOpenId(o.id)} data-testid={`button-review-order-${o.id}`}>{o.status === 'pending_review' ? t('مراجعة', 'Review') : t('عرض', 'View')}</Button>{canEdit && <Button size="sm" variant="ghost" className="ms-1" onClick={() => setEditId(o.id)} data-testid={`button-edit-company-order-${o.id}`}>{t('تعديل', 'Edit')}</Button>}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
      {openId != null && <Review id={openId} onClose={() => setOpenId(null)} />}
      {editId != null && canEdit && <CompanyOrderEditorDialog orderId={editId} open onOpenChange={(v) => { if (!v) setEditId(null); }} />}
    </div>
  );
}
