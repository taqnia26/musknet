import { useMemo, useRef, useState, useEffect } from 'react';
import {
  type AdminProduct,
  type AdminProductImage,
  type AdminCategory,
  type AdminUser,
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
import { useForm, useWatch } from 'react-hook-form';
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
  MoreHorizontal,
  Upload,
  X,
  Settings2,
  Check,
   Eye,
   EyeOff,
} from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { sortProductsForSelection } from '@/lib/product-sort';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const MAX_IMAGES = 6;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

const stringToNull = (val: string | undefined | null) => (val === '' ? null : val || null);

const productSchema = z.object({
  nameAr: z.string().min(1, 'Required / مطلوب'),
  nameEn: z.string().min(1, 'Required / مطلوب'),
  descriptionAr: z.string().optional(),
  descriptionEn: z.string().optional(),
  slug: z.string().min(1, 'Required / مطلوب'),
  price: z.coerce.number().min(0),
  compareAtPrice: z.union([z.literal('').transform(() => null), z.coerce.number().min(0), z.null()]).optional(),
  discountPrice: z.union([z.literal('').transform(() => null), z.coerce.number().min(0), z.null()]).optional(),
  discountEndsOn: z.string().nullable().optional(),
  weightKg: z.coerce.number().min(0).default(0),
  costPrice: z.coerce.number().min(0).default(0),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  mpn: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  subtitleAr: z.string().max(35, 'Max 35 chars').nullable().optional(),
  promotionalTitleAr: z.string().max(25, 'Max 25 chars').nullable().optional(),
  maxPerCustomer: z.union([z.literal('').transform(() => null), z.coerce.number().int().min(1), z.null()]).optional(),
  requiresShipping: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sellable: z.boolean().default(true),
  showOnDistributors: z.boolean().default(true),
  allowOrderAttachment: z.boolean().default(false),
  allowCustomerNote: z.boolean().default(false),
  taxable: z.boolean().default(true),
  registrationNumber: z.string().nullable().optional(),
  tagsString: z.string().default(''),
  seoTitleAr: z.string().nullable().optional(),
  seoDescriptionAr: z.string().nullable().optional(),
  categoryId: z.coerce.number().min(1, 'Required / مطلوب'),
  stockQuantity: z.coerce.number().int().min(0).default(0),
  reorderPoint: z.coerce.number().int().min(0).default(5),
  targetStockQuantity: z.coerce.number().int().min(0).default(20),
});

type ProductFormValues = z.infer<typeof productSchema>;

const emptyProduct: ProductFormValues = {
  nameAr: '',
  nameEn: '',
  descriptionAr: '',
  descriptionEn: '',
  slug: '',
  price: 0,
  compareAtPrice: null,
  discountPrice: null,
  discountEndsOn: '',
  weightKg: 0,
  costPrice: 0,
  sku: '',
  barcode: '',
  mpn: '',
  brand: '',
  subtitleAr: '',
  promotionalTitleAr: '',
  maxPerCustomer: null,
  requiresShipping: true,
  isActive: true,
  sellable: true,
  showOnDistributors: true,
  allowOrderAttachment: false,
  allowCustomerNote: false,
  taxable: true,
  registrationNumber: '',
  tagsString: '',
  seoTitleAr: '',
  seoDescriptionAr: '',
  categoryId: 0,
  stockQuantity: 0,
  reorderPoint: 5,
  targetStockQuantity: 20,
};

