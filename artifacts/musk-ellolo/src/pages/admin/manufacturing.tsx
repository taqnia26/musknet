import { useMemo, useState } from 'react';
import { 
  useAdminListManufacturingBatches,
  useAdminCreateManufacturingBatch,
  useAdminUpdateManufacturingBatch,
  useAdminDeleteManufacturingBatch,
  useAdminListProducts,
  useAdminListProductionPlans,
  useAdminAddManufacturingInputs,
  useGetAdminMe,
  getAdminListManufacturingBatchesQueryKey,
  getAdminListProductionPlansQueryKey
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { quantityInputClass } from '@/lib/quantity-input';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Edit2, Trash2, Search, MoreHorizontal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { sortProductsForSelection } from '@/lib/product-sort';

export default function AdminManufacturing() {
  const { t, lang } = useLanguage();
  const { data: currentUser } = useGetAdminMe();
  const canEdit = hasPermission(currentUser, 'manufacturing', 'edit');
  const canDelete = hasPermission(currentUser, 'manufacturing', 'delete');
  
  const [isOpen, setIsOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<any>(null);
  const [inputLines, setInputLines] = useState<{ materialProductId: string; quantity: string }[]>([]);
  
  const { data: batches, isLoading, isError, refetch } = useAdminListManufacturingBatches();
  const { data: plans } = useAdminListProductionPlans({query:{enabled:hasPermission(currentUser,'manufacturing','view'),queryKey:getAdminListProductionPlansQueryKey()}});
  const eligiblePlans = plans?.filter(p =>
    (p.securedAt && ['approved','scheduled','in_production'].includes(p.status)) ||
    (p.id === editingBatch?.productionPlanId && ['completed','on_hold'].includes(p.status))
  ) ?? [];
  const { data: products } = useAdminListProducts({});
  const productOptions = useMemo(() => sortProductsForSelection(products ?? [], lang), [products, lang]);
  
  const queryClient = useQueryClient();
  const createMutation = useAdminCreateManufacturingBatch();
  const updateMutation = useAdminUpdateManufacturingBatch();
  const deleteMutation = useAdminDeleteManufacturingBatch();
  const addInputsMutation = useAdminAddManufacturingInputs();
  const { toast } = useToast();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const prodDate = formData.get('productionDate') as string;
    const expDate = formData.get('expiryDate') as string || null;
    
    if (expDate && new Date(expDate) < new Date(prodDate)) {
      toast({ title: t('خطأ', 'Error'), description: t('تاريخ الانتهاء يجب أن يكون بعد تاريخ الإنتاج', 'Expiry must be after production date'), variant: 'destructive' });
      return;
    }

    const data = {
      batchNumber: formData.get('batchNumber') as string,
      productId: Number(formData.get('productId')),
      productionPlanId: formData.get('productionPlanId') ? Number(formData.get('productionPlanId')) : null,
      quantityProduced: Number(formData.get('quantityProduced')),
      costPerUnit: Number(formData.get('costPerUnit')),
      productionDate: prodDate,
      expiryDate: expDate,
      status: formData.get('status') as any,
    };

    const updateBatch = () => updateMutation.mutate({ id: editingBatch.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListManufacturingBatchesQueryKey() });
          setIsOpen(false);
          toast({ title: t('تم الحفظ', 'Saved') });
        }
      });

    if (editingBatch) {
      const lines = inputLines.map((line) => ({ materialProductId: Number(line.materialProductId), quantity: Number(line.quantity) }));
      if (lines.some((line) => !Number.isInteger(line.materialProductId) || line.materialProductId < 1 || !Number.isInteger(line.quantity) || line.quantity < 1)) {
        toast({ title: t('تحقق من مواد التصنيع', 'Check manufacturing materials'), description: t('اختر مادة وأدخل كمية صحيحة لكل بند.', 'Choose a material and valid quantity for each line.'), variant: 'destructive' });
        return;
      }
      if (lines.length) {
        addInputsMutation.mutate({ id: editingBatch.id, data: { lines } }, {
          onSuccess: updateBatch,
          onError: (error) => toast({ title: t('تعذر تسجيل مواد التصنيع', 'Could not record manufacturing inputs'), description: String((error as Error).message), variant: 'destructive' }),
        });
      } else updateBatch();
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListManufacturingBatchesQueryKey() });
          setIsOpen(false);
          toast({ title: t('تمت الإضافة', 'Added') });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm(t('هل أنت متأكد من الحذف؟', 'Are you sure you want to delete?'))) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListManufacturingBatchesQueryKey() });
          toast({ title: t('تم الحذف', 'Deleted') });
        }
      });
    }
  };

  const getProductName = (id: number) => {
    const p = products?.find(p => p.id === id);
    return p ? (lang === 'ar' ? p.nameAr : p.nameEn) : id;
  };

  if (currentUser && !hasPermission(currentUser, 'manufacturing', 'view')) return <div className="rounded-md border bg-card p-8 text-center">{t('ليس لديك صلاحية لعرض دفعات التصنيع', 'You do not have access to manufacturing batches')}</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('التصنيع', 'Manufacturing')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة دفعات الإنتاج والتصنيع', 'Manage production batches')}</p>
        </div>
        {canEdit && (
             <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if (!v) { setEditingBatch(null); setInputLines([]); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 me-2" />{t('إضافة دفعة', 'Add Batch')}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editingBatch ? t('تعديل دفعة', 'Edit Batch') : t('إضافة دفعة', 'Add Batch')}</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('رقم الدفعة', 'Batch Number')}</label>
                  <Input name="batchNumber" required defaultValue={editingBatch?.batchNumber} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('المنتج', 'Product')}</label>
                  <select name="productId" required defaultValue={editingBatch?.productId || ''} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="">{t('اختر منتج...', 'Select product...')}</option>
                    {productOptions.map(p => <option key={p.id} value={p.id}>{lang === 'ar' ? p.nameAr : p.nameEn}</option>)}
                  </select>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium">{t('خطة الإنتاج المرتبطة (اختياري)', 'Linked production plan (optional)')}</label>
                  <select name="productionPlanId" defaultValue={editingBatch?.productionPlanId ?? ''} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" data-testid="select-batch-production-plan">
                    <option value="">{t('بدون خطة مرتبطة', 'No linked plan')}</option>
                    {eligiblePlans.map(p=><option key={p.id} value={p.id}>{p.productName} · #{p.id}</option>)}
                    {editingBatch?.productionPlanId && !eligiblePlans.some(p=>p.id===editingBatch.productionPlanId) && <option value={editingBatch.productionPlanId}>#{editingBatch.productionPlanId}</option>}
                  </select>
                  <p className="text-xs text-muted-foreground">{t('تظهر الخطط المعتمدة والممولة، أو المجدولة وقيد الإنتاج؛ تبقى الخطة المكتملة أو المعلقة المرتبطة متاحة عند تعديل الدفعة. ترك الحقل فارغاً لا يغيّر سير الدفعات.', 'Funded approved, scheduled and in-production plans are available; linked completed or on-hold plans remain when editing. Leaving this blank preserves the existing batch flow.')}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الكمية', 'Quantity')}</label>
                  <Input name="quantityProduced" type="number" min="1" required defaultValue={editingBatch?.quantityProduced} className={quantityInputClass} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('تكلفة الوحدة', 'Cost per Unit')}</label>
                  <Input name="costPerUnit" type="number" step="0.01" min="0" required defaultValue={editingBatch?.costPerUnit} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('تاريخ الإنتاج', 'Production Date')}</label>
                  <Input name="productionDate" type="date" required defaultValue={editingBatch?.productionDate?.split('T')[0] || new Date().toISOString().split('T')[0]} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('تاريخ الانتهاء', 'Expiry Date')}</label>
                  <Input name="expiryDate" type="date" defaultValue={editingBatch?.expiryDate?.split('T')[0] || ''} />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium">{t('الحالة', 'Status')}</label>
                  <select name="status" required defaultValue={editingBatch?.status || 'in_production'} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="in_production">{t('قيد الإنتاج', 'In Production')}</option>
                    <option value="quality_check">{t('فحص الجودة', 'Quality Check')}</option>
                    <option value="completed">{t('مكتمل', 'Completed')}</option>
                    <option value="approved">{t('معتمد', 'Approved')}</option>
                    <option value="rejected">{t('مرفوض', 'Rejected')}</option>
                  </select>
                </div>
                {editingBatch && editingBatch.status !== 'approved' && (
                  <div className="col-span-2 space-y-2 rounded-md border bg-muted/20 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium">{t('مواد التصنيع الفعلية', 'Actual material inputs')}</label>
                        <p className="text-xs text-muted-foreground">{t('يجب تسجيل المواد قبل اعتماد الدفعة؛ سيخصم النظام المخزون ويتحقق من التكلفة.', 'Record materials before approval; the system will consume stock and validate cost.')}</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setInputLines([...inputLines, { materialProductId: '', quantity: '1' }])}><Plus className="me-1 h-3 w-3" />{t('إضافة مادة', 'Add material')}</Button>
                    </div>
                    {inputLines.map((line, index) => (
                      <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(6rem,8rem)_auto] gap-2">
                        <select value={line.materialProductId} onChange={(event) => setInputLines(inputLines.map((item, itemIndex) => itemIndex === index ? { ...item, materialProductId: event.target.value } : item))} className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm">
                          <option value="">{t('اختر مادة', 'Select material')}</option>
                           {productOptions.map((product) => <option key={product.id} value={product.id}>{lang === 'ar' ? product.nameAr : product.nameEn}</option>)}
                        </select>
                        <Input type="number" min="1" step="1" value={line.quantity} onChange={(event) => setInputLines(inputLines.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} className={quantityInputClass} />
                        <Button type="button" variant="ghost" size="icon" onClick={() => setInputLines(inputLines.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="col-span-2 flex justify-end mt-4">
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || addInputsMutation.isPending}>{t('حفظ', 'Save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="border rounded-md bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('رقم الدفعة', 'Batch No')}</TableHead>
              <TableHead>{t('المنتج', 'Product')}</TableHead>
              <TableHead>{t('خطة الإنتاج', 'Production plan')}</TableHead>
              <TableHead>{t('الكمية', 'Quantity')}</TableHead>
              <TableHead>{t('تاريخ الإنتاج', 'Production')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={7} className="text-center"><div className="h-12 animate-pulse rounded bg-muted/50" /></TableCell></TableRow> :
             isError ? <TableRow><TableCell colSpan={7} className="py-8 text-center">{t('تعذر تحميل الدفعات', 'Could not load batches')} <Button variant="outline" size="sm" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry')}</Button></TableCell></TableRow> :
             !batches?.length ? <TableRow><TableCell colSpan={7} className="py-8 text-center">{t('لا توجد دفعات تصنيع بعد', 'No manufacturing batches yet')}</TableCell></TableRow> :
             batches.map(batch => (
               <TableRow key={batch.id}>
                 <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                 <TableCell>{getProductName(batch.productId)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{batch.productionPlanId ? `${t('خطة','Plan')} #${batch.productionPlanId}` : '—'}</TableCell>
                 <TableCell>{batch.quantityProduced}</TableCell>
                 <TableCell>{format(new Date(batch.productionDate), 'yyyy-MM-dd')}</TableCell>
                 <TableCell>
                   <Badge variant="outline" className={
                     batch.status === 'completed' || batch.status === 'approved' ? 'bg-success/10 text-success border-success/20' : 
                     batch.status === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/20' : ''
                   }>
                     {batch.status}
                   </Badge>
                 </TableCell>
                 <TableCell className="text-end">
                   <DropdownMenu>
                     <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                       {canEdit && <DropdownMenuItem onClick={() => { setEditingBatch(batch); setIsOpen(true); }}><Edit2 className="h-4 w-4 me-2" />{t('تعديل', 'Edit')}</DropdownMenuItem>}
                       {canEdit && canDelete && <DropdownMenuSeparator />}
                       {canDelete && <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={deleteMutation.isPending} onClick={() => handleDelete(batch.id)}><Trash2 className="h-4 w-4 me-2" />{t('حذف', 'Delete')}</DropdownMenuItem>}
                     </DropdownMenuContent>
                   </DropdownMenu>
                 </TableCell>
               </TableRow>
             ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}