import { useState } from 'react';
import { useLanguage } from '@/hooks/use-language';
import { useAdminListInventory, useAdminCreateInventoryProduct, useAdminListCategories, useGetAdminMe } from '@workspace/api-client-react';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Printer } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getAdminListInventoryQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { BarcodeScanner } from '@/components/admin/inventory/barcode-scanner';

export default function AdminInventoryBalances() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const { data: currentUser } = useGetAdminMe();
  const canEdit = hasPermission(currentUser, 'inventory', 'edit');
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
                <TableHead className="w-[100px]"></TableHead>
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
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handlePrintBarcode(item.barcode || item.sku, item.nameAr)}>
                        <Printer className="w-4 h-4" />
                      </Button>
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