function ProductRow({
  product,
  categories,
  lang,
  t,
  currentUser,
  onEdit,
}: {
  product: AdminProduct;
  categories: AdminCategory[];
  lang: string;
  t: (ar: string, en: string) => string;
  currentUser: AdminUser | null | undefined;
  onEdit: (product: AdminProduct) => void;
}) {
  const queryClient = useQueryClient();
  const updateMutation = useAdminUpdateProduct();
  const visibilityMutation = useAdminUpdateProduct();
  const disableMutation = useAdminDisableProduct();
  
  const [draftPrice, setDraftPrice] = useState(product.price.toString());
  const [draftCategory, setDraftCategory] = useState(String(product.categoryId));
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasChanges = draftPrice !== product.price.toString() || draftCategory !== String(product.categoryId);
  const canEdit = hasPermission(currentUser, 'products', 'edit');
  const isVisible = product.isActive && product.sellable;
  const isBusy = isSaving || visibilityMutation.isPending;

  useEffect(() => {
    setDraftPrice(String(product.price));
    setDraftCategory(String(product.categoryId));
  }, [product.price, product.categoryId]);

  const handleSave = () => {
    if (!canEdit || !hasChanges) return;
    const price = Number(draftPrice);
    const categoryId = Number(draftCategory);
    if (!draftPrice.trim() || !Number.isFinite(price) || price < 0 || !categories.some((category) => category.id === categoryId)) {
      setErrorMsg(t('تأكد من السعر والقسم قبل الحفظ', 'Enter a valid price and category'));
      return;
    }
    setIsSaving(true);
    setErrorMsg(null);
    updateMutation.mutate(
      {
        id: product.id,
        data: {
           price,
           categoryId,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
          setIsSaving(false);
        },
         onError: (err) => {
          setIsSaving(false);
           setErrorMsg(err instanceof Error ? err.message : t('حدث خطأ أثناء الحفظ', 'Error saving changes'));
        },
      }
    );
  };

  const handleDisable = () => {
    if (!confirm(t('هل أنت متأكد من تعطيل هذا المنتج؟', 'Are you sure you want to disable this product?'))) return;
    disableMutation.mutate({ id: product.id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() }),
    });
  };

  const handleToggleVisibility = () => {
    setErrorMsg(null);
    visibilityMutation.mutate({
      id: product.id,
      data: isVisible ? { sellable: false } : { isActive: true, sellable: true },
    }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() }),
      onError: (err) => setErrorMsg(err instanceof Error ? err.message : t('تعذر تحديث ظهور المنتج', 'Could not update product visibility')),
    });
  };

  const image = product.images?.[0];

  return (
    <div data-testid={`card-product-${product.id}`} className="group bg-card border rounded-lg hover:border-primary/30 transition-colors shadow-sm flex flex-col p-3 gap-3 relative">
      {errorMsg && (
        <div role="alert" className="border border-destructive/30 rounded bg-destructive/10 text-destructive text-xs p-2">
          {errorMsg}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="shrink-0 h-14 w-14 bg-muted overflow-hidden border rounded-md">
          {image ? (
            <img src={image.url} alt={image.alt || product.nameAr} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground bg-muted/50">
              <ImageIcon className="h-5 w-5 opacity-50" />
            </div>
          )}
        </div>

        <div className="flex flex-col flex-1 min-w-0 justify-center">
          <div className="flex flex-col">
            <h4 className="font-semibold text-sm text-foreground truncate">{lang === 'ar' ? product.nameAr : product.nameEn}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className={cn("font-normal text-[10px] h-4 px-1 rounded-sm border-transparent", product.isActive ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" : "bg-muted text-muted-foreground")}>
                {product.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
              </Badge>
              <Badge variant="outline" className={cn("font-normal text-[10px] h-4 px-1 rounded-sm border-transparent", product.sellable ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10" : "bg-muted text-muted-foreground")}>
                {isVisible ? t('معروض', 'Visible') : t('مخفي', 'Hidden')}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 bg-muted/20 p-2 rounded-md border">
        {/* Inline Edits */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 min-w-[120px]">
            <span className="text-xs text-muted-foreground shrink-0">{t('السعر', 'Price')}</span>
            <Input 
              data-testid={`input-product-price-${product.id}`}
              className="h-8 text-sm px-2 bg-background font-medium focus-visible:ring-1" 
              dir="ltr"
              type="number"
              min="0"
              step="0.01"
              value={draftPrice}
              onChange={(e) => { setDraftPrice(e.target.value); setErrorMsg(null); }}
               disabled={!canEdit || isBusy}
            />
          </div>
          <div className="flex items-center gap-1.5 min-w-[140px] flex-1">
            <span className="text-xs text-muted-foreground shrink-0">{t('القسم', 'Category')}</span>
             <Select value={draftCategory} onValueChange={(value) => { setDraftCategory(value); setErrorMsg(null); }} disabled={!canEdit || isBusy}>
              <SelectTrigger data-testid={`select-product-category-${product.id}`} className="h-8 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                 {categories.filter((c) => c.isActive || c.id === product.categoryId).map((c) => (
                   <SelectItem key={c.id} value={String(c.id)}>
                     {lang === 'ar' ? c.nameAr : c.nameEn}{!c.isActive && ` (${t('غير نشط', 'Inactive')})`}
                   </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm whitespace-nowrap px-2">
           <div className="flex flex-col text-xs items-center justify-center bg-muted/40 px-3 py-1 rounded border">
             <span className="text-muted-foreground text-[10px] uppercase">{t('المخزون', 'Stock')}</span>
             <span className="font-semibold" dir="ltr">{product.stockQuantity.toLocaleString('en-US')}</span>
           </div>
           {product.sku && <div className="text-xs text-muted-foreground hidden lg:block" dir="ltr">{product.sku}</div>}
        </div>

        <div className="flex items-center gap-2 ms-auto shrink-0">
          <Button 
            variant="outline" 
            size="sm" 
            className="hidden sm:flex h-8 gap-1.5 text-xs text-muted-foreground"
            onClick={() => onEdit(product)}
             disabled={isBusy}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t('بيانات المنتج', 'Details')}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label={t('إجراءات المنتج', 'Product actions')} data-testid={`button-product-actions-${product.id}`} disabled={isBusy}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {canEdit && (
                <DropdownMenuItem onClick={() => onEdit(product)} className="gap-2 text-sm">
                  <Edit2 className="h-4 w-4" />{t('تعديل كامل', 'Full Edit')}
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem onClick={handleToggleVisibility} className="gap-2 text-sm" data-testid={`menu-product-visibility-${product.id}`}>
                  {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {isVisible ? t('إخفاء المنتج', 'Hide product') : t('عرض المنتج', 'Show product')}
                </DropdownMenuItem>
              )}
              {hasPermission(currentUser, 'products', 'delete') && product.isActive && (
                <DropdownMenuItem onClick={handleDisable} className="gap-2 text-sm text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4" />{t('تعطيل', 'Disable')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {canEdit && (
            <Button 
              size="sm" 
              className={cn("h-8 px-4 transition-all", hasChanges ? "bg-[#35c3a4] hover:bg-[#2da389] text-white" : "bg-muted text-muted-foreground opacity-50")}
               disabled={!hasChanges || isBusy}
              onClick={handleSave}
               data-testid={`button-save-product-${product.id}`}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 me-1" />}
              {t('حفظ', 'Save')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


export default function AdminProducts() {
  const { t, lang } = useLanguage();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Real filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [originalNames, setOriginalNames] = useState<{ ar: string; en: string } | null>(null);
  const [productImages, setProductImages] = useState<AdminProductImage[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: currentUser } = useGetAdminMe();
  const { data: allProducts, isLoading } = useAdminListProducts({ search });
   const { data: categories, isLoading: categoriesLoading } = useAdminListCategories({});
  
   const activeCategories = (categories ?? []).filter((category) => category.isActive);
  
  // Apply local filters since the list hook might not support status/categoryId yet
  const products = useMemo(() => {
    if (!allProducts) return [];
    return sortProductsForSelection(allProducts.filter(p => {
      if (statusFilter === 'active' && !p.isActive) return false;
      if (statusFilter === 'inactive' && p.isActive) return false;
       if (statusFilter === 'sellable' && (!p.sellable || !p.isActive)) return false;
      if (categoryFilter !== 'all' && p.categoryId.toString() !== categoryFilter) return false;
      return true;
    }), lang);
  }, [allProducts, statusFilter, categoryFilter, lang]);

  const createMutation = useAdminCreateProduct();
  const updateMutation = useAdminUpdateProduct();
  const uploadMutation = useAdminRequestProductImageUpload();

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: emptyProduct,
  });
  const [nameAr, nameEn] = useWatch({ control: form.control, name: ['nameAr', 'nameEn'] });
  const editingName = lang === 'ar'
    ? nameAr?.trim() || originalNames?.ar
    : nameEn?.trim() || originalNames?.en;

  const resetDialog = () => {
    setEditingId(null);
    setOriginalNames(null);
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
    const tags = data.tagsString.split(',').map((tag) => tag.trim()).filter(Boolean);
    
    const processedData = {
      ...data,
      compareAtPrice: data.compareAtPrice ?? null,
      discountPrice: data.discountPrice ?? null,
      discountEndsOn: stringToNull(data.discountEndsOn),
      sku: stringToNull(data.sku),
      barcode: stringToNull(data.barcode),
      mpn: stringToNull(data.mpn),
      brand: stringToNull(data.brand),
      subtitleAr: stringToNull(data.subtitleAr),
      promotionalTitleAr: stringToNull(data.promotionalTitleAr),
      maxPerCustomer: data.maxPerCustomer ?? null,
      registrationNumber: stringToNull(data.registrationNumber),
      seoTitleAr: stringToNull(data.seoTitleAr),
      seoDescriptionAr: stringToNull(data.seoDescriptionAr),
      descriptionAr: data.descriptionAr || '',
      descriptionEn: data.descriptionEn || '',
      tags,
    };
    
    const { tagsString, ...apiData } = processedData;

    const request = { ...apiData, images: productImages };
    const options = {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
        setIsDialogOpen(false);
        resetDialog();
      },
      onError: (err: unknown) => {
        setUploadError(err instanceof Error ? err.message : t('حدث خطأ أثناء الحفظ', 'Error saving product'));
      }
    };

    if (editingId) {
      const { stockQuantity: openingStock, ...updates } = request;
      void openingStock;
      updateMutation.mutate({ id: editingId, data: updates }, options);
    } else {
      createMutation.mutate({ data: request }, options);
    }
  };

  const handleEdit = (product: AdminProduct) => {
    setEditingId(product.id);
    setOriginalNames({ ar: product.nameAr, en: product.nameEn });
    setProductImages(product.images || []);
    setUploadError(null);
    form.reset({
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      descriptionAr: product.descriptionAr || '',
      descriptionEn: product.descriptionEn || '',
      slug: product.slug,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      discountPrice: product.discountPrice,
      discountEndsOn: product.discountEndsOn || '',
      weightKg: product.weightKg || 0,
      costPrice: product.costPrice || 0,
      sku: product.sku || '',
      barcode: product.barcode || '',
      mpn: product.mpn || '',
      brand: product.brand || '',
      subtitleAr: product.subtitleAr || '',
      promotionalTitleAr: product.promotionalTitleAr || '',
      maxPerCustomer: product.maxPerCustomer,
      requiresShipping: product.requiresShipping ?? true,
      isActive: product.isActive ?? true,
      sellable: product.sellable ?? true,
      showOnDistributors: product.showOnDistributors ?? true,
      allowOrderAttachment: product.allowOrderAttachment ?? false,
      allowCustomerNote: product.allowCustomerNote ?? false,
      taxable: product.taxable,
      registrationNumber: product.registrationNumber || '',
      tagsString: product.tags.join(', '),
      seoTitleAr: product.seoTitleAr || '',
      seoDescriptionAr: product.seoDescriptionAr || '',
      categoryId: product.categoryId,
      stockQuantity: product.stockQuantity,
      reorderPoint: product.reorderPoint,
      targetStockQuantity: product.targetStockQuantity,
    });
    setIsDialogOpen(true);
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
    <div className="space-y-4 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-3 rounded-lg border shadow-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('ابحث باسم المنتج ، اسم التصنيف ، وصف المنتج أو الـSKU', 'Search by name, category, description or SKU')}
              className="ps-10 h-9 bg-muted/50 border-none focus-visible:ring-1 focus-visible:bg-background transition-colors"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-[140px] bg-muted/50 border-none">
              <SelectValue placeholder={t('كل الأقسام', 'All Categories')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('كل الأقسام', 'All Categories')}</SelectItem>
              {activeCategories.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{lang === 'ar' ? c.nameAr : c.nameEn}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[130px] bg-muted/50 border-none">
              <SelectValue placeholder={t('كل الحالات', 'All Status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('الكل', 'All')}</SelectItem>
              <SelectItem value="active">{t('نشط', 'Active')}</SelectItem>
              <SelectItem value="inactive">{t('غير نشط', 'Inactive')}</SelectItem>
              <SelectItem value="sellable">{t('معروض للبيع', 'Sellable')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetDialog(); }}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} disabled={!hasPermission(currentUser, 'products', 'edit')} className="h-9 bg-[#35c3a4] hover:bg-[#2da389] text-white gap-2 px-4 shadow-sm" data-testid="button-create-product">
                <Plus className="h-4 w-4" />
                {t('إضافة منتج جديد', 'Add New Product')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto p-0">
              <DialogHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10">
                <DialogTitle className="px-0">{editingId !== null ? t('تعديل المنتج', 'Edit Product') : t('إضافة منتج جديد', 'Add New Product')}</DialogTitle>
                {editingId !== null && editingName && (
                  <p
                    data-testid="editing-product-name"
                    dir={lang === 'ar' ? 'rtl' : 'ltr'}
                    className="text-sm font-medium text-muted-foreground break-words [overflow-wrap:anywhere]"
                  >
                    {editingName}
                  </p>
                )}
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 py-6 space-y-8">
                  {uploadError && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      <AlertCircle className="h-5 w-5 shrink-0" />
                      {uploadError}
                    </div>
                  )}
                  
                  <section className="space-y-4">
                    <div className="mb-2 border-b pb-2">
                      <h3 className="text-lg font-semibold">{t('صور المنتج', 'Product Images')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t('الصورة الأولى ستكون الصورة الرئيسية للمنتج', 'The first image will be the main product image')}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                      {productImages.map((image, index) => (
                        <div key={`${image.url}-${index}`} className="group relative aspect-square overflow-hidden rounded-xl border bg-muted shadow-sm">
                          <img src={image.url} alt={image.alt} className="h-full w-full object-cover" />
                          {index === 0 && (
                            <span className="absolute bottom-1 start-1 rounded bg-black/70 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                              {t('رئيسية', 'Main')}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setProductImages((images) => images.filter((_, imageIndex) => imageIndex !== index))}
                            className="absolute end-1 top-1 rounded-full bg-destructive/90 p-1.5 text-white opacity-100 shadow-sm sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
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
                          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/10 text-muted-foreground transition hover:bg-muted/30 hover:border-muted-foreground/50 hover:text-foreground disabled:opacity-50"
                        >
                          {uploadMutation.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                          <span className="text-xs font-medium">{t('رفع صور', 'Upload')}</span>
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
                  </section>

                  <section className="space-y-4">
                    <div className="mb-2 border-b pb-2"><h3 className="text-lg font-semibold">{t('بيانات المنتج الأساسية', 'Basic Information')}</h3></div>
                    
                    <div className="grid gap-5 sm:grid-cols-2">
                      <FormField control={form.control} name="nameAr" render={({ field }) => (
                        <FormItem><FormLabel>{t('الاسم بالعربية', 'Name (AR)')} *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="nameEn" render={({ field }) => (
                        <FormItem><FormLabel>{t('الاسم بالإنجليزية', 'Name (EN)')} *</FormLabel><FormControl><Input {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <FormField control={form.control} name="categoryId" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('القسم', 'Category')} *</FormLabel>
                          <Select value={field.value ? String(field.value) : ''} onValueChange={(value) => field.onChange(Number(value))}>
                            <FormControl>
                               <SelectTrigger disabled={categoriesLoading || (!editingId && activeCategories.length === 0)}>
                                <SelectValue placeholder={t('اختر القسم', 'Select category')} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(editingId ? categories ?? [] : activeCategories).map((category) => (
                                <SelectItem key={category.id} value={String(category.id)}>
                                  {lang === 'ar' ? category.nameAr : category.nameEn}{!category.isActive && ` (${t('غير نشط', 'Inactive')})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="slug" render={({ field }) => (
                        <FormItem><FormLabel>{t('رابط المنتج (Slug)', 'Product URL Slug')} *</FormLabel><FormControl><Input {...field} dir="ltr" placeholder="product-name" /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>

                     <div className="space-y-5">
                      <FormField control={form.control} name="descriptionAr" render={({ field }) => (
                         <FormItem><FormLabel>{t('الوصف بالعربية', 'Description (AR)')}</FormLabel><FormControl><Textarea className="min-h-[200px] resize-y" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="descriptionEn" render={({ field }) => (
                         <FormItem><FormLabel>{t('الوصف بالإنجليزية', 'Description (EN)')}</FormLabel><FormControl><Textarea className="min-h-[200px] resize-y" dir="ltr" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="mb-2 border-b pb-2"><h3 className="text-lg font-semibold">{t('التسعير والتكلفة', 'Pricing & Costs')}</h3></div>
                    
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                      <FormField control={form.control} name="price" render={({ field }) => (
                        <FormItem><FormLabel>{t('السعر', 'Price')} *</FormLabel><FormControl><Input type="number" min="0" step="0.01" inputMode="decimal" {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="compareAtPrice" render={({ field }) => (
                        <FormItem><FormLabel>{t('السعر قبل الخصم', 'Compare at Price')}</FormLabel><FormControl><Input type="number" min="0" step="0.01" inputMode="decimal" {...field} value={field.value ?? ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="discountPrice" render={({ field }) => (
                        <FormItem><FormLabel>{t('السعر المخفض', 'Discount Price')}</FormLabel><FormControl><Input type="number" min="0" step="0.01" inputMode="decimal" {...field} value={field.value ?? ''} dir="ltr" /></FormControl><FormDescription>{t('يُحفظ للتخطيط؛ لا يغيّر سعر الطلب تلقائيًا', 'Saved for planning; does not change checkout price automatically')}</FormDescription><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="costPrice" render={({ field }) => (
                        <FormItem><FormLabel>{t('سعر التكلفة', 'Cost Price')}</FormLabel><FormControl><Input type="number" min="0" step="0.01" inputMode="decimal" {...field} dir="ltr" /></FormControl><FormDescription>{t('للمرجعية فقط', 'Reference only')}</FormDescription><FormMessage /></FormItem>
                      )} />
                    </div>
                    
                    <div className="grid gap-5 sm:grid-cols-2">
                      <FormField control={form.control} name="discountEndsOn" render={({ field }) => (
                        <FormItem><FormLabel>{t('نهاية التخفيض', 'Discount Ends On')}</FormLabel><FormControl><Input type="date" {...field} value={field.value || ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="taxable" render={({ field }) => (
                         <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 h-[72px]">
                           <div className="space-y-0.5">
                             <FormLabel className="text-sm font-semibold">{t('خاضع للضريبة', 'Taxable')}</FormLabel>
                              <FormDescription>{t('يُحفظ على المنتج؛ لا يغيّر احتساب الضريبة حاليًا', 'Saved on the product; does not change tax calculation yet')}</FormDescription>
                           </div>
                           <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                         </FormItem>
                      )} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="mb-2 border-b pb-2"><h3 className="text-lg font-semibold">{t('المخزون والمعرفات', 'Inventory & Identifiers')}</h3></div>
                    
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                      <FormField control={form.control} name="sku" render={({ field }) => (
                        <FormItem><FormLabel>{t('رمز التخزين (SKU)', 'SKU')}</FormLabel><FormControl><Input {...field} value={field.value || ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="barcode" render={({ field }) => (
                        <FormItem><FormLabel>{t('الباركود (GTIN)', 'Barcode (GTIN)')}</FormLabel><FormControl><Input {...field} value={field.value || ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="mpn" render={({ field }) => (
                        <FormItem><FormLabel>{t('رمز المصنع (MPN)', 'MPN')}</FormLabel><FormControl><Input {...field} value={field.value || ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="registrationNumber" render={({ field }) => (
                        <FormItem><FormLabel>{t('رقم الإدراج', 'Registration Number')}</FormLabel><FormControl><Input {...field} value={field.value || ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-3">
                      {!editingId && <FormField control={form.control} name="stockQuantity" render={({ field }) => (
                        <FormItem><FormLabel>{t('الكمية الافتتاحية', 'Opening stock')}</FormLabel><FormControl><Input type="number" min="0" step="1" inputMode="numeric" {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />}
                      <FormField control={form.control} name="reorderPoint" render={({ field }) => (
                        <FormItem><FormLabel>{t('حد إعادة الطلب', 'Reorder point')}</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="targetStockQuantity" render={({ field }) => (
                        <FormItem><FormLabel>{t('الكمية المستهدفة', 'Target stock')}</FormLabel><FormControl><Input type="number" min="0" step="1" {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="mb-2 border-b pb-2"><h3 className="text-lg font-semibold">{t('الشحن والتوصيل', 'Shipping & Delivery')}</h3></div>
                    
                    <div className="grid gap-5 sm:grid-cols-3">
                      <FormField control={form.control} name="requiresShipping" render={({ field }) => (
                         <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 h-[72px]">
                           <div className="space-y-0.5">
                             <FormLabel className="text-sm font-semibold">{t('يتطلب شحن/توصيل', 'Requires Shipping')}</FormLabel>
                              <FormDescription>{t('لا يغيّر رسوم الشحن الحالية', 'Does not change current shipping fees')}</FormDescription>
                           </div>
                           <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                         </FormItem>
                      )} />
                      <FormField control={form.control} name="weightKg" render={({ field }) => (
                        <FormItem><FormLabel>{t('وزن المنتج (كجم)', 'Weight (KG)')}</FormLabel><FormControl><Input type="number" min="0" step="0.01" inputMode="decimal" {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="maxPerCustomer" render={({ field }) => (
                        <FormItem><FormLabel>{t('أقصى كمية لكل عميل', 'Max per customer')}</FormLabel><FormControl><Input type="number" min="1" step="1" inputMode="numeric" {...field} value={field.value ?? ''} dir="ltr" /></FormControl><FormDescription>{t('قيمة محفوظة؛ لا تُفرض في الطلبات بعد', 'Saved setting; not enforced during checkout yet')}</FormDescription><FormMessage /></FormItem>
                      )} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="mb-2 border-b pb-2"><h3 className="text-lg font-semibold">{t('التسويق والعرض', 'Marketing & Display')}</h3></div>
                    
                    <div className="grid gap-5 sm:grid-cols-2">
                      <FormField control={form.control} name="brand" render={({ field }) => (
                        <FormItem><FormLabel>{t('الماركة التجارية', 'Brand')}</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="tagsString" render={({ field }) => (
                        <FormItem><FormLabel>{t('الوسوم', 'Tags')}</FormLabel><FormControl><Input {...field} placeholder={t('مفصولة بفاصلة (عطر, مسك, جديد)', 'Comma separated')} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <FormField control={form.control} name="subtitleAr" render={({ field }) => (
                        <FormItem><FormLabel>{t('العنوان الفرعي', 'Subtitle (AR)')}</FormLabel><FormControl><Input {...field} value={field.value || ''} maxLength={35} placeholder={t('حتى 35 حرفًا', 'Up to 35 characters')}/></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="promotionalTitleAr" render={({ field }) => (
                        <FormItem><FormLabel>{t('العنوان الترويجي', 'Promotional Title (AR)')}</FormLabel><FormControl><Input {...field} value={field.value || ''} maxLength={25} placeholder={t('حتى 25 حرفًا', 'Up to 25 characters')}/></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="mb-2 border-b pb-2"><h3 className="text-lg font-semibold">{t('تحسينات محركات البحث (SEO)', 'SEO Improvements')}</h3></div>
                    <p className="text-xs text-muted-foreground">{t('عدّل رابط صفحة المنتج في البيانات الأساسية. تُحفظ بيانات SEO هنا لكنها لا تغيّر عنوان الصفحة العامة حاليًا.', 'Edit the product URL in Basic Information. SEO fields are saved here but do not change the public page metadata yet.')}</p>
                    <FormField control={form.control} name="seoTitleAr" render={({ field }) => (
                      <FormItem><FormLabel>{t('عنوان صفحة المنتج (Page Title)', 'SEO Title')}</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="seoDescriptionAr" render={({ field }) => (
                      <FormItem><FormLabel>{t('وصف صفحة المنتج (Page Description)', 'SEO Description')}</FormLabel><FormControl><Textarea className="resize-none h-[100px]" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </section>

                   {activeCategories.length === 0 && !editingId && !categoriesLoading && (
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                      {t('أضف قسماً نشطاً أولاً قبل إنشاء المنتج.', 'Add an active category before creating a product.')}
                    </div>
                  )}

                  <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t mt-8 flex justify-end gap-3 z-10">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>{t('إلغاء', 'Cancel')}</Button>
                     <Button type="submit" className="min-w-[140px] bg-[#35c3a4] hover:bg-[#2da389] text-white" disabled={isSaving || uploadMutation.isPending || (!editingId && activeCategories.length === 0)}>
                      {isSaving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                      {editingId ? t('حفظ التعديلات', 'Save Changes') : t('إضافة المنتج', 'Create Product')}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : products?.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground border rounded-lg bg-card">{t('لا توجد منتجات مطابقة', 'No products found')}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {products?.map((product) => (
            <ProductRow 
              key={product.id}
              product={product}
               categories={categories ?? []}
              lang={lang}
              t={t}
              currentUser={currentUser}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
