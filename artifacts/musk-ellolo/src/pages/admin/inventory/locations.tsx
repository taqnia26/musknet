import { useLanguage } from '@/hooks/use-language';
import { useListInventoryLocations, useCreateInventoryLocation, useUpdateInventoryLocation, useDeleteInventoryLocation, type InventoryLocation } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Eye, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListInventoryLocationsQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

export default function AdminInventoryLocations() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rawLocations, isLoading } = useListInventoryLocations();
  const locations = (rawLocations as unknown as InventoryLocation[] | undefined) ?? [];
  const createMutation = useCreateInventoryLocation();
  const updateMutation = useUpdateInventoryLocation();
  const deleteMutation = useDeleteInventoryLocation();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<InventoryLocation | null>(null);
  const [editing, setEditing] = useState<InventoryLocation | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        name: fd.get('name') as string,
        code: fd.get('code') as string,
        managerName: fd.get('managerName') as string,
        email: fd.get('email') as string,
        phone: fd.get('phone') as string,
        type: (fd.get('type') as any) || 'warehouse',
        isDefault: fd.get('isDefault') === 'on'
      }
    }, {
      onSuccess: () => {
        toast({ title: t('تم إضافة الموقع', 'Location added') });
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: getListInventoryLocationsQueryKey() });
      }
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editing.id,
      data: {
        name: String(fd.get('name') || ''),
        code: String(fd.get('code') || ''),
        managerName: String(fd.get('managerName') || ''),
        email: String(fd.get('email') || ''),
        phone: String(fd.get('phone') || ''),
        type: (fd.get('type') as 'warehouse' | 'store' | 'virtual') || 'warehouse',
        isDefault: editing.isDefault || fd.get('isDefault') === 'on',
        active: fd.get('active') === 'on',
      },
    }, {
      onSuccess: () => {
        toast({ title: t('تم تعديل الموقع', 'Location updated') });
        setEditing(null);
        queryClient.invalidateQueries({ queryKey: getListInventoryLocationsQueryKey() });
      },
      onError: (error) => toast({ title: t('تعذر تعديل الموقع', 'Could not update location'), description: error.message, variant: 'destructive' }),
    });
  };

  const removeLocation = (location: InventoryLocation) => {
    if (location.isDefault) {
      toast({ title: t('لا يمكن حذف الموقع الأساسي', 'The default location cannot be deleted'), variant: 'destructive' });
      return;
    }
    if (!window.confirm(t(`سيتم حذف الموقع «${location.name}» نهائيًا. هل تريد المتابعة؟`, `Location “${location.name}” will be permanently deleted. Continue?`))) return;
    deleteMutation.mutate({ id: location.id }, {
      onSuccess: () => {
        toast({ title: t('تم حذف الموقع', 'Location deleted') });
        queryClient.invalidateQueries({ queryKey: getListInventoryLocationsQueryKey() });
      },
      onError: (error) => toast({ title: t('تعذر حذف الموقع', 'Could not delete location'), description: error.message, variant: 'destructive' }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          {t('مواقع المخزون', 'Inventory Locations')}
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 me-2" />
              {t('موقع جديد', 'New Location')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('إضافة موقع جديد', 'Add New Location')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>{t('اسم المخزن', 'Warehouse Name')}</Label>
                <Input name="name" required className="mt-1" />
              </div>
              <div>
                <Label>{t('الرمز', 'Code')}</Label>
                <Input name="code" required className="mt-1" />
              </div>
              <div>
                <Label>{t('النوع', 'Type')}</Label>
                <Select name="type" defaultValue="warehouse">
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">{t('مستودع رئيسي', 'Warehouse')}</SelectItem>
                    <SelectItem value="store">{t('معرض/فرع', 'Store')}</SelectItem>
                    <SelectItem value="virtual">{t('مخزون افتراضي', 'Virtual')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('المسؤول', 'Manager')}</Label>
                <Input name="managerName" required className="mt-1" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>{t('البريد الإلكتروني', 'Email')}</Label>
                  <Input name="email" type="email" required className="mt-1" dir="ltr" />
                </div>
                <div>
                  <Label>{t('رقم الجوال', 'Mobile Number')}</Label>
                  <Input name="phone" type="tel" required className="mt-1" dir="ltr" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="isDefault" id="isDefault" className="rounded" />
                <Label htmlFor="isDefault">{t('الموقع الافتراضي', 'Default Location')}</Label>
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createMutation.isPending}>
                  {t('حفظ الموقع', 'Save Location')}
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
                <TableHead>{t('الرمز', 'Code')}</TableHead>
                <TableHead>{t('الاسم', 'Name')}</TableHead>
                <TableHead>{t('النوع', 'Type')}</TableHead>
                <TableHead>{t('المسؤول', 'Manager')}</TableHead>
                <TableHead>{t('الحالة', 'Status')}</TableHead>
                <TableHead className="min-w-[150px]">{t('الإجراءات', 'Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
              ) : !locations?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">{t('لا توجد مواقع', 'No locations')}</TableCell></TableRow>
              ) : (
                locations.map(loc => (
                  <TableRow key={loc.id}>
                    <TableCell className="font-mono">{loc.code}</TableCell>
                    <TableCell className="font-medium">
                      {loc.name}
                      {loc.isDefault && <Badge variant="secondary" className="ms-2 text-[10px]">{t('أساسي', 'Default')}</Badge>}
                    </TableCell>
                    <TableCell>
                      {loc.type === 'warehouse' ? t('مستودع', 'Warehouse') : loc.type === 'store' ? t('معرض', 'Store') : t('افتراضي', 'Virtual')}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{loc.managerName || '—'}</div>
                      {loc.phone && <div className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{loc.phone}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={loc.active ? 'default' : 'secondary'} className={loc.active ? 'bg-success/20 text-success border-success/30' : ''}>
                        {loc.active ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-sky-500/25 bg-sky-500/10 text-sky-600 shadow-sm hover:bg-sky-500/20" title={t('عرض', 'View')} onClick={() => setViewing(loc)}>
                          <Eye className="h-4 w-4 stroke-[1.8]" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-amber-500/25 bg-amber-500/10 text-amber-600 shadow-sm hover:bg-amber-500/20" title={t('تعديل', 'Edit')} onClick={() => setEditing(loc)}>
                          <Pencil className="h-4 w-4 stroke-[1.8]" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-destructive/25 bg-destructive/10 text-destructive shadow-sm hover:bg-destructive/20 disabled:opacity-35" title={loc.isDefault ? t('لا يمكن حذف الموقع الأساسي', 'Default location cannot be deleted') : t('حذف', 'Delete')} disabled={loc.isDefault || deleteMutation.isPending} onClick={() => removeLocation(loc)}>
                          <Trash2 className="h-4 w-4 stroke-[1.8]" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(viewing)} onOpenChange={(next) => !next && setViewing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('تفاصيل موقع المخزون', 'Inventory Location Details')}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">{t('الرمز', 'Code')}</div><div className="mt-1 font-mono font-semibold">{viewing.code}</div></div>
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">{t('اسم المخزن', 'Warehouse Name')}</div><div className="mt-1 font-semibold">{viewing.name}</div></div>
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">{t('النوع', 'Type')}</div><div className="mt-1 font-semibold">{viewing.type === 'warehouse' ? t('مستودع', 'Warehouse') : viewing.type === 'store' ? t('معرض', 'Store') : t('افتراضي', 'Virtual')}</div></div>
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">{t('الحالة', 'Status')}</div><div className="mt-1 font-semibold">{viewing.active ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}</div></div>
              <div className="col-span-2 rounded-lg border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">{t('التعيين', 'Assignment')}</div><div className="mt-1 font-semibold">{viewing.isDefault ? t('الموقع الأساسي للمخزون', 'Default inventory location') : t('موقع إضافي', 'Additional location')}</div></div>
              <div className="col-span-2 rounded-lg border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">{t('المسؤول', 'Manager')}</div><div className="mt-1 font-semibold">{viewing.managerName || '—'}</div></div>
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">{t('البريد الإلكتروني', 'Email')}</div><div className="mt-1 truncate font-semibold" dir="ltr">{viewing.email || '—'}</div></div>
              <div className="rounded-lg border bg-muted/20 p-3"><div className="text-xs text-muted-foreground">{t('رقم الجوال', 'Mobile Number')}</div><div className="mt-1 font-semibold" dir="ltr">{viewing.phone || '—'}</div></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t('تعديل موقع المخزون', 'Edit Inventory Location')}</DialogTitle></DialogHeader>
          {editing && (
            <form key={editing.id} onSubmit={handleUpdate} className="space-y-4">
              <div><Label>{t('اسم المخزن', 'Warehouse Name')}</Label><Input name="name" defaultValue={editing.name} required className="mt-1" /></div>
              <div><Label>{t('الرمز', 'Code')}</Label><Input name="code" defaultValue={editing.code} required className="mt-1 font-mono" /></div>
              <div>
                <Label>{t('النوع', 'Type')}</Label>
                <Select name="type" defaultValue={editing.type}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">{t('مستودع رئيسي', 'Warehouse')}</SelectItem>
                    <SelectItem value="store">{t('معرض/فرع', 'Store')}</SelectItem>
                    <SelectItem value="virtual">{t('مخزون افتراضي', 'Virtual')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t('المسؤول', 'Manager')}</Label><Input name="managerName" defaultValue={editing.managerName || ''} required className="mt-1" /></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><Label>{t('البريد الإلكتروني', 'Email')}</Label><Input name="email" type="email" defaultValue={editing.email || ''} required className="mt-1" dir="ltr" /></div>
                <div><Label>{t('رقم الجوال', 'Mobile Number')}</Label><Input name="phone" type="tel" defaultValue={editing.phone || ''} required className="mt-1" dir="ltr" /></div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <input type="checkbox" name="active" id="edit-active" defaultChecked={editing.active} className="h-4 w-4 rounded" />
                <Label htmlFor="edit-active">{t('الموقع نشط', 'Location is active')}</Label>
              </div>
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <input type="checkbox" name="isDefault" id="edit-default" defaultChecked={editing.isDefault} disabled={editing.isDefault} className="h-4 w-4 rounded" />
                <Label htmlFor="edit-default">{editing.isDefault ? t('الموقع الأساسي الحالي', 'Current default location') : t('تعيينه كموقع أساسي', 'Set as default location')}</Label>
              </div>
              <div className="flex justify-end pt-2"><Button type="submit" disabled={updateMutation.isPending}>{t('حفظ التعديلات', 'Save Changes')}</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
