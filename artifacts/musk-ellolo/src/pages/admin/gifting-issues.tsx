import { useMemo, useState } from 'react';
import { Coins, Gift, Package, Search, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminGiftingIssuesQueryKey,
  getGetAdminGiftingIssuesIdQueryKey,
  useAdminListInventory,
  useCreateAdminGiftingIssue,
  useGetAdminGiftingIssues,
  useGetAdminGiftingIssuesId,
} from '@workspace/api-client-react';
import type { GiftingIssue, GiftingIssueCategory, GiftingIssueInputCategory } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { giftingIssueLabels as labels, issueUses } from './gifting-issues-config';
const initialForm = { productId: '', category: '' as GiftingIssueInputCategory | '', quantity: '1', issueDate: '', recipientName: '', occasion: '' };

export default function AdminGiftingIssues() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<GiftingIssueCategory | undefined>();
  const [selected, setSelected] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm);
  const params = { search: search || undefined, category };
  const { data, isLoading, error } = useGetAdminGiftingIssues(params, { query: { retry: false, queryKey: getGetAdminGiftingIssuesQueryKey(params) } });
  const detail = useGetAdminGiftingIssuesId(selected ?? 0, { query: { enabled: selected !== null, queryKey: getGetAdminGiftingIssuesIdQueryKey(selected ?? 0) } });
  const { data: inventory } = useAdminListInventory({ stockStatus: 'all', sort: 'name_asc' });
  const mutation = useCreateAdminGiftingIssue();
  const rows = data?.rows ?? [];
  const summary = data?.summary;
  const product = useMemo(() => inventory?.items.find((item) => item.id === Number(form.productId)), [inventory, form.productId]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const quantity = Number(form.quantity);
    if (!product || !form.category || !Number.isSafeInteger(quantity) || quantity <= 0) {
      toast({ title: t('اختر المنتج والاستخدام وأدخل كمية موجبة', 'Select a product and use, then enter a positive quantity'), variant: 'destructive' });
      return;
    }
    mutation.mutate({ data: {
      productId: product.id, category: form.category, quantity,
      idempotencyKey: crypto.randomUUID(),
      ...(form.issueDate ? { issueDate: form.issueDate } : {}),
      ...(form.recipientName.trim() ? { recipientName: form.recipientName.trim() } : {}),
      ...(form.occasion.trim() ? { occasion: form.occasion.trim() } : {}),
    } }, {
      onSuccess: async () => {
        setForm(initialForm);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['/api/admin/gifting-issues'] }),
          queryClient.invalidateQueries({ queryKey: ['/api/admin/inventory'] }),
        ]);
        toast({ title: t('تم صرف المنتج وتحديث المخزون والقيد المالي', 'Product issued; inventory and accounting were updated') });
      },
      onError: (mutationError: any) => toast({
        title: t('تعذر تنفيذ الصرف', 'Issue failed'),
        description: mutationError?.data?.error ?? mutationError?.message,
        variant: 'destructive',
      }),
    });
  };

  if (error) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-destructive">لا تملك صلاحية عرض سجل الهدايا والتيسترز.</div>;
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-3"><Gift className="h-7 w-7 text-primary" /><h1 className="text-3xl font-bold">{t('صرف الهدايا والتيسترز', 'Gifts & Testers')}</h1></div>
        <p className="mt-2 text-muted-foreground">{t('صرف فعلي من المخزون مع تسجيل التكلفة في حساب الهدايا والتيسترز.', 'Issue stock with its actual cost posted to Gifts and Testers.')}</p>
      </header>
      <Card>
        <CardHeader><CardTitle>{t('عملية صرف جديدة', 'New issue')}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div><Label>{t('المنتج', 'Product')} *</Label><Select value={form.productId} onValueChange={(value) => setForm((current) => ({ ...current, productId: value }))}><SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر المنتج', 'Select product')} /></SelectTrigger><SelectContent>{inventory?.items.map((item) => <SelectItem key={item.id} value={String(item.id)}>{lang === 'ar' ? item.nameAr : item.nameEn} — {item.stockQuantity}</SelectItem>)}</SelectContent></Select>{product && <p className="mt-1 text-xs text-muted-foreground">{t('المتاح', 'Available')}: {product.stockQuantity} · {t('متوسط التكلفة', 'Average cost')}: {product.averageCost} SAR</p>}</div>
            <div><Label>{t('الاستخدام', 'Use')} *</Label><Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value as GiftingIssueInputCategory }))}><SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر الاستخدام', 'Select use')} /></SelectTrigger><SelectContent>{issueUses.map((item) => <SelectItem key={item.value} value={item.value}>{lang === 'ar' ? item.ar : item.en}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>{t('الكمية', 'Quantity')} *</Label><Input className="mt-1" type="number" min="1" max={product?.stockQuantity} step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} /></div>
            <div><Label>{t('التاريخ (اختياري)', 'Date (optional)')}</Label><Input className="mt-1" type="date" value={form.issueDate} onChange={(event) => setForm((current) => ({ ...current, issueDate: event.target.value }))} /></div>
            <div><Label>{t('اسم الشخص (اختياري)', 'Person name (optional)')}</Label><Input className="mt-1" value={form.recipientName} onChange={(event) => setForm((current) => ({ ...current, recipientName: event.target.value }))} /></div>
            <div className="md:col-span-2"><Label>{t('المناسبة (اختياري)', 'Occasion (optional)')}</Label><Input className="mt-1" value={form.occasion} onChange={(event) => setForm((current) => ({ ...current, occasion: event.target.value }))} /></div>
            <div className="flex items-end"><Button className="w-full" type="submit" disabled={mutation.isPending || !product || product.stockQuantity <= 0}>{mutation.isPending ? t('جاري الصرف...', 'Issuing...') : t('صرف من المخزون', 'Issue from inventory')}</Button></div>
          </form>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={Users} label={t('عدد العمليات', 'Issues')} value={summary?.rows ?? 0} />
        <SummaryCard icon={Package} label={t('إجمالي الوحدات', 'Units')} value={summary?.units ?? 0} />
        <SummaryCard icon={Coins} label={t('إجمالي التكلفة', 'Total cost')} value={`${summary?.totalCost ?? '0'} SAR`} />
      </div>
      <Card><CardContent className="flex flex-col gap-3 p-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute end-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} className="pe-9" placeholder={t('ابحث باسم الشخص...', 'Search person...')} /></div><Select value={category ?? 'all'} onValueChange={(value) => setCategory(value === 'all' ? undefined : value as GiftingIssueCategory)}><SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('كل الاستخدامات', 'All uses')}</SelectItem>{Object.entries(labels).map(([value, label]) => <SelectItem key={value} value={value}>{lang === 'ar' ? label.ar : label.en}</SelectItem>)}</SelectContent></Select></CardContent></Card>
      <Card className="overflow-hidden"><CardHeader><CardTitle>{t('العمليات المسجلة', 'Recorded issues')} ({rows.length})</CardTitle></CardHeader><CardContent className="p-0">
        {isLoading ? <div className="p-8 text-center text-muted-foreground">{t('جاري التحميل...', 'Loading...')}</div> : rows.length === 0 ? <div className="p-8 text-center text-muted-foreground">{t('لا توجد سجلات', 'No records')}</div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('التاريخ', 'Date')}</TableHead><TableHead>{t('الاستخدام', 'Use')}</TableHead><TableHead>{t('المنتج', 'Product')}</TableHead><TableHead>{t('الشخص / المناسبة', 'Person / occasion')}</TableHead><TableHead>{t('الكمية', 'Quantity')}</TableHead><TableHead>{t('التكلفة', 'Cost')}</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelected(row.id)}><TableCell>{new Date(row.issueDate).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US')}</TableCell><TableCell><Badge variant="outline">{labels[row.category]?.[lang] ?? row.category}</Badge></TableCell><TableCell>{row.descriptionSnapshot}<div className="text-xs text-muted-foreground">{row.barcode}</div></TableCell><TableCell>{row.recipientName || '—'}{row.occasion && <div className="text-xs text-muted-foreground">{row.occasion}</div>}</TableCell><TableCell>{row.quantity}</TableCell><TableCell>{row.totalCost} SAR</TableCell></TableRow>)}</TableBody></Table></div>}
      </CardContent></Card>
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>{t('تفاصيل العملية', 'Issue details')}</DialogTitle></DialogHeader>{detail.data && <Detail row={detail.data} lang={lang} />}</DialogContent></Dialog>
    </div>
  );
}
function SummaryCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) { return <Card><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-primary" /><div><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold">{value}</div></div></CardContent></Card>; }
function Detail({ row, lang }: { row: GiftingIssue; lang: 'ar' | 'en' }) { return <div className="space-y-3 text-sm"><div className="flex justify-between"><b>{row.recipientName || '—'}</b><Badge>{labels[row.category]?.[lang] ?? row.category}</Badge></div><div>{row.descriptionSnapshot}</div><div className="text-muted-foreground">{new Date(row.issueDate).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US')}</div>{row.occasion && <div className="rounded bg-muted p-3">{row.occasion}</div>}{row.comment && <div className="rounded bg-muted p-3">{row.comment}</div>}<div className="grid grid-cols-2 gap-3"><span>الكمية: <b>{row.quantity}</b></span><span>التكلفة: <b>{row.totalCost} SAR</b></span></div>{row.sourceFilename && <div className="text-xs text-muted-foreground">المصدر: {row.sourceFilename}{row.sourceRow ? ` — الصف ${row.sourceRow}` : ''}</div>}</div>; }