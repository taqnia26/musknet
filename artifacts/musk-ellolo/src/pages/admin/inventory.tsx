import { useState } from 'react';
import { useAdminListInventory, useAdminUpdateInventory, useGetAdminMe } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Save, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getAdminListInventoryQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';

export default function AdminInventory() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editingStocks, setEditingStocks] = useState<Record<number, number>>({});

  const queryClient = useQueryClient();
  const { data: currentUser } = useGetAdminMe();
  const { data: inventory, isLoading } = useAdminListInventory({ search, lowStock: lowStockOnly });
  const updateMutation = useAdminUpdateInventory();

  const handleStockChange = (id: number, value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      setEditingStocks(prev => ({ ...prev, [id]: num }));
    }
  };

  const handleSaveStock = (id: number) => {
    const newStock = editingStocks[id];
    if (newStock !== undefined) {
      updateMutation.mutate({ id, data: { stockQuantity: newStock } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListInventoryQueryKey() });
          setEditingStocks(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          toast({ title: t('تم تحديث المخزون', 'Stock updated successfully') });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('المخزون', 'Inventory')}</h1>
          <p className="text-muted-foreground mt-1">{t('مراقبة وتحديث كميات المنتجات', 'Monitor and update product quantities')}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative flex-1 w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input 
            placeholder={t('البحث عن منتج...', 'Search products...')} 
            className="pl-9 rtl:pr-9 rtl:pl-3" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <Checkbox id="lowStock" checked={lowStockOnly} onCheckedChange={(c) => setLowStockOnly(!!c)} />
          <label htmlFor="lowStock" className="text-sm font-medium leading-none cursor-pointer">
            {t('عرض المخزون المنخفض فقط', 'Show low stock only')}
          </label>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('المنتج', 'Product')}</TableHead>
              <TableHead>{t('رمز SKU', 'SKU')}</TableHead>
              <TableHead>{t('الكمية الحالية', 'Current Stock')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead className="w-[180px]">{t('تحديث', 'Update')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : inventory?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t('لا توجد منتجات', 'No products found')}</TableCell></TableRow>
            ) : (
              inventory?.map((item) => {
                const isEditing = editingStocks[item.id] !== undefined;
                const currentStockVal = isEditing ? editingStocks[item.id] : item.stockQuantity;
                const isLow = item.stockQuantity <= 5;

                return (
                  <TableRow key={item.id} data-testid={`row-inventory-${item.id}`}>
                    <TableCell className="font-medium">{lang === 'ar' ? item.nameAr : item.nameEn}</TableCell>
                    <TableCell>{item.sku || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isLow && <AlertTriangle className="h-4 w-4 text-red-500" />}
                        {item.stockQuantity}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isLow ? "destructive" : "default"}>
                        {isLow ? t('منخفض', 'Low') : t('متوفر', 'In Stock')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {hasPermission(currentUser, 'inventory', 'edit') && (
                        <div className="flex items-center gap-2">
                          <Input 
                            type="number" 
                            className="w-20 h-8"
                            value={currentStockVal}
                            onChange={(e) => handleStockChange(item.id, e.target.value)}
                          />
                          {isEditing && currentStockVal !== item.stockQuantity && (
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => handleSaveStock(item.id)}>
                              <Save className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
