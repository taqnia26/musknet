import { useEffect, useRef } from 'react';
import { useRoute, useLocation, Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAdminGetContract, useAdminCreateContract, useAdminUpdateContract, getAdminListContractsQueryKey, getAdminGetContractQueryKey, DistributorContractInput, useAdminListSiteContent, getAdminListSiteContentQueryKey } from '@workspace/api-client-react';
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

const contractSchema = z.object({
  contractType: z.string().min(1, 'مطلوب'),
  contractDate: z.string().optional().nullable(),
  hijriDateStr: z.string().optional().nullable(),
  gregorianDateStr: z.string().optional().nullable(),
  contractDayName: z.string().optional().nullable(),
  
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
  
  marginPercent: z.string().optional().nullable(),
  minOrderValue: z.string().optional().nullable(),
  
  vatRate: z.string().optional().nullable(),
  latePaymentWeeklyRate: z.string().optional().nullable(),
  latePaymentCapRate: z.string().optional().nullable(),
  
  inspectionDays: z.coerce.number().optional().nullable(),
  warrantyMonths: z.coerce.number().optional().nullable(),
  deliveryDays: z.coerce.number().optional().nullable(),
  paymentDays: z.coerce.number().optional().nullable(),
  
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
  
  const { data: siteContent, isLoading: isSiteContentLoading } = useAdminListSiteContent({
    query: { enabled: !isEditing, queryKey: getAdminListSiteContentQueryKey() }
  });
  
  const createMutation = useAdminCreateContract();
  const updateMutation = useAdminUpdateContract();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      contractType: 'موزع',
      sellerName: '',
      sellerCrNumber: '',
      sellerCrDate: '',
      sellerCrIssuer: '',
      sellerAddress: '',
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
      if (legalProfile && typeof legalProfile.data === 'object' && legalProfile.data) {
        sellerInitialized.current = true;
        const d = legalProfile.data as any;
        form.reset({
          ...form.getValues(),
          sellerName: d.sellerName || '',
          sellerCrNumber: d.sellerCrNumber || '',
          sellerCrDate: d.sellerCrDate || '',
          sellerCrIssuer: d.sellerCrIssuer || '',
          sellerAddress: d.sellerAddress || '',
          sellerRepName: d.sellerRepName || '',
          sellerRepTitle: d.sellerRepTitle || '',
        });
      }
    }
  }, [isEditing, siteContent, form]);

  const onSubmit = (values: FormValues) => {
    if (isEditing) {
      updateMutation.mutate({ id, data: values as any }, {
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
      createMutation.mutate({ data: values as any }, {
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

  if (isEditing && isLoading) {
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
                    <FormLabel>رقم السجل التجاري *</FormLabel>
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
                    <FormLabel>تاريخ السجل *</FormLabel>
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
                    <FormLabel>مصدر السجل *</FormLabel>
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
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="buyerCompanyName"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>اسم الشركة/المؤسسة *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
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
                        <SelectItem value="موزع">موزع (بضاعة)</SelectItem>
                        <SelectItem value="امتياز">امتياز تجاري</SelectItem>
                        <SelectItem value="وكالة">وكالة حصرية</SelectItem>
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
                    <FormLabel>نسبة الخصم / الهامش (%)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} value={field.value || ''} /></FormControl>
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
                    <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
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
                    <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
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
                    <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
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
                    <FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl>
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
