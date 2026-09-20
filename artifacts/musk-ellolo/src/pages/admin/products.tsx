import { useMemo, useRef, useState } from 'react';
import {
  type AdminProduct,
  type AdminProductImage,
  getAdminListProductsQueryKey,
  useAdminCreateProduct,
  useAdminDisableProduct,
  useAdminListCategories,
  useAdminListProducts,
  useAdminRequestProductImageUpload,
  useAdminUpdateProduct,
  useGetAdminMe,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  AlertCircle,
  Edit2,
  ImageIcon,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MAX_IMAGES = 6;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

const productSchema = z.object({
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  slug: z.string().min(1),
  price: z.coerce.number().min(0),
  categoryId: z.coerce.number().min(1),
  stockQuantity: z.coerce.number().int().min(0),
  reorderPoint: z.coerce.number().int().min(0),
  targetStockQuantity: z.coerce.number().int().min(0),
  isActive: z.boolean().default(true),
});

type ProductFormValues = z.infer<typeof productSchema>;

const emptyProduct = {
  nameAr: '',
  nameEn: '',
  slug: '',
  price: 0,
  categoryId: 0,
  stockQuantity: 0,
  reorderPoint: 5,
  targetStockQuantity: 20,
  isActive: true,
};

export default function AdminProducts() {
  const { t, lang } = useLanguage();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [productImages, setProductImages] = useState<AdminProductImage[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: currentUser } = useGetAdminMe();
  const { data: products, isLoading } = useAdminListProducts({ search });
  const { data: categories, isLoading: categoriesLoading } = useAdminListCategories({ status: 'active' });
  const activeCategories = categories ?? [];
  const categoryById = useMemo(
    () => new Map(activeCategories.map((category) => [category.id, category])),
    [activeCategories],
  );

  const createMutation = useAdminCreateProduct();
  const updateMutation = useAdminUpdateProduct();
  const disableMutation = useAdminDisableProduct();
  const uploadMutation = useAdminRequestProductImageUpload();

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: emptyProduct,
  });

  const resetDialog = () => {
    setEditingId(null);
    setProductImages([]);
    setUploadError(null);
    form.reset({
      ...emptyProduct,
      categoryId: activeCategories[0]?.id ?? 0,
    });
  };

  const openCreateDialog = () => {
    resetDialog();
    setIsDialogOpen(true);
  };

  const onSubmit = (data: ProductFormValues) => {
    const request = { ...data, images: productImages };
    const options = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
        setIsDialogOpen(false);
        resetDialog();
      },
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: request }, options);
    } else {
      createMutation.mutate({ data: request }, options);
    }
  };

  const handleEdit = (product: AdminProduct) => {
    setEditingId(product.id);
    setProductImages(product.images);
    setUploadError(null);
    form.reset({
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      slug: product.slug,
      price: product.price,
      categoryId: product.categoryId,
      stockQuantity: product.stockQuantity,
      reorderPoint: product.reorderPoint,
      targetStockQuantity: product.targetStockQuantity,
      isActive: product.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleDisable = (id: number) => {
    if (!confirm(t('هل أنت متأكد من تعطيل هذا المنتج؟', 'Are you sure you want to disable this product?'))) return;
    disableMutation.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() }),
    });
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadError(null);
    const selectedFiles = Array.from(files);

    if (productImages.length + selectedFiles.length > MAX_IMAGES) {
      setUploadError(t(`يمكن رفع ${MAX_IMAGES} صور كحد أقصى`, `You can upload up to ${MAX_IMAGES} images`));
      return;
    }

    try {
      for (const file of selectedFiles) {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
          throw new Error(t('صيغة الصورة غير مدعومة', 'Unsupported image format'));
        }
        if (file.size > MAX_IMAGE_SIZE) {
          throw new Error(t('يجب ألا يتجاوز حجم الصورة 8 MB', 'Each image must be 8 MB or smaller'));
        }

        const upload = await uploadMutation.mutateAsync({
          data: { name: file.name, size: file.size, contentType: file.type as 'image/jpeg' },
        });
        const response = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!response.ok) throw new Error(t('تعذر رفع الصورة', 'Unable to upload image'));

        setProductImages((current) => [
          ...current,
          {
            url: upload.imageUrl,
            alt: form.getValues('nameAr') || form.getValues('nameEn') || file.name,
          },
        ]);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t('تعذر رفع الصور', 'Unable to upload images'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('المنتجات', 'Products')}</h1>
          <p className="mt-1 text-muted-foreground">{t('إدارة المنتجات والمخزون والصور', 'Manage products, inventory, and images')}</p>
        </div>
        {hasPermission(currentUser, 'products', 'edit') && (
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetDialog();
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} data-testid="button-create-product">
                <Plus className="me-2 h-4 w-4" />
                {t('إضافة منتج', 'Add Product')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? t('تعديل المنتج', 'Edit Product') : t('إضافة منتج جديد', 'Add New Product')}</DialogTitle>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <section className="rounded-xl border bg-card/50 p-4">
                    <div className="mb-4">
                      <h3 className="font-semibold">{t('صور المنتج', 'Product Images')}</h3>
                      <p className="text-xs text-muted-foreground">
                        {t('الصورة الأولى ستكون الصورة الرئيسية للمنتج', 'The first image will be the main product image')}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                      {productImages.map((image, index) => (
                        <div key={`${image.url}-${index}`} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
                          <img src={image.url} alt={image.alt} className="h-full w-full object-cover" />
                          {index === 0 && (
                            <span className="absolute bottom-1 start-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
                              {t('رئيسية', 'Main')}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setProductImages((images) => images.filter((_, imageIndex) => imageIndex !== index))}
                            className="absolute end-1 top-1 rounded-full bg-background/90 p-1 text-destructive opacity-100 shadow-sm sm:opacity-0 sm:group-hover:opacity-100"
                            aria-label={t('حذف الصورة', 'Remove image')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {productImages.length < MAX_IMAGES && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadMutation.isPending}
                          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 text-primary transition hover:bg-primary/10 disabled:opacity-50"
                        >
                          {uploadMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                          <span className="text-[11px] font-medium">{t('رفع صور', 'Upload')}</span>
                        </button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_IMAGE_TYPES.join(',')}
                      multiple
                      className="sr-only"
                      onChange={(event) => void handleImageUpload(event.target.files)}
                    />
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t('PNG أو JPG أو WebP، حتى 8 MB للصورة، وبحد أقصى 6 صور', 'PNG, JPG, or WebP, up to 8 MB each, maximum 6 images')}
                    </p>
                    {uploadError && (
                      <div className="mt-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {uploadError}
                      </div>
                    )}
                  </section>

                  <section className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={form.control} name="nameAr" render={({ field }) => (
                        <FormItem><FormLabel>{t('الاسم بالعربية', 'Name (AR)')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="nameEn" render={({ field }) => (
                        <FormItem><FormLabel>{t('الاسم بالإنجليزية', 'Name (EN)')}</FormLabel><FormControl><Input {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>

                    <FormField control={form.control} name="slug" render={({ field }) => (
                      <FormItem><FormLabel>{t('رابط المنتج', 'Product Slug')}</FormLabel><FormControl><Input {...field} dir="ltr" placeholder="product-name" /></FormControl><FormMessage /></FormItem>
                    )} />

                    <div className="grid gap-4 sm:grid-cols-3">
                      <FormField control={form.control} name="categoryId" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('القسم', 'Category')}</FormLabel>
                          <Select value={field.value ? String(field.value) : ''} onValueChange={(value) => field.onChange(Number(value))}>
                            <FormControl>
                              <SelectTrigger disabled={categoriesLoading || activeCategories.length === 0}>
                                <SelectValue placeholder={t('اختر القسم', 'Select category')} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {activeCategories.map((category) => (
                                <SelectItem key={category.id} value={String(category.id)}>
                                  {lang === 'ar' ? category.nameAr : category.nameEn}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="price" render={({ field }) => (
                        <FormItem><FormLabel>{t('السعر', 'Price')}</FormLabel><FormControl><Input type="number" min="0" step="0.01" inputMode="decimal" {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                      {!editingId && <FormField control={form.control} name="stockQuantity" render={({ field }) => (
                        <FormItem><FormLabel>{t('الكمية الافتتاحية', 'Opening stock')}</FormLabel><FormControl><Input type="number" min="0" step="1" inputMode="numeric" {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={form.control} name="reorderPoint" render={({ field }) => (
                        <FormItem><FormLabel>{t('حد إعادة الطلب', 'Reorder point')}</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="targetStockQuantity" render={({ field }) => (
                        <FormItem><FormLabel>{t('الكمية المستهدفة', 'Target stock')}</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </section>

                  {activeCategories.length === 0 && !categoriesLoading && (
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                      {t('أضف قسماً نشطاً أولاً قبل إنشاء المنتج.', 'Add an active category before creating a product.')}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={isSaving || uploadMutation.isPending || activeCategories.length === 0}>
                    {isSaving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {editingId ? t('حفظ التعديلات', 'Save Changes') : t('إضافة المنتج', 'Create Product')}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('البحث عن منتج...', 'Search products...')}
          className="ps-10"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>{t('المنتج', 'Product')}</TableHead>
              <TableHead>{t('القسم', 'Category')}</TableHead>
              <TableHead>{t('السعر', 'Price')}</TableHead>
              <TableHead>{t('المخزون', 'Stock')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : products?.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">{t('لا توجد منتجات', 'No products found')}</TableCell></TableRow>
            ) : (
              products?.map((product) => {
                const image = product.images[0];
                const category = categoryById.get(product.categoryId);
                return (
                  <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                    <TableCell>
                      <div className="flex min-w-[180px] items-center gap-3">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
                          {image ? (
                            <img src={image.url} alt={image.alt || product.nameAr} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ImageIcon className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold">{lang === 'ar' ? product.nameAr : product.nameEn}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{product.slug}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{category ? (lang === 'ar' ? category.nameAr : category.nameEn) : '—'}</TableCell>
                    <TableCell><span dir="ltr">{product.price.toLocaleString('en-US')} SAR</span></TableCell>
                    <TableCell><span dir="ltr">{product.stockQuantity.toLocaleString('en-US')}</span></TableCell>
                    <TableCell>
                      <Badge variant={product.isActive ? 'default' : 'secondary'} className={product.isActive ? 'bg-success text-success-foreground hover:bg-success/90' : ''}>
                        {product.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {hasPermission(currentUser, 'products', 'edit') && (
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(product)} aria-label={t('تعديل المنتج', 'Edit product')}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                        {hasPermission(currentUser, 'products', 'delete') && product.isActive && (
                          <Button variant="ghost" size="icon" onClick={() => handleDisable(product.id)} className="text-destructive" aria-label={t('تعطيل المنتج', 'Disable product')}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}