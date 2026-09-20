import { useLanguage } from '@/hooks/use-language';
import { useListInventoryPurchaseOrders, useCreateInventoryPurchaseOrder, useReceiveInventoryPurchaseOrder, useListInventoryLocations, useAdminListInventory } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListInventoryPurchaseOrdersQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

export default function AdminInventoryPurchases() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: pos, isLoading } = useListInventoryPurchaseOrders();
  const { data: rawLocations } = useListInventoryLocations();
  const { data: inventory } = useAdminListInventory();
  const locations = (rawLocations as unknown as Array<{ id: number; name: string; code: string }> | undefined) ?? [];
  const items = inventory?.items ?? [];
  const createMutation = useCreateInventoryPurchaseOrder();
  const receiveMutation = useReceiveInventoryPurchaseOrder();
  const [open, setOpen] = useState(false);
  const [receivingId, setReceivingId] = useState<number | null>(null);
  const [receiptLines, setReceiptLines] = useState<Array<{ productId: number; quantity: string; remaining: number }>>([]);
  const [lines, setLines] = useState([{ productId: '', quantity: '', unitCost: '' }]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        orderNumber: fd.get('orderNumber') as string,
        vendorName: fd.get('vendorName') as string,
        idempotencyKey: crypto.randomUUID(),
        locationId: Number(fd.get('locationId')),
        lines: lines.map((line) => ({ productId: Number(line.productId), quantity: Number(line.quantity), unitCost: Number(line.unitCost) }))
      }
    }, {
      onSuccess: () => {
        toast({ title: t('تم إنشاء أمر الشراء', 'PO created') });
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: getListInventoryPurchaseOrdersQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-primary" />
          {t('أوامر الشراء والتوريد', 'Purchase Orders')}
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 me-2" />
              {t('أمر شراء جديد', 'New PO')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('إنشاء أمر شراء', 'Create Purchase Order')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('رقم الأمر', 'PO Number')}</Label>
                  <Input name="orderNumber" required defaultValue={`PO-${Math.floor(Date.now()/1000)}`} className="mt-1 font-mono" />
                </div>
                <div>
                  <Label>{t('المورد', 'Vendor')}</Label>
                  <Input name="vendorName" required className="mt-1" />
                </div>
              </div>
              <div>
                <Label>{t('موقع الاستلام (ID)', 'Receiving Location ID')}</Label>
                 <Select name="locationId" defaultValue={locations[0] ? String(locations[0].id) : undefined}><SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر الموقع', 'Select location')} /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.code} · {location.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="border p-4 rounded-lg bg-muted/20">
                <h4 className="text-sm font-medium mb-3">{t('صنف للتوريد', 'Supply Item')}</h4>
                 {lines.map((line, index) => <div key={index} className="grid grid-cols-[1fr_7rem_8rem_auto] items-end gap-3 mb-3">
                  <div>
                    <Label>{t('معرف المنتج', 'Product ID')}</Label>
                   <Select value={line.productId} onValueChange={(value) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, productId: value } : entry))}><SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر الصنف', 'Select item')} /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.sku || item.id} · {item.nameEn}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div>
                    <Label>{t('الكمية', 'Qty')}</Label>
                   <Input value={line.quantity} onChange={(e) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, quantity: e.target.value } : entry))} type="number" min="1" required className="mt-1" />
                  </div>
                  <div>
                    <Label>{t('سعر الوحدة', 'Unit Cost')}</Label>
                   <Input value={line.unitCost} onChange={(e) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, unitCost: e.target.value } : entry))} type="number" step="0.01" min="0" required className="mt-1" />
                    </div>
                    <Button type="button" variant="ghost" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>{t('حذف', 'Remove')}</Button>
                  </div>)}
                 <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { productId: '', quantity: '', unitCost: '' }])}>{t('إضافة صنف', 'Add line')}</Button>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {t('إنشاء الأمر', 'Create PO')}
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
                <TableHead>{t('رقم الأمر', 'PO No')}</TableHead>
                <TableHead>{t('المورد', 'Vendor')}</TableHead>
                <TableHead>{t('موقع الاستلام', 'Location')}</TableHead>
                <TableHead>{t('الحالة', 'Status')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
              ) : !pos?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">{t('لا توجد أوامر شراء', 'No purchase orders')}</TableCell></TableRow>
              ) : (
                pos.map(po => (
                  <TableRow key={po.id}>
                    <TableCell className="font-mono">{po.orderNumber}</TableCell>
                    <TableCell>{po.vendorName}</TableCell>
                    <TableCell>Location #{po.locationId}</TableCell>
                    <TableCell>
                      <Badge variant={po.status === 'draft' ? 'secondary' : po.status === 'received' ? 'default' : 'outline'}>
                        {po.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {po.lines.map((line) => <div key={line.productId} className="text-xs">{t('صنف', 'Item')} #{line.productId}: {Math.max(0, line.quantity - line.receivedQuantity)} {t('متبقٍ', 'remaining')}</div>)}
                      {po.status !== 'received' && <Button variant="ghost" size="sm" disabled={receiveMutation.isPending} onClick={() => {
                        const remaining = po.lines.map((line) => ({ productId: line.productId, remaining: Math.max(0, line.quantity - line.receivedQuantity), quantity: String(Math.max(0, line.quantity - line.receivedQuantity)) })).filter((line) => line.remaining > 0);
                        if (!remaining.length) return;
                        setReceivingId(po.id);
                        setReceiptLines(remaining);
                      }}>{t('استلام', 'Receive')}</Button>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={receivingId !== null} onOpenChange={(value) => { if (!value) setReceivingId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('تسجيل استلام جزئي أو كامل', 'Record partial or full receipt')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {receiptLines.map((line, index) => <div key={line.productId} className="grid grid-cols-[1fr_9rem] items-end gap-3">
              <div>
                <Label>{t('الصنف', 'Item')} #{line.productId}</Label>
                <p className="text-xs text-muted-foreground">{t('المتبقي', 'Remaining')}: {line.remaining}</p>
              </div>
              <div>
                <Label>{t('كمية الاستلام', 'Receipt quantity')}</Label>
                <Input type="number" min="0" max={line.remaining} value={line.quantity} onChange={(event) => setReceiptLines((current) => current.map((entry, i) => i === index ? { ...entry, quantity: event.target.value } : entry))} />
              </div>
            </div>)}
          </div>
          <div className="flex justify-end">
            <Button disabled={receiveMutation.isPending} onClick={() => {
              if (receivingId === null) return;
              const receipts = receiptLines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })).filter((line) => Number.isInteger(line.quantity) && line.quantity > 0);
              if (!receipts.length) {
                toast({ title: t('أدخل كمية استلام واحدة على الأقل', 'Enter at least one receipt quantity'), variant: 'destructive' });
                return;
              }
              receiveMutation.mutate({ id: receivingId, data: { idempotencyKey: crypto.randomUUID(), receipts } }, {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListInventoryPurchaseOrdersQueryKey() });
                  toast({ title: t('تم تسجيل الاستلام', 'Receipt posted') });
                  setReceivingId(null);
                },
                onError: (error) => toast({ title: t('تعذر تسجيل الاستلام', 'Could not post receipt'), description: error.message, variant: 'destructive' }),
              });
            }}>{t('تأكيد الاستلام', 'Confirm receipt')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
