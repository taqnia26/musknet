import { useState } from 'react';
import { Search, Gift, Package, Coins, Users } from 'lucide-react';
import { useGetAdminGiftingIssues, useGetAdminGiftingIssuesId, getGetAdminGiftingIssuesQueryKey, getGetAdminGiftingIssuesIdQueryKey } from '@workspace/api-client-react';
import type { GiftingIssue, GetAdminGiftingIssuesCategory } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const categories: Array<{ value: GetAdminGiftingIssuesCategory; ar: string; en: string }> = [
  { value: 'VIP', ar: 'كبار العملاء', en: 'VIP' }, { value: 'Sample', ar: 'عينات', en: 'Samples' },
  { value: 'Damage', ar: 'تالف', en: 'Damage' }, { value: 'Marketing', ar: 'تسويق', en: 'Marketing' },
  { value: 'Tester', ar: 'تيستر', en: 'Testers' },
];
const labels: Record<string, string> = { VIP: 'كبار العملاء', Sample: 'عينات', Damage: 'تالف', Marketing: 'تسويق', Tester: 'تيستر' };

export default function AdminGiftingIssues() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<GetAdminGiftingIssuesCategory | undefined>();
  const [selected, setSelected] = useState<number | null>(null);
  const params = { search: search || undefined, category };
  const { data, isLoading, error } = useGetAdminGiftingIssues(params, { query: { retry: false, queryKey: getGetAdminGiftingIssuesQueryKey(params) } });
  const detail = useGetAdminGiftingIssuesId(selected ?? 0, { query: { enabled: selected !== null, queryKey: getGetAdminGiftingIssuesIdQueryKey(selected ?? 0) } });
  const rows = data?.rows ?? [];
  const summary = data?.summary;

  if (error) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-destructive" dir="rtl">لا تملك صلاحية عرض سجل الهدايا والعينات.</div>;
  return (
    <div className="space-y-6" dir="rtl">
      <header>
        <div className="flex items-center gap-3"><Gift className="h-7 w-7 text-primary" /><h1 className="text-3xl font-bold">{t('سجل الهدايا والتيستر', 'Gifts & Testers')}</h1></div>
        <p className="mt-2 text-muted-foreground">{t('أرشيف صرف الهدايا والعينات — للعرض فقط ولا يؤثر على المخزون أو القيود المحاسبية', 'Read-only archive of gifting issues; inventory and accounting are unchanged.')}</p>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={Users} label={t('عدد العمليات', 'Issues')} value={summary?.rows ?? 0} />
        <SummaryCard icon={Package} label={t('إجمالي الوحدات', 'Units')} value={summary?.units ?? 0} />
        <SummaryCard icon={Coins} label={t('إجمالي التكلفة', 'Total cost')} value={`${summary?.totalCost ?? '0'} SAR`} />
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" placeholder={t('ابحث باسم المستلم...', 'Search recipient...')} /></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={!category ? 'default' : 'outline'} onClick={() => setCategory(undefined)}>الكل</Button>
            {categories.map((item) => <Button key={item.value} size="sm" variant={category === item.value ? 'default' : 'outline'} onClick={() => setCategory(item.value)}>{item.ar}</Button>)}
          </div>
        </CardContent>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>{t('العمليات المسجلة', 'Recorded issues')} ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div> : rows.length === 0 ? <div className="p-8 text-center text-muted-foreground">لا توجد سجلات</div> : <>
            <div className="grid gap-3 p-4 md:hidden">{rows.map((row) => <MobileCard key={row.id} row={row} onSelect={setSelected} />)}</div>
            <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>المستلم</TableHead><TableHead>الفئة</TableHead><TableHead>المنتج</TableHead><TableHead>الكمية</TableHead><TableHead>التكلفة</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelected(row.id)}><TableCell className="font-medium">{row.recipientName}</TableCell><TableCell><Badge variant="outline">{labels[row.category] ?? row.category}</Badge></TableCell><TableCell>{row.descriptionSnapshot}<div className="text-xs text-muted-foreground">{row.barcode}</div></TableCell><TableCell>{row.quantity}</TableCell><TableCell>{row.totalCost} SAR</TableCell></TableRow>)}</TableBody></Table></div>
          </>}
        </CardContent>
      </Card>
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}><DialogContent dir="rtl"><DialogHeader><DialogTitle>تفاصيل العملية</DialogTitle></DialogHeader>{detail.data && <Detail row={detail.data} />}</DialogContent></Dialog>
    </div>
  );
}
function SummaryCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) { return <Card><CardContent className="flex items-center gap-3 p-4"><Icon className="h-5 w-5 text-primary" /><div><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold">{value}</div></div></CardContent></Card>; }
function MobileCard({ row, onSelect }: { row: GiftingIssue; onSelect: (id: number) => void }) { return <button className="rounded-lg border bg-background p-4 text-right shadow-sm" onClick={() => onSelect(row.id)}><div className="flex items-start justify-between gap-2"><b>{row.recipientName}</b><Badge variant="outline">{labels[row.category] ?? row.category}</Badge></div><div className="mt-2 text-sm">{row.descriptionSnapshot}</div><div className="mt-2 flex justify-between text-sm text-muted-foreground"><span>{row.quantity} وحدة</span><span>{row.totalCost} SAR</span></div></button>; }
function Detail({ row }: { row: GiftingIssue }) { return <div className="space-y-3 text-sm"><div className="flex justify-between"><b>{row.recipientName}</b><Badge>{labels[row.category] ?? row.category}</Badge></div><div>{row.descriptionSnapshot}</div><div className="text-muted-foreground">{row.barcode}</div>{row.comment && <div className="rounded bg-muted p-3">{row.comment}</div>}<div className="grid grid-cols-2 gap-3"><span>الكمية: <b>{row.quantity}</b></span><span>التكلفة: <b>{row.totalCost} SAR</b></span></div><div className="text-xs text-muted-foreground">المصدر: {row.sourceFilename} — الصف {row.sourceRow}</div></div>; }