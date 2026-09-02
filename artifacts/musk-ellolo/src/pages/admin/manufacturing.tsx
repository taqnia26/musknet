import { useState } from 'react';
import { 
  useAdminListManufacturingBatches,
  useAdminCreateManufacturingBatch,
  useAdminUpdateManufacturingBatch,
  useAdminDeleteManufacturingBatch,
  useAdminListProducts,
  useGetAdminMe,
  getAdminListManufacturingBatchesQueryKey
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function AdminManufacturing() {
  const { t, lang } = useLanguage();
  const { data: currentUser } = useGetAdminMe();
  const canEdit = hasPermission(currentUser, 'manufacturing', 'edit');
  const canDelete = hasPermission(currentUser, 'manufacturing', 'delete');
  
  const [isOpen, setIsOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<any>(null);
  
  const { data: batches, isLoading } = useAdminListManufacturingBatches();
  const { data: products } = useAdminListProducts({});
  
  const queryClient = useQueryClient();
  const createMutation = useAdminCreateManufacturingBatch();
  const updateMutation = useAdminUpdateManufacturingBatch();
  const deleteMutation = useAdminDeleteManufacturingBatch();
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
      quantityProduced: Number(formData.get('quantityProduced')),
      costPerUnit: Number(formData.get('costPerUnit')),
      productionDate: prodDate,
      expiryDate: expDate,
      status: formData.get('status') as any,
    };

    if (editingBatch) {
      updateMutation.mutate({ id: editingBatch.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListManufacturingBatchesQueryKey() });
          setIsOpen(false);
          toast({ title: t('تم الحفظ', 'Saved') });
        }
      });
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('التصنيع', 'Manufacturing')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة دفعات الإنتاج والتصنيع', 'Manage production batches')}</p>
        </div>
        {canEdit && (
          <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if (!v) setEditingBatch(null); }}>
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
                    {products?.map(p => <option key={p.id} value={p.id}>{lang === 'ar' ? p.nameAr : p.nameEn}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الكمية', 'Quantity')}</label>
                  <Input name="quantityProduced" type="number" min="1" required defaultValue={editingBatch?.quantityProduced} />
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
                <div className="col-span-2 flex justify-end mt-4">
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{t('حفظ', 'Save')}</Button>
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
              <TableHead>{t('الكمية', 'Quantity')}</TableHead>
              <TableHead>{t('تاريخ الإنتاج', 'Production')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6} className="text-center">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow> : 
             !batches?.length ? <TableRow><TableCell colSpan={6} className="text-center">{t('لا توجد بيانات', 'No data')}</TableCell></TableRow> :
             batches.map(batch => (
               <TableRow key={batch.id}>
                 <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                 <TableCell>{getProductName(batch.productId)}</TableCell>
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
                   {canEdit && (
                     <Button variant="ghost" size="icon" onClick={() => { setEditingBatch(batch); setIsOpen(true); }}>
                       <Edit2 className="h-4 w-4" />
                     </Button>
                   )}
                   {canDelete && (
                     <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(batch.id)}>
                       <Trash2 className="h-4 w-4" />
                     </Button>
                   )}
                 </TableCell>
               </TableRow>
             ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}