import { useLanguage } from '@/hooks/use-language';
import { sortProductsForSelection } from '@/lib/product-sort';
import { useListInventoryCycleCounts, useCreateInventoryCycleCount, useUpdateInventoryCycleCount, useDeleteInventoryCycleCount, useReviewInventoryCycleCount, useApproveInventoryCycleCount, useListInventoryLocations, useAdminListInventory } from '@workspace/api-client-react';
import type { InventoryCycleCount } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Mail, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  const updateMutation = useUpdateInventoryCycleCount();
  const deleteMutation = useDeleteInventoryCycleCount();
  const reviewMutation = useReviewInventoryCycleCount();
  const approveMutation = useApproveInventoryCycleCount();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryCycleCount | null>(null);
  const [locationId, setLocationId] = useState('');
  const [lines, setLines] = useState([{ productId: '', countedQuantity: '' }]);

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
    setLocationId('');
    setLines([{ productId: '', countedQuantity: '' }]);
  };

  const openNew = () => {
    setEditing(null);
    setLocationId(locations[0] ? String(locations[0].id) : '');
    setLines([{ productId: '', countedQuantity: '' }]);
    setOpen(true);
  };

  const openEdit = (count: InventoryCycleCount) => {
    setEditing(count);
    setLocationId(String(count.locationId));
    setLines(count.lines.map((line) => ({ productId: String(line.productId), countedQuantity: String(line.countedQuantity) })));
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = {
      locationId: Number(locationId),
      lines: lines.map((line) => ({ productId: Number(line.productId), countedQuantity: Number(line.countedQuantity) })),
    };
    const options = {
      onSuccess: () => {
        toast({ title: editing ? t('تم تعديل الجرد', 'Count updated') : t('تم تسجيل الجرد', 'Count recorded') });
        closeDialog();
        queryClient.invalidateQueries({ queryKey: getListInventoryCycleCountsQueryKey() });
      },
      onError: (error: Error) => toast({ title: t('تعذر حفظ الجرد', 'Could not save count'), description: error.message, variant: 'destructive' }),
    };
    if (editing) updateMutation.mutate({ id: editing.id, data }, options);
    else createMutation.mutate({ data }, options);
  };

  const removeCount = (count: InventoryCycleCount) => {
    if (!window.confirm(t('سيتم حذف مسودة الجرد نهائيًا. هل تريد المتابعة؟', 'This draft count will be permanently deleted. Continue?'))) return;
    deleteMutation.mutate({ id: count.id }, {
      onSuccess: () => {
        toast({ title: t('تم حذف مسودة الجرد', 'Draft count deleted') });
        queryClient.invalidateQueries({ queryKey: getListInventoryCycleCountsQueryKey() });
      },
      onError: (error) => toast({ title: t('تعذر حذف الجرد', 'Could not delete count'), description: error.message, variant: 'destructive' }),
    });
  };

  const productLabel = (productId: number) => {
    const product = items.find((item) => item.id === productId);
    return product ? `${product.sku || product.id} · ${lang === 'ar' ? product.nameAr : product.nameEn}` : `#${productId}`;
  };

  const printCount = (count: InventoryCycleCount) => {
    const location = locations.find((entry) => entry.id === count.locationId);
    const rows = count.lines.map((line) => `<tr><td>${productLabel(line.productId)}</td><td>${line.expectedQuantity}</td><td>${line.countedQuantity}</td><td>${line.countedQuantity - line.expectedQuantity}</td></tr>`).join('');
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) return;
    popup.document.write(`<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${t('جرد المخزون', 'Inventory Count')} #${count.id}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{margin:0 0 8px}p{color:#555}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #ccc;padding:10px;text-align:center}th{background:#f3f3f3}</style></head><body><h1>${t('الجرد الدوري للمخزون', 'Inventory Cycle Count')} #${count.id}</h1><p>${t('الموقع', 'Location')}: ${location?.name ?? count.locationId} · ${t('الحالة', 'Status')}: ${count.status}</p><table><thead><tr><th>${t('الصنف', 'Item')}</th><th>${t('المتوقع', 'Expected')}</th><th>${t('الفعلي', 'Counted')}</th><th>${t('الفرق', 'Variance')}</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  const emailCount = (count: InventoryCycleCount) => {
    const subject = t(`تقرير الجرد رقم ${count.id}`, `Inventory count report #${count.id}`);
    const body = count.lines.map((line) => `${productLabel(line.productId)}: ${line.countedQuantity} (${line.countedQuantity - line.expectedQuantity >= 0 ? '+' : ''}${line.countedQuantity - line.expectedQuantity})`).join('\n');
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          {t('الجرد الدوري للمخزون', 'Inventory Cycle Counts')}
        </h2>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 me-2" />
          {t('جرد جديد', 'New Count')}
        </Button>
        <Dialog open={open} onOpenChange={(next) => next ? setOpen(true) : closeDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? t('تعديل مسودة الجرد', 'Edit Cycle Count Draft') : t('تسجيل جرد فعلي', 'Record Physical Count')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>{t('موقع الجرد (ID)', 'Location ID')}</Label>
                <Select value={locationId} onValueChange={setLocationId}><SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر الموقع', 'Select location')} /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.code} · {location.name}</SelectItem>)}</SelectContent></Select>
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
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editing ? t('حفظ التعديلات', 'Save Changes') : t('حفظ كمسودة', 'Save Draft')}
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
                    <TableCell className="text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                      {count.status === 'draft' && <Button variant="ghost" size="sm" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: count.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInventoryCycleCountsQueryKey() }), onError: (error) => toast({ title: t('تعذر إرسال الجرد', 'Could not submit count'), description: error.message, variant: 'destructive' }) })}>{t('مراجعة', 'Review')}</Button>}
                      {count.status === 'review' && <Button variant="ghost" size="sm" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate({ id: count.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInventoryCycleCountsQueryKey() }), onError: (error) => toast({ title: t('تعذر اعتماد الجرد', 'Could not approve count'), description: error.message, variant: 'destructive' }) })}>{t('اعتماد', 'Approve')}</Button>}
                      <Button variant="ghost" size="icon" title={t('طباعة', 'Print')} onClick={() => printCount(count)}><Printer className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title={t('إرسال بالبريد', 'Send by email')} onClick={() => emailCount(count)}><Mail className="h-4 w-4" /></Button>
                      {count.status === 'draft' && <Button variant="ghost" size="icon" title={t('تعديل', 'Edit')} onClick={() => openEdit(count)}><Pencil className="h-4 w-4" /></Button>}
                      {count.status === 'draft' && <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title={t('حذف', 'Delete')} disabled={deleteMutation.isPending} onClick={() => removeCount(count)}><Trash2 className="h-4 w-4" /></Button>}
                      </div>
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
