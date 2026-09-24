import { useState } from 'react';
import { useAdminListDistributorCatalog, useAdminUpdateDistributorCatalog, getAdminListDistributorCatalogQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, Save, Pencil, Image as ImageIcon, Search, MoreHorizontal } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { sortProductsForSelection } from '@/lib/product-sort';

export default function AdminDistributorCatalog() {
  const { data: catalog, isLoading } = useAdminListDistributorCatalog();
  const updateCatalog = useAdminUpdateDistributorCatalog();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{
    showOnDistributors: boolean;
    distributorNameOverride: string;
    distributorImageOverride: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCatalog = sortProductsForSelection((catalog ?? []).filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.nameAr?.toLowerCase().includes(q) ||
      item.nameEn?.toLowerCase().includes(q) ||
      item.distributorNameOverride?.toLowerCase().includes(q)
    );
  }), 'ar');

  const startEditing = (item: any) => {
    setEditingId(item.id);
    setEditValues({
      showOnDistributors: item.showOnDistributors,
      distributorNameOverride: item.distributorNameOverride || '',
      distributorImageOverride: item.distributorImageOverride || '',
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues(null);
  };

  const handleSave = (productId: number) => {
    if (!editValues) return;

    updateCatalog.mutate(
      {
        data: {
          productId,
          showOnDistributors: editValues.showOnDistributors,
          distributorNameOverride: editValues.distributorNameOverride || null,
          distributorImageOverride: editValues.distributorImageOverride || null,
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListDistributorCatalogQueryKey() });
          toast({ title: 'تم الحفظ', description: 'تم تحديث إعدادات المنتج بنجاح' });
          setEditingId(null);
          setEditValues(null);
        },
        onError: () => {
          toast({ title: 'خطأ', description: 'حدث خطأ أثناء الحفظ', variant: 'destructive' });
        }
      }
    );
  };

  const toggleVisibility = (productId: number, currentVisibility: boolean) => {
    const item = catalog?.find(c => c.id === productId);
    if (!item) return;

    updateCatalog.mutate(
      {
        data: {
          productId,
          showOnDistributors: !currentVisibility,
          distributorNameOverride: item.distributorNameOverride,
          distributorImageOverride: item.distributorImageOverride,
        }
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListDistributorCatalogQueryKey() });
          toast({ title: 'تم التحديث', description: 'تم تحديث حالة الظهور بنجاح' });
        }
      }
    );
  };

  if (isLoading) {
    return <div className="flex h-[200px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">كتالوج الموزعين / B2B Catalog</h1>
          <p className="text-muted-foreground mt-2">إدارة المنتجات المعروضة للموزعين وتخصيص أسمائها وصورها</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث في المنتجات..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9 rtl:pr-9 ltr:pl-9 rtl:pl-3"
            data-testid="input-catalog-search"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المنتج الأساسي</TableHead>
              <TableHead>حالة الظهور</TableHead>
              <TableHead>الاسم المخصص (للموزعين)</TableHead>
              <TableHead>الصورة المخصصة</TableHead>
              <TableHead className="w-[150px]">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCatalog?.map((item) => {
              const isEditing = editingId === item.id;
              
              return (
                <TableRow key={item.id}>
                  <TableCell className="text-center font-medium">
                    {item.nameAr}
                    <div className="text-xs text-muted-foreground mt-1" dir="ltr">{item.nameEn}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-2">
                        <Switch 
                          checked={editValues?.showOnDistributors} 
                          onCheckedChange={(c) => setEditValues(prev => prev ? {...prev, showOnDistributors: c} : null)}
                        />
                        <span className="text-sm">{editValues?.showOnDistributors ? 'ظاهر' : 'مخفي'}</span>
                      </div>
                    ) : (
                      <Badge
                        variant="secondary"
                        className={item.showOnDistributors ? "border-transparent bg-success text-success-foreground" : ""}
                      >
                        {item.showOnDistributors ? <Eye className="ml-1 h-3 w-3 inline" /> : <EyeOff className="ml-1 h-3 w-3 inline" />}
                        {item.showOnDistributors ? 'ظاهر' : 'مخفي'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {isEditing ? (
                      <Input 
                        value={editValues?.distributorNameOverride} 
                        onChange={(e) => setEditValues(prev => prev ? {...prev, distributorNameOverride: e.target.value} : null)}
                        placeholder="اترك فارغاً لاستخدام الاسم الأساسي"
                        className="h-8 text-center"
                      />
                    ) : (
                      <span className={item.distributorNameOverride ? "text-primary font-medium" : "text-muted-foreground"}>
                        {item.distributorNameOverride || '—'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {isEditing ? (
                      <div className="flex items-center justify-center gap-2">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <Input 
                          value={editValues?.distributorImageOverride} 
                          onChange={(e) => setEditValues(prev => prev ? {...prev, distributorImageOverride: e.target.value} : null)}
                          placeholder="رابط الصورة (URL)"
                          className="h-8"
                          dir="ltr"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {item.distributorImageOverride ? (
                          <>
                            <div className="h-8 w-8 rounded overflow-hidden bg-muted flex items-center justify-center border">
                              <img src={item.distributorImageOverride} alt="Custom" className="h-full w-full object-cover" />
                            </div>
                            <span className="text-xs text-muted-foreground truncate w-24 block" dir="ltr">{item.distributorImageOverride}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-left">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={cancelEditing}>إلغاء</Button>
                        <Button size="sm" onClick={() => handleSave(item.id)} disabled={updateCatalog.isPending}>
                          {updateCatalog.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      </div>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="إجراءات المنتج"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem disabled={updateCatalog.isPending} onClick={() => toggleVisibility(item.id, item.showOnDistributors)}>{item.showOnDistributors ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}{item.showOnDistributors ? 'إخفاء' : 'إظهار'}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => startEditing(item)}><Pencil className="h-4 w-4 mr-2" />تعديل</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            
            {filteredCatalog?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  {searchQuery ? 'لا توجد نتائج بحث تطابق مدخلاتك.' : 'لا توجد منتجات حالياً.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
