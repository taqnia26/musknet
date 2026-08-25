import { useState } from 'react';
import { useAdminListProducts, useAdminCreateProduct, useAdminUpdateProduct, useAdminDisableProduct, useGetAdminMe } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useQueryClient } from '@tanstack/react-query';
import { getAdminListProductsQueryKey } from '@workspace/api-client-react';

const productSchema = z.object({
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  slug: z.string().min(1),
  price: z.coerce.number().min(0),
  categoryId: z.coerce.number().min(1),
  stockQuantity: z.coerce.number().min(0),
  isActive: z.boolean().default(true),
});

export default function AdminProducts() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { data: currentUser } = useGetAdminMe();
  const { data: products, isLoading } = useAdminListProducts({ search });

  const createMutation = useAdminCreateProduct();
  const updateMutation = useAdminUpdateProduct();
  const disableMutation = useAdminDisableProduct();

  const handleDisable = (id: number) => {
    if (confirm(t('هل أنت متأكد من تعطيل/حذف هذا المنتج؟', 'Are you sure you want to disable/delete this product?'))) {
      disableMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
        }
      });
    }
  };

  const form = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      nameAr: '', nameEn: '', slug: '', price: 0, categoryId: 1, stockQuantity: 0, isActive: true
    }
  });

  const onSubmit = (data: z.infer<typeof productSchema>) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
          setIsDialogOpen(false);
          setEditingId(null);
          form.reset();
        }
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
          setIsDialogOpen(false);
          form.reset();
        }
      });
    }
  };

  const handleEdit = (product: any) => {
    setEditingId(product.id);
    form.reset({
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      slug: product.slug,
      price: product.price,
      categoryId: product.categoryId,
      stockQuantity: product.stockQuantity,
      isActive: product.isActive
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('المنتجات', 'Products')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة المنتجات والمخزون', 'Manage products and inventory')}</p>
        </div>
        {hasPermission(currentUser, 'products', 'edit') && (
          <Dialog open={isDialogOpen} onOpenChange={(v) => { setIsDialogOpen(v); if (!v) { setEditingId(null); form.reset(); } }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-product">
                <Plus className="h-4 w-4 ms-2 rtl:ms-0 rtl:me-2" />
                {t('إضافة منتج', 'Add Product')}
              </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? t('تعديل منتج', 'Edit Product') : t('إضافة منتج', 'Add Product')}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="nameAr" render={({ field }) => (
                    <FormItem><FormLabel>{t('الاسم بالعربية', 'Name (AR)')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="nameEn" render={({ field }) => (
                    <FormItem><FormLabel>{t('الاسم بالإنجليزية', 'Name (EN)')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="slug" render={({ field }) => (
                  <FormItem><FormLabel>{t('الرابط (Slug)', 'Slug')}</FormLabel><FormControl><Input {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="price" render={({ field }) => (
                    <FormItem><FormLabel>{t('السعر', 'Price')}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="stockQuantity" render={({ field }) => (
                    <FormItem><FormLabel>{t('الكمية', 'Stock Quantity')}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="categoryId" render={({ field }) => (
                  <FormItem><FormLabel>{t('معرف القسم', 'Category ID')}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {t('حفظ', 'Save')}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input 
            placeholder={t('البحث عن منتج...', 'Search products...')} 
            className="pl-9 rtl:pr-9 rtl:pl-3" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('الاسم', 'Name')}</TableHead>
              <TableHead>{t('السعر', 'Price')}</TableHead>
              <TableHead>{t('المخزون', 'Stock')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : products?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t('لا توجد منتجات', 'No products found')}</TableCell></TableRow>
            ) : (
              products?.map((product) => (
                <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                  <TableCell className="font-medium">{lang === 'ar' ? product.nameAr : product.nameEn}</TableCell>
                  <TableCell>{product.price} SAR</TableCell>
                  <TableCell>{product.stockQuantity}</TableCell>
                  <TableCell>
                    <Badge variant={product.isActive ? "default" : "secondary"}>
                      {product.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {hasPermission(currentUser, 'products', 'edit') && (
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(product)} data-testid={`btn-edit-${product.id}`}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      {hasPermission(currentUser, 'products', 'delete') && product.isActive && (
                        <Button variant="ghost" size="icon" onClick={() => handleDisable(product.id)} data-testid={`btn-disable-${product.id}`} className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
