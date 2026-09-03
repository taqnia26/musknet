import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  getAdminGetTrialBalanceQueryKey,
  getAdminListJournalEntriesQueryKey,
  type AccountingAccount,
  type AdminJournalEntry,
  useAdminCreateJournalEntry,
  useAdminGetTrialBalance,
  useAdminListAccountingAccounts,
  useAdminListJournalEntries,
  useAdminReverseJournalEntry,
  useGetAdminMe,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronDown, ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';

const today = () => new Date().toISOString().slice(0, 10);
const amountPattern = /^\d{1,15}(?:\.\d{1,4})?$/;

const journalSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1),
  lines: z.array(z.object({
    accountId: z.coerce.number().int().positive(),
    description: z.string(),
    debit: z.string().regex(amountPattern),
    credit: z.string().regex(amountPattern),
  }).refine((line) => (Number(line.debit) > 0) !== (Number(line.credit) > 0), {
    message: 'Enter a positive debit or credit, but not both',
    path: ['debit'],
  })).min(2),
}).superRefine((value, context) => {
  const debit = value.lines.reduce((total, line) => total + Math.round(Number(line.debit) * 10000), 0);
  const credit = value.lines.reduce((total, line) => total + Math.round(Number(line.credit) * 10000), 0);
  if (debit !== credit) context.addIssue({ code: 'custom', message: 'Debit and credit totals must match', path: ['lines'] });
});

type JournalForm = z.infer<typeof journalSchema>;

