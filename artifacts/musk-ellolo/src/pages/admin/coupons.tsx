import { useMemo, useState } from 'react';
import { useAdminListCoupons, useAdminCreateCoupon, useAdminUpdateCoupon, useAdminDisableCoupon, AdminCouponInputDiscountType, useGetAdminMe, useAdminListProducts, type AdminCoupon, type CouponAffectedCampaign } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Money } from '@/components/money';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Edit2, Trash2, MoreHorizontal, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { INVOICE_COUNTRY_CODES, countryDisplayName } from '@/components/admin/individual-invoice-address';
import { sortProductsForSelection } from '@/lib/product-sort';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useQueryClient } from '@tanstack/react-query';
import { getAdminListCouponsQueryKey } from '@workspace/api-client-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const optionalNumber = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().finite().nullable());
const couponSchema = z.object({
  code: z.string().trim().min(1).max(100),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.coerce.number().finite().min(0),
  isActive: z.boolean().default(true),
  usageLimit: optionalNumber.refine((v) => v === null || (Number.isInteger(v) && v >= 1), 'Must be a whole number ≥ 1'),
  perCustomerLimit: optionalNumber.refine((v) => v === null || (Number.isInteger(v) && v >= 1), 'Must be a whole number ≥ 1'),
  maxDiscount: optionalNumber.refine((v) => v === null || v > 0, 'Cap must be greater than 0'),
  expiresAt: z.string().default(''),
  freeShipping: z.boolean().default(false),
  excludedProductIds: z.array(z.number()).default([]),
  allowedCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).default([]),
}).refine((d) => d.discountType !== 'percentage' || d.discountValue <= 100, { path: ['discountValue'], message: 'Percentage cannot exceed 100' });
type CouponForm = z.infer<typeof couponSchema>;

