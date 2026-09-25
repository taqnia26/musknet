import { useMemo, useState } from 'react';
import { 
  useAdminListExhibitions,
  useAdminCreateExhibition,
  useAdminUpdateExhibition,
  useAdminDeleteExhibition,
  useAdminListExhibitionProducts,
  useAdminCreateExhibitionProduct,
  useAdminListProducts,
  useGetAdminMe,
  getAdminListExhibitionsQueryKey,
  getAdminListExhibitionProductsQueryKey
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { quantityInputClass } from '@/lib/quantity-input';
import { Money } from '@/components/money';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Plus, Edit2, Trash2, Calendar, MapPin, DollarSign, Package, MoreHorizontal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { sortProductsForSelection } from '@/lib/product-sort';

function ExhibitionProducts({ exhibitionId, canEdit }: { exhibitionId: number, canEdit: boolean }) {
  const { t, lang } = useLanguage();
  const { data: allocations, isLoading } = useAdminListExhibitionProducts(exhibitionId);
  const { data: products } = useAdminListProducts({});
  const productOptions = useMemo(() => sortProductsForSelection(products ?? [], lang), [products, lang]);
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const allocateMutation = useAdminCreateExhibitionProduct();
  const { toast } = useToast();

  const handleAllocate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const allocated = Number(formData.get('quantityAllocated'));
    const sold = Number(formData.get('quantitySold')) || 0;
    
    if (sold > allocated) {
      toast({ title: t('خطأ', 'Error'), description: t('الكمية المباعة لا يمكن أن تتجاوز المخصصة', 'Sold quantity cannot exceed allocated'), variant: 'destructive' });
      return;
    }

    const data = {
      productId: Number(formData.get('productId')),
      quantityAllocated: allocated,
      quantitySold: sold,
    };
    
    allocateMutation.mutate({ id: exhibitionId, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListExhibitionProductsQueryKey(exhibitionId) });
        setIsOpen(false);
        toast({ title: t('تم الحفظ', 'Saved') });
      }
    });
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">{t('المنتجات المخصصة', 'Allocated Products')}</h3>
        {canEdit && (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="h-4 w-4 me-2" />{t('تخصيص منتج', 'Allocate Product')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t('تخصيص منتج للمعرض', 'Allocate Product to Exhibition')}</DialogTitle></DialogHeader>
              <form onSubmit={handleAllocate} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('المنتج', 'Product')}</label>
                  <select name="productId" required className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="">{t('اختر منتج...', 'Select product...')}</option>
                    {productOptions.map(p => <option key={p.id} value={p.id}>{lang === 'ar' ? p.nameAr : p.nameEn}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('الكمية المخصصة', 'Allocated Quantity')}</label>
                    <Input name="quantityAllocated" type="number" min="1" required className={quantityInputClass} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('الكمية المباعة', 'Sold Quantity')}</label>
                    <Input name="quantitySold" type="number" min="0" defaultValue="0" className={quantityInputClass} />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <Button type="submit" disabled={allocateMutation.isPending}>{t('حفظ', 'Save')}</Button>
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
              <TableHead>{t('المنتج', 'Product')}</TableHead>
              <TableHead>{t('المخصص', 'Allocated')}</TableHead>
              <TableHead>{t('المباع', 'Sold')}</TableHead>
              <TableHead>{t('المتبقي', 'Remaining')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={4} className="text-center">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow> : 
             !allocations?.length ? <TableRow><TableCell colSpan={4} className="text-center">{t('لا توجد منتجات', 'No products')}</TableCell></TableRow> :
             allocations.map(a => (
               <TableRow key={a.id}>
                 <TableCell className="font-medium">{lang === 'ar' ? a.productNameAr : a.productNameEn}</TableCell>
                 <TableCell>{a.quantityAllocated}</TableCell>
                 <TableCell>{a.quantitySold}</TableCell>
                 <TableCell>{a.quantityAllocated - a.quantitySold}</TableCell>
               </TableRow>
             ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function AdminExhibitions() {
  const { t, lang } = useLanguage();
  const { data: currentUser } = useGetAdminMe();
  const canEdit = hasPermission(currentUser, 'exhibitions', 'edit');
  const canDelete = hasPermission(currentUser, 'exhibitions', 'delete');
  
  const [isOpen, setIsOpen] = useState(false);
  const [editingExhibition, setEditingExhibition] = useState<any>(null);
  const [selectedExhibition, setSelectedExhibition] = useState<number | null>(null);
  
  const { data: exhibitions, isLoading } = useAdminListExhibitions();
  
  const queryClient = useQueryClient();
  const createMutation = useAdminCreateExhibition();
  const updateMutation = useAdminUpdateExhibition();
  const deleteMutation = useAdminDeleteExhibition();
  const { toast } = useToast();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const startDate = formData.get('startDate') as string;
    const endDate = formData.get('endDate') as string;
    
    if (new Date(endDate) < new Date(startDate)) {
      toast({ title: t('خطأ', 'Error'), description: t('تاريخ النهاية يجب أن يكون بعد تاريخ البداية', 'End date must be after start date'), variant: 'destructive' });
      return;
    }

    const data = {
      name: formData.get('name') as string,
      location: formData.get('location') as string,
      startDate,
      endDate,
      budget: Number(formData.get('budget')),
      status: formData.get('status') as any,
      notes: formData.get('notes') as string || null,
    };

    if (editingExhibition) {
      updateMutation.mutate({ id: editingExhibition.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListExhibitionsQueryKey() });
          setIsOpen(false);
          toast({ title: t('تم الحفظ', 'Saved') });
        }
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListExhibitionsQueryKey() });
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
          queryClient.invalidateQueries({ queryKey: getAdminListExhibitionsQueryKey() });
          if (selectedExhibition === id) setSelectedExhibition(null);
          toast({ title: t('تم الحذف', 'Deleted') });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('مبيعات المعارض', 'Exhibition Sales')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة المعارض وكميات مبيعاتها', 'Manage exhibitions and their sales quantities')}</p>
        </div>
        {canEdit && (
          <Dialog open={isOpen} onOpenChange={(v) => { setIsOpen(v); if (!v) setEditingExhibition(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 me-2" />{t('إضافة معرض', 'Add Exhibition')}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editingExhibition ? t('تعديل معرض', 'Edit Exhibition') : t('إضافة معرض', 'Add Exhibition')}</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium">{t('الاسم', 'Name')}</label>
                  <Input name="name" required defaultValue={editingExhibition?.name} />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium">{t('الموقع', 'Location')}</label>
                  <Input name="location" required defaultValue={editingExhibition?.location} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('تاريخ البداية', 'Start Date')}</label>
                  <Input name="startDate" type="date" required defaultValue={editingExhibition?.startDate?.split('T')[0]} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('تاريخ النهاية', 'End Date')}</label>
                  <Input name="endDate" type="date" required defaultValue={editingExhibition?.endDate?.split('T')[0]} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الميزانية', 'Budget')}</label>
                  <Input name="budget" type="number" min="0" required defaultValue={editingExhibition?.budget} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('الحالة', 'Status')}</label>
                  <select name="status" required defaultValue={editingExhibition?.status || 'planned'} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="planned">{t('مخطط', 'Planned')}</option>
                    <option value="ongoing">{t('جاري', 'Ongoing')}</option>
                    <option value="completed">{t('مكتمل', 'Completed')}</option>
                    <option value="cancelled">{t('ملغى', 'Cancelled')}</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-sm font-medium">{t('ملاحظات', 'Notes')}</label>
                  <Input name="notes" defaultValue={editingExhibition?.notes || ''} />
                </div>
                <div className="col-span-2 flex justify-end mt-4">
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{t('حفظ', 'Save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4 max-h-[800px] overflow-y-auto pr-2">
          {isLoading ? <div className="text-center py-4">{t('جاري التحميل...', 'Loading...')}</div> : 
           !exhibitions?.length ? <div className="text-center py-4">{t('لا توجد معارض', 'No exhibitions')}</div> :
           exhibitions.map(ex => (
             <Card 
               key={ex.id} 
               className={`cursor-pointer transition-colors ${selectedExhibition === ex.id ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'}`}
               onClick={() => setSelectedExhibition(ex.id)}
             >
               <CardHeader className="p-4 pb-2">
                 <div className="flex justify-between items-start">
                   <CardTitle className="text-lg">{ex.name}</CardTitle>
                   <Badge variant="outline">{ex.status}</Badge>
                 </div>
               </CardHeader>
               <CardContent className="p-4 pt-0 space-y-2 text-sm text-muted-foreground">
                 <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {ex.location}</div>
                 <div className="flex items-center gap-2"><Calendar className="h-4 w-4" /> {format(new Date(ex.startDate), 'MMM d, yyyy')} - {format(new Date(ex.endDate), 'MMM d, yyyy')}</div>
               </CardContent>
               {(canEdit || canDelete) && (
                 <CardFooter className="p-2 border-t flex justify-end gap-1 bg-muted/30">
                   <DropdownMenu>
                     <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                       {canEdit && <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingExhibition(ex); setIsOpen(true); }}><Edit2 className="h-4 w-4 me-2" />{t('تعديل', 'Edit')}</DropdownMenuItem>}
                       {canEdit && canDelete && <DropdownMenuSeparator />}
                       {canDelete && <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={deleteMutation.isPending} onClick={(e) => { e.stopPropagation(); handleDelete(ex.id); }}><Trash2 className="h-4 w-4 me-2" />{t('حذف', 'Delete')}</DropdownMenuItem>}
                     </DropdownMenuContent>
                   </DropdownMenu>
                 </CardFooter>
               )}
             </Card>
           ))
          }
        </div>
        
        <div className="lg:col-span-2">
          {selectedExhibition ? (
            <div className="bg-card border rounded-lg p-6">
              <div className="flex items-start justify-between mb-6 border-b pb-4">
                <div>
                  <h2 className="text-2xl font-bold">{exhibitions?.find(e => e.id === selectedExhibition)?.name}</h2>
                  <div className="flex items-center gap-4 mt-2 text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {exhibitions?.find(e => e.id === selectedExhibition)?.location}</span>
                    <span className="flex items-center gap-1"><DollarSign className="h-4 w-4" /> <Money value={exhibitions?.find(e => e.id === selectedExhibition)?.budget} lang={lang} /></span>
                  </div>
                </div>
                <Badge className="text-sm px-3 py-1">{exhibitions?.find(e => e.id === selectedExhibition)?.status}</Badge>
              </div>
              
              <ExhibitionProducts exhibitionId={selectedExhibition} canEdit={canEdit} />
            </div>
          ) : (
            <div className="bg-muted/30 border border-dashed rounded-lg h-[400px] flex flex-col items-center justify-center text-muted-foreground">
              <Package className="h-12 w-12 mb-4 opacity-50" />
              <p>{t('اختر معرضاً لعرض التفاصيل', 'Select an exhibition to view details')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}