import { useState } from 'react';
import { useAdminListDistributors, useAdminCreateDistributor, useAdminUpdateDistributor, useAdminDisableDistributor, useGetAdminMe } from '@workspace/api-client-react';
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
import { getAdminListDistributorsQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

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
      message: 'رقم الهاتف غير صالح. استخدم 8-15 رقماً (مثال: ‎+966 50 123 4567) / Invalid phone. Use 8-15 digits (e.g. +966 50 123 4567).',
    }),
  ),
  email: z.union([z.string().email(), z.literal('')]).nullable().optional(),
  city: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  taxNumber: z.string().nullable().optional(),
  commercialRegistrationNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

export default function AdminDistributors() {
  const { t } = useLanguage();
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
    resolver: zodResolver(distributorSchema),
    defaultValues: { companyName: '', contactName: '', phone: '', email: null, city: null, address: null, taxNumber: null, commercialRegistrationNumber: null, notes: null, isActive: true }
  });

  const onSubmit = (data: z.infer<typeof distributorSchema>) => {
    const payload = {
      ...data,
      companyName: data.companyName.trim(),
      contactName: data.contactName.trim(),
      phone: normalizePhone(data.phone),
      email: normalizeOptional(data.email),
      city: normalizeOptional(data.city),
      address: normalizeOptional(data.address),
      taxNumber: normalizeOptional(data.taxNumber),
      commercialRegistrationNumber: normalizeOptional(data.commercialRegistrationNumber),
      notes: normalizeOptional(data.notes),
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
      createMutation.mutate({ data: payload }, {
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
            <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? t('تعديل موزع', 'Edit Distributor') : t('إضافة موزع', 'Add Distributor')}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit, (errors) => {
                  const labels: Record<string, string> = {
                    companyName: t('اسم الشركة', 'Company name'),
                    contactName: t('اسم المسؤول', 'Contact name'),
                    phone: t('رقم الهاتف', 'Phone'),
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
                <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>{t('رقم الهاتف', 'Phone')}</FormLabel><FormControl><Input {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>{t('البريد الإلكتروني', 'Email')}</FormLabel><FormControl><Input {...field} value={field.value || ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="city" render={({ field }) => (
                    <FormItem><FormLabel>{t('المدينة', 'City')}</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="taxNumber" render={({ field }) => (
                    <FormItem><FormLabel>{t('الرقم الضريبي', 'Tax Number')}</FormLabel><FormControl><Input {...field} value={field.value || ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem><FormLabel>{t('العنوان', 'Address')}</FormLabel><FormControl><Input {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                )} />
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
              <TableHead>{t('الهاتف', 'Phone')}</TableHead>
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
                    <div className="flex justify-end gap-1">
                      {hasPermission(currentUser, 'distributors', 'edit') && (
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(distributor)} data-testid={`btn-edit-distributor-${distributor.id}`}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      {hasPermission(currentUser, 'distributors', 'delete') && distributor.isActive && (
                        <Button variant="ghost" size="icon" onClick={() => handleDisable(distributor.id)} data-testid={`btn-disable-distributor-${distributor.id}`} className="text-destructive">
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
