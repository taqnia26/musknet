import { useLanguage } from '@/hooks/use-language';
import { sortProductsForSelection } from '@/lib/product-sort';
import { useListInventoryCycleCounts, useCreateInventoryCycleCount, useReviewInventoryCycleCount, useApproveInventoryCycleCount, useListInventoryLocations, useAdminListInventory } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListInventoryCycleCountsQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatInteger } from '@/lib/formatters';

export default function AdminInventoryCounts() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: counts, isLoading } = useListInventoryCycleCounts();
  const { data: rawLocations } = useListInventoryLocations();
  const { data: inventory } = useAdminListInventory();
  const locations = (rawLocations as unknown as Array<{ id: number; name: string; code: string }> | undefined) ?? [];
  const items = useMemo(
    () => sortProductsForSelection(inventory?.items ?? [], lang),
    [inventory, lang],
  );
  const createMutation = useCreateInventoryCycleCount();
  const reviewMutation = useReviewInventoryCycleCount();
  const approveMutation = useApproveInventoryCycleCount();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState([{ productId: '', countedQuantity: '' }]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        locationId: Number(fd.get('locationId')),
         lines: lines.map((line) => ({ productId: Number(line.productId), countedQuantity: Number(line.countedQuantity) }))
      }
    }, {
      onSuccess: () => {
        toast({ title: t('تم تسجيل الجرد', 'Count recorded') });
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: getListInventoryCycleCountsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          {t('الجرد الدوري للمخزون', 'Inventory Cycle Counts')}
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 me-2" />
              {t('جرد جديد', 'New Count')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('تسجيل جرد فعلي', 'Record Physical Count')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>{t('موقع الجرد (ID)', 'Location ID')}</Label>
                <Select name="locationId" defaultValue={locations[0] ? String(locations[0].id) : undefined}><SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر الموقع', 'Select location')} /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.code} · {location.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="border p-4 rounded-lg bg-muted/20">
                <h4 className="text-sm font-medium mb-3">{t('صنف الجرد', 'Counted Item')}</h4>
                {lines.map((line, index) => <div className="grid grid-cols-[1fr_8rem_auto] items-end gap-3 mb-3" key={index}>
                  <div>
                    <Label>{t('الصنف', 'Item')}</Label>
                    <Select value={line.productId} onValueChange={(value) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, productId: value } : entry))}><SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر الصنف', 'Select item')} /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.sku || item.id} · {item.nameEn}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div>
                    <Label>{t('الكمية الفعلية', 'Counted Qty')}</Label>
                    <Input value={line.countedQuantity} onChange={(e) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, countedQuantity: e.target.value } : entry))} type="number" min="0" required className="mt-1" />
                  </div>
                  <Button type="button" variant="ghost" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>{t('حذف', 'Remove')}</Button>
                </div>)}
                <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { productId: '', countedQuantity: '' }])}>{t('إضافة سطر', 'Add line')}</Button>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {t('إرسال للمراجعة', 'Submit for Review')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم الجرد', 'Count ID')}</TableHead>
                <TableHead>{t('الموقع', 'Location')}</TableHead>
                <TableHead>{t('الفروقات', 'Variances')}</TableHead>
                <TableHead>{t('قيمة الفرق', 'Variance value')}</TableHead>
                <TableHead>{t('الحالة', 'Status')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
              ) : !counts?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">{t('لا توجد عمليات جرد', 'No counts')}</TableCell></TableRow>
              ) : (
                counts.map(count => (
                  <TableRow key={count.id}>
                    <TableCell className="font-mono">#{count.id}</TableCell>
                    <TableCell>Location #{count.locationId}</TableCell>
                    <TableCell>
                      {count.lines.map((line) => {
                        const difference = line.countedQuantity - line.expectedQuantity;
                        return <div key={line.id} className={difference === 0 ? 'text-muted-foreground text-xs' : difference < 0 ? 'text-destructive text-xs' : 'text-success text-xs'}>
                          #{line.productId}: {difference > 0 ? '+' : ''}{formatInteger(difference)}
                        </div>;
                      })}
                    </TableCell>
                    <TableCell>{formatCurrency(count.lines.reduce((sum, line) => sum + (line.countedQuantity - line.expectedQuantity) * Number(line.unitCost), 0))} SAR</TableCell>
                    <TableCell>
                      <Badge variant={count.status === 'draft' ? 'secondary' : count.status === 'approved' ? 'default' : 'outline'}>
                        {count.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {count.status === 'draft' && <Button variant="ghost" size="sm" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: count.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInventoryCycleCountsQueryKey() }), onError: (error) => toast({ title: t('تعذر إرسال الجرد', 'Could not submit count'), description: error.message, variant: 'destructive' }) })}>{t('مراجعة', 'Review')}</Button>}
                      {count.status === 'review' && <Button variant="ghost" size="sm" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate({ id: count.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInventoryCycleCountsQueryKey() }), onError: (error) => toast({ title: t('تعذر اعتماد الجرد', 'Could not approve count'), description: error.message, variant: 'destructive' }) })}>{t('اعتماد', 'Approve')}</Button>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
