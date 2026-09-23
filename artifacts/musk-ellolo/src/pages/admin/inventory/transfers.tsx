import { useLanguage } from '@/hooks/use-language';
import { sortProductsForSelection } from '@/lib/product-sort';
import { useListInventoryTransfers, useCreateInventoryTransfer, useSendInventoryTransfer, useReceiveInventoryTransfer, useListInventoryLocations, useAdminListInventory } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeftRight, Plus, MoreHorizontal, Send, PackageCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListInventoryTransfersQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function AdminInventoryTransfers() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: transfers, isLoading } = useListInventoryTransfers();
  const { data: rawLocations } = useListInventoryLocations();
  const { data: inventory } = useAdminListInventory();
  const locations = ((rawLocations as unknown as Array<{ id: number; name: string; code: string }> | undefined) ?? [])
    .filter((location) => location.code !== 'B2B_USED_RETURN');
  const items = useMemo(
    () => sortProductsForSelection(inventory?.items ?? [], lang),
    [inventory, lang],
  );
  const createMutation = useCreateInventoryTransfer();
  const sendMutation = useSendInventoryTransfer();
  const receiveMutation = useReceiveInventoryTransfer();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState([{ productId: '', quantity: '' }]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        transferNumber: fd.get('transferNumber') as string,
        idempotencyKey: crypto.randomUUID(),
        fromLocationId: Number(fd.get('fromLocationId')),
        toLocationId: Number(fd.get('toLocationId')),
         lines: lines.map((line) => ({ productId: Number(line.productId), quantity: Number(line.quantity) }))
      }
    }, {
      onSuccess: () => {
        toast({ title: t('تم إنشاء طلب التحويل', 'Transfer created') });
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: getListInventoryTransfersQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-primary" />
          {t('تحويلات المخزون', 'Inventory Transfers')}
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 me-2" />
              {t('تحويل جديد', 'New Transfer')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('إنشاء تحويل مخزون', 'Create Inventory Transfer')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>{t('رقم التحويل', 'Transfer Number')}</Label>
                <Input name="transferNumber" required defaultValue={`TRF-${Math.floor(Date.now()/1000)}`} className="mt-1 font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('من موقع (ID)', 'From Location ID')}</Label>
                  <Select name="fromLocationId" defaultValue={locations[0] ? String(locations[0].id) : undefined}><SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر الموقع', 'Select location')} /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.code} · {location.name}</SelectItem>)}</SelectContent></Select>
                </div>
                <div>
                  <Label>{t('إلى موقع (ID)', 'To Location ID')}</Label>
                  <Select name="toLocationId" defaultValue={locations[1] ? String(locations[1].id) : undefined}><SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر الموقع', 'Select location')} /></SelectTrigger><SelectContent>{locations.map((location) => <SelectItem key={location.id} value={String(location.id)}>{location.code} · {location.name}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <div className="border p-4 rounded-lg bg-muted/20">
                <h4 className="text-sm font-medium mb-3">{t('الأصناف', 'Items')}</h4>
                {lines.map((line, index) => <div className="grid grid-cols-[1fr_8rem_auto] items-end gap-3 mb-3" key={index}>
                  <div>
                    <Label>{t('الصنف', 'Item')}</Label>
                    <Select value={line.productId} onValueChange={(value) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, productId: value } : entry))}><SelectTrigger className="mt-1"><SelectValue placeholder={t('اختر الصنف', 'Select item')} /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.sku || item.id} · {item.nameEn}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div>
                    <Label>{t('الكمية', 'Quantity')}</Label>
                    <Input value={line.quantity} onChange={(e) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, quantity: e.target.value } : entry))} type="number" min="1" required className="mt-1" />
                  </div>
                  <Button type="button" variant="ghost" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>{t('حذف', 'Remove')}</Button>
                </div>)}
                <Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { productId: '', quantity: '' }])}>{t('إضافة سطر', 'Add line')}</Button>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {t('إنشاء التحويل', 'Create Transfer')}
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
                <TableHead>{t('رقم التحويل', 'Transfer No')}</TableHead>
                <TableHead>{t('من موقع', 'From Location')}</TableHead>
                <TableHead>{t('إلى موقع', 'To Location')}</TableHead>
                <TableHead>{t('الحالة', 'Status')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
              ) : !transfers?.length ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">{t('لا توجد تحويلات', 'No transfers')}</TableCell></TableRow>
              ) : (
                transfers.map(trf => (
                  <TableRow key={trf.id}>
                    <TableCell className="font-mono">{trf.transferNumber}</TableCell>
                    <TableCell>Location #{trf.fromLocationId}</TableCell>
                    <TableCell>Location #{trf.toLocationId}</TableCell>
                    <TableCell>
                      <Badge variant={trf.status === 'draft' ? 'secondary' : trf.status === 'received' ? 'default' : 'outline'}>
                        {trf.status}
                      </Badge>
                    </TableCell>
                     <TableCell>
                       <DropdownMenu>
                         <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('المزيد', 'More actions')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                         <DropdownMenuContent align="end">
                           {trf.status === 'draft' && <DropdownMenuItem disabled={sendMutation.isPending} onClick={() => sendMutation.mutate({ id: trf.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInventoryTransfersQueryKey() }), onError: (error) => toast({ title: t('تعذر الإرسال', 'Could not send'), description: error.message, variant: 'destructive' }) })}><Send className="h-4 w-4 mr-2" />{t('إرسال', 'Send')}</DropdownMenuItem>}
                           {trf.status === 'sent' && <DropdownMenuItem disabled={receiveMutation.isPending} onClick={() => receiveMutation.mutate({ id: trf.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListInventoryTransfersQueryKey() }), onError: (error) => toast({ title: t('تعذر الاستلام', 'Could not receive'), description: error.message, variant: 'destructive' }) })}><PackageCheck className="h-4 w-4 mr-2" />{t('استلام', 'Receive')}</DropdownMenuItem>}
                         </DropdownMenuContent>
                       </DropdownMenu>
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
