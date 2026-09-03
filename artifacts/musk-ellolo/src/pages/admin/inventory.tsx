import { useState, useRef, useEffect } from 'react';
import {
  useAdminListInventory,
  useAdminAdjustInventory,
  useGetAdminMe,
  useAdminListInventoryMovements,
  getAdminListInventoryQueryKey,
  getAdminListInventoryMovementsQueryKey
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Save, AlertTriangle, History, ArrowUpRight, ArrowDownRight, Edit2, Box } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

function InventoryHistoryDialog({
  productId,
  productName,
  currentStock,
  sku,
  isOpen,
  onOpenChange,
  canEdit
}: {
  productId: number;
  productName: string;
  currentStock: number;
  sku: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [adjustStock, setAdjustStock] = useState(currentStock.toString());
  const [adjustReason, setAdjustReason] = useState('');

  const { data: movements, isLoading } = useAdminListInventoryMovements(productId, {
    query: {
      enabled: isOpen && productId !== 0,
      queryKey: getAdminListInventoryMovementsQueryKey(productId)
    }
  });

  const adjustMutation = useAdminAdjustInventory();

  useEffect(() => {
    if (isOpen) {
      setShowAdjustForm(false);
      setAdjustStock(currentStock.toString());
      setAdjustReason('');
    }
  }, [isOpen, currentStock]);

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newStock = parseInt(adjustStock, 10);

    if (isNaN(newStock) || newStock < 0) {
      toast({ title: t('تنبيه', 'Warning'), description: t('الكمية يجب أن تكون رقماً صحيحاً موجباً', 'Quantity must be a non-negative integer'), variant: 'destructive' });
      return;
    }
    if (!adjustReason.trim()) {
      toast({ title: t('تنبيه', 'Warning'), description: t('سبب التعديل مطلوب', 'Reason is required'), variant: 'destructive' });
      return;
    }

    adjustMutation.mutate({ id: productId, data: { stockQuantity: newStock, reason: adjustReason } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListInventoryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAdminListInventoryMovementsQueryKey(productId) });
        toast({ title: t('نجاح', 'Success'), description: t('تم تحديث المخزون', 'Stock updated successfully') });
        setShowAdjustForm(false);
        setAdjustReason('');
      },
      onError: () => {
        toast({ title: t('خطأ', 'Error'), description: t('حدث خطأ أثناء تحديث المخزون', 'Failed to update stock'), variant: 'destructive' });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Box className="h-5 w-5 text-primary" />
              <span>{productName}</span>
              {sku && <span className="text-sm font-normal text-muted-foreground ml-2">({sku})</span>}
            </DialogTitle>
            <div className="text-sm">
              <span className="text-muted-foreground me-2">{t('الكمية الحالية:', 'Current Stock:')}</span>
              <Badge variant="outline" className="text-base px-3 py-0.5">{currentStock}</Badge>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-6">
            {canEdit && (
              <div className="border rounded-md bg-muted/20 overflow-hidden">
                {!showAdjustForm ? (
                  <div className="p-4 flex items-center justify-between bg-card hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setShowAdjustForm(true)}>
                    <div className="flex items-center gap-2 font-medium">
                      <Edit2 className="h-4 w-4 text-primary" />
                      {t('تعديل الكمية', 'Adjust Quantity')}
                    </div>
                    <Button variant="ghost" size="sm">{t('تعديل', 'Edit')}</Button>
                  </div>
                ) : (
                  <div className="p-4 bg-card border-b">
                    <form onSubmit={handleAdjustSubmit} className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium flex items-center gap-2">
                          <Edit2 className="h-4 w-4 text-primary" />
                          {t('تعديل الكمية', 'Adjust Quantity')}
                        </h4>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdjustForm(false)}>
                          {t('إلغاء', 'Cancel')}
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="newStock">{t('الكمية الجديدة', 'New Quantity')}</Label>
                          <Input
                            id="newStock"
                            type="number"
                            min="0"
                            className="mt-1"
                            value={adjustStock}
                            onChange={e => setAdjustStock(e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="reason">{t('سبب التعديل', 'Reason for Adjustment')}</Label>
                          <Input
                            id="reason"
                            className="mt-1"
                            placeholder={t('مثال: جرد شهري، بضاعة تالفة...', 'e.g. Monthly audit, damaged goods...')}
                            value={adjustReason}
                            onChange={e => setAdjustReason(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button type="submit" disabled={adjustMutation.isPending}>
                          {adjustMutation.isPending ? t('جاري الحفظ...', 'Saving...') : (
                            <>
                              <Save className="h-4 w-4 me-2" />
                              {t('حفظ التعديل', 'Save Adjustment')}
                            </>
                          )}
                        </Button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}

            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                {t('سجل الحركات', 'Movement History')}
              </h4>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead>{t('التاريخ', 'Date')}</TableHead>
                      <TableHead>{t('النوع', 'Type')}</TableHead>
                      <TableHead className="text-center">{t('التغيير', 'Change')}</TableHead>
                      <TableHead className="text-center">{t('قبل', 'Before')}</TableHead>
                      <TableHead className="text-center">{t('بعد', 'After')}</TableHead>
                      <TableHead>{t('السبب', 'Reason')}</TableHead>
                      <TableHead>{t('بواسطة', 'By')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
                    ) : movements?.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t('لا يوجد سجل حركات', 'No movement history')}</TableCell></TableRow>
                    ) : (
                      movements?.map((m) => {
                        const isIncrease = m.quantityChange > 0;
                        const isDecrease = m.quantityChange < 0;
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="text-sm whitespace-nowrap">{format(new Date(m.createdAt), 'yyyy-MM-dd HH:mm')}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-xs">
                                {m.movementType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={`flex items-center justify-center font-medium ${isIncrease ? 'text-success' : isDecrease ? 'text-destructive' : 'text-muted-foreground'}`}>
                                {isIncrease && <ArrowUpRight className="h-3 w-3 me-1" />}
                                {isDecrease && <ArrowDownRight className="h-3 w-3 me-1" />}
                                {m.quantityChange > 0 ? '+' : ''}{m.quantityChange}
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">{m.quantityBefore}</TableCell>
                            <TableCell className="text-center font-medium">{m.quantityAfter}</TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate" title={m.reason || ''}>
                              {m.reason || '-'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {m.performedBy ? t('إداري', 'Admin') : t('نظام', 'System')}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminInventory() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string; stock: number; sku: string | null } | null>(null);

  const { data: currentUser } = useGetAdminMe();
  const { data: inventory, isLoading } = useAdminListInventory({ search, lowStock: lowStockOnly });

  const canEdit = hasPermission(currentUser, 'inventory', 'edit');

  const chartData = inventory?.slice(0, 10).map(item => ({
    name: lang === 'ar' ? item.nameAr : item.nameEn,
    current: item.stockQuantity,
    reorder: Math.max(5, Math.floor(item.stockQuantity * 0.2)),
    refill: Math.max(20, Math.floor(item.stockQuantity * 1.5))
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('المخزون', 'Inventory')}</h1>
          <p className="text-muted-foreground mt-1">{t('مراقبة وتحديث كميات المنتجات', 'Monitor and update product quantities')}</p>
        </div>
      </div>

      <div className="bg-card p-6 rounded-xl border shadow-sm h-[350px]" dir="ltr">
        <h3 className="font-bold mb-4 rtl:text-right">{t('مستويات المخزون (أعلى 10 منتجات)', 'Stock Levels (Top 10 Products)')}</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
            <XAxis dataKey="name" tick={{fontSize: 12}} />
            <YAxis />
            <RechartsTooltip />
            <Legend />
            <Bar dataKey="current" name={t('الكمية الحالية', 'Current Stock')} fill="#F0B429" radius={[4, 4, 0, 0]} />
            <Bar dataKey="reorder" name={t('نقطة إعادة الطلب', 'Reorder Point')} fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Bar dataKey="refill" name={t('كمية التعبئة', 'Refill Qty')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="relative flex-1 w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input
            placeholder={t('البحث عن منتج...', 'Search products...')}
            className="pl-9 rtl:pr-9 rtl:pl-3 bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center space-x-2 rtl:space-x-reverse border-s ps-4">
          <Checkbox id="lowStock" checked={lowStockOnly} onCheckedChange={(c) => setLowStockOnly(!!c)} />
          <label htmlFor="lowStock" className="text-sm font-medium leading-none cursor-pointer">
            {t('عرض المخزون المنخفض فقط', 'Show low stock only')}
          </label>
        </div>
      </div>

      <div className="border rounded-md bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('المنتج', 'Product')}</TableHead>
              <TableHead>{t('رمز SKU', 'SKU')}</TableHead>
              <TableHead className="text-center">{t('الكمية الحالية', 'Current')}</TableHead>
              <TableHead className="text-center">{t('إعادة الطلب', 'Reorder Point')}</TableHead>
              <TableHead className="text-center">{t('كمية التعبئة', 'Refill Qty')}</TableHead>
              <TableHead className="text-center">{t('الحالة', 'Status')}</TableHead>
              <TableHead className="text-end">{t('إجراءات', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : inventory?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">{t('لا توجد منتجات', 'No products found')}</TableCell></TableRow>
            ) : (
              inventory?.map((item) => {
                const isLow = item.stockQuantity <= 5;
                const itemName = lang === 'ar' ? item.nameAr : item.nameEn;
                const mockReorderPoint = Math.max(5, Math.floor(item.stockQuantity * 0.2));
                const mockRefillQty = Math.max(20, Math.floor(item.stockQuantity * 1.5));
                const isOutOfStock = item.stockQuantity === 0;

                return (
                  <TableRow key={item.id} data-testid={`row-inventory-${item.id}`}>
                    <TableCell className="font-medium">{itemName}</TableCell>
                    <TableCell className="text-muted-foreground">{item.sku || '-'}</TableCell>
                    <TableCell className="text-center font-bold text-lg">{item.stockQuantity}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{mockReorderPoint}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{mockRefillQty}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={isOutOfStock ? "destructive" : isLow ? "outline" : "default"} className={!isOutOfStock && !isLow ? "bg-success hover:bg-success/90" : isLow ? "border-amber-500 text-amber-500" : ""}>
                        {isOutOfStock ? t('نفذ المخزون', 'Out of Stock') : isLow ? t('منخفض', 'Low') : t('متوفر', 'In Stock')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() => setSelectedProduct({ id: item.id, name: itemName, stock: item.stockQuantity, sku: item.sku })}
                      >
                        <Save className="h-4 w-4 me-2" />
                        {t('حفظ', 'Save')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {selectedProduct && (
        <InventoryHistoryDialog
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          currentStock={selectedProduct.stock}
          sku={selectedProduct.sku}
          isOpen={true}
          onOpenChange={(open) => !open && setSelectedProduct(null)}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