// Expiry is entered as Riyadh wall-clock time (UTC+3, no DST).
const riyadhLocalToIso = (v: string) => (v ? new Date(`${v}:00+03:00`).toISOString() : null);
const isoToRiyadhLocal = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16);
};
const formatRiyadh = (iso: string, lang: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const emptyForm: CouponForm = { code: '', discountType: 'percentage', discountValue: 0, isActive: true, usageLimit: null, perCustomerLimit: null, maxDiscount: null, expiresAt: '', freeShipping: false, excludedProductIds: [], allowedCountries: [] };

export default function AdminCoupons() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [disableConflict, setDisableConflict] = useState<{ couponId: number; campaigns: CouponAffectedCampaign[] } | null>(null);

  const queryClient = useQueryClient();
  const { data: currentUser } = useGetAdminMe();
  const { data: coupons, isLoading } = useAdminListCoupons({ search });

  const { data: products } = useAdminListProducts(undefined, { query: { enabled: isDialogOpen, queryKey: ['admin-products-for-coupon'] } });
  const [productQuery, setProductQuery] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const productOptions = useMemo(() => sortProductsForSelection(products ?? [], lang), [products, lang]);
  const createMutation = useAdminCreateCoupon();
  const updateMutation = useAdminUpdateCoupon();
  const disableMutation = useAdminDisableCoupon();

  const disableCoupon = (id: number, confirmImpact = false) => {
    disableMutation.mutate({ id, data: confirmImpact ? { confirm: true } : undefined }, {
      onSuccess: () => {
        setDisableConflict(null);
        queryClient.invalidateQueries({ queryKey: getAdminListCouponsQueryKey() });
      },
      onError: (error) => {
        const apiError = error as { status?: number; data?: { affectedCampaigns?: CouponAffectedCampaign[] } | null };
        if (apiError.status === 409 && apiError.data?.affectedCampaigns?.length) {
          setDisableConflict({ couponId: id, campaigns: apiError.data.affectedCampaigns });
        }
      },
    });
  };

  const handleDisable = (id: number) => {
    if (!confirm(t('هل أنت متأكد من تعطيل هذا الكوبون؟', 'Are you sure you want to disable this coupon?'))) return;
    disableCoupon(id);
  };

  const form = useForm<CouponForm>({
    resolver: zodResolver(couponSchema) as never,
    defaultValues: emptyForm,
  });

  const onError = (error: unknown) => {
    const e = error as { data?: { error?: string } | null; message?: string };
    setSaveError(e.data?.error ?? e.message ?? t('تعذر حفظ الكوبون', 'Could not save coupon'));
  };

  const onSubmit = (data: CouponForm) => {
    setSaveError(null);
    const payload = {
      code: data.code.trim(),
      discountType: data.discountType as AdminCouponInputDiscountType,
      discountValue: data.discountValue,
      isActive: data.isActive,
      usageLimit: data.usageLimit,
      expiresAt: riyadhLocalToIso(data.expiresAt),
      freeShipping: data.freeShipping,
      perCustomerLimit: data.perCustomerLimit,
      maxDiscount: data.discountType === 'percentage' ? data.maxDiscount : null,
      excludedProductIds: data.excludedProductIds,
      allowedCountries: data.allowedCountries,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListCouponsQueryKey() });
          setIsDialogOpen(false);
          setEditingId(null);
          form.reset(emptyForm);
        },
        onError,
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListCouponsQueryKey() });
          setIsDialogOpen(false);
          form.reset(emptyForm);
        },
        onError,
      });
    }
  };

  const handleEdit = (coupon: AdminCoupon) => {
    setEditingId(coupon.id);
    setSaveError(null);
    form.reset({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      isActive: coupon.isActive,
      usageLimit: coupon.usageLimit ?? null,
      perCustomerLimit: coupon.perCustomerLimit ?? null,
      maxDiscount: coupon.maxDiscount ?? null,
      expiresAt: isoToRiyadhLocal(coupon.expiresAt),
      freeShipping: coupon.freeShipping ?? false,
      excludedProductIds: coupon.excludedProductIds ?? [],
      allowedCountries: coupon.allowedCountries ?? [],
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('الكوبونات', 'Coupons')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة كوبونات الخصم', 'Manage discount coupons')}</p>
        </div>
        {hasPermission(currentUser, 'coupons', 'edit') && (
          <Dialog open={isDialogOpen} onOpenChange={(v) => { setIsDialogOpen(v); if (!v) { setEditingId(null); setSaveError(null); form.reset(emptyForm); } }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-coupon">
                <Plus className="h-4 w-4 ms-2 rtl:ms-0 rtl:me-2" />
                {t('إضافة كوبون', 'Add Coupon')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? t('تعديل كوبون', 'Edit Coupon') : t('إضافة كوبون', 'Add Coupon')}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="code" render={({ field }) => (
                  <FormItem><FormLabel>{t('كود الخصم', 'Coupon Code')}</FormLabel><FormControl><Input {...field} dir="ltr" maxLength={100} /></FormControl><p className="text-xs text-muted-foreground">{t('يحفظ كما كُتب؛ المطابقة لا تفرق بين الأحرف الكبيرة والصغيرة.', 'Saved exactly as typed; matching is case-insensitive.')}</p><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="discountType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('نوع الخصم', 'Discount Type')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="percentage">{t('نسبة مئوية', 'Percentage')}</SelectItem>
                          <SelectItem value="fixed">{t('مبلغ ثابت', 'Fixed Amount')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="discountValue" render={({ field }) => (
                    <FormItem><FormLabel>{t('القيمة', 'Value')}</FormLabel><FormControl><Input type="number" min={0} step="0.01" max={form.watch('discountType') === 'percentage' ? 100 : undefined} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="usageLimit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('حد الاستخدام (اختياري)', 'Usage Limit (Optional)')}</FormLabel>
                    <FormControl><Input type="number" min={1} step={1} {...field} value={field.value ?? ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="perCustomerLimit" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('حد لكل عميل (اختياري)', 'Per-customer limit (optional)')}</FormLabel>
                      <FormControl><Input type="number" min={1} step={1} {...field} value={field.value ?? ''} data-testid="input-coupon-per-customer" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {form.watch('discountType') === 'percentage' && (
                    <FormField control={form.control} name="maxDiscount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('سقف الخصم بالريال (اختياري)', 'Max discount, SAR (optional)')}</FormLabel>
                        <FormControl><Input type="number" min={0.01} step="0.01" {...field} value={field.value ?? ''} data-testid="input-coupon-max-discount" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}
                </div>
                <FormField control={form.control} name="expiresAt" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('ينتهي في — بتوقيت الرياض (اختياري)', 'Expires at — Riyadh time (optional)')}</FormLabel>
                    <FormControl><Input type="datetime-local" dir="ltr" {...field} data-testid="input-coupon-expires" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex flex-wrap gap-6 rounded-md border p-3">
                  <FormField control={form.control} name="freeShipping" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-coupon-free-shipping" /></FormControl>
                      <FormLabel className="!mt-0">{t('توصيل مجاني (لا يشمل رسوم الاستلام)', 'Free delivery (pickup fee unchanged)')}</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="isActive" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <FormLabel className="!mt-0">{t('نشط', 'Active')}</FormLabel>
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="excludedProductIds" render={({ field }) => {
                  const q = productQuery.trim().toLowerCase();
                  const matches = productOptions.filter((p) => !field.value.includes(p.id) && (!q || `${p.nameAr} ${p.nameEn} ${p.id}`.toLowerCase().includes(q))).slice(0, 8);
                  return (
                    <FormItem>
                      <FormLabel>{t('منتجات مستثناة من الخصم', 'Products excluded from discount')}</FormLabel>
                      <div className="flex flex-wrap gap-1">
                        {field.value.map((id) => {
                          const p = productOptions.find((x) => x.id === id);
                          return <Badge key={id} variant="secondary" className="gap-1">{p ? (lang === 'ar' ? p.nameAr : p.nameEn) : `#${id}`}<button type="button" aria-label={t('إزالة', 'Remove')} onClick={() => field.onChange(field.value.filter((x) => x !== id))}><X className="h-3 w-3" /></button></Badge>;
                        })}
                      </div>
                      <Input placeholder={t('ابحث عن منتج...', 'Search products...')} value={productQuery} onChange={(e) => setProductQuery(e.target.value)} data-testid="input-coupon-product-search" />
                      {q && <div className="max-h-40 overflow-y-auto rounded-md border">
                        {matches.length === 0 ? <p className="p-2 text-sm text-muted-foreground">{products ? t('لا نتائج', 'No matches') : t('جاري التحميل...', 'Loading...')}</p>
                          : matches.map((p) => <button key={p.id} type="button" className="block w-full px-2 py-1.5 text-start text-sm hover:bg-muted" onClick={() => { field.onChange([...field.value, p.id]); setProductQuery(''); }}>{lang === 'ar' ? p.nameAr : p.nameEn}</button>)}
                      </div>}
                      <FormMessage />
                    </FormItem>
                  );
                }} />
                <FormField control={form.control} name="allowedCountries" render={({ field }) => {
                  const q = countryQuery.trim().toLowerCase();
                  const matches = INVOICE_COUNTRY_CODES.filter((c) => !field.value.includes(c) && (!q || `${c} ${countryDisplayName(c, 'ar')} ${countryDisplayName(c, 'en')}`.toLowerCase().includes(q))).slice(0, 8);
                  return (
                    <FormItem>
                      <FormLabel>{t('الدول المسموحة (فارغ = كل الدول)', 'Allowed countries (empty = all)')}</FormLabel>
                      <div className="flex flex-wrap gap-1">
                        {field.value.map((c) => <Badge key={c} variant="secondary" className="gap-1">{countryDisplayName(c, lang)} ({c})<button type="button" aria-label={t('إزالة', 'Remove')} onClick={() => field.onChange(field.value.filter((x) => x !== c))}><X className="h-3 w-3" /></button></Badge>)}
                      </div>
                      <Input placeholder={t('ابحث عن دولة...', 'Search countries...')} value={countryQuery} onChange={(e) => setCountryQuery(e.target.value)} data-testid="input-coupon-country-search" />
                      {q && <div className="max-h-40 overflow-y-auto rounded-md border">
                        {matches.length === 0 ? <p className="p-2 text-sm text-muted-foreground">{t('لا نتائج', 'No matches')}</p>
                          : matches.map((c) => <button key={c} type="button" className="block w-full px-2 py-1.5 text-start text-sm hover:bg-muted" onClick={() => { field.onChange([...field.value, c]); setCountryQuery(''); }}>{countryDisplayName(c, lang)} ({c})</button>)}
                      </div>}
                      {field.value.length > 0 && <p className="text-xs text-muted-foreground">{t('يتطلب تحديد دولة العميل عند استخدام الكوبون.', 'Buyer country is required when this coupon is used.')}</p>}
                      <FormMessage />
                    </FormItem>
                  );
                }} />
                {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
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
            placeholder={t('البحث عن كوبون...', 'Search coupons...')} 
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
              <TableHead>{t('الكود', 'Code')}</TableHead>
              <TableHead>{t('الخصم', 'Discount')}</TableHead>
              <TableHead>{t('الاستخدام', 'Usage')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : coupons?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">{t('لا توجد كوبونات', 'No coupons found')}</TableCell></TableRow>
            ) : (
              coupons?.map((coupon) => (
                <TableRow key={coupon.id} data-testid={`row-coupon-${coupon.id}`}>
                  <TableCell className="font-bold tracking-wider" dir="ltr">{coupon.code}
                    <div className="flex flex-wrap gap-1 pt-1 font-normal">
                      {coupon.freeShipping && <Badge variant="outline">{t('توصيل مجاني', 'Free delivery')}</Badge>}
                      {(coupon.allowedCountries?.length ?? 0) > 0 && <Badge variant="outline">{coupon.allowedCountries!.join(', ')}</Badge>}
                      {coupon.expiresAt && <span className="text-xs text-muted-foreground">{t('ينتهي', 'Expires')} {formatRiyadh(coupon.expiresAt, lang)}</span>}
                    </div></TableCell>
                  <TableCell>{coupon.discountType === 'percentage' ? `${coupon.discountValue}%` : <Money value={coupon.discountValue} lang={lang} />}{coupon.maxDiscount != null && <span className="block text-xs text-muted-foreground">{t('بحد أقصى', 'max')} <Money value={coupon.maxDiscount} lang={lang} /></span>}</TableCell>
                  <TableCell>{coupon.timesUsed} / {coupon.usageLimit || '∞'}{coupon.perCustomerLimit != null && <span className="block text-xs text-muted-foreground">{t(`${coupon.perCustomerLimit} لكل عميل`, `${coupon.perCustomerLimit} per customer`)}</span>}</TableCell>
                  <TableCell>
                    <Badge variant={coupon.isActive ? "default" : "secondary"} className={coupon.isActive ? "bg-success text-success-foreground hover:bg-success/90" : "bg-muted text-muted-foreground"}>
                      {coupon.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                      {hasPermission(currentUser, 'coupons', 'edit') && (
                        <DropdownMenuItem onClick={() => handleEdit(coupon)} disabled={updateMutation.isPending}><Edit2 className="h-4 w-4" />{t('تعديل', 'Edit')}</DropdownMenuItem>
                      )}
                      {hasPermission(currentUser, 'coupons', 'delete') && coupon.isActive && (
                        <DropdownMenuItem onClick={() => handleDisable(coupon.id)} disabled={disableMutation.isPending} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" />{t('تعطيل', 'Disable')}</DropdownMenuItem>
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

      <AlertDialog open={Boolean(disableConflict)} onOpenChange={(open) => { if (!open) setDisableConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('هذا الكوبون مستخدم في حملات نشطة', 'This coupon is used by active campaigns')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{t(
                  'سيؤثر تعطيل الكوبون في الحملات التالية. راجعها قبل تأكيد التعطيل:',
                  'Disabling this coupon will affect the following campaigns. Review them before confirming:',
                )}</p>
                <ul className="list-disc space-y-1 ps-5 text-foreground">
                  {disableConflict?.campaigns.map((campaign) => (
                    <li key={campaign.id}>{campaign.name}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('إلغاء', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={disableMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (disableConflict) disableCoupon(disableConflict.couponId, true);
              }}
              data-testid="button-confirm-coupon-impact"
            >
              {t('تعطيل رغم ذلك', 'Disable anyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
