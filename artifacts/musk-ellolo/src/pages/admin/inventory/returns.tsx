import { useEffect, useState } from 'react';
import { getListSalesReturnsQueryKey, useListSalesReturns, type ListSalesReturnsParams, type SalesReturn } from '@workspace/api-client-react';
import { PackageX, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/hooks/use-language';
import { SalesReturnEditor, conditionLabel } from '@/components/admin/inventory/sales-return-editor';
import { errorText } from '@/components/admin/inventory/sales-return-shared';

export default function AdminInventoryReturns() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<'all' | 'draft' | 'completed' | 'cancelled'>('all');
  const [openId, setOpenId] = useState<number | 'new' | null>(null);

  useEffect(() => {
    const h = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(h);
  }, [search]);

  const params: ListSalesReturnsParams = { ...(debounced ? { search: debounced } : {}), ...(status !== 'all' ? { status } : {}) };
  const { data, isLoading, isError, error, refetch } = useListSalesReturns(params, {
    query: { queryKey: getListSalesReturnsQueryKey(params), refetchInterval: 15000 },
  });
  const rows: SalesReturn[] = data ?? [];

  const statusLabel = (s: string) => s === 'draft' ? t('مسودة', 'Draft') : s === 'completed' ? t('مكتمل', 'Completed') : t('ملغي', 'Cancelled');
  const fmt = (v: string) => new Date(v).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB');

  return (
    <div className="space-y-4" data-testid="page-sales-returns">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2"><PackageX className="w-5 h-5 text-primary" />{t('مرتجعات المبيعات', 'Sales returns')}</h2>
        <Button size="sm" onClick={() => setOpenId('new')} data-testid="button-new-return"><Plus className="w-4 h-4 me-2" />{t('مرتجع جديد', 'New return')}</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute top-2.5 start-3 text-muted-foreground" />
          <Input className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('بحث برقم المرتجع أو الطلب', 'Search return or order number')} data-testid="input-search-returns" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-40" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('كل الحالات', 'All statuses')}</SelectItem>
            <SelectItem value="draft">{t('مسودة', 'Draft')}</SelectItem>
            <SelectItem value="completed">{t('مكتمل', 'Completed')}</SelectItem>
            <SelectItem value="cancelled">{t('ملغي', 'Cancelled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : isError ? (
        <div className="rounded-md border p-4 text-sm space-y-2" data-testid="error-returns">
          <p className="text-destructive">{errorText(error, t('تعذر تحميل المرتجعات', 'Could not load returns'))}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry')}</Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground" data-testid="empty-returns">
          <PackageX className="w-8 h-8 mx-auto mb-2 opacity-50" />
          {t('لا توجد مرتجعات مطابقة. أنشئ مسودة من طلب أصلي.', 'No matching returns. Start a draft from an original order.')}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpenId(r.id)} className="w-full text-start rounded-md border bg-card p-3 hover:border-primary/60 transition-colors" data-testid={`row-return-${r.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm"><span className="font-mono font-semibold">#{r.id}</span> · <span className="font-mono">{r.orderNumber}</span> · {r.customerName}
                    <span className="ms-2 text-xs text-muted-foreground">{r.sourceType === 'company' ? t('شركة', 'Company') : t('فرد', 'Individual')}</span></div>
                  <Badge variant={r.status === 'draft' ? 'secondary' : r.status === 'completed' ? 'default' : 'outline'}>{statusLabel(r.status)}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {r.lines.map((l) => `${l.productName} x${l.quantity} (${conditionLabel(l.condition, t)})`).join(' · ')}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{fmt(r.updatedAt)}</div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={openId !== null} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{openId === 'new' ? t('مرتجع مبيعات جديد', 'New sales return') : t(`مرتجع رقم ${openId}`, `Sales return #${openId}`)}</DialogTitle></DialogHeader>
          {openId !== null && (
            <SalesReturnEditor key={String(openId)} id={openId === 'new' ? null : openId} onClose={() => setOpenId(null)} onSaved={(id) => setOpenId(id)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
