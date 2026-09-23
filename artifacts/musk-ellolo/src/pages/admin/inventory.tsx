import { useEffect, useMemo, useState } from 'react';
import {
  type AdminInventoryAdjustmentOperation,
  type AdminInventoryItem,
  getAdminListInventoryMovementsQueryKey,
  getAdminListInventoryQueryKey,
  useAdminAdjustInventory,
  useAdminCreateInventoryProduct,
  useAdminListCategories,
  useAdminListInventory,
  useAdminListInventoryMovements,
  useGetAdminMe,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, CircleDollarSign, History, PackagePlus, Search, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useLanguage } from '@/hooks/use-language';
import { Money } from '@/components/money';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RowActions } from './inventory/balances';

type StockStatus = 'all' | 'in_stock' | 'low' | 'out';
type Sort = 'name_asc' | 'name_desc' | 'quantity_asc' | 'quantity_desc' | 'value_desc';
type CreateForm = {
  nameAr: string; nameEn: string; descriptionAr: string; descriptionEn: string; sku: string; categoryId: string; price: string;
  openingQuantity: string; openingUnitCost: string; reorderPoint: string; targetStockQuantity: string;
};
const emptyCreate: CreateForm = { nameAr: '', nameEn: '', descriptionAr: '', descriptionEn: '', sku: '', categoryId: '', price: '0', openingQuantity: '0', openingUnitCost: '', reorderPoint: '5', targetStockQuantity: '20' };

function statusLabel(status: AdminInventoryItem['stockStatus'], t: (ar: string, en: string) => string) {
  return status === 'out' ? t('نافد', 'Out of stock') : status === 'low' ? t('منخفض', 'Low') : t('متوفر', 'In stock');
}

