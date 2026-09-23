import { useState } from 'react';
import { useAdminListCoupons, useAdminCreateCoupon, useAdminUpdateCoupon, useAdminDisableCoupon, AdminCouponInputDiscountType, useGetAdminMe, type CouponAffectedCampaign } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Edit2, Trash2, MoreHorizontal } from 'lucide-react';
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

const couponSchema = z.object({
  code: z.string().min(1),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.coerce.number().min(0),
  isActive: z.boolean().default(true),
  usageLimit: z.coerce.number().nullable().optional(),
});

export default function AdminCoupons() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [disableConflict, setDisableConflict] = useState<{ couponId: number; campaigns: CouponAffectedCampaign[] } | null>(null);

  const queryClient = useQueryClient();
  const { data: currentUser } = useGetAdminMe();
  const { data: coupons, isLoading } = useAdminListCoupons({ search });

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

  const form = useForm<z.infer<typeof couponSchema>>({
    resolver: zodResolver(couponSchema),
    defaultValues: { code: '', discountType: 'percentage', discountValue: 0, isActive: true, usageLimit: null }
  });

  const onSubmit = (data: z.infer<typeof couponSchema>) => {
    const payload = {
      ...data,
      discountType: data.discountType as AdminCouponInputDiscountType
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListCouponsQueryKey() });
          setIsDialogOpen(false);
          setEditingId(null);
          form.reset();
        }
      });
    } else {
      createMutation.mutate({ data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListCouponsQueryKey() });
          setIsDialogOpen(false);
          form.reset();
        }
      });
    }
  };

  const handleEdit = (coupon: any) => {
    setEditingId(coupon.id);
    form.reset({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      isActive: coupon.isActive,
      usageLimit: coupon.usageLimit
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
          <Dialog open={isDialogOpen} onOpenChange={(v) => { setIsDialogOpen(v); if (!v) { setEditingId(null); form.reset(); } }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-coupon">
                <Plus className="h-4 w-4 ms-2 rtl:ms-0 rtl:me-2" />
                {t('إضافة كوبون', 'Add Coupon')}
              </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? t('تعديل كوبون', 'Edit Coupon') : t('إضافة كوبون', 'Add Coupon')}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="code" render={({ field }) => (
                  <FormItem><FormLabel>{t('كود الخصم', 'Coupon Code')}</FormLabel><FormControl><Input {...field} dir="ltr" className="uppercase" /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="discountType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('نوع الخصم', 'Discount Type')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <FormItem><FormLabel>{t('القيمة', 'Value')}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="usageLimit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('حد الاستخدام (اختياري)', 'Usage Limit (Optional)')}</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
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
                  <TableCell className="font-bold uppercase tracking-wider">{coupon.code}</TableCell>
                  <TableCell>{coupon.discountValue} {coupon.discountType === 'percentage' ? '%' : 'SAR'}</TableCell>
                  <TableCell>{coupon.timesUsed} / {coupon.usageLimit || '∞'}</TableCell>
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
