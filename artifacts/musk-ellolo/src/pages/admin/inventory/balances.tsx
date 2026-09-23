import { useState } from 'react';
import { useLanguage } from '@/hooks/use-language';
import { 
  useAdminListInventory, 
  useAdminCreateInventoryProduct, 
  useAdminUpdateInventoryProduct,
  useAdminDeleteInventoryProduct,
  useAdminAdjustInventory,
  useAdminListInventoryMovements,
  useAdminListCategories, 
  useGetAdminMe,
  getAdminListInventoryQueryKey,
  getAdminListInventoryMovementsQueryKey
} from '@workspace/api-client-react';
import type { AdminInventoryItem, AdminCategory } from '@workspace/api-client-react';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Printer, History, ArrowUpDown, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { BarcodeScanner } from '@/components/admin/inventory/barcode-scanner';

export function RowActions({
  item, 
  canEdit, 
  canDelete, 
  onPrintBarcode,
  categories
}: { 
  item: AdminInventoryItem; 
  canEdit: boolean; 
  canDelete: boolean; 
  onPrintBarcode: (sku: string | null, name: string) => void;
  categories: AdminCategory[];
}) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const editMutation = useAdminUpdateInventoryProduct();
  const adjustMutation = useAdminAdjustInventory();
  const deleteMutation = useAdminDeleteInventoryProduct();

  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    editMutation.mutate({
      id: item.id,
      data: {
        nameAr: fd.get('nameAr') as string,
        nameEn: fd.get('nameEn') as string,
        sku: fd.get('sku') as string,
        categoryId: Number(fd.get('categoryId')),
        barcode: (fd.get('barcode') as string) || null,
        operationalType: fd.get('operationalType') as any,
        unitOfMeasure: fd.get('unitOfMeasure') as string,
        preferredSupplier: (fd.get('preferredSupplier') as string) || null,
        sellable: fd.get('sellable') === 'on',
        price: Number(fd.get('price')),
        reorderPoint: Number(fd.get('reorderPoint')),
        targetStockQuantity: Number(fd.get('targetStockQuantity'))
      }
    }, {
      onSuccess: () => {
        toast({ title: t('تم تعديل المنتج', 'Product updated') });
        setEditOpen(false);
        queryClient.invalidateQueries({ queryKey: getAdminListInventoryQueryKey() });
      }
    });
  };

  const handleAdjust = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const idempotencyKey = Date.now().toString(36) + Math.random().toString(36).substring(2);
    
    adjustMutation.mutate({
      id: item.id,
      data: {
        operation: fd.get('operation') as any,
        quantity: Number(fd.get('quantity')),
        unitCost: fd.get('unitCost') ? Number(fd.get('unitCost')) : undefined,
        reason: fd.get('reason') as string,
        idempotencyKey
      }
    }, {
      onSuccess: () => {
        toast({ title: t('تم تسوية المخزون بنجاح', 'Inventory adjusted successfully') });
        setAdjustOpen(false);
        queryClient.invalidateQueries({ queryKey: getAdminListInventoryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAdminListInventoryMovementsQueryKey(item.id) });
      }
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id: item.id }, {
      onSuccess: () => {
        toast({ title: t('تم حذف المنتج', 'Product deleted') });
        setDeleteOpen(false);
        queryClient.invalidateQueries({ queryKey: getAdminListInventoryQueryKey() });
      },
      onError: (err: any) => {
        if (err.status === 409) {
          toast({ 
            title: t('لا يمكن الحذف', 'Cannot delete'),
            description: t('تأكد من أن الرصيد صفر. سيتم الاحتفاظ بسجل الحركات.', 'Ensure balance is zero. Movement history will be preserved.'),
            variant: 'destructive'
          });
        } else {
          toast({ title: t('حدث خطأ', 'An error occurred'), variant: 'destructive' });
        }
        setDeleteOpen(false);
      }
    });
  };

  const { data: movements, isLoading: movementsLoading } = useAdminListInventoryMovements(item.id, {
    query: { enabled: movementOpen, queryKey: getAdminListInventoryMovementsQueryKey(item.id) }
  });

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('المزيد', 'More actions')}><MoreHorizontal className="w-4 h-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setMovementOpen(true)}><History className="w-4 h-4 mr-2" />{t('سجل الحركات', 'Movement History')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPrintBarcode(item.barcode || item.sku, item.nameAr)}><Printer className="w-4 h-4 mr-2" />{t('طباعة الباركود', 'Print Barcode')}</DropdownMenuItem>
            {canEdit && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setEditOpen(true)}><Pencil className="w-4 h-4 mr-2" />{t('تعديل البيانات', 'Edit Metadata')}</DropdownMenuItem><DropdownMenuItem onClick={() => setAdjustOpen(true)}><ArrowUpDown className="w-4 h-4 mr-2" />{t('تسوية المخزون', 'Adjust Stock')}</DropdownMenuItem></>}
            {canDelete && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" disabled={deleteMutation.isPending} onClick={() => setDeleteOpen(true)}><Trash2 className="w-4 h-4 mr-2" />{t('حذف', 'Delete')}</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('تعديل الصنف', 'Edit Item')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Label>{t('الاسم (عربي)', 'Name (Ar)')}</Label>
              <Input name="nameAr" required defaultValue={item.nameAr} className="mt-1" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>{t('الاسم (إنجليزي)', 'Name (En)')}</Label>
              <Input name="nameEn" required defaultValue={item.nameEn} className="mt-1" />
            </div>
            <div className="col-span-2">
                <Label>SKU</Label>
              <div className="flex gap-2 mt-1">
                <Input name="sku" required defaultValue={item.sku || ''} />
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" type="button">{t('مسح', 'Scan')}</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('مسح الباركود', 'Scan Barcode')}</DialogTitle>
                    </DialogHeader>
                    <BarcodeScanner onScan={(code) => {
                      const skuInput = document.querySelector('input[name="sku"]') as HTMLInputElement;
                      if (skuInput) skuInput.value = code;
                    }} />
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div>
              <Label>{t('التصنيف', 'Category')}</Label>
              <Select name="categoryId" defaultValue={String(item.categoryId)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر التصنيف', 'Select category')} /></SelectTrigger>
                <SelectContent>{categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{lang === 'ar' ? category.nameAr : category.nameEn}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{t('الباركود', 'Barcode')}</Label><Input name="barcode" defaultValue={item.barcode || ''} className="mt-1" /></div>
            <div>
              <Label>{t('النوع التشغيلي', 'Operational type')}</Label>
              <Select name="operationalType" defaultValue={item.operationalType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="finished_good">{t('منتج نهائي', 'Finished good')}</SelectItem>
                  <SelectItem value="raw_material">{t('مادة خام', 'Raw material')}</SelectItem>
                  <SelectItem value="packaging">{t('مادة تعبئة', 'Packaging')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t('وحدة القياس', 'Unit of measure')}</Label><Input name="unitOfMeasure" required defaultValue={item.unitOfMeasure} className="mt-1" /></div>
            <div><Label>{t('المورد المفضل', 'Preferred supplier')}</Label><Input name="preferredSupplier" defaultValue={item.preferredSupplier || ''} className="mt-1" /></div>
            <div className="flex items-center gap-2 pt-8">
              <input type="checkbox" name="sellable" defaultChecked={item.sellable} id={`sellable-edit-${item.id}`} />
              <Label htmlFor={`sellable-edit-${item.id}`}>{t('قابل للبيع', 'Sellable')}</Label>
            </div>
            <div>
              <Label>{t('السعر', 'Price')}</Label>
              <Input name="price" type="number" step="0.01" required defaultValue={item.price} className="mt-1" />
            </div>
            <div>
              <Label>{t('حد إعادة الطلب', 'Reorder Point')}</Label>
              <Input name="reorderPoint" type="number" required defaultValue={item.reorderPoint} className="mt-1" />
            </div>
            <div>
              <Label>{t('الكمية المستهدفة', 'Target Quantity')}</Label>
              <Input name="targetStockQuantity" type="number" required defaultValue={item.targetStockQuantity} className="mt-1" />
            </div>
            <div className="col-span-2 flex justify-end mt-4">
              <Button type="submit" disabled={editMutation.isPending}>{t('حفظ التعديلات', 'Save Changes')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('تسوية المخزون', 'Adjust Stock')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdjust} className="space-y-4">
            <div>
              <Label>{t('العملية', 'Operation')}</Label>
              <Select name="operation" defaultValue="increase">
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">{t('إضافة', 'Increase')}</SelectItem>
                  <SelectItem value="decrease">{t('صرف/نقص', 'Decrease')}</SelectItem>
                  <SelectItem value="adjustment">{t('ضبط الكمية', 'Set Exact')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('الكمية', 'Quantity')}</Label>
              <Input name="quantity" type="number" required min="0" className="mt-1" />
            </div>
            <div>
              <Label>{t('تكلفة الوحدة (اختياري)', 'Unit Cost (Optional)')}</Label>
              <Input name="unitCost" type="number" step="0.01" min="0" className="mt-1" />
            </div>
            <div>
              <Label>{t('السبب', 'Reason')}</Label>
              <Input name="reason" required className="mt-1" />
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={adjustMutation.isPending}>{t('حفظ التعديل', 'Save Adjustment')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={movementOpen} onOpenChange={setMovementOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('سجل حركات الصنف', 'Movement History')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('التاريخ', 'Date')}</TableHead>
                  <TableHead>{t('النوع', 'Type')}</TableHead>
                  <TableHead>{t('المقدار', 'Delta')}</TableHead>
                  <TableHead>{t('الرصيد قبل/بعد', 'Before/After')}</TableHead>
                  <TableHead>{t('السبب', 'Reason')}</TableHead>
                  <TableHead>{t('بواسطة', 'Performer')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movementsLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
                ) : !movements?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6">{t('لا توجد حركات', 'No movements')}</TableCell></TableRow>
                ) : (
                  movements.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">{new Date(m.createdAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}</TableCell>
                      <TableCell>
                        <Badge variant={m.movementType === 'increase' ? 'default' : m.movementType === 'decrease' ? 'destructive' : 'secondary'}>
                          {m.movementType}
                        </Badge>
                      </TableCell>
                      <TableCell dir="ltr" className={m.quantityChange > 0 ? "text-green-600" : m.quantityChange < 0 ? "text-red-600" : ""}>
                        {m.quantityChange > 0 ? '+' : ''}{m.quantityChange}
                      </TableCell>
                      <TableCell dir="ltr">{m.quantityBefore} &rarr; {m.quantityAfter}</TableCell>
                      <TableCell>{m.reason}</TableCell>
                      <TableCell>{m.performerName || m.sourceType || '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('هل أنت متأكد من حذف الصنف؟', 'Are you sure you want to delete this item?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('لا يمكن حذف الصنف إلا إذا كان رصيده صفراً. يتم الاحتفاظ بسجل الحركات السابقة.', 'Deletion is allowed only after stock reaches zero. Historical movements remain preserved.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('إلغاء', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" disabled={deleteMutation.isPending}>
              {t('حذف', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


export default function AdminInventoryBalances() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const { data: currentUser } = useGetAdminMe();
  const canEdit = hasPermission(currentUser, 'inventory', 'edit');
  const canDelete = hasPermission(currentUser, 'inventory', 'delete');
  const { data: categories = [] } = useAdminListCategories({ status: 'active' });
  
  const { data, isLoading } = useAdminListInventory({ 
    search: search || undefined
  });
  
  const [createOpen, setCreateOpen] = useState(false);
  const createMutation = useAdminCreateInventoryProduct();

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        nameAr: fd.get('nameAr') as string,
        nameEn: fd.get('nameEn') as string,
        sku: fd.get('sku') as string,
        categoryId: Number(fd.get('categoryId')),
        barcode: (fd.get('barcode') as string) || null,
        operationalType: fd.get('operationalType') as any,
        unitOfMeasure: fd.get('unitOfMeasure') as string,
        preferredSupplier: (fd.get('preferredSupplier') as string) || null,
        sellable: fd.get('sellable') === 'on',
        price: Number(fd.get('price')),
        openingQuantity: Number(fd.get('openingQuantity')),
        reorderPoint: Number(fd.get('reorderPoint')),
        targetStockQuantity: Number(fd.get('targetStockQuantity'))
      }
    }, {
      onSuccess: () => {
        toast({ title: t('تم إضافة المنتج', 'Product added') });
        setCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: getAdminListInventoryQueryKey() });
      }
    });
  };

  const handlePrintBarcode = (sku: string | null, name: string) => {
    if (!sku) {
      toast({ title: t('لا يوجد باركود للمنتج', 'No barcode for product'), variant: 'destructive' });
      return;
    }
    const printWindow = window.open('', '_blank', 'width=420,height=280');
    if (!printWindow) {
      toast({ title: t('تعذر فتح نافذة الطباعة', 'Could not open print window'), variant: 'destructive' });
      return;
    }
    printWindow.document.write(`<html><head><title>${name}</title><style>body{font-family:Arial;text-align:center;padding:24px}svg{width:280px;height:100px}</style></head><body><h2>${name}</h2><svg id="code"></svg><p>${sku}</p><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script><script>JsBarcode("#code","${sku}",{format:"CODE128",displayValue:false});window.onload=()=>window.print();<\/script></body></html>`);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder={t('بحث بالباركود أو الاسم...', 'Search by barcode or name...')} 
            className="ps-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        
         {canEdit && <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 me-2" />
              {t('صنف جديد', 'New Item')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{t('إضافة صنف مخزون جديد', 'Add New Inventory Item')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <Label>{t('الاسم (عربي)', 'Name (Ar)')}</Label>
                <Input name="nameAr" required className="mt-1" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label>{t('الاسم (إنجليزي)', 'Name (En)')}</Label>
                <Input name="nameEn" required className="mt-1" />
              </div>
              <div className="col-span-2">
                  <Label>SKU</Label>
                <div className="flex gap-2 mt-1">
                  <Input name="sku" required />
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" type="button">{t('مسح', 'Scan')}</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t('مسح الباركود', 'Scan Barcode')}</DialogTitle>
                      </DialogHeader>
                      <BarcodeScanner onScan={(code) => {
                        const skuInput = document.querySelector('input[name="sku"]') as HTMLInputElement;
                        if (skuInput) skuInput.value = code;
                      }} />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              <div>
                <Label>{t('التصنيف', 'Category')}</Label>
                <Select name="categoryId" defaultValue={categories[0] ? String(categories[0].id) : undefined}><SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر التصنيف', 'Select category')} /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{lang === 'ar' ? category.nameAr : category.nameEn}</SelectItem>)}</SelectContent></Select>
              </div>
              <div><Label>{t('الباركود', 'Barcode')}</Label><Input name="barcode" className="mt-1" /></div>
              <div><Label>{t('النوع التشغيلي', 'Operational type')}</Label><Select name="operationalType" defaultValue="finished_good"><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="finished_good">{t('منتج نهائي', 'Finished good')}</SelectItem><SelectItem value="raw_material">{t('مادة خام', 'Raw material')}</SelectItem><SelectItem value="packaging">{t('مادة تعبئة', 'Packaging')}</SelectItem></SelectContent></Select></div>
              <div><Label>{t('وحدة القياس', 'Unit of measure')}</Label><Input name="unitOfMeasure" required defaultValue="unit" className="mt-1" /></div>
              <div><Label>{t('المورد المفضل', 'Preferred supplier')}</Label><Input name="preferredSupplier" className="mt-1" /></div>
              <div className="flex items-center gap-2"><input type="checkbox" name="sellable" defaultChecked id="sellable" /><Label htmlFor="sellable">{t('قابل للبيع', 'Sellable')}</Label></div>
              <div>
                <Label>{t('السعر', 'Price')}</Label>
                <Input name="price" type="number" step="0.01" required defaultValue="0" className="mt-1" />
              </div>
              <div>
                <Label>{t('الرصيد الافتتاحي', 'Opening Quantity')}</Label>
                <Input name="openingQuantity" type="number" required defaultValue="0" className="mt-1" />
              </div>
              <div>
                <Label>{t('حد إعادة الطلب', 'Reorder Point')}</Label>
                <Input name="reorderPoint" type="number" required defaultValue="10" className="mt-1" />
              </div>
              <div>
                <Label>{t('الكمية المستهدفة', 'Target Quantity')}</Label>
                <Input name="targetStockQuantity" type="number" required defaultValue="50" className="mt-1" />
              </div>
              <div className="col-span-2 flex justify-end mt-4">
                <Button type="submit" disabled={createMutation.isPending}>{t('حفظ الصنف', 'Save Item')}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الصنف', 'Item')}</TableHead>
                <TableHead>SKU</TableHead>
                 <TableHead>{t('الباركود', 'Barcode')}</TableHead>
                 <TableHead>{t('التشغيل', 'Type')}</TableHead>
                <TableHead>{t('الكمية', 'Qty')}</TableHead>
                <TableHead>{t('حد الطلب', 'Reorder')}</TableHead>
                <TableHead>{t('السعر', 'Price')}</TableHead>
                <TableHead>{t('الحالة', 'Status')}</TableHead>
                <TableHead className="w-[180px] sticky end-0 bg-background shadow-[inset_1px_0_0_rgba(0,0,0,0.1)] dark:shadow-[inset_1px_0_0_rgba(255,255,255,0.1)]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
              ) : !data?.items?.length ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">{t('لا توجد أصناف', 'No items found')}</TableCell></TableRow>
              ) : (
                data.items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{lang === 'ar' ? item.nameAr : item.nameEn}</TableCell>
                    <TableCell className="font-mono text-sm">{item.sku || '-'}</TableCell>
                   <TableCell className="font-mono text-sm">{item.barcode || item.sku || '-'}</TableCell>
                   <TableCell>{item.operationalType} · {item.unitOfMeasure}{!item.sellable && <Badge variant="outline" className="ms-1">{t('غير قابل للبيع', 'Non-sellable')}</Badge>}</TableCell>
                    <TableCell className="font-bold">{item.stockQuantity}</TableCell>
                    <TableCell>{item.reorderPoint}</TableCell>
                    <TableCell>{item.price}</TableCell>
                    <TableCell>
                      <Badge variant={item.stockStatus === 'out' ? 'destructive' : item.stockStatus === 'low' ? 'outline' : 'secondary'}
                             className={item.stockStatus === 'low' ? 'border-amber-500 text-amber-500' : ''}>
                        {item.stockStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-[180px] sticky end-0 bg-background shadow-[inset_1px_0_0_rgba(0,0,0,0.1)] dark:shadow-[inset_1px_0_0_rgba(255,255,255,0.1)]">
                      <RowActions 
                        item={item} 
                        canEdit={canEdit} 
                        canDelete={canDelete} 
                        onPrintBarcode={handlePrintBarcode} 
                        categories={categories} 
                      />
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
