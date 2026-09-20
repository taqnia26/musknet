import { useLanguage } from '@/hooks/use-language';
import { useListInventoryLocations, useCreateInventoryLocation, type InventoryLocation } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MapPin, Plus } from 'lucide-react';
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
  const [open, setOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        name: fd.get('name') as string,
        code: fd.get('code') as string,
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
                <Label>{t('الاسم', 'Name')}</Label>
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
                <TableHead>{t('الحالة', 'Status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
              ) : !locations?.length ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">{t('لا توجد مواقع', 'No locations')}</TableCell></TableRow>
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
                      <Badge variant={loc.active ? 'default' : 'secondary'} className={loc.active ? 'bg-success/20 text-success border-success/30' : ''}>
                        {loc.active ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
                      </Badge>
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
