import { useState } from 'react';
import { useAdminListDistributors, useAdminCreateDistributor, useAdminUpdateDistributor, useAdminDisableDistributor, useGetAdminMe } from '@workspace/api-client-react';
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
import { getAdminListDistributorsQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { IntakeAddressFields } from '@/components/admin/intake-address-fields';
import { emptyIntakeAddress, intakeAddressSchema, intakeAddressPayload, type IntakeAddressField } from '@/lib/intake-address';

const COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(' ');
const GCC_COUNTRY_CODES = ['SA', 'AE', 'BH', 'KW', 'OM', 'QA'];
const countryLabel = (code: string, lang: string) => {
  const name = new Intl.DisplayNames([lang], { type: 'region' }).of(code);
  return `${name && name !== code ? name : code} (${code})`;
};

const normalizePhone = (value: string) => value
  .trim()
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');

const distributorSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  phone: z.preprocess(
    (value) => normalizePhone(String(value ?? '')),
    z.string().regex(/^(?=(?:\D*\d){8,15}\D*$)\+?[\d\s().-]+$/, {
      message: 'رقم الجوال غير صالح. استخدم 8-15 رقماً (مثال: ‎+966 50 123 4567) / Invalid phone. Use 8-15 digits (e.g. +966 50 123 4567).',
    }),
  ),
  email: z.union([z.string().email(), z.literal('')]).nullable().optional(),
  city: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  taxNumber: z.string().nullable().optional(),
  commercialRegistrationNumber: z.string().nullable().optional(),
  countryCode: z.string().refine((value) => value === '' || /^[A-Z]{2}$/.test(value), {
    message: 'اختر رمز دولة مكوّناً من حرفين كبيرين / Choose a two-letter uppercase country code',
  }),
  nationalAddressShortCode: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  buildingNo: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  additionalNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});
const createDistributorSchema = distributorSchema.superRefine((data, ctx) => {
  for (const key of ['companyName', 'contactName', 'taxNumber', 'commercialRegistrationNumber', 'email'] as const) {
    if (!data[key]?.trim()) ctx.addIssue({ code: 'custom', path: [key], message: 'هذا الحقل مطلوب / Required' });
  }
  const result = intakeAddressSchema.safeParse({
    country: data.countryCode, city: data.city ?? '', nationalAddressShortCode: data.nationalAddressShortCode ?? '',
    district: data.district ?? '', street: data.street ?? '', buildingNo: data.buildingNo ?? '',
    postalCode: data.postalCode ?? '', additionalNumber: data.additionalNumber ?? '', additionalInfo: data.address ?? '',
  });
  if (!result.success) result.error.issues.forEach((issue) => ctx.addIssue({
    code: 'custom', path: [issue.path[0] === 'country' ? 'countryCode' : issue.path[0] === 'additionalInfo' ? 'address' : issue.path[0]],
    message: issue.message,
  }));
});

