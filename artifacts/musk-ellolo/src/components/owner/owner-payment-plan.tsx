import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import {
  getListOwnerObligationsQueryKey, useListOwnerObligations, useAddOwnerObligationInstallment, useReviseOwnerInstallment,
  useGetOwnerAccountingReview, getGetOwnerAccountingReviewQueryKey,
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@/components/money';
import { obligationDate, obligationError, obligationPanel } from './owner-obligations';

export function OwnerPaymentPlan() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const client = useQueryClient();
  const obligations = useListOwnerObligations({ query: { queryKey: getListOwnerObligationsQueryKey(), refetchInterval: 15_000 } });
  const report = useGetOwnerAccountingReview({ query: { queryKey: getGetOwnerAccountingReviewQueryKey(), refetchInterval: 15_000 } });
  const add = useAddOwnerObligationInstallment();
  const revise = useReviseOwnerInstallment();
  const [editing, setEditing] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [error, setError] = useState('');
  const rows = obligations.data || [];
  const installments = rows.flatMap((obligation) => obligation.installments.map((installment) => ({ ...installment, obligation }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const remaining = rows.reduce((total, row) => total + Number(row.remaining), 0);
  const scheduled = installments.reduce((total, item) => total + Number(item.amount), 0);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (target === null) return;
    const fields = new FormData(event.currentTarget);
    const amount = String(fields.get('amount') || '').trim();
    const obligation = rows.find((row) => row.id === target);
    const existing = obligation?.installments.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
    if (!/^\d{1,14}(\.\d{1,4})?$/.test(amount) || Number(amount) <= 0 || !obligation || Number(amount) + existing > Number(obligation.remaining)) {
      setError(t('القسط يجب أن يكون موجباً، وألا يتجاوز مجموع الأقساط المتبقي على الالتزام.', 'Installment must be positive; planned installments must not exceed the obligation remainder.'));
      return;
    }
    setError('');
    add.mutate({ id: target, data: { amount, dueDate: String(fields.get('dueDate')) } }, {
      onSuccess: () => { void client.invalidateQueries({ queryKey: getListOwnerObligationsQueryKey() }); setTarget(null); toast({ title: t('تمت إضافة القسط', 'Installment added') }); },
      onError: (failure) => setError(obligationError(failure)),
    });
  };
  return <div className="space-y-7">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#af8517]">{t('المالك / جدولة', 'OWNER / SCHEDULING')}</p><h1 className="text-3xl font-bold">{t('خطة السداد', 'Payment plan')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('الأقساط من إنشائك. هي مواعيد مقترحة وليست إثبات سداد.', 'Installments are owner-created dates, not proof of payment.')}</p></div><Link href="/owner/obligations" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-[#f5efd9]">{t('سجل الالتزامات', 'Obligation register')}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></div>
    <div className="grid gap-3 sm:grid-cols-3"><div className={`${obligationPanel} p-5`}><p className="text-xs text-muted-foreground">{t('إجمالي المتبقي', 'Total outstanding')}</p><p className="mt-3 text-2xl font-bold"><Money value={remaining} lang={lang} /></p></div><div className={`${obligationPanel} p-5`}><p className="text-xs text-muted-foreground">{t('أقساط مجدولة', 'Scheduled installments')}</p><p className="mt-3 text-2xl font-bold"><Money value={scheduled} lang={lang} /></p></div><div className={`${obligationPanel} p-5`}><p className="text-xs text-muted-foreground">{t('رصيد حساب المالك المرحّل', 'Posted owner account balance')}</p><p className="mt-3 text-2xl font-bold">{report.data ? <Money value={report.data.balance} lang={lang} /> : '—'}</p></div></div>
    <section className={`${obligationPanel} border-s-4 border-s-[#d7b749] p-5 sm:p-7`}><h2 className="font-bold">{t('قراءة قائمة على البيانات، لا تقدير تلقائي', 'Grounded guidance, not an automatic guess')}</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">{t('يوضح السجل الالتزامات المتبقية وتواريخ استحقاقها، لكنه لا يثبت السيولة المتاحة أو التدفقات النقدية المستقبلية. لذلك لا يمكن اقتراح مبلغ قسط آمن رقمياً من هذه البيانات وحدها. راجع رصيد البنك والتدفقات المعتمدة قبل تثبيت المواعيد.', 'The register shows remaining obligations and due dates, but does not establish available cash or future cash flow. A safe numeric installment recommendation cannot be made from this data alone. Check verified bank balances and cash flow before committing dates.')}</p>{report.error && <p role="alert" className="mt-2 text-sm text-destructive">{t('تعذر تحميل رصيد المالك:', 'Owner balance unavailable:')} {obligationError(report.error)} <button type="button" className="underline" onClick={() => void report.refetch()}>{t('أعد المحاولة', 'Retry')}</button></p>}</section>
    {obligations.isLoading ? <div className={`${obligationPanel} h-48 animate-pulse`} /> : obligations.error ? <div role="alert" className={`${obligationPanel} p-6 text-destructive`}>{t('تعذر تحميل الخطة:', 'Could not load plan:')} {obligationError(obligations.error)} <Button variant="outline" onClick={() => void obligations.refetch()}>{t('أعد المحاولة', 'Retry')}</Button></div> : !rows.length ? <div className={`${obligationPanel} p-12 text-center`}><CalendarDays className="mx-auto mb-3 h-9 w-9 text-[#b58d2c]" /><h2 className="font-bold">{t('ابدأ بتسجيل التزام', 'Start with an obligation')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('ستظهر هنا مواعيد السداد عندما تضيف أقساطاً.', 'Your scheduled dates will appear here once installments are added.')}</p></div> : <>
      <section className={`${obligationPanel} p-5 sm:p-6`}><h2 className="mb-4 text-lg font-bold">{t('جدولة قسط جديد', 'Schedule an installment')}</h2><form onSubmit={submit} className="grid gap-4 sm:grid-cols-3"><label className="space-y-1 text-sm">{t('الالتزام', 'Obligation')}<select required value={target ?? ''} onChange={(event) => { setTarget(Number(event.target.value)); setError(''); }} className="h-10 w-full rounded-md border border-input bg-background px-3" data-testid="select-installment-obligation"><option value="" disabled>{t('اختر الالتزام', 'Choose obligation')}</option>{rows.filter((row) => Number(row.remaining) > 0).map((row) => <option key={row.id} value={row.id}>{row.name} · {row.remaining} SAR</option>)}</select></label><label className="space-y-1 text-sm">{t('المبلغ', 'Amount')}<Input name="amount" inputMode="decimal" required data-testid="input-installment-amount" /></label><label className="space-y-1 text-sm">{t('تاريخ الاستحقاق', 'Due date')}<Input name="dueDate" type="date" required data-testid="input-installment-date" /></label>{error && <p role="alert" className="sm:col-span-3 text-sm text-destructive">{error}</p>}<div className="sm:col-span-3"><Button type="submit" disabled={add.isPending || target === null} data-testid="button-save-installment"><Plus className="me-2 h-4 w-4" />{t('إضافة القسط', 'Add installment')}</Button></div></form></section>
      <section className={`${obligationPanel} overflow-hidden`}>
        <div className="border-b px-5 py-4"><h2 className="font-bold">{t('المواعيد القادمة', 'Scheduled dates')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('الجدولة لا تنفذ دفعة؛ أي تعديل محفوظ في سجل المراجعات.', 'Scheduling does not execute a payment; edits remain in the revision history.')}</p></div>
        {installments.length ? <div className="divide-y">{installments.map((item) => <div key={item.id} className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-[#aa8320]">{obligationDate(item.dueDate)}</p><p className="font-medium">{item.obligation.name}</p><p className="text-xs text-muted-foreground">{t('تعديلات سابقة', 'Previous revisions')}: {item.revisions?.length ?? 0}</p></div><div className="flex items-center gap-3"><strong><Money value={item.amount} lang={lang} /></strong><Button type="button" variant="outline" size="sm" onClick={() => { setEditing(editing === item.id ? null : item.id); setError(''); }}>{t('تعديل', 'Edit')}</Button></div></div>
          {editing === item.id && <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            revise.mutate({ id: item.id, data: { amount: String(fields.get('amount')), dueDate: String(fields.get('dueDate')) } }, {
              onSuccess: () => { void client.invalidateQueries({ queryKey: getListOwnerObligationsQueryKey() }); setEditing(null); toast({ title: t('حُفظ تعديل القسط', 'Installment updated') }); },
              onError: (failure) => setError(obligationError(failure)),
            });
          }}><label className="text-sm">{t('المبلغ', 'Amount')}<Input name="amount" defaultValue={item.amount} required /></label><label className="text-sm">{t('التاريخ', 'Date')}<Input name="dueDate" type="date" defaultValue={item.dueDate} required /></label><Button type="submit" disabled={revise.isPending}>{t('حفظ التعديل', 'Save edit')}</Button>{error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}</form>}
          {item.revisions?.map((revision) => <p key={revision.id} className="mt-2 text-xs text-muted-foreground">{t('تعديل', 'Revised')} {obligationDate(revision.changedAt)}: {revision.previousAmount} / {revision.previousDate} → {revision.nextAmount} / {revision.nextDate}</p>)}
        </div>)}</div> : <p className="p-8 text-center text-sm text-muted-foreground">{t('لا توجد أقساط مجدولة بعد.', 'No installments scheduled yet.')}</p>}
      </section>
    </>}
  </div>;
}