function InventoryDetails({ item, open, onOpenChange, canEdit }: {
  item: AdminInventoryItem; open: boolean; onOpenChange: (open: boolean) => void; canEdit: boolean;
}) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [operation, setOperation] = useState<AdminInventoryAdjustmentOperation>('increase');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState(item.averageCost > 0 ? String(item.averageCost) : '');
  const [reason, setReason] = useState('');
  const [currentStock, setCurrentStock] = useState(item.stockQuantity);
  const [currentAverageCost, setCurrentAverageCost] = useState(item.averageCost);
  const { data: movements = [], isLoading, isError } = useAdminListInventoryMovements(item.id, {
    query: { enabled: open, queryKey: getAdminListInventoryMovementsQueryKey(item.id) },
  });
  const mutation = useAdminAdjustInventory();
  const amount = Number(quantity);
  const expected = operation === 'increase' ? currentStock + amount : operation === 'decrease' ? currentStock - amount : amount;

  useEffect(() => {
    setCurrentStock(item.stockQuantity);
    setCurrentAverageCost(item.averageCost);
    setUnitCost(item.averageCost > 0 ? String(item.averageCost) : '');
  }, [item.stockQuantity, item.averageCost]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsedUnitCost = unitCost === '' ? undefined : Number(unitCost);
    const costRequired = operation !== 'decrease' && expected > 0 && currentAverageCost <= 0 && parsedUnitCost == null;
    if (!Number.isSafeInteger(amount) || amount < 0 || expected < 0 || !reason.trim() ||
      (parsedUnitCost != null && (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0)) ||
      costRequired) {
      toast({
        title: t('تحقق من العملية', 'Check operation'),
        description: costRequired
          ? t('أدخل تكلفة الوحدة ليتم حساب قيمة المخزون.', 'Enter the unit cost so inventory value can be calculated.')
          : t('أدخل كمية صحيحة وسبباً، ولا يمكن أن يصبح الرصيد سالباً.', 'Enter a valid quantity and reason; stock cannot become negative.'),
        variant: 'destructive',
      });
      return;
    }
    mutation.mutate({
      id: item.id,
      data: { operation, quantity: amount, ...(operation !== 'decrease' && parsedUnitCost != null ? { unitCost: parsedUnitCost } : {}), reason: reason.trim(), idempotencyKey: crypto.randomUUID() },
    }, {
      onSuccess: (result) => {
        setCurrentStock(result.item.stockQuantity);
        setCurrentAverageCost(result.item.averageCost);
        setUnitCost(result.item.averageCost > 0 ? String(result.item.averageCost) : '');
        queryClient.invalidateQueries({ queryKey: getAdminListInventoryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getAdminListInventoryMovementsQueryKey(item.id) });
        setReason('');
        toast({ title: t('تم تسجيل الحركة', 'Movement recorded') });
      },
      onError: (error) => toast({ title: t('تعذر تسجيل الحركة', 'Could not record movement'), description: error.message, variant: 'destructive' }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>{t('تفاصيل المخزون', 'Inventory details')} · {item.nameAr}</DialogTitle></DialogHeader>
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">{t('الرصيد الحالي', 'Current')}</p><p className="text-xl font-bold">{currentStock}</p></div>
          <div><p className="text-xs text-muted-foreground">{t('حد الطلب', 'Reorder point')}</p><p className="text-xl font-bold">{item.reorderPoint}</p></div>
          <div><p className="text-xs text-muted-foreground">{t('المستهدف', 'Target')}</p><p className="text-xl font-bold">{item.targetStockQuantity}</p></div>
          <div><p className="text-xs text-muted-foreground">{t('التكلفة المتوسطة', 'Average cost')}</p><p className="text-xl font-bold"><Money value={currentAverageCost} lang={lang} /></p></div>
        </div>
        {canEdit && (
          <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
            <h3 className="font-semibold">{t('تسجيل حركة', 'Record movement')}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><Label>{t('العملية', 'Operation')}</Label><Select value={operation} onValueChange={(value) => setOperation(value as AdminInventoryAdjustmentOperation)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="increase">{t('زيادة', 'Increase')}</SelectItem><SelectItem value="decrease">{t('صرف', 'Issue')}</SelectItem><SelectItem value="adjustment">{t('تسوية إلى رصيد', 'Set balance')}</SelectItem></SelectContent></Select></div>
              <div><Label>{operation === 'adjustment' ? t('الرصيد الجديد', 'New balance') : t('الكمية', 'Quantity')}</Label><Input className="mt-1" type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
              <div><Label>{t('الرصيد الناتج', 'Resulting balance')}</Label><div className={`mt-1 flex h-10 items-center rounded-md border px-3 font-bold ${expected < 0 ? 'text-destructive' : ''}`}>{Number.isFinite(expected) ? expected : '—'}</div></div>
            </div>
            {operation !== 'decrease' && <div><Label>{t('تكلفة الوحدة (ليست سعر البيع)', 'Unit cost (not selling price)')}</Label><Input className="mt-1" type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder={t('أدخل تكلفة شراء أو تصنيع الوحدة', 'Enter the unit purchase or manufacturing cost')} /></div>}
            <div><Label>{t('السبب (إلزامي)', 'Reason (required)')}</Label><Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('مثال: استلام توريد أو جرد فعلي', 'e.g. Delivery received or physical count')} /></div>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? t('جاري التسجيل...', 'Recording...') : t('تأكيد الحركة', 'Confirm movement')}</Button>
          </form>
        )}
        <div>
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><History className="h-4 w-4" />{t('سجل الحركات', 'Movement history')}</h3>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>{t('التاريخ', 'Date')}</TableHead><TableHead>{t('النوع', 'Type')}</TableHead><TableHead>{t('التغيير', 'Change')}</TableHead><TableHead>{t('قبل / بعد', 'Before / after')}</TableHead><TableHead>{t('السبب', 'Reason')}</TableHead><TableHead>{t('المصدر', 'Source')}</TableHead><TableHead>{t('المنفذ', 'By')}</TableHead></TableRow></TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={7} className="py-8 text-center">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
                  : isError ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-destructive">{t('تعذر تحميل السجل', 'Could not load history')}</TableCell></TableRow>
                  : movements.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{t('لا توجد حركات', 'No movements')}</TableCell></TableRow>
                  : movements.map((movement) => <TableRow key={movement.id}>
                    <TableCell className="whitespace-nowrap text-xs">{format(new Date(movement.createdAt), 'yyyy-MM-dd HH:mm')}</TableCell>
                    <TableCell><Badge variant="outline">{movement.movementType}</Badge></TableCell>
                    <TableCell className={movement.quantityChange < 0 ? 'text-destructive' : 'text-success'}>{movement.quantityChange > 0 ? '+' : ''}{movement.quantityChange}</TableCell>
                    <TableCell>{movement.quantityBefore} → {movement.quantityAfter}</TableCell>
                    <TableCell>{movement.reason || '—'}</TableCell><TableCell>{movement.sourceType || '—'}</TableCell>
                    <TableCell>{movement.performerName || t('النظام', 'System')}</TableCell>
                  </TableRow>)}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminInventory({ titleKey = 'overview' }: { titleKey?: 'overview' | 'balances' }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [stockStatus, setStockStatus] = useState<StockStatus>('all');
  const [sort, setSort] = useState<Sort>('name_asc');
  const [selected, setSelected] = useState<AdminInventoryItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [create, setCreate] = useState<CreateForm>(emptyCreate);
  const { data: currentUser } = useGetAdminMe();
  const canEdit = hasPermission(currentUser, 'inventory', 'edit');
  const canDelete = hasPermission(currentUser, 'inventory', 'delete');
  const { data: categories = [] } = useAdminListCategories({ status: 'active' });
  const { data, isLoading, isError } = useAdminListInventory({ search: search || undefined, categoryId: categoryId === 'all' ? undefined : Number(categoryId), stockStatus, sort });
  const createMutation = useAdminCreateInventoryProduct();
  const items = data?.items ?? [];
  const summary = data?.summary ?? { totalUnits: 0, totalValue: 0, lowStockProducts: 0, outOfStockProducts: 0 };
  const chartData = useMemo(() => items.slice(0, 10).map((item) => ({ name: lang === 'ar' ? item.nameAr : item.nameEn, current: item.stockQuantity, reorder: item.reorderPoint, target: item.targetStockQuantity })), [items, lang]);

  const printBarcode = (code: string | null, name: string) => {
    if (!code) {
      toast({ title: t('لا يوجد باركود أو SKU لهذا الصنف', 'This item has no barcode or SKU'), variant: 'destructive' });
      return;
    }
    const printWindow = window.open('', '_blank', 'width=420,height=280');
    if (!printWindow) {
      toast({ title: t('تعذر فتح نافذة الطباعة', 'Could not open print window'), variant: 'destructive' });
      return;
    }
    printWindow.document.write(`<html><head><title>${name}</title><style>body{font-family:Arial;text-align:center;padding:24px}svg{width:280px;height:100px}</style></head><body><h2>${name}</h2><svg id="code"></svg><p>${code}</p><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script><script>JsBarcode("#code","${code}",{format:"CODE128",displayValue:false});window.onload=()=>window.print();<\/script></body></html>`);
    printWindow.document.close();
  };

  const createProduct = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = { nameAr: create.nameAr.trim(), nameEn: create.nameEn.trim(), descriptionAr: create.descriptionAr.trim(), descriptionEn: create.descriptionEn.trim(), sku: create.sku.trim(), categoryId: Number(create.categoryId), price: Number(create.price), openingQuantity: Number(create.openingQuantity), ...(create.openingUnitCost !== '' ? { openingUnitCost: Number(create.openingUnitCost) } : {}), reorderPoint: Number(create.reorderPoint), targetStockQuantity: Number(create.targetStockQuantity) };
    if (!payload.nameAr || !payload.nameEn || !payload.descriptionAr || !payload.descriptionEn || !payload.sku || !Number.isSafeInteger(payload.categoryId) || [payload.price, payload.openingQuantity, payload.openingUnitCost, payload.reorderPoint, payload.targetStockQuantity].some((value) => value != null && (!Number.isFinite(value) || value < 0)) || (payload.openingQuantity > 0 && payload.openingUnitCost == null)) {
      toast({ title: t('أكمل الحقول المطلوبة', 'Complete required fields'), variant: 'destructive' }); return;
    }
    const existingProduct = items.find((item) => item.sku?.trim().toLowerCase() === payload.sku.toLowerCase());
    if (existingProduct) {
      setCreateOpen(false);
      setSelected(existingProduct);
      toast({
        title: t('المنتج موجود مسبقًا', 'Product already exists'),
        description: t(
          'فُتحت تفاصيل المنتج الموجود. استخدم «تسجيل حركة» ثم «تسوية إلى رصيد» لإدخال الكمية الحالية.',
          'The existing product was opened. Use “Record movement” then “Set balance” to enter the current quantity.',
        ),
      });
      return;
    }
    createMutation.mutate({ data: payload }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getAdminListInventoryQueryKey() }); setCreateOpen(false); setCreate(emptyCreate); toast({ title: t('تم إنشاء المنتج', 'Product created') }); },
      onError: (error) => toast({ title: t('تعذر إنشاء المنتج', 'Could not create product'), description: error.message, variant: 'destructive' }),
    });
  };

  const cards = [
    { title: t('إجمالي الوحدات', 'Total units'), value: summary.totalUnits.toLocaleString(), icon: Boxes },
    { title: t('قيمة المخزون', 'Inventory value'), value: <Money value={summary.totalValue} lang={lang} />, icon: CircleDollarSign },
    { title: t('منتجات منخفضة', 'Low stock'), value: summary.lowStockProducts.toLocaleString(), icon: AlertTriangle },
    { title: t('منتجات نافدة', 'Out of stock'), value: summary.outOfStockProducts.toLocaleString(), icon: XCircle },
  ];

  const isBalances = titleKey === 'balances';
  const pageTitle = isBalances
    ? t('الأصناف والأرصدة', 'Items & balances')
    : t('مركز المخزون', 'Inventory center');
  const pageDesc = isBalances
    ? t('متابعة أرصدة المنتجات وحدود الطلب', 'Track product balances and reorder thresholds')
    : t('إدارة الأرصدة والحدود والحركات من مكان واحد', 'Manage balances, thresholds, and movements in one place');

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-3xl font-bold">{pageTitle}</h1><p className="mt-1 text-muted-foreground">{pageDesc}</p></div>{canEdit && <Button onClick={() => setCreateOpen(true)}><PackagePlus className="me-2 h-4 w-4" />{t('إضافة منتج', 'Add product')}</Button>}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ title, value, icon: Icon }) => <Card key={title}><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle><Icon className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="text-base">{t('الرصيد مقابل حدود المخزون', 'Stock versus saved thresholds')}</CardTitle></CardHeader><CardContent className="h-[320px]" dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis /><Tooltip /><Legend /><Bar dataKey="current" name={t('الحالي', 'Current')} fill="hsl(31 78% 66%)" /><Bar dataKey="reorder" name={t('حد الطلب', 'Reorder')} fill="hsl(0 48% 31%)" /><Bar dataKey="target" name={t('المستهدف', 'Target')} fill="hsl(17 57% 46%)" /></BarChart></ResponsiveContainer></CardContent></Card>
    <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-4"><div className="relative"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="ps-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('بحث بالاسم أو SKU', 'Search name or SKU')} /></div><Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('كل التصنيفات', 'All categories')}</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{lang === 'ar' ? category.nameAr : category.nameEn}</SelectItem>)}</SelectContent></Select><Select value={stockStatus} onValueChange={(value) => setStockStatus(value as StockStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('كل الحالات', 'All statuses')}</SelectItem><SelectItem value="in_stock">{t('متوفر', 'In stock')}</SelectItem><SelectItem value="low">{t('منخفض', 'Low')}</SelectItem><SelectItem value="out">{t('نافد', 'Out')}</SelectItem></SelectContent></Select><Select value={sort} onValueChange={(value) => setSort(value as Sort)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="name_asc">{t('الاسم تصاعدياً', 'Name A-Z')}</SelectItem><SelectItem value="name_desc">{t('الاسم تنازلياً', 'Name Z-A')}</SelectItem><SelectItem value="quantity_asc">{t('الأقل كمية', 'Lowest quantity')}</SelectItem><SelectItem value="quantity_desc">{t('الأعلى كمية', 'Highest quantity')}</SelectItem><SelectItem value="value_desc">{t('الأعلى قيمة', 'Highest value')}</SelectItem></SelectContent></Select></div>
    <div className="overflow-x-auto rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead>{t('المنتج', 'Product')}</TableHead><TableHead>{t('التصنيف', 'Category')}</TableHead><TableHead>SKU</TableHead><TableHead>{t('الحالي', 'Current')}</TableHead><TableHead>{t('حد الطلب', 'Reorder')}</TableHead><TableHead>{t('المستهدف', 'Target')}</TableHead><TableHead>{t('القيمة', 'Value')}</TableHead><TableHead>{t('الحالة', 'Status')}</TableHead><TableHead className="sticky end-0 w-[190px] bg-card text-center">{t('الإجراءات', 'Actions')}</TableHead></TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={9} className="py-12 text-center">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow> : isError ? <TableRow><TableCell colSpan={9} className="py-12 text-center text-destructive">{t('تعذر تحميل المخزون', 'Could not load inventory')}</TableCell></TableRow> : items.length === 0 ? <TableRow><TableCell colSpan={9} className="py-12 text-center text-muted-foreground">{t('لا توجد نتائج', 'No results')}</TableCell></TableRow> : items.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{lang === 'ar' ? item.nameAr : item.nameEn}</TableCell><TableCell>{lang === 'ar' ? item.categoryNameAr : item.categoryNameEn}</TableCell><TableCell dir="ltr">{item.sku || '—'}</TableCell><TableCell className="font-bold">{item.stockQuantity}</TableCell><TableCell>{item.reorderPoint}</TableCell><TableCell>{item.targetStockQuantity}</TableCell><TableCell>{item.inventoryValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell><TableCell><Badge variant={item.stockStatus === 'out' ? 'destructive' : 'outline'} className={item.stockStatus === 'in_stock' ? 'border-success text-success' : item.stockStatus === 'low' ? 'border-amber-500 text-amber-600' : ''}>{statusLabel(item.stockStatus, t)}</Badge></TableCell><TableCell className="sticky end-0 bg-card"><RowActions item={item} canEdit={canEdit} canDelete={canDelete} onPrintBarcode={printBarcode} categories={categories} /></TableCell></TableRow>)}</TableBody></Table></div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{t('إضافة منتج إلى المخزون', 'Add inventory product')}</DialogTitle></DialogHeader><form onSubmit={createProduct} className="grid gap-4 sm:grid-cols-2">{([['nameAr', t('الاسم بالعربية', 'Arabic name')], ['nameEn', t('الاسم بالإنجليزية', 'English name')], ['sku', 'SKU']] as const).map(([key, label]) => <div key={key}><Label>{label}</Label><Input className="mt-1" required value={create[key]} onChange={(e) => setCreate((value) => ({ ...value, [key]: e.target.value }))} /></div>)}<div><Label>{t('التصنيف', 'Category')}</Label><Select value={create.categoryId} onValueChange={(value) => setCreate((current) => ({ ...current, categoryId: value }))}><SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر التصنيف', 'Select category')} /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{lang === 'ar' ? category.nameAr : category.nameEn}</SelectItem>)}</SelectContent></Select></div><div className="sm:col-span-2"><Label>{t('وصف المنتج بالعربية', 'Arabic product description')}</Label><Textarea className="mt-1 min-h-28 resize-y" required dir="rtl" value={create.descriptionAr} onChange={(e) => setCreate((value) => ({ ...value, descriptionAr: e.target.value }))} placeholder={t('اكتب الوصف الذي سيظهر في صفحة المنتج العربية', 'Enter the description shown on the Arabic product page')} /></div><div className="sm:col-span-2"><Label>{t('وصف المنتج بالإنجليزية', 'English product description')}</Label><Textarea className="mt-1 min-h-28 resize-y" required dir="ltr" value={create.descriptionEn} onChange={(e) => setCreate((value) => ({ ...value, descriptionEn: e.target.value }))} placeholder={t('اكتب الوصف الذي سيظهر في صفحة المنتج الإنجليزية', 'Enter the description shown on the English product page')} /></div>{([['price', t('سعر البيع', 'Selling price')], ['openingQuantity', t('الكمية الافتتاحية', 'Opening quantity')], ['openingUnitCost', t('تكلفة الوحدة الافتتاحية', 'Opening unit cost')], ['reorderPoint', t('حد إعادة الطلب', 'Reorder point')], ['targetStockQuantity', t('الكمية المستهدفة', 'Target quantity')]] as const).map(([key, label]) => <div key={key}><Label>{label}</Label><Input className="mt-1" type="number" min="0" step={key === 'price' || key === 'openingUnitCost' ? '0.01' : '1'} value={create[key]} onChange={(e) => setCreate((value) => ({ ...value, [key]: e.target.value }))} /></div>)}<Button className="sm:col-span-2" type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? t('جاري الإنشاء...', 'Creating...') : t('إنشاء المنتج', 'Create product')}</Button></form></DialogContent></Dialog>
    {selected && <InventoryDetails item={selected} open onOpenChange={(open) => !open && setSelected(null)} canEdit={canEdit} />}
  </div>;
}