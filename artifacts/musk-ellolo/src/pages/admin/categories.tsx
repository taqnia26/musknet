import { useState } from 'react';
import { useAdminListCategories, useAdminCreateCategory, useAdminUpdateCategory, useAdminDisableCategory, useGetAdminMe } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Edit2, Trash2, MoreHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useQueryClient } from '@tanstack/react-query';
import { getAdminListCategoriesQueryKey, getListCategoriesQueryKey } from '@workspace/api-client-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const categorySchema = z.object({
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  slug: z.string().min(1),
  isActive: z.boolean().default(true),
});

export default function AdminCategories() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { data: currentUser } = useGetAdminMe();
  const { data: categories, isLoading } = useAdminListCategories({ search });

  const createMutation = useAdminCreateCategory();
  const updateMutation = useAdminUpdateCategory();
  const disableMutation = useAdminDisableCategory();

  const handleDisable = (id: number) => {
    if (confirm(t('هل أنت متأكد من تعطيل/حذف هذا القسم؟', 'Are you sure you want to disable/delete this category?'))) {
      disableMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListCategoriesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        }
      });
    }
  };

  const form = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    defaultValues: { nameAr: '', nameEn: '', slug: '', isActive: true }
  });

  const onSubmit = (data: z.infer<typeof categorySchema>) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListCategoriesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setIsDialogOpen(false);
          setEditingId(null);
          form.reset();
        }
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListCategoriesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          setIsDialogOpen(false);
          form.reset();
        }
      });
    }
  };

  const handleEdit = (category: any) => {
    setEditingId(category.id);
    form.reset({
      nameAr: category.nameAr,
      nameEn: category.nameEn,
      slug: category.slug,
      isActive: category.isActive
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('الأقسام', 'Categories')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة أقسام المتجر', 'Manage store categories')}</p>
        </div>
        {hasPermission(currentUser, 'categories', 'edit') && (
          <Dialog open={isDialogOpen} onOpenChange={(v) => { setIsDialogOpen(v); if (!v) { setEditingId(null); form.reset(); } }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-category">
                <Plus className="h-4 w-4 ms-2 rtl:ms-0 rtl:me-2" />
                {t('إضافة قسم', 'Add Category')}
              </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? t('تعديل قسم', 'Edit Category') : t('إضافة قسم', 'Add Category')}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="nameAr" render={({ field }) => (
                  <FormItem><FormLabel>{t('الاسم بالعربية', 'Name (AR)')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="nameEn" render={({ field }) => (
                  <FormItem><FormLabel>{t('الاسم بالإنجليزية', 'Name (EN)')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="slug" render={({ field }) => (
                  <FormItem><FormLabel>{t('الرابط (Slug)', 'Slug')}</FormLabel><FormControl><Input {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
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
            placeholder={t('البحث عن قسم...', 'Search categories...')} 
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
              <TableHead>{t('الرابط', 'Slug')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : categories?.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">{t('لا توجد أقسام', 'No categories found')}</TableCell></TableRow>
            ) : (
              categories?.map((category) => (
                <TableRow key={category.id} data-testid={`row-category-${category.id}`}>
                  <TableCell className="font-medium">{lang === 'ar' ? category.nameAr : category.nameEn}</TableCell>
                  <TableCell>{category.slug}</TableCell>
                  <TableCell>
                    <Badge variant={category.isActive ? "default" : "secondary"} className={category.isActive ? "bg-success text-success-foreground hover:bg-success/90" : "bg-muted text-muted-foreground"}>
                      {category.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                      {hasPermission(currentUser, 'categories', 'edit') && (
                        <DropdownMenuItem onClick={() => handleEdit(category)} disabled={updateMutation.isPending}><Edit2 className="h-4 w-4" />{t('تعديل', 'Edit')}</DropdownMenuItem>
                      )}
                      {hasPermission(currentUser, 'categories', 'delete') && category.isActive && (
                        <DropdownMenuItem onClick={() => handleDisable(category.id)} disabled={disableMutation.isPending} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" />{t('تعطيل', 'Disable')}</DropdownMenuItem>
                      )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