function money(value: string) {
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function errorMessage(error: unknown) {
  const value = error as { data?: { error?: string }; message?: string };
  return value.data?.error ?? value.message ?? 'Request failed';
}

function AccountTree({ accounts }: { accounts: AccountingAccount[] }) {
  const { t } = useLanguage();
  const children = useMemo(() => {
    const result = new Map<number | null, AccountingAccount[]>();
    for (const account of accounts) {
      const siblings = result.get(account.parentId) ?? [];
      siblings.push(account);
      result.set(account.parentId, siblings);
    }
    return result;
  }, [accounts]);

  const renderBranch = (parentId: number | null, depth = 0): ReactNode =>
    (children.get(parentId) ?? []).map((account) => (
      <div key={account.id}>
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b px-3 py-3 last:border-0"
          style={{ paddingInlineStart: `${12 + depth * 24}px` }}
          data-testid={`row-account-${account.id}`}
        >
          <div className="min-w-0">
            <div className="font-medium"><span className="font-mono text-muted-foreground">{account.code}</span> · {account.nameAr}</div>
            <div className="text-sm text-muted-foreground">{account.nameEn}</div>
          </div>
          <Badge variant="outline">{account.accountType}</Badge>
          <Badge variant={account.isPosting ? 'default' : 'secondary'}>{account.isPosting ? t('ترحيل', 'Posting') : t('رئيسي', 'Header')}</Badge>
        </div>
        {renderBranch(account.id, depth + 1)}
      </div>
    ));

  return <div className="overflow-hidden rounded-md border bg-card">{renderBranch(null)}</div>;
}

function AccountsTab() {
  const { t } = useLanguage();
  const { data: accounts, isLoading } = useAdminListAccountingAccounts();
  if (isLoading) return <p className="py-10 text-center" data-testid="status-accounts-loading">{t('جاري التحميل...', 'Loading...')}</p>;
  if (!accounts?.length) return <p className="py-10 text-center" data-testid="status-accounts-empty">{t('لا توجد حسابات', 'No accounts')}</p>;
  return <AccountTree accounts={accounts} />;
}

function EntryDetails({ entry, accounts }: { entry: AdminJournalEntry; accounts: AccountingAccount[] }) {
  const { t } = useLanguage();
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return (
    <div className="space-y-3 bg-muted/30 p-4" data-testid={`details-journal-${entry.id}`}>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <div><span className="text-muted-foreground">{t('المصدر', 'Source')}: </span>{entry.sourceType ? `${entry.sourceType} #${entry.sourceId}` : t('يدوي', 'Manual')}</div>
        <div><span className="text-muted-foreground">{t('المنشئ', 'Creator')}: </span>{entry.creator.name} ({entry.creator.email})</div>
        <div><span className="text-muted-foreground">{t('المرحّل', 'Poster')}: </span>{entry.poster.name} ({entry.poster.email})</div>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>#</TableHead><TableHead>{t('الحساب', 'Account')}</TableHead><TableHead>{t('البيان', 'Description')}</TableHead><TableHead>{t('مدين', 'Debit')}</TableHead><TableHead>{t('دائن', 'Credit')}</TableHead></TableRow></TableHeader>
        <TableBody>
          {entry.lines.map((line) => {
            const account = byId.get(line.accountId);
            return (
              <TableRow key={line.id} data-testid={`row-journal-line-${line.id}`}>
                <TableCell>{line.lineNumber}</TableCell>
                <TableCell>{account ? `${account.code} · ${account.nameAr} / ${account.nameEn}` : line.accountId}</TableCell>
                <TableCell>{line.description || '—'}</TableCell>
                <TableCell className="font-mono">{money(line.debit)}</TableCell>
                <TableCell className="font-mono">{money(line.credit)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function EntriesTab({ canEdit }: { canEdit: boolean }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [reversing, setReversing] = useState<AdminJournalEntry | null>(null);
  const [reversalDate, setReversalDate] = useState(today());
  const [reversalReason, setReversalReason] = useState('');
  const params = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const invalidRange = Boolean(from && to && from > to);
  const { data: entries, isLoading } = useAdminListJournalEntries(params, {
    query: { enabled: !invalidRange, queryKey: getAdminListJournalEntriesQueryKey(params) },
  });
  const { data: accounts = [] } = useAdminListAccountingAccounts();
  const reverseMutation = useAdminReverseJournalEntry();

  const reverse = () => {
    if (!reversing || !reversalReason.trim() || !reversalDate) return;
    reverseMutation.mutate({ id: reversing.id, data: { entryDate: reversalDate, description: reversalReason.trim() } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListJournalEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAdminGetTrialBalanceQueryKey() });
        setReversing(null);
        setReversalReason('');
        toast({ title: t('تم عكس القيد', 'Journal entry reversed') });
      },
      onError: (error) => toast({ title: t('تعذر عكس القيد', 'Could not reverse entry'), description: errorMessage(error), variant: 'destructive' }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-4">
        <label className="space-y-1 text-sm">{t('من', 'From')}<Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} data-testid="input-journal-from" /></label>
        <label className="space-y-1 text-sm">{t('إلى', 'To')}<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} data-testid="input-journal-to" /></label>
        {invalidRange && <p className="text-sm text-destructive" data-testid="status-journal-date-error">{t('تاريخ البداية يجب أن يسبق النهاية', 'From date must not be after to date')}</p>}
      </div>
      <div className="overflow-hidden rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead /><TableHead>{t('رقم القيد', 'Entry')}</TableHead><TableHead>{t('التاريخ', 'Date')}</TableHead><TableHead>{t('البيان', 'Description')}</TableHead><TableHead>{t('الحالة', 'Status')}</TableHead><TableHead>{t('المصدر', 'Source')}</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7} className="text-center" data-testid="status-journals-loading">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
              : invalidRange ? <TableRow><TableCell colSpan={7} className="text-center">{t('صحح نطاق التاريخ', 'Correct the date range')}</TableCell></TableRow>
              : !entries?.length ? <TableRow><TableCell colSpan={7} className="text-center" data-testid="status-journals-empty">{t('لا توجد قيود', 'No journal entries')}</TableCell></TableRow>
              : entries.map((entry) => (
                <Fragment key={entry.id}>
                  <TableRow data-testid={`row-journal-${entry.id}`}>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)} data-testid={`button-journal-details-${entry.id}`}>
                        {expanded === entry.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 rtl:rotate-180" />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono font-medium">{entry.entryNumber}</TableCell>
                    <TableCell>{entry.entryDate}</TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell><Badge variant={entry.status === 'posted' ? 'default' : 'secondary'}>{entry.status}</Badge></TableCell>
                    <TableCell>{entry.sourceType ? `${entry.sourceType} #${entry.sourceId}` : t('يدوي', 'Manual')}</TableCell>
                    <TableCell>
                      {canEdit && entry.status === 'posted' && (
                        <Button variant="outline" size="sm" onClick={() => { setReversing(entry); setReversalDate(today()); }} data-testid={`button-reverse-journal-${entry.id}`}>
                          <RotateCcw className="me-2 h-4 w-4" />{t('عكس', 'Reverse')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {expanded === entry.id && <TableRow key={`${entry.id}-details`}><TableCell colSpan={7} className="p-0"><EntryDetails entry={entry} accounts={accounts} /></TableCell></TableRow>}
                </Fragment>
              ))}
          </TableBody>
        </Table>
      </div>
      <AlertDialog open={Boolean(reversing)} onOpenChange={(open) => { if (!open) setReversing(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('تأكيد عكس القيد', 'Confirm journal reversal')}</AlertDialogTitle>
            <AlertDialogDescription>{t('سيتم إنشاء قيد عكسي جديد ولا يمكن حذف القيود المرحلة.', 'A new reversing entry will be posted. Posted entries cannot be deleted.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <label className="space-y-1 text-sm">{t('تاريخ العكس', 'Reversal date')}<Input type="date" value={reversalDate} onChange={(event) => setReversalDate(event.target.value)} data-testid="input-reversal-date" /></label>
            <label className="space-y-1 text-sm">{t('سبب العكس', 'Reversal reason')}<Textarea value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} data-testid="input-reversal-reason" /></label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reversal">{t('إلغاء', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); reverse(); }} disabled={!reversalDate || !reversalReason.trim() || reverseMutation.isPending} data-testid="button-confirm-reversal">{t('تأكيد العكس', 'Confirm reversal')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ManualEntryTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useAdminListAccountingAccounts();
  const mutation = useAdminCreateJournalEntry();
  const form = useForm<JournalForm>({
    resolver: zodResolver(journalSchema),
    defaultValues: { entryDate: today(), description: '', lines: [{ accountId: 0, description: '', debit: '0', credit: '0' }, { accountId: 0, description: '', debit: '0', credit: '0' }] },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const watched = form.watch('lines');
  const totals = watched.reduce((result, line) => ({ debit: result.debit + Number(line.debit || 0), credit: result.credit + Number(line.credit || 0) }), { debit: 0, credit: 0 });
  const postingAccounts = accounts.filter((account) => account.isPosting && account.isActive);

  const submit = (values: JournalForm) => mutation.mutate({
    data: {
      entryDate: values.entryDate,
      description: values.description.trim(),
      lines: values.lines.map((line) => ({ ...line, description: line.description.trim() || null })),
    },
  }, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getAdminListJournalEntriesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getAdminGetTrialBalanceQueryKey() });
      form.reset({ entryDate: today(), description: '', lines: [{ accountId: 0, description: '', debit: '0', credit: '0' }, { accountId: 0, description: '', debit: '0', credit: '0' }] });
      toast({ title: t('تم ترحيل القيد', 'Journal entry posted') });
    },
    onError: (error) => toast({ title: t('تعذر ترحيل القيد', 'Could not post entry'), description: errorMessage(error), variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader><CardTitle>{t('قيد يومية يدوي', 'Manual journal entry')}</CardTitle></CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <FormField control={form.control} name="entryDate" render={({ field }) => <FormItem><FormLabel>{t('التاريخ', 'Date')}</FormLabel><FormControl><Input type="date" {...field} data-testid="input-entry-date" /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="description" render={({ field }) => <FormItem className="md:col-span-2"><FormLabel>{t('البيان', 'Description')}</FormLabel><FormControl><Input {...field} data-testid="input-entry-description" /></FormControl><FormMessage /></FormItem>} />
            </div>
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-[2fr_2fr_1fr_1fr_auto]">
                  <FormField control={form.control} name={`lines.${index}.accountId`} render={({ field: accountField }) => <FormItem><FormLabel>{t('الحساب', 'Account')}</FormLabel><FormControl><select {...accountField} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid={`select-entry-account-${index}`}><option value={0}>{t('اختر حساباً', 'Select account')}</option>{postingAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.nameAr} / {account.nameEn}</option>)}</select></FormControl><FormMessage /></FormItem>} />
                  <FormField control={form.control} name={`lines.${index}.description`} render={({ field: descriptionField }) => <FormItem><FormLabel>{t('بيان السطر', 'Line description')}</FormLabel><FormControl><Input {...descriptionField} data-testid={`input-entry-line-description-${index}`} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={form.control} name={`lines.${index}.debit`} render={({ field: debitField }) => <FormItem><FormLabel>{t('مدين', 'Debit')}</FormLabel><FormControl><Input inputMode="decimal" {...debitField} data-testid={`input-entry-debit-${index}`} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={form.control} name={`lines.${index}.credit`} render={({ field: creditField }) => <FormItem><FormLabel>{t('دائن', 'Credit')}</FormLabel><FormControl><Input inputMode="decimal" {...creditField} data-testid={`input-entry-credit-${index}`} /></FormControl><FormMessage /></FormItem>} />
                  <Button type="button" variant="ghost" size="icon" disabled={fields.length <= 2} onClick={() => remove(index)} className="self-end text-destructive" data-testid={`button-remove-entry-line-${index}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {form.formState.errors.lines?.message && <p className="text-sm text-destructive" data-testid="status-entry-balance-error">{form.formState.errors.lines.message}</p>}
              <Button type="button" variant="outline" onClick={() => append({ accountId: 0, description: '', debit: '0', credit: '0' })} data-testid="button-add-entry-line"><Plus className="me-2 h-4 w-4" />{t('إضافة سطر', 'Add line')}</Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-muted p-4">
              <div className="flex gap-6 font-mono" data-testid="text-entry-totals"><span>{t('مدين', 'Debit')}: {money(String(totals.debit))}</span><span>{t('دائن', 'Credit')}: {money(String(totals.credit))}</span></div>
              <Badge variant={totals.debit > 0 && totals.debit === totals.credit ? 'default' : 'destructive'}>{totals.debit > 0 && totals.debit === totals.credit ? t('متوازن', 'Balanced') : t('غير متوازن', 'Unbalanced')}</Badge>
            </div>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-post-journal">{mutation.isPending ? t('جاري الترحيل...', 'Posting...') : t('ترحيل القيد', 'Post entry')}</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function TrialBalanceTab() {
  const { t } = useLanguage();
  const [asOf, setAsOf] = useState(today());
  const trialParams = { as_of: asOf };
  const { data: balance, isLoading } = useAdminGetTrialBalance(trialParams, {
    query: { enabled: Boolean(asOf), queryKey: getAdminGetTrialBalanceQueryKey(trialParams) },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 rounded-md border bg-card p-4">
        <label className="space-y-1 text-sm">{t('كما في تاريخ', 'As of')}<Input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} data-testid="input-trial-balance-date" /></label>
      </div>
      <div className="overflow-hidden rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>{t('الحساب', 'Account')}</TableHead><TableHead>{t('النوع', 'Type')}</TableHead><TableHead>{t('الرصيد الافتتاحي', 'Opening')}</TableHead><TableHead>{t('إجمالي المدين', 'Debit')}</TableHead><TableHead>{t('إجمالي الدائن', 'Credit')}</TableHead><TableHead>{t('الرصيد الختامي', 'Closing')}</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading || !balance ? <TableRow><TableCell colSpan={6} className="text-center" data-testid="status-trial-loading">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow> : (
              <>
                {balance.accounts.map((account) => <TableRow key={account.accountId} data-testid={`row-trial-account-${account.accountId}`}><TableCell><div>{account.accountCode} · {account.accountNameAr}</div><div className="text-xs text-muted-foreground">{account.accountNameEn}</div></TableCell><TableCell>{account.accountType}</TableCell><TableCell className="font-mono">{money(account.openingBalance)}</TableCell><TableCell className="font-mono">{money(account.totalDebit)}</TableCell><TableCell className="font-mono">{money(account.totalCredit)}</TableCell><TableCell className="font-mono">{money(account.closingBalance)}</TableCell></TableRow>)}
                <TableRow className="font-bold"><TableCell colSpan={3}>{t('الإجمالي', 'Total')}</TableCell><TableCell data-testid="text-trial-total-debit">{money(balance.totalDebit)}</TableCell><TableCell data-testid="text-trial-total-credit">{money(balance.totalCredit)}</TableCell><TableCell><Badge variant={balance.isBalanced ? 'default' : 'destructive'}>{balance.isBalanced ? t('متوازن', 'Balanced') : t('غير متوازن', 'Unbalanced')}</Badge></TableCell></TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function AdminAccounting() {
  const { t } = useLanguage();
  const [location] = useLocation();
  const { data: user, isLoading } = useGetAdminMe();
  const canView = hasPermission(user, 'accounting', 'view');
  const canEdit = hasPermission(user, 'accounting', 'edit');
  if (isLoading) return <p className="py-10 text-center">{t('جاري التحميل...', 'Loading...')}</p>;
  if (!canView) return <Card><CardContent className="py-12 text-center text-muted-foreground" data-testid="status-accounting-forbidden">{t('ليس لديك صلاحية عرض المحاسبة', 'You do not have permission to view accounting')}</CardContent></Card>;
  const initialTab = location.endsWith('/journal-entries') ? 'journals' : location.endsWith('/trial-balance') ? 'trial' : 'accounts';
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><BookOpen className="h-8 w-8 text-primary" /><div><h1 className="text-3xl font-bold tracking-tight">{t('المحاسبة', 'Accounting')}</h1><p className="mt-1 text-muted-foreground">{t('دليل الحسابات والقيود وميزان المراجعة', 'Chart of accounts, journals, and trial balance')}</p></div></div>
      <Tabs key={initialTab} defaultValue={initialTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 lg:grid-cols-4">
          <TabsTrigger value="accounts" data-testid="tab-accounts">{t('دليل الحسابات', 'Chart of accounts')}</TabsTrigger>
          <TabsTrigger value="journals" data-testid="tab-journals">{t('القيود اليومية', 'Journal entries')}</TabsTrigger>
          {canEdit && <TabsTrigger value="manual" data-testid="tab-manual-entry">{t('قيد يدوي', 'Manual entry')}</TabsTrigger>}
          <TabsTrigger value="trial" data-testid="tab-trial-balance">{t('ميزان المراجعة', 'Trial balance')}</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" className="mt-4"><AccountsTab /></TabsContent>
        <TabsContent value="journals" className="mt-4"><EntriesTab canEdit={canEdit} /></TabsContent>
        {canEdit && <TabsContent value="manual" className="mt-4"><ManualEntryTab /></TabsContent>}
        <TabsContent value="trial" className="mt-4"><TrialBalanceTab /></TabsContent>
      </Tabs>
    </div>
  );
}