export default function AdminDistributors() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { data: currentUser } = useGetAdminMe();
  const { data: distributors, isLoading } = useAdminListDistributors({ search });

  const createMutation = useAdminCreateDistributor();
  const updateMutation = useAdminUpdateDistributor();
  const disableMutation = useAdminDisableDistributor();
  const mutationError = (error: unknown, fallback: string) => {
    const cause = error as { data?: { error?: string }; message?: string };
    return cause.data?.error ?? cause.message ?? fallback;
  };
  const normalizeOptional = (value: string | null | undefined) => value?.trim() || null;

  const handleDisable = (id: number) => {
    if (confirm(t('هل أنت متأكد من تعطيل/حذف هذا الموزع؟', 'Are you sure you want to disable/delete this distributor?'))) {
      disableMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListDistributorsQueryKey() });
          toast({ title: t('تم تعطيل الشركة', 'Company disabled') });
        },
        onError: (error) => toast({
          title: t('تعذر تعطيل الشركة', 'Could not disable company'),
          description: mutationError(error, t('حاول مرة أخرى', 'Please try again')),
          variant: 'destructive',
        }),
      });
    }
  };

  const form = useForm<z.infer<typeof distributorSchema>>({
    resolver: zodResolver(editingId ? distributorSchema : createDistributorSchema),
    defaultValues: { companyName: '', contactName: '', phone: '', email: '', city: '', address: '', taxNumber: '', commercialRegistrationNumber: '', countryCode: 'SA', notes: null, isActive: true,
      nationalAddressShortCode: '', district: '', street: '', buildingNo: '', postalCode: '', additionalNumber: '' }
  });

  const onSubmit = (data: z.infer<typeof distributorSchema>) => {
    const address = !editingId ? intakeAddressPayload({
      country: data.countryCode, city: data.city ?? '', nationalAddressShortCode: data.nationalAddressShortCode ?? '',
      district: data.district ?? '', street: data.street ?? '', buildingNo: data.buildingNo ?? '',
      postalCode: data.postalCode ?? '', additionalNumber: data.additionalNumber ?? '', additionalInfo: data.address ?? '',
    }) : null;
    const payload = {
      ...data,
      companyName: data.companyName.trim(),
      contactName: data.contactName.trim(),
      phone: normalizePhone(data.phone),
      email: editingId ? normalizeOptional(data.email) : data.email?.trim() ?? '',
      city: editingId ? normalizeOptional(data.city) : data.city?.trim() ?? '',
      address: normalizeOptional(data.address),
      taxNumber: editingId ? normalizeOptional(data.taxNumber) : data.taxNumber?.trim() ?? '',
      commercialRegistrationNumber: editingId ? normalizeOptional(data.commercialRegistrationNumber) : data.commercialRegistrationNumber?.trim() ?? '',
      countryCode: data.countryCode,
      notes: normalizeOptional(data.notes),
      ...(!editingId && address ? {
        countryCode: address.country, city: address.city,
        nationalAddressShortCode: address.nationalAddressShortCode,
        district: address.district, street: address.street, buildingNo: address.buildingNo,
        postalCode: address.postalCode, additionalNumber: address.additionalNumber,
        address: address.additionalInfo,
      } : {}),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListDistributorsQueryKey() });
          setIsDialogOpen(false);
          setEditingId(null);
          form.reset();
          toast({ title: t('تم حفظ تعديلات الشركة', 'Company changes saved') });
        },
        onError: (error) => toast({
          title: t('تعذر حفظ تعديلات الشركة', 'Could not save company changes'),
          description: mutationError(error, t('تحقق من البيانات والصلاحيات ثم حاول مرة أخرى', 'Check the data and permissions, then try again')),
          variant: 'destructive',
        }),
      });
    } else {
      createMutation.mutate({ data: { ...payload, email: data.email?.trim() ?? '', city: data.city?.trim() ?? '',
        countryCode: address!.country, taxNumber: data.taxNumber?.trim() ?? '',
        commercialRegistrationNumber: data.commercialRegistrationNumber?.trim() ?? '' } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListDistributorsQueryKey() });
          setIsDialogOpen(false);
          form.reset();
          toast({ title: t('تمت إضافة الشركة', 'Company added') });
        },
        onError: (error) => toast({
          title: t('تعذر إضافة الشركة', 'Could not add company'),
          description: mutationError(error, t('تحقق من البيانات والصلاحيات ثم حاول مرة أخرى', 'Check the data and permissions, then try again')),
          variant: 'destructive',
        }),
      });
    }
  };

  const handleEdit = (distributor: any) => {
    setEditingId(distributor.id);
    form.reset({
      companyName: distributor.companyName,
      contactName: distributor.contactName,
      phone: distributor.phone,
      email: distributor.email,
      city: distributor.city,
      address: distributor.address,
      taxNumber: distributor.taxNumber,
      commercialRegistrationNumber: distributor.commercialRegistrationNumber,
      countryCode: distributor.countryCode ?? '',
      nationalAddressShortCode: distributor.nationalAddressShortCode,
      district: distributor.district, street: distributor.street, buildingNo: distributor.buildingNo,
      postalCode: distributor.postalCode, additionalNumber: distributor.additionalNumber,
      notes: distributor.notes,
      isActive: distributor.isActive
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('الشركات', 'Companies')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة حسابات الشركات والموزعين وتفاصيلهم', 'Manage company and distributor accounts and details')}</p>
        </div>
        {hasPermission(currentUser, 'distributors', 'edit') && (
          <Dialog open={isDialogOpen} onOpenChange={(v) => { setIsDialogOpen(v); if (!v) { setEditingId(null); form.reset(); } }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-distributor">
                <Plus className="h-4 w-4 ms-2 rtl:ms-0 rtl:me-2" />
                {t('إضافة موزع', 'Add Distributor')}
              </Button>
            </DialogTrigger>
             <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? t('تعديل موزع', 'Edit Distributor') : t('إضافة موزع', 'Add Distributor')}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit, (errors) => {
                  const labels: Record<string, string> = {
                    companyName: t('اسم الشركة', 'Company name'),
                    contactName: t('اسم المسؤول', 'Contact name'),
                    phone: t('رقم الجوال', 'Phone'),
                    email: t('البريد الإلكتروني', 'Email'),
                  };
                  const firstError = Object.entries(errors)[0];
                  toast({
                    title: t('تعذر الحفظ', 'Could not save'),
                    description: firstError
                      ? `${labels[firstError[0]] ?? firstError[0]}: ${String(firstError[1]?.message ?? t('قيمة غير صالحة', 'Invalid value'))}`
                      : t('راجع الحقول المعلّمة وصحح البيانات المطلوبة', 'Review the marked fields and correct the required information'),
                    variant: 'destructive',
                  });
                })}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="companyName" render={({ field }) => (
                    <FormItem><FormLabel>{t('اسم الشركة', 'Company Name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="contactName" render={({ field }) => (
                    <FormItem><FormLabel>{t('اسم المسؤول', 'Contact Name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="commercialRegistrationNumber" render={({ field }) => (
                  <FormItem><FormLabel>{t('رقم السجل التجاري', 'Commercial Registration Number')}</FormLabel><FormControl><Input {...field} value={field.value || ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
                {editingId && <FormField control={form.control} name="countryCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('الدولة / رمز ISO-2', 'Country / ISO-2 code')}</FormLabel>
                    <FormControl>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={field.value || ''}
                        onChange={field.onChange}
                      >
                        <option value="">{t('غير محددة', 'Unspecified')}</option>
                        <optgroup label={t('دول مجلس التعاون الخليجي', 'Gulf Cooperation Council')}>
                          {GCC_COUNTRY_CODES.map((code) => <option key={code} value={code}>{countryLabel(code, lang)}</option>)}
                        </optgroup>
                        <optgroup label={t('دول أخرى', 'Other countries')}>
                          {COUNTRY_CODES.filter((code) => !GCC_COUNTRY_CODES.includes(code)).sort().map((code) => (
                            <option key={code} value={code}>{countryLabel(code, lang)}</option>
                          ))}
                        </optgroup>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>{t('رقم الجوال', 'Phone')}</FormLabel><FormControl><Input {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>{t('البريد الإلكتروني', 'Email')}</FormLabel><FormControl><Input {...field} value={field.value || ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="city" render={({ field }) => (
                    <FormItem><FormLabel>{t('المدينة', 'City')}</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="taxNumber" render={({ field }) => (
                    <FormItem><FormLabel>{t('الرقم الضريبي', 'Tax Number')}</FormLabel><FormControl><Input {...field} value={field.value || ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                {editingId ? <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem><FormLabel>{t('العنوان', 'Address')}</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                )} /> : <IntakeAddressFields id="distributor-address" value={{
                  country: form.watch('countryCode'), city: form.watch('city') ?? '',
                  nationalAddressShortCode: form.watch('nationalAddressShortCode') ?? '',
                  district: form.watch('district') ?? '', street: form.watch('street') ?? '',
                  buildingNo: form.watch('buildingNo') ?? '', postalCode: form.watch('postalCode') ?? '',
                  additionalNumber: form.watch('additionalNumber') ?? '', additionalInfo: form.watch('address') ?? '',
                }} onChange={(key: IntakeAddressField, next) => form.setValue(
                  key === 'country' ? 'countryCode' : key === 'additionalInfo' ? 'address' : key, next,
                  { shouldValidate: true },
                )} errors={{
                  country: form.formState.errors.countryCode?.message, city: form.formState.errors.city?.message,
                  nationalAddressShortCode: form.formState.errors.nationalAddressShortCode?.message,
                  district: form.formState.errors.district?.message, street: form.formState.errors.street?.message,
                  buildingNo: form.formState.errors.buildingNo?.message, postalCode: form.formState.errors.postalCode?.message,
                  additionalNumber: form.formState.errors.additionalNumber?.message, additionalInfo: form.formState.errors.address?.message,
                }} />}
                {editingId && form.watch('nationalAddressShortCode') && <p className="rounded-md border p-3 text-sm">
                  {t('الرمز المختصر للعنوان الوطني', 'National address short code')}: {form.watch('nationalAddressShortCode')}
                  {' — '}{[form.watch('district'), form.watch('street'), form.watch('buildingNo'),
                    form.watch('postalCode'), form.watch('additionalNumber')].filter(Boolean).join('، ')}
                </p>}
                <Button data-testid="button-save-distributor" type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ', 'Save')}
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
            placeholder={t('البحث عن موزع...', 'Search distributors...')} 
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
              <TableHead>{t('الشركة', 'Company')}</TableHead>
              <TableHead>{t('المسؤول', 'Contact')}</TableHead>
              <TableHead>{t('رقم الجوال', 'Phone')}</TableHead>
              <TableHead>{t('المدينة', 'City')}</TableHead>
              <TableHead>{t('حد الائتمان', 'Credit Limit')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : distributors?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">{t('لا يوجد موزعين', 'No distributors found')}</TableCell></TableRow>
            ) : (
              distributors?.map((distributor) => (
                  <TableRow key={distributor.id} data-testid={`row-distributor-${distributor.id}`}>
                    <TableCell className="font-medium">{distributor.companyName}</TableCell>
                    <TableCell>{distributor.contactName}</TableCell>
                    <TableCell dir="ltr" className="text-right rtl:text-left">{distributor.phone}</TableCell>
                    <TableCell>{distributor.city || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {t('غير متاح', 'Not available')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={distributor.isActive ? "default" : "secondary"} className={distributor.isActive ? "bg-success text-success-foreground hover:bg-success/90" : "bg-muted text-muted-foreground"}>
                        {distributor.isActive ? t('نشط', 'Active') : t('غير نشط', 'Inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                      {hasPermission(currentUser, 'distributors', 'edit') && (
                        <DropdownMenuItem onClick={() => handleEdit(distributor)} disabled={updateMutation.isPending}><Edit2 className="h-4 w-4" />{t('تعديل', 'Edit')}</DropdownMenuItem>
                      )}
                      {hasPermission(currentUser, 'distributors', 'delete') && distributor.isActive && (
                        <DropdownMenuItem onClick={() => handleDisable(distributor.id)} disabled={disableMutation.isPending} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" />{t('تعطيل', 'Disable')}</DropdownMenuItem>
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
