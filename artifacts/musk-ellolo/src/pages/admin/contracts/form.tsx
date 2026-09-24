import { useEffect, useRef } from 'react';
import { useRoute, useLocation, Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAdminGetContract, useAdminCreateContract, useAdminUpdateContract, getAdminListContractsQueryKey, getAdminGetContractQueryKey, DistributorContractInput, useAdminListSiteContent, getAdminListSiteContentQueryKey, useAdminListDistributors } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Save } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { sellerDefaults, sellerNumberLabel, sellerProfile } from './seller-defaults';

const contractSchema = z.object({
  contractType: z.string().min(1, 'مطلوب'),
  contractDate: z.string().optional().nullable(),
  hijriDateStr: z.string().optional().nullable(),
  gregorianDateStr: z.string().optional().nullable(),
  contractDayName: z.string().optional().nullable(),
  distributorId: z.string().optional().nullable(),
  
  sellerName: z.string().min(1, 'مطلوب'),
  sellerCrNumber: z.string().min(1, 'مطلوب'),
  sellerCrDate: z.string().min(1, 'مطلوب'),
  sellerCrIssuer: z.string().min(1, 'مطلوب'),
  sellerAddress: z.string().min(1, 'مطلوب'),
  sellerRepName: z.string().min(1, 'مطلوب'),
  sellerRepTitle: z.string().min(1, 'مطلوب'),
  
  buyerCompanyName: z.string().min(1, 'مطلوب'),
  buyerCrNumber: z.string().optional().nullable(),
  buyerCrDate: z.string().optional().nullable(),
  buyerCrIssuer: z.string().optional().nullable(),
  buyerNeighborhood: z.string().optional().nullable(),
  buyerCity: z.string().optional().nullable(),
  buyerPoBox: z.string().optional().nullable(),
  buyerPostalCode: z.string().optional().nullable(),
  buyerRepName: z.string().optional().nullable(),
  buyerRepTitle: z.string().optional().nullable(),
  buyerEmail: z.string().email('بريد غير صالح').optional().or(z.literal('')).nullable(),
  buyerPhone: z.string().optional().nullable(),
  
  showroomName: z.string().optional().nullable(),
  showroomLocation: z.string().optional().nullable(),
  showroomCity: z.string().optional().nullable(),
  
  marginPercent: z.string().optional().nullable()
    .refine(val => !val || Number(val) >= 0, { message: 'يجب أن يكون رقماً غير سالب' })
    .refine(val => !val || Number(val) <= 100, { message: 'يجب ألا تتجاوز النسبة 100%' }),
  minOrderValue: z.string().optional().nullable().refine(val => !val || Number(val) >= 0, { message: 'يجب أن يكون رقماً غير سالب' }),
  
  vatRate: z.string().optional().nullable().refine(val => !val || Number(val) >= 0, { message: 'يجب أن يكون رقماً غير سالب' }),
  latePaymentWeeklyRate: z.string().optional().nullable().refine(val => !val || Number(val) >= 0, { message: 'يجب أن يكون رقماً غير سالب' }),
  latePaymentCapRate: z.string().optional().nullable().refine(val => !val || Number(val) >= 0, { message: 'يجب أن يكون رقماً غير سالب' }),
  
  inspectionDays: z.coerce.number().min(0, 'يجب أن يكون رقماً غير سالب').optional().nullable(),
  warrantyMonths: z.coerce.number().min(0, 'يجب أن يكون رقماً غير سالب').optional().nullable(),
  deliveryDays: z.coerce.number().min(0, 'يجب أن يكون رقماً غير سالب').optional().nullable(),
  paymentDays: z.coerce.number().min(0, 'يجب أن يكون رقماً غير سالب').optional().nullable(),
  
  notes: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof contractSchema>;

export default function AdminContractForm() {
  const [match, params] = useRoute('/admin/contracts/:id/edit');
  const [newMatch] = useRoute('/admin/contracts/new');
  
  const isEditing = match && params?.id !== 'new';
  const id = parseInt(params?.id || '0', 10);
  
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contract, isLoading } = useAdminGetContract(id, { 
    query: { enabled: isEditing && !!id, queryKey: getAdminGetContractQueryKey(id) } 
  });
  const { data: activeDistributors } = useAdminListDistributors({ status: 'active' });
  
   const { data: siteContent, isLoading: isSiteContentLoading, isError: isSiteContentError, refetch: refetchSiteContent } = useAdminListSiteContent({
    query: { enabled: !isEditing, queryKey: getAdminListSiteContentQueryKey() }
  });
  
  const createMutation = useAdminCreateContract();
  const updateMutation = useAdminUpdateContract();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      contractType: 'عقد توريد أجل المملكة العربية السعودية',
       distributorId: '',
       sellerName: sellerDefaults.sellerName,
       sellerCrNumber: sellerDefaults.sellerCrNumber,
       sellerCrDate: sellerDefaults.sellerCrDate,
       sellerCrIssuer: sellerDefaults.sellerCrIssuer,
       sellerAddress: sellerDefaults.sellerAddress,
      sellerRepName: '',
      sellerRepTitle: '',
      buyerCompanyName: '',
      vatRate: '15',
      latePaymentWeeklyRate: '1',
      latePaymentCapRate: '10',
    }
  });

  const initializedForId = useRef<number | null>(null);
  const sellerInitialized = useRef(false);

  useEffect(() => {
    if (isEditing && contract && initializedForId.current !== contract.id) {
      initializedForId.current = contract.id;
      form.reset({
        contractType: contract.contractType,
        distributorId: contract.distributorId ? String(contract.distributorId) : '',
        contractDate: contract.contractDate,
        hijriDateStr: contract.hijriDateStr,
        gregorianDateStr: contract.gregorianDateStr,
        contractDayName: contract.contractDayName,
        sellerName: contract.sellerName,
        sellerCrNumber: contract.sellerCrNumber,
        sellerCrDate: contract.sellerCrDate,
        sellerCrIssuer: contract.sellerCrIssuer,
        sellerAddress: contract.sellerAddress,
        sellerRepName: contract.sellerRepName,
        sellerRepTitle: contract.sellerRepTitle,
        buyerCompanyName: contract.buyerCompanyName,
        buyerCrNumber: contract.buyerCrNumber,
        buyerCrDate: contract.buyerCrDate,
        buyerCrIssuer: contract.buyerCrIssuer,
        buyerNeighborhood: contract.buyerNeighborhood,
        buyerCity: contract.buyerCity,
        buyerPoBox: contract.buyerPoBox,
        buyerPostalCode: contract.buyerPostalCode,
        buyerRepName: contract.buyerRepName,
        buyerRepTitle: contract.buyerRepTitle,
        buyerEmail: contract.buyerEmail,
        buyerPhone: contract.buyerPhone,
        showroomName: contract.showroomName,
        showroomLocation: contract.showroomLocation,
        showroomCity: contract.showroomCity,
        marginPercent: contract.marginPercent,
        minOrderValue: contract.minOrderValue,
        vatRate: contract.vatRate,
        latePaymentWeeklyRate: contract.latePaymentWeeklyRate,
        latePaymentCapRate: contract.latePaymentCapRate,
        inspectionDays: contract.inspectionDays,
        warrantyMonths: contract.warrantyMonths,
        deliveryDays: contract.deliveryDays,
        paymentDays: contract.paymentDays,
        notes: contract.notes,
      });
    }
  }, [contract, isEditing, form]);

  useEffect(() => {
     if (!isEditing && siteContent && !sellerInitialized.current) {
      const legalProfile = siteContent.find(c => c.key === 'seller_legal_profile');
       sellerInitialized.current = true;
       const profile = sellerProfile(legalProfile?.data);
       for (const [key, value] of Object.entries(profile)) {
         const field = key as keyof typeof sellerDefaults;
         if (!form.getFieldState(field).isDirty) form.setValue(field, value);
       }
    }
  }, [isEditing, siteContent, form]);

  const onSubmit = (values: FormValues) => {
    if (!isEditing && !values.distributorId) {
      form.setError('distributorId', { type: 'manual', message: 'اختر الشركة/الموزع لربط العقد بالفواتير' });
      return;
    }
    const { distributorId, ...contractValues } = values;
    const data = {
      ...contractValues,
      distributorId: distributorId ? Number(distributorId) : null,
    } as DistributorContractInput;
    if (isEditing) {
      updateMutation.mutate({ id, data }, {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({ queryKey: getAdminListContractsQueryKey() });
          toast({ title: 'تم الحفظ', description: 'تم تحديث العقد بنجاح' });
          setLocation(`/admin/contracts/${updated.id}`);
        },
        onError: () => {
          toast({ title: 'خطأ', description: 'فشل في تحديث العقد', variant: 'destructive' });
        }
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getAdminListContractsQueryKey() });
          toast({ title: 'تم الإنشاء', description: 'تم إنشاء العقد بنجاح' });
          setLocation(`/admin/contracts/${created.id}`);
        },
        onError: () => {
          toast({ title: 'خطأ', description: 'فشل في إنشاء العقد', variant: 'destructive' });
        }
      });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

   if ((isEditing && isLoading) || (!isEditing && isSiteContentLoading)) {
    return <div className="flex h-[400px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex items-center gap-4">
        <Link href={isEditing ? `/admin/contracts/${id}` : "/admin/contracts"}>
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full">
            <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEditing ? 'تعديل عقد التوزيع' : 'إنشاء عقد توزيع جديد'}
          </h1>
        </div>
      </div>
       {!isEditing && isSiteContentError && (
         <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
           تعذر تحميل البيانات القانونية المركزية. تظهر القيم المستخرجة من المرفقات؛ تحقق منها قبل إنشاء العقد.
           <Button type="button" variant="link" onClick={() => refetchSiteContent()}>إعادة المحاولة</Button>
         </div>
       )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          {/* Seller details */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>الطرف الأول (البائع / نحن)</CardTitle>
                  <CardDescription>البيانات القانونية إجبارية في العقد</CardDescription>
                </div>
                {!isEditing && (
                  <Link href="/admin/site-content" target="_blank" className="text-sm text-primary hover:underline">
                    تعديل البيانات الافتراضية
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sellerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم الشركة/المؤسسة *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sellerCrNumber"
                render={({ field }) => (
                  <FormItem>
                     <FormLabel>{sellerNumberLabel(form.watch('sellerCrNumber'))} *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sellerCrDate"
                render={({ field }) => (
                  <FormItem>
                     <FormLabel>تاريخ إصدار شهادة السجل *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sellerCrIssuer"
                render={({ field }) => (
                  <FormItem>
                     <FormLabel>الجهة المصدرة *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sellerAddress"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>العنوان الوطني *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                     <p className="text-xs text-muted-foreground">العنوان من إثبات انتهت صلاحيته في 25/05/2024؛ يرجى التحقق منه قبل الاعتماد.</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sellerRepName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>يمثلها في هذا العقد *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                     <p className="text-xs text-muted-foreground">اسم الممثل غير وارد في المرفقات؛ أدخله قبل إنشاء العقد.</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sellerRepTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الصفة *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                     <p className="text-xs text-muted-foreground">صفة الممثل غير واردة في المرفقات؛ أدخلها قبل إنشاء العقد.</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Buyer details */}
          <Card>
            <CardHeader>
              <CardTitle>الطرف الثاني (المشتري / الموزع)</CardTitle>
              {!isEditing && <CardDescription>اختيار شركة نشطة مطلوب لربط العقد بالفواتير.</CardDescription>}
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="distributorId"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>الشركة / الموزع النشط{!isEditing ? ' *' : ''}</FormLabel>
                    <Select
                      value={field.value || ''}
                      onValueChange={(value) => {
                        field.onChange(value);
                        const distributor = activeDistributors?.find((candidate) => String(candidate.id) === value);
                        if (distributor) form.setValue('buyerCompanyName', distributor.companyName, { shouldDirty: true, shouldValidate: true });
                      }}
                    >
                      <FormControl><SelectTrigger><SelectValue placeholder="اختر الشركة/الموزع" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(activeDistributors ?? []).map((distributor) => (
                          <SelectItem key={distributor.id} value={String(distributor.id)}>{distributor.companyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buyerCompanyName"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>اسم الشركة/المؤسسة *</FormLabel>
                    <FormControl><Input {...field} readOnly /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buyerCrNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>رقم السجل التجاري</FormLabel>
                    <FormControl><Input {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buyerCrIssuer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>مصدر السجل</FormLabel>
                    <FormControl><Input {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buyerRepName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>يمثلها</FormLabel>
                    <FormControl><Input {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buyerRepTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الصفة</FormLabel>
                    <FormControl><Input {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buyerEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>البريد الإلكتروني</FormLabel>
                    <FormControl><Input type="email" dir="ltr" {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buyerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الهاتف</FormLabel>
                    <FormControl><Input dir="ltr" {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Terms */}
          <Card>
            <CardHeader>
              <CardTitle>الشروط التجارية والتشغيلية</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="contractType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع العقد</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="عقد توريد أجل المملكة العربية السعودية">عقد توريد أجل المملكة العربية السعودية</SelectItem>
                        <SelectItem value="عقد توريد نقد المملكة العربية السعودية">عقد توريد نقد المملكة العربية السعودية</SelectItem>
                        <SelectItem value="عقد توريد أجل دول الخليج">عقد توريد أجل دول الخليج</SelectItem>
                        <SelectItem value="عقد توريد نقد دول الخليج">عقد توريد نقد دول الخليج</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="marginPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نسبة الخصم (%)</FormLabel>
                    <FormControl><Input type="number" min="0" max="100" step="0.01" {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paymentDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>أيام الدفع (آجل)</FormLabel>
                    <FormControl><Input type="number" min="0" step="1" {...field} value={field.value ?? ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deliveryDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>أيام التوصيل (SLA)</FormLabel>
                    <FormControl><Input type="number" min="0" step="1" {...field} value={field.value ?? ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="inspectionDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>أيام الفحص والإرجاع</FormLabel>
                    <FormControl><Input type="number" min="0" step="1" {...field} value={field.value ?? ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="warrantyMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>مدة الضمان (بالأشهر)</FormLabel>
                    <FormControl><Input type="number" min="0" step="1" {...field} value={field.value ?? ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-3">
                    <FormLabel>شروط إضافية / ملاحظات (ستظهر في الملحق)</FormLabel>
                    <FormControl><Textarea rows={4} {...field} value={field.value || ''} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 sticky bottom-4">
            <Link href={isEditing ? `/admin/contracts/${id}` : "/admin/contracts"}>
              <Button type="button" variant="outline" className="bg-background">إلغاء</Button>
            </Link>
            <Button type="submit" disabled={isSubmitting} className="gap-2 shadow-lg">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {!isSubmitting && <Save className="h-4 w-4" />}
              {isEditing ? 'حفظ التعديلات' : 'إنشاء العقد'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
