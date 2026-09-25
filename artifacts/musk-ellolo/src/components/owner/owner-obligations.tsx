import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowUpRight, Plus, ReceiptText, RefreshCw } from 'lucide-react';
import {
  getGetOwnerAccountingReviewQueryKey, getListOwnerObligationsQueryKey,
  useCreateOwnerObligation, useCreateOwnerObligationEvent, useGetOwnerAccountingReview,
  useListOwnerObligations, useRenewOwnerMonthlyObligation, type OwnerObligation,
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export const obligationDate = (value: string) => value?.slice(0, 10) || '—';
export const obligationError = (error: unknown) => {
  const e = error as { data?: { error?: string }; message?: string };
  return e?.data?.error || e?.message || 'Request failed';
};
export const obligationPanel = 'rounded-2xl border border-[#e5e2dc] bg-white shadow-sm dark:border-[#292b2f] dark:bg-[#111214]';
const today = () => new Date().toISOString().slice(0, 10);
const amountValid = (value: string) => /^\d{1,14}(\.\d{1,4})?$/.test(value) && Number(value) > 0;

export function OwnerObligations() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [eventKind, setEventKind] = useState<'payment' | 'transfer'>('payment');
  const [formError, setFormError] = useState('');
  const obligations = useListOwnerObligations({ query: { refetchInterval: 15_000, refetchOnWindowFocus: true, queryKey: getListOwnerObligationsQueryKey() } });
  const report = useGetOwnerAccountingReview({ query: { refetchInterval: 15_000, queryKey: getGetOwnerAccountingReviewQueryKey() } });
  const create = useCreateOwnerObligation();
  const createEvent = useCreateOwnerObligationEvent();
  const renew = useRenewOwnerMonthlyObligation();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: getListOwnerObligationsQueryKey() });
    void client.invalidateQueries({ queryKey: getGetOwnerAccountingReviewQueryKey() });
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    const fields = new FormData(event.currentTarget);
    const amount = String(fields.get('amount') || '').trim();
    if (!amountValid(amount)) { setFormError(t('أدخل مبلغاً موجباً حتى أربع منازل عشرية.', 'Enter a positive amount with up to four decimals.')); return; }
    create.mutate({ data: {
      name: String(fields.get('name') || '').trim(), amount,
      dueDate: String(fields.get('dueDate')), recurrence: fields.get('recurrence') as 'once' | 'monthly',
      liableParty: fields.get('liableParty') as 'owner' | 'company', clientKey: crypto.randomUUID(),
    } }, {
      onSuccess: () => { refresh(); setAdding(false); toast({ title: t('تم تسجيل الالتزام', 'Obligation recorded') }); },
      onError: (error) => setFormError(obligationError(error)),
    });
  };
  const saveEvent = (event: FormEvent<HTMLFormElement>, obligation: OwnerObligation) => {
    event.preventDefault();
    setFormError('');
    const fields = new FormData(event.currentTarget);
    const amount = String(fields.get('amount') || '').trim();
    if (eventKind === 'payment' && (!amountValid(amount) || Number(amount) > Number(obligation.remaining))) {
      setFormError(t('المبلغ يجب أن يكون موجباً وألا يتجاوز المتبقي.', 'Amount must be positive and no greater than the remaining balance.'));
      return;
    }
    createEvent.mutate({ id: obligation.id, data: {
      kind: eventKind, ...(eventKind === 'payment' ? { amount, payer: fields.get('payer') as 'owner' | 'company' } : {}),
      eventDate: String(fields.get('eventDate')), clientKey: crypto.randomUUID(),
    } }, {
      onSuccess: () => { refresh(); setActive(null); toast({ title: t('أُرسل الطلب إلى مراجعة المالية', 'Sent to finance review') }); },
      onError: (error) => setFormError(obligationError(error)),
    });
  };
  const rows = obligations.data || [];
  const pending = rows.flatMap((row) => row.events).filter((event) => event.status === 'pending').length;
  const remaining = rows.reduce((sum, row) => sum + Number(row.remaining), 0);
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#af8517]">{t('سجل المالك / المالية', 'OWNER / FINANCE REGISTER')}</p><h1 className="text-3xl font-bold">{t('الالتزامات', 'Obligations')}</h1><p className="mt-2 text-sm text-[#827e76] dark:text-[#a5a29b]">{t('سجل حيّ للمستحقات، والسداد الجزئي، وطلبات نقل المسؤولية.', 'A live register of dues, partial payments and liability transfers.')}</p></div>
        <Button onClick={() => { setAdding(!adding); setFormError(''); }} data-testid="button-add-obligation"><Plus className="me-2 h-4 w-4" />{t('التزام جديد', 'New obligation')}</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`${obligationPanel} p-5`}><p className="text-xs text-muted-foreground">{t('المتبقي على الالتزامات', 'Outstanding obligations')}</p><p className="mt-3 text-2xl font-bold tabular-nums"><Money value={remaining} lang={lang} /></p></div>
        <div className={`${obligationPanel} p-5`}><p className="text-xs text-muted-foreground">{t('بانتظار مراجعة المالية', 'Awaiting finance review')}</p><p className={`mt-3 text-2xl font-bold ${pending ? 'text-[#b43232]' : ''}`} data-testid="status-owner-pending">{pending}</p></div>
        <div className={`${obligationPanel} p-5`}><p className="text-xs text-muted-foreground">{t('رصيد حساب المالك المُرحّل', 'Posted owner account balance')}</p><p className="mt-3 text-2xl font-bold tabular-nums">{report.data ? <Money value={report.data.balance} lang={lang} /> : '—'}</p><p className="mt-1 text-xs text-muted-foreground">{t('لا يشمل طلبات المراجعة غير المعتمدة', 'Excludes unapproved requests')}</p></div>
      </div>
      {report.error && <p role="alert" className="text-sm text-destructive">{t('تعذر تحميل مراجعة حساب المالك:', 'Could not load owner account review:')} {obligationError(report.error)} <button type="button" onClick={() => void report.refetch()} className="underline">{t('أعد المحاولة', 'Retry')}</button></p>}
      {adding && <section className={`${obligationPanel} p-5 sm:p-7`}><h2 className="mb-4 text-lg font-bold">{t('إضافة التزام', 'Record an obligation')}</h2><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">{t('الاسم', 'Name')}<Input name="name" required maxLength={200} data-testid="input-obligation-name" /></label>
        <label className="space-y-1 text-sm">{t('المبلغ (ر.س)', 'Amount (SAR)')}<Input name="amount" inputMode="decimal" required data-testid="input-obligation-amount" /></label>
        <label className="space-y-1 text-sm">{t('تاريخ الاستحقاق', 'Due date')}<Input name="dueDate" type="date" required data-testid="input-obligation-due" /></label>
        <label className="space-y-1 text-sm">{t('التكرار', 'Recurrence')}<select name="recurrence" className="h-10 w-full rounded-md border border-input bg-background px-3" data-testid="select-obligation-recurrence"><option value="once">{t('مرة واحدة', 'Once')}</option><option value="monthly">{t('شهري', 'Monthly')}</option></select></label>
        <label className="space-y-1 text-sm">{t('الجهة المسؤولة', 'Liable party')}<select name="liableParty" className="h-10 w-full rounded-md border border-input bg-background px-3" data-testid="select-obligation-party"><option value="owner">{t('المالك', 'Owner')}</option><option value="company">{t('الشركة', 'Company')}</option></select></label>
        <div className="flex items-end gap-2"><Button disabled={create.isPending} type="submit" data-testid="button-save-obligation">{t('حفظ الالتزام', 'Save obligation')}</Button><Button type="button" variant="ghost" onClick={() => setAdding(false)}>{t('إلغاء', 'Cancel')}</Button></div>
        {formError && <p role="alert" className="sm:col-span-2 text-sm text-destructive">{formError}</p>}
      </form></section>}
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{t('السجل', 'Register')} <span className="ms-2 text-sm font-normal text-muted-foreground">{rows.length}</span></h2><button type="button" onClick={refresh} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground" data-testid="button-refresh-obligations"><RefreshCw className="h-3.5 w-3.5" />{t('تحديث', 'Refresh')}</button></div>
      {obligations.isLoading ? <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className={`${obligationPanel} h-36 animate-pulse bg-[#f0ece3] dark:bg-[#222225]`} />)}</div> : obligations.error ? <div role="alert" className={`${obligationPanel} p-7 text-sm text-destructive`}>{t('تعذر تحميل الالتزامات:', 'Could not load obligations:')} {obligationError(obligations.error)} <Button variant="outline" onClick={() => void obligations.refetch()}>{t('أعد المحاولة', 'Retry')}</Button></div> : !rows.length ? <div className={`${obligationPanel} p-12 text-center`}><ReceiptText className="mx-auto mb-4 h-9 w-9 text-[#be9838]" /><h3 className="font-bold">{t('لا توجد التزامات مسجلة بعد', 'No obligations recorded yet')}</h3><p className="mt-2 text-sm text-muted-foreground">{t('أضف أول التزام لبدء سجل قابل للتتبع.', 'Add the first obligation to start a traceable register.')}</p></div> :
      <div className="space-y-4">{rows.map((row) => <section key={row.id} className={`${obligationPanel} overflow-hidden`} data-testid={`card-obligation-${row.id}`}>
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0"><p className="text-xs font-medium tracking-widest text-[#a58026]">#{row.id} · {row.recurrence === 'monthly' ? t('شهري', 'MONTHLY') : t('مرة واحدة', 'ONE-TIME')}</p><h3 className="mt-2 text-xl font-bold">{row.name}</h3><p className="mt-2 text-sm text-muted-foreground">{t('الاستحقاق', 'Due')} {obligationDate(row.dueDate)} · {t('المسؤولية الفعلية', 'Effective liability')}: <strong className="text-foreground">{row.effectiveLiableParty === 'company' ? t('الشركة', 'Company') : t('المالك', 'Owner')}</strong>{row.liableParty !== row.effectiveLiableParty && ` · ${t('الأصل', 'Original')}: ${row.liableParty === 'company' ? t('الشركة', 'Company') : t('المالك', 'Owner')}`}</p></div>
          <div className="grid grid-cols-3 gap-5 border-t pt-4 text-sm sm:border-0 sm:pt-0"><div><p className="text-xs text-muted-foreground">{t('الأصل', 'Original')}</p><strong className="mt-1 block whitespace-nowrap"><Money value={row.amount} lang={lang} /></strong></div><div><p className="text-xs text-muted-foreground">{t('مدفوع', 'Paid')}</p><strong className="mt-1 block whitespace-nowrap"><Money value={row.paid} lang={lang} /></strong></div><div><p className="text-xs text-muted-foreground">{t('متبقي', 'Remaining')}</p><strong className="mt-1 block whitespace-nowrap text-[#a37c16]"><Money value={row.remaining} lang={lang} /></strong></div></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[#eeeae1] bg-[#fcfaf5] px-5 py-3 dark:border-[#292b2f] dark:bg-[#171719]">
          {Number(row.remaining) > 0 && <Button size="sm" variant="outline" onClick={() => { setActive(active === row.id ? null : row.id); setEventKind('payment'); setFormError(''); }} data-testid={`button-add-payment-${row.id}`}>{t('سداد جزئي', 'Record payment')}</Button>}
          {row.liableParty === 'owner' && row.effectiveLiableParty === 'owner' && Number(row.remaining) > 0 && <Button size="sm" variant="outline" onClick={() => { setActive(row.id); setEventKind('transfer'); setFormError(''); }} data-testid={`button-transfer-${row.id}`}>{t('طلب نقل المسؤولية', 'Request transfer')}</Button>}
          {row.recurrence === 'monthly' && !rows.some((item) => item.renewalOf === row.id) && <Button size="sm" variant="outline" disabled={renew.isPending} onClick={() => renew.mutate({ id: row.id }, { onSuccess: () => { refresh(); toast({ title: t('أُضيف استحقاق الشهر التالي دون تسجيل سداد', 'Next month added without recording a payment') }); }, onError: (failure) => setFormError(obligationError(failure)) })} data-testid={`button-renew-obligation-${row.id}`}>{t('إنشاء استحقاق الشهر التالي', 'Create next monthly due')}</Button>}
          <span className="ms-auto text-xs text-muted-foreground">{row.events.length} {t('حركة', 'events')} · {row.installments.length} {t('قسط', 'installments')}</span>
        </div>
        {active === row.id && <form onSubmit={(event) => saveEvent(event, row)} className="grid gap-3 border-t p-5 sm:grid-cols-2" data-testid={`form-obligation-event-${row.id}`}><h4 className="sm:col-span-2 font-bold">{eventKind === 'payment' ? t('طلب تسجيل سداد', 'Submit payment for review') : t('طلب نقل المسؤولية', 'Submit liability transfer')}</h4>
          {eventKind === 'payment' && <><label className="space-y-1 text-sm">{t('المبلغ', 'Amount')}<Input name="amount" inputMode="decimal" required data-testid="input-event-amount" /></label><label className="space-y-1 text-sm">{t('من دفع؟', 'Payer')}<select name="payer" className="h-10 w-full rounded-md border border-input bg-background px-3" data-testid="select-event-payer"><option value="owner">{t('المالك', 'Owner')}</option>{row.effectiveLiableParty === 'company' && <option value="company">{t('الشركة', 'Company')}</option>}</select></label></>}
          <label className="space-y-1 text-sm">{t('تاريخ الحركة', 'Event date')}<Input name="eventDate" type="date" defaultValue={today()} required data-testid="input-event-date" /></label>
          <p className="self-end text-xs leading-5 text-muted-foreground">{t('تبقى الحركة قيد المراجعة حتى توثّق المالية الدليل والحساب المقابل والسبب. السداد الشخصي لدين المالك لا ينشئ قيداً.', 'The request stays pending until finance documents evidence, counter account and reason. Personal payment of owner debt creates no journal.')}</p>
          {formError && <p role="alert" className="sm:col-span-2 text-sm text-destructive">{formError}</p>}
          <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={createEvent.isPending} data-testid="button-submit-obligation-event">{t('إرسال للمراجعة', 'Send for review')}</Button><Button type="button" variant="ghost" onClick={() => setActive(null)}>{t('إلغاء', 'Cancel')}</Button></div>
        </form>}
        {(row.events.length > 0 || row.installments.length > 0) && <div className="grid gap-5 border-t px-5 py-5 lg:grid-cols-2"><div><h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t('سجل الحركات', 'EVENT HISTORY')}</h4><div className="space-y-2">{row.events.map((item) => <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border p-3 text-sm"><div><strong>{item.kind === 'transfer' ? t('نقل مسؤولية', 'Liability transfer') : t('سداد', 'Payment')}</strong><span className="ms-2 text-muted-foreground">{obligationDate(item.eventDate)}</span><p className="mt-1 text-xs text-muted-foreground">{t('الدافع', 'Payer')}: {item.payer || '—'} · {t('الدليل', 'Evidence')}: {item.evidence || t('لم يُرفق بعد', 'Not yet documented')}</p>{item.reason && <p className="mt-1 text-xs">{item.reason}</p>}{item.status === 'corrected' && <p className="mt-1 text-xs text-destructive">{t('سبب التصحيح', 'Correction reason')}: {item.correctionReason} · {t('قيد العكس', 'Reversal')} #{item.reversalEntryId || '—'}</p>}{item.journalEntryId && <p className="mt-1 text-xs text-[#9a781f]">{t('قيد', 'Journal')} #{item.journalEntryId} · {item.accountCode || '—'}</p>}</div><div className="text-end"><strong><Money value={item.amount} lang={lang} /></strong><span className={`mt-1 block text-xs font-bold ${item.status === 'pending' ? 'text-[#b43232]' : item.status === 'approved' ? 'text-[#3b7855]' : 'text-muted-foreground'}`}>{item.status === 'pending' ? t('قيد المراجعة', 'Pending review') : item.status === 'approved' ? t('معتمد', 'Approved') : item.status === 'corrected' ? t('مصحّح', 'Corrected') : t('مرفوض', 'Rejected')}</span></div></div>)}</div></div><div><h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t('الأقساط المخططة', 'PLANNED INSTALLMENTS')}</h4><div className="space-y-2">{row.installments.map((item) => <div key={item.id} className="flex justify-between rounded-xl border p-3 text-sm"><span>{obligationDate(item.dueDate)}</span><strong><Money value={item.amount} lang={lang} /></strong></div>)}</div><Link href="/owner/payment-plan" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#a37c16]">{t('إدارة خطة السداد', 'Manage payment plan')}<ArrowUpRight className="h-4 w-4" /></Link></div></div>}
      </section>)}</div>}
      {report.data && <section className={`${obligationPanel} p-5 sm:p-6`}><div className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-[#ad8423]" /><h2 className="font-bold">{t('أثر حساب المالك', 'Owner account trail')}</h2></div><p className="mt-2 text-sm text-muted-foreground">{report.data.note}</p><p className="mt-3 text-xs text-muted-foreground">{t('القيد المحاسبي لا يختفي بمجرد طلب المراجعة؛ يلزم قرار موثق لتصحيحه.', 'A posted journal does not disappear because it is under review; correction requires a documented decision.')}</p></section>}
    </div>
  );
}