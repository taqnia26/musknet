import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, FileSearch, RefreshCw, RotateCcw, X } from 'lucide-react';
import {
  getAdminGetOwnerAccountReviewQueryKey, getAdminListOwnerObligationsQueryKey,
  getGetOwnerAccountingReviewQueryKey, getListOwnerObligationsQueryKey,
  getAdminListJournalEntriesQueryKey, getAdminGetTrialBalanceQueryKey,
  useAdminGetOwnerAccountReview, useAdminListOwnerObligations, useAdminReviewOwnerEvent,
  useAdminDecideOwnerJournal, useAdminListAccountingAccounts,
  adminUploadOwnerEvidence,
  adminDownloadOwnerEventEvidence, adminDownloadOwnerJournalEvidence,
  adminDownloadOwnerEventCorrectionEvidence, useAdminCorrectOwnerEvent, useGetAdminMe,
  type OwnerObligationEvent, type OwnerJournalReportEntriesItem,
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { obligationDate, obligationError } from '@/components/owner/owner-obligations';

const today = () => new Date().toISOString().slice(0, 10);
const card = 'rounded-xl border border-border bg-card shadow-sm';
const allowedEvidence = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
async function uploadEvidence(file: File): Promise<string> {
  if (!allowedEvidence.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error('Attach a PDF or image no larger than 10 MB');
  const upload = await adminUploadOwnerEvidence({ contentType: file.type, size: file.size });
  const result = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!result.ok) throw new Error('Supporting document upload failed');
  return upload.objectPath;
}
async function viewEvidence(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function AdminOwnerObligationsReview({ canEdit }: { canEdit: boolean }) {
  const { t, lang } = useLanguage();
  const client = useQueryClient();
  const query = useAdminListOwnerObligations({ query: { queryKey: getAdminListOwnerObligationsQueryKey(), refetchInterval: 12_000, refetchOnWindowFocus: true } });
  const accounts = useAdminListAccountingAccounts();
  const review = useAdminReviewOwnerEvent();
  const correction = useAdminCorrectOwnerEvent();
  const { data: admin } = useGetAdminMe();
  const [selected, setSelected] = useState<OwnerObligationEvent | null>(null);
  const [correcting, setCorrecting] = useState<OwnerObligationEvent | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const rows = query.data || [];
  const selectedObligation = rows.find((row) => row.events.some((event) => event.id === selected?.id));
  const needsAccount = selected?.kind === 'transfer' || selectedObligation?.effectiveLiableParty === 'company';
  const queue = rows.flatMap((obligation) => obligation.events.filter((event) => event.status === 'pending').map((event) => ({ obligation, event }))).sort((a, b) => a.event.eventDate.localeCompare(b.event.eventDate));
  const history = rows.flatMap((obligation) => obligation.events.filter((event) => event.status !== 'pending').map((event) => ({ obligation, event }))).sort((a, b) => b.event.eventDate.localeCompare(a.event.eventDate));
  const refresh = () => {
    void client.invalidateQueries({ queryKey: getAdminListOwnerObligationsQueryKey() });
    void client.invalidateQueries({ queryKey: getAdminGetOwnerAccountReviewQueryKey() });
    void client.invalidateQueries({ queryKey: getListOwnerObligationsQueryKey() });
    void client.invalidateQueries({ queryKey: getGetOwnerAccountingReviewQueryKey() });
    void client.invalidateQueries({ queryKey: getAdminListJournalEntriesQueryKey() });
    void client.invalidateQueries({ queryKey: getAdminGetTrialBalanceQueryKey() });
  };
  const submit = async (form: FormEvent<HTMLFormElement>) => {
    form.preventDefault();
    if (!selected) return;
    const fields = new FormData(form.currentTarget);
    const file = fields.get('evidence');
    const accountCode = String(fields.get('accountCode') || '').trim();
    const reason = String(fields.get('reason') || '').trim();
    if (!reason || (decision === 'approved' && (!(file instanceof File) || !file.size || (needsAccount && !accountCode)))) { setError(t('الدليل والحساب المقابل والسبب مطلوبة للاعتماد.', 'Evidence, counter account and reason are required for approval.')); return; }
    setError(''); setUploading(true);
    try {
      const evidence = decision === 'approved' ? await uploadEvidence(file as File) : undefined;
      await review.mutateAsync({ id: selected.id, data: { decision, evidence, accountCode: accountCode || undefined, reason } });
      setSelected(null); refresh();
    } catch (failure) { setError(obligationError(failure)); }
    finally { setUploading(false); }
  };
  const submitCorrection = async (form: FormEvent<HTMLFormElement>) => {
    form.preventDefault();
    if (!correcting) return;
    const fields = new FormData(form.currentTarget);
    const file = fields.get('evidence');
    const reason = String(fields.get('reason') || '').trim();
    const entryDate = String(fields.get('entryDate') || '');
    if (!(file instanceof File) || !file.size || !reason || !entryDate) {
      setError(t('مستند التصحيح والسبب والتاريخ مطلوبة.', 'Correction document, reason and date are required.')); return;
    }
    setError(''); setUploading(true);
    try {
      const evidence = await uploadEvidence(file);
      await correction.mutateAsync({ id: correcting.id, data: { evidence, reason, entryDate } });
      setCorrecting(null); refresh();
    } catch (failure) { setError(obligationError(failure)); }
    finally { setUploading(false); }
  };
  return <div className="mt-5 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-xl font-bold">{t('التزامات المالك المشتركة', 'Shared owner obligations')}</h2>{queue.length > 0 && <span className="rounded-full bg-[#b43232] px-2.5 py-0.5 text-xs font-bold text-white" data-testid="status-finance-owner-pending">{queue.length} {t('قيد المراجعة', 'pending')}</span>}</div><p className="mt-1 text-sm text-muted-foreground">{t('لا يُعتمد دفع أو نقل مسؤولية حتى يُراجع المستند والحساب والسبب.', 'Payments and liability transfers require evidence, a counter account and a reason before approval.')}</p></div><Button variant="outline" size="sm" onClick={refresh} data-testid="button-refresh-finance-owner"><RefreshCw className="me-2 h-4 w-4" />{t('تحديث', 'Refresh')}</Button></div>
    {query.isLoading ? <div className="space-y-3">{[0, 1].map((n) => <div key={n} className={`${card} h-32 animate-pulse`} />)}</div> : query.error ? <div role="alert" className={`${card} p-6 text-destructive`}>{t('تعذر تحميل السجل:', 'Could not load register:')} {obligationError(query.error)} <Button variant="outline" onClick={() => void query.refetch()}>{t('أعد المحاولة', 'Retry')}</Button></div> : <>
      <section className={`${card} overflow-hidden`}><div className="flex items-center gap-2 border-b px-5 py-4"><AlertCircle className={`h-5 w-5 ${queue.length ? 'text-[#b43232]' : 'text-muted-foreground'}`} /><h3 className="font-bold">{t('طابور المراجعة', 'Review queue')}</h3><span className="ms-auto text-sm text-muted-foreground">{queue.length}</span></div>{queue.length ? <div className="divide-y">{queue.map(({ obligation, event }) => <div key={event.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between" data-testid={`row-owner-event-${event.id}`}><div><p className="text-xs font-medium text-[#af861c]">#{event.id} · {obligationDate(event.eventDate)}</p><h4 className="mt-1 font-bold">{obligation.name}</h4><p className="mt-1 text-sm text-muted-foreground">{event.kind === 'transfer' ? t('طلب نقل مسؤولية', 'Liability transfer request') : t('سداد جزئي', 'Partial payment')} · {t('الدافع', 'Payer')}: {event.payer || '—'} · {t('المسؤولية الحالية', 'Current liability')}: {obligation.effectiveLiableParty === 'owner' ? t('المالك', 'Owner') : t('الشركة', 'Company')}</p><p className="mt-1 text-xs text-muted-foreground">{t('المتبقي', 'Remaining')}: <Money value={obligation.remaining} lang={lang} /> · {t('قيد مرتبط', 'Linked journal')}: {event.journalEntryId ? `#${event.journalEntryId}` : t('لم يُنشأ', 'Not created')}</p></div><div className="flex items-center gap-3"><strong className="text-lg"><Money value={event.amount} lang={lang} /></strong>{canEdit && <Button size="sm" onClick={() => { setSelected(event); setDecision('approved'); setError(''); }} data-testid={`button-review-owner-event-${event.id}`}>{t('مراجعة', 'Review')}</Button>}</div></div>)}</div> : <div className="p-9 text-center text-sm text-muted-foreground">{t('لا توجد طلبات معلقة. القرارات السابقة موثقة أدناه.', 'No pending requests. Earlier decisions remain documented below.')}</div>}</section>
      <section className={`${card} overflow-hidden`}><div className="border-b px-5 py-4"><h3 className="font-bold">{t('السجل الكامل', 'Full obligation register')}</h3></div>{rows.length ? <div className="divide-y">{rows.map((row) => <div key={row.id} className="grid gap-3 px-5 py-4 text-sm md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]"><div><strong>{row.name}</strong><p className="mt-1 text-xs text-muted-foreground">#{row.id} · {obligationDate(row.dueDate)} · {row.recurrence === 'monthly' ? t('شهري', 'Monthly') : t('مرة واحدة', 'Once')} · {t('الجهة الفعلية', 'Effective party')}: {row.effectiveLiableParty === 'owner' ? t('المالك', 'Owner') : t('الشركة', 'Company')}</p></div><div><span className="text-xs text-muted-foreground">{t('الأصل', 'Original')}</span><p className="font-semibold"><Money value={row.amount} lang={lang} /></p></div><div><span className="text-xs text-muted-foreground">{t('المدفوع', 'Paid')}</span><p className="font-semibold"><Money value={row.paid} lang={lang} /></p></div><div><span className="text-xs text-muted-foreground">{t('المتبقي', 'Remaining')}</span><p className="font-semibold"><Money value={row.remaining} lang={lang} /></p></div></div>)}</div> : <p className="p-8 text-center text-sm text-muted-foreground">{t('لا توجد التزامات مسجلة.', 'No obligations recorded.')}</p>}</section>
      {history.length > 0 && <section className={`${card} overflow-hidden`}>
        <div className="border-b px-5 py-4"><h3 className="font-bold">{t('قرارات سابقة', 'Decision history')}</h3></div>
        <div className="divide-y">{history.map(({ obligation, event }) => <div key={event.id} className="flex flex-wrap justify-between gap-3 px-5 py-4 text-sm">
          <div><strong>{obligation.name} · #{event.id}</strong>
            <p className="mt-1 text-muted-foreground">{obligationDate(event.eventDate)} · {event.kind} · {t('حساب', 'Account')}: {event.accountCode || '—'}</p>
            <p className="mt-1">{event.reason || '—'} {event.journalEntryId && `· Journal #${event.journalEntryId}`}</p>
            {event.evidence && <button type="button" className="mt-2 text-primary underline" onClick={() => void adminDownloadOwnerEventEvidence(event.id).then(viewEvidence).catch((failure) => setError(obligationError(failure)))}>{t('عرض مستند الاعتماد', 'View approval document')}</button>}
            {event.status === 'corrected' && <p className="mt-2 text-destructive">{t('سبب التصحيح', 'Correction reason')}: {event.correctionReason} · {t('القيد العكسي', 'Reversal')} #{event.reversalEntryId || '—'}</p>}
            {event.correctionEvidence && <button type="button" className="ms-3 text-primary underline" onClick={() => void adminDownloadOwnerEventCorrectionEvidence(event.id).then(viewEvidence).catch((failure) => setError(obligationError(failure)))}>{t('عرض مستند التصحيح', 'View correction document')}</button>}
            {canEdit && admin?.isSuperAdmin && event.status === 'approved' && <Button type="button" size="sm" variant="outline" className="ms-3" onClick={() => { setCorrecting(event); setError(''); }} data-testid={`button-correct-owner-event-${event.id}`}>{t('تصحيح مع عكس القيد', 'Correct and reverse')}</Button>}
          </div>
          <span className={event.status === 'approved' ? 'text-[#387451]' : 'text-[#ad3434]'}>{event.status === 'approved' ? t('معتمد', 'Approved') : event.status === 'corrected' ? t('مصحّح', 'Corrected') : t('مرفوض', 'Rejected')} · <Money value={event.amount} lang={lang} /></span>
        </div>)}</div>
      </section>}
    </>}
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171714]/65 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !uploading && !review.isPending) setSelected(null); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="owner-event-review-title" className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border bg-card p-6 shadow-2xl">
        <h3 id="owner-event-review-title" className="text-xl font-bold">{t('قرار مراجعة الحركة', 'Review event decision')} #{selected.id}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{t('يُحفظ مستند السداد الخاص قبل الاعتماد. الدين الشخصي المدفوع من المالك لا ينشئ قيد شركة.', 'Attach a private supporting document before approval. Personal owner debt creates no company journal.')}</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDecision('approved')} className={`rounded-lg border p-3 text-sm font-semibold ${decision === 'approved' ? 'border-[#498662] bg-[#edf6ee] text-[#286842]' : ''}`} data-testid="button-approve-owner-event"><Check className="me-1 inline h-4 w-4" />{t('اعتماد', 'Approve')}</button>
            <button type="button" onClick={() => setDecision('rejected')} className={`rounded-lg border p-3 text-sm font-semibold ${decision === 'rejected' ? 'border-[#bb4646] bg-[#fceeee] text-[#a42d2d]' : ''}`} data-testid="button-reject-owner-event"><X className="me-1 inline h-4 w-4" />{t('رفض', 'Reject')}</button>
          </div>
          {decision === 'approved' && <label className="block space-y-1 text-sm">{t('فاتورة أو إيصال بنك أو مستند داعم (PDF أو صورة)', 'Invoice, bank receipt or supporting document (PDF or image)')}<Input name="evidence" type="file" accept=".pdf,image/png,image/jpeg,image/webp" required data-testid="input-owner-event-evidence" /></label>}
          {decision === 'approved' && needsAccount && <label className="block space-y-1 text-sm">{t('الحساب المقابل', 'Counter account')}<select name="accountCode" required defaultValue="" className="h-10 w-full rounded-md border border-input bg-background px-3" data-testid="select-owner-event-account"><option value="" disabled>{t('اختر حساب ترحيل', 'Select posting account')}</option>{(accounts.data || []).filter((account) => account.isPosting && account.isActive && !['1120', '2140'].includes(account.code) && (selected?.kind === 'transfer' ? account.code !== '2110' : selectedObligation?.events.some((event) => event.kind === 'transfer' && event.status === 'approved') ? account.code === '2110' : true)).map((account) => <option key={account.id} value={account.code}>{account.code} · {lang === 'ar' ? account.nameAr : account.nameEn}</option>)}</select></label>}
          <label className="block space-y-1 text-sm">{t('سبب القرار', 'Decision reason')}<Textarea name="reason" required data-testid="input-owner-event-reason" /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSelected(null)} disabled={uploading || review.isPending}>{t('إلغاء', 'Cancel')}</Button><Button type="submit" disabled={uploading || review.isPending || (decision === 'approved' && (accounts.isLoading || !!accounts.error))} data-testid="button-submit-owner-event-review">{uploading ? t('جارٍ رفع المستند', 'Uploading document') : t('توثيق القرار', 'Record decision')}</Button></div>
        </form>
      </div>
    </div>}
    {correcting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171714]/65 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="owner-event-correction-title" className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border bg-card p-6 shadow-2xl">
        <h3 id="owner-event-correction-title" className="text-xl font-bold">{t('تصحيح حركة معتمدة', 'Correct approved event')} #{correcting.id}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{t('يعيد التصحيح مبلغ الدفعة إلى المتبقي ويعكس قيدها إن وجد. لا يُحذف سجل الاعتماد الأول.', 'Correction restores the payment to the outstanding amount and reverses its journal if present. Original approval remains visible.')}</p>
        <form onSubmit={submitCorrection} className="mt-5 space-y-4">
          <label className="block space-y-1 text-sm">{t('مستند التصحيح (PDF أو صورة)', 'Correction document (PDF or image)')}<Input name="evidence" type="file" accept=".pdf,image/png,image/jpeg,image/webp" required /></label>
          <label className="block space-y-1 text-sm">{t('سبب التصحيح', 'Correction reason')}<Textarea name="reason" required /></label>
          <label className="block space-y-1 text-sm">{t('تاريخ العكس', 'Reversal date')}<Input name="entryDate" type="date" defaultValue={today()} required /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={uploading || correction.isPending} onClick={() => setCorrecting(null)}>{t('إلغاء', 'Cancel')}</Button><Button type="submit" disabled={uploading || correction.isPending}>{t('توثيق التصحيح', 'Record correction')}</Button></div>
        </form>
      </div>
    </div>}
  </div>;
}

export function AdminOwnerLedgerReview({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { t, lang } = useLanguage();
  const client = useQueryClient();
  const report = useAdminGetOwnerAccountReview({ query: { queryKey: getAdminGetOwnerAccountReviewQueryKey(), refetchInterval: 12_000, refetchOnWindowFocus: true } });
  const decide = useAdminDecideOwnerJournal();
  const [selected, setSelected] = useState<OwnerJournalReportEntriesItem | null>(null);
  const [decision, setDecision] = useState<'retain' | 'reverse'>('retain');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const submit = async (form: FormEvent<HTMLFormElement>) => {
    form.preventDefault();
    if (!selected || !isSuperAdmin) return;
    const fields = new FormData(form.currentTarget);
    const evidenceFile = fields.get('evidence');
    const reason = String(fields.get('reason') || '').trim();
    const entryDate = String(fields.get('entryDate') || '');
    if (!(evidenceFile instanceof File) || !evidenceFile.size || !reason || !entryDate) { setError(t('المستند والسبب والتاريخ مطلوبة.', 'Document, reason and date are required.')); return; }
    setError(''); setUploading(true);
    try {
      const evidence = await uploadEvidence(evidenceFile);
      await decide.mutateAsync({ id: selected.id, data: { decision, evidence, reason, entryDate } });
      setSelected(null);
      for (const key of [getAdminGetOwnerAccountReviewQueryKey(), getAdminListOwnerObligationsQueryKey(), getGetOwnerAccountingReviewQueryKey(), getListOwnerObligationsQueryKey(), getAdminListJournalEntriesQueryKey(), getAdminGetTrialBalanceQueryKey()]) void client.invalidateQueries({ queryKey: key });
    } catch (failure) { setError(obligationError(failure)); }
    finally { setUploading(false); }
  };
  const data = report.data;
  return <div className="mt-5 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{t('مراجعة ذمم المالك', 'Owner payable review')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('أثر كل مصدر ظاهر قبل التصحيح وبعده. لا يُفترض تصفير الرصيد دون دليل.', 'Each source shows its before and projected after effect. No balance is assumed to reach zero without evidence.')}</p></div><Button variant="outline" size="sm" onClick={() => void report.refetch()}><RefreshCw className="me-2 h-4 w-4" />{t('تحديث', 'Refresh')}</Button></div>
    {report.isLoading ? <div className={`${card} h-40 animate-pulse`} /> : report.error ? <div role="alert" className={`${card} p-6 text-destructive`}>{t('تعذر تحميل تقرير الذمم:', 'Could not load payable report:')} {obligationError(report.error)} <Button variant="outline" onClick={() => void report.refetch()}>{t('أعد المحاولة', 'Retry')}</Button></div> : data && <>
      <div className={`${card} border-s-4 border-s-[#d4aa31] p-6`}><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('الرصيد المرحّل الحالي', 'CURRENT POSTED BALANCE')}</p><p className="mt-3 text-3xl font-bold" data-testid="text-owner-payable-balance"><Money value={data.balance} lang={lang} /></p><p className="mt-2 text-sm text-muted-foreground">{data.note}</p><p className="mt-2 text-xs text-muted-foreground">{t('التغييرات المعروضة أدناه لكل قيد على حدة، وليست رصيداً متوقعاً مجمعاً.', 'The changes below are per entry, not a combined forecast balance.')}</p></div>
      <section className={`${card} overflow-hidden`}><div className="border-b px-5 py-4"><h3 className="font-bold">{t('قيود المصادر', 'Source journals')} · {data.entries.length}</h3></div>{data.entries.length ? <div className="divide-y">{data.entries.map((entry) => {
        const projected = Number(data.balance) + Number(entry.projectedBalanceChangeIfReversed);
        return <article key={entry.id} className="p-5" data-testid={`card-owner-journal-${entry.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div>
            <p className="text-xs font-semibold text-[#aa8423]">{entry.entryNumber} · {obligationDate(entry.entryDate)} · {entry.status}</p>
            <h4 className="mt-1 font-bold">{entry.description}</h4>
            <p className="mt-1 text-xs text-muted-foreground">{t('المصدر', 'Source')}: {entry.sourceType || '—'} {entry.sourceId || ''}{entry.sourceDetail?.title ? ` · ${entry.sourceDetail.title}` : ''}{entry.sourceDetail?.paymentSource ? ` · ${entry.sourceDetail.paymentSource}` : ''}</p>
          </div>{isSuperAdmin && !entry.review && entry.status === 'posted' && entry.sourceType !== 'reversal' && <Button size="sm" variant="outline" onClick={() => { setSelected(entry); setDecision('retain'); setError(''); }} data-testid={`button-decide-owner-journal-${entry.id}`}><FileSearch className="me-2 h-4 w-4" />{t('اتخاذ قرار', 'Decide')}</Button>}</div>
          <div className="mt-4 grid gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-4">
            <div><span className="block text-xs text-muted-foreground">{t('مدين', 'Debit')}</span><strong><Money value={entry.debit} lang={lang} /></strong></div>
            <div><span className="block text-xs text-muted-foreground">{t('دائن', 'Credit')}</span><strong><Money value={entry.credit} lang={lang} /></strong></div>
            <div><span className="block text-xs text-muted-foreground">{t('أثر العكس', 'Reversal change')}</span><strong><Money value={entry.projectedBalanceChangeIfReversed} lang={lang} /></strong></div>
            <div><span className="block text-xs text-muted-foreground">{t('الرصيد بعد العكس المقترح', 'Projected balance')}</span><strong><Money value={projected} lang={lang} /></strong></div>
          </div>
          {entry.review && <div className="mt-3 rounded-lg border border-[#d8c99c] bg-[#faf7eb] p-3 text-sm dark:bg-[#272418]">
            <strong>{entry.review.decision === 'reverse' ? t('عُكس القيد', 'Reversed') : t('أُبقي القيد', 'Retained')}</strong>
            <p className="mt-1">{t('السبب', 'Reason')}: {entry.review.reason}</p>
            <button type="button" className="text-primary underline" onClick={() => void adminDownloadOwnerJournalEvidence(entry.id).then(viewEvidence).catch((failure) => setError(obligationError(failure)))}>{t('عرض المستند', 'View document')}</button>
            {entry.review.reversalEntryId && <p className="mt-1">{t('قيد عكسي', 'Reversal entry')} #{entry.review.reversalEntryId}</p>}
          </div>}
        </article>;
      })}</div> : <div className="p-10 text-center text-sm text-muted-foreground">{t('لا توجد قيود مصدر في هذا التقرير. هذا لا يثبت تسوية رصيد المالك.', 'No source journals in this report. This does not prove the owner balance has been settled.')}</div>}</section>
      {!isSuperAdmin && <p className="text-sm text-muted-foreground">{t('قرار تصحيح القيد محصور بالمدير العام الأعلى. يمكنك مراجعة الأثر والدليل فقط.', 'Only a super administrator can decide journal corrections. You can inspect the effect and evidence.')}</p>}
    </>}
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171714]/65 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !uploading && !decide.isPending) setSelected(null); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="owner-journal-decision-title" className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl border bg-card p-6 shadow-2xl">
        <h3 id="owner-journal-decision-title" className="text-xl font-bold">{t('قرار مراجعة القيد', 'Journal review decision')} · {selected.entryNumber}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{t('الرصيد الحالي', 'Current balance')}: <Money value={data?.balance || '0'} lang={lang} /> · {t('أثر العكس المقترح', 'Proposed reversal change')}: <Money value={selected.projectedBalanceChangeIfReversed} lang={lang} /></p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setDecision('retain')} className={`rounded-lg border p-3 text-sm ${decision === 'retain' ? 'border-[#498662] bg-[#edf6ee] text-[#286842]' : ''}`} data-testid="button-retain-owner-journal"><Check className="me-1 inline h-4 w-4" />{t('الإبقاء على القيد', 'Retain entry')}</button><button type="button" onClick={() => setDecision('reverse')} className={`rounded-lg border p-3 text-sm ${decision === 'reverse' ? 'border-[#bb4646] bg-[#fceeee] text-[#a42d2d]' : ''}`} data-testid="button-reverse-owner-journal"><RotateCcw className="me-1 inline h-4 w-4" />{t('عكس القيد', 'Reverse entry')}</button></div>
          <label className="block space-y-1 text-sm">{t('المستند الداعم (PDF أو صورة)', 'Supporting document (PDF or image)')}<Input name="evidence" type="file" accept=".pdf,image/png,image/jpeg,image/webp" required data-testid="input-owner-journal-evidence" /></label>
          <label className="block space-y-1 text-sm">{t('سبب القرار', 'Reason')}<Textarea name="reason" required data-testid="input-owner-journal-reason" /></label>
          <label className="block space-y-1 text-sm">{t('تاريخ القرار / العكس', 'Decision / reversal date')}<Input name="entryDate" type="date" defaultValue={today()} required data-testid="input-owner-journal-date" /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={uploading || decide.isPending} onClick={() => setSelected(null)}>{t('إلغاء', 'Cancel')}</Button><Button type="submit" disabled={uploading || decide.isPending} data-testid="button-submit-owner-journal-decision">{uploading ? t('جارٍ رفع المستند', 'Uploading document') : t('توثيق القرار', 'Record decision')}</Button></div>
        </form>
      </div>
    </div>}
  </div>;
}