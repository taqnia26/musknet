import { useState } from 'react';
import {
  useAdminListCustomers, useAdminCreateCustomer, useAdminUpdateCustomer, useGetAdminMe,
  getAdminListCustomersQueryKey, type AdminCustomer,
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Edit2, MoreHorizontal, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useQueryClient } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { createCustomerSchema, editCustomerSchema, customerPayload, customerCreateError, type CreateCustomerValues, type EditCustomerValues } from '@/lib/customer-create';
import { emptyIntakeAddress, type IntakeAddressField } from '@/lib/intake-address';
import { IntakeAddressFields } from '@/components/admin/intake-address-fields';

export default function AdminCustomers() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'create' | 'edit' | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<AdminCustomer | null>(null);
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetAdminMe();
  const { data: customers, isLoading } = useAdminListCustomers({ search });
  const createMutation = useAdminCreateCustomer();
  const updateMutation = useAdminUpdateCustomer();
  const createForm = useForm<CreateCustomerValues>({
    resolver: zodResolver(createCustomerSchema), defaultValues: { name: '', phone: '', email: '', profileAddress: emptyIntakeAddress() },
  });
  const editForm = useForm<EditCustomerValues>({
    resolver: zodResolver(editCustomerSchema), defaultValues: { name: '', email: '', isActive: true },
  });
  const errorMessage = (error: unknown, fallback: string) => {
    const cause = error as { status?: number; data?: { error?: string } };
    if (cause.status === 409) return t('رقم الجوال مسجل لعميل آخر', 'This phone number already belongs to a customer');
    return cause.data?.error ?? fallback;
  };
  const close = () => {
    setMode(null);
    setSelectedCustomer(null);
    createForm.reset({ name: '', phone: '', email: '', profileAddress: emptyIntakeAddress() });
    editForm.reset({ name: '', email: '', isActive: true });
  };
  const openCreate = () => {
    createForm.reset({ name: '', phone: '', email: '', profileAddress: emptyIntakeAddress() });
    setSelectedCustomer(null);
    setMode('create');
  };
  const openEdit = (customer: AdminCustomer) => {
    setSelectedCustomer(customer);
    editForm.reset({ name: customer.name, email: customer.email ?? '', isActive: customer.isActive });
    setMode('edit');
  };
  const onCreate = (data: CreateCustomerValues) => {
    if (createMutation.isPending) return;
    createMutation.mutate({
      data: customerPayload(data),
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListCustomersQueryKey() });
        close();
        toast({ title: t('تمت إضافة العميل', 'Customer added') });
      },
      onError: (error) => toast({
        title: t('تعذر إضافة العميل', 'Could not add customer'),
         description: customerCreateError(error, t('تحقق من البيانات والصلاحيات ثم حاول مرة أخرى', 'Check the details and permissions, then try again'), t('رقم الجوال مسجل لعميل آخر', 'This phone number already belongs to a customer')),
        variant: 'destructive',
      }),
    });
  };
  const onEdit = (data: EditCustomerValues) => {
    if (!selectedCustomer || updateMutation.isPending) return;
    updateMutation.mutate({
      id: selectedCustomer.id,
      data: { name: data.name.trim(), email: data.email.trim() || null, isActive: data.isActive },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListCustomersQueryKey() });
        close();
        toast({ title: t('تم حفظ تعديلات العميل', 'Customer changes saved') });
      },
      onError: (error) => toast({
        title: t('تعذر حفظ التعديلات', 'Could not save changes'),
        description: errorMessage(error, t('حاول مرة أخرى', 'Please try again')),
        variant: 'destructive',
      }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('الأفراد', 'Individuals')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة حسابات عملاء المتجر', 'Manage storefront customer accounts')}</p>
        </div>
        {hasPermission(currentUser, 'customers', 'edit') && (
          <Button data-testid="button-create-customer" onClick={openCreate}>
            <Plus className="h-4 w-4 me-2" />{t('إضافة عميل', 'Add Customer')}
          </Button>
        )}
      </div>

      <Dialog open={mode !== null} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? t('إضافة عميل', 'Add Customer') : t('تعديل بيانات العميل', 'Edit Customer')}</DialogTitle>
          </DialogHeader>
          {mode === 'create' ? (
            <Form {...createForm}>
               <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
                <FormField control={createForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>{t('اسم العميل *', 'Customer name *')}</FormLabel><FormControl><Input {...field} data-testid="input-customer-name" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>{t('رقم الجوال *', 'Phone number *')}</FormLabel><FormControl><Input {...field} data-testid="input-customer-phone" type="tel" dir="ltr" placeholder="966501234567" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="email" render={({ field }) => (
                   <FormItem><FormLabel>{t('البريد الإلكتروني *', 'Email *')}</FormLabel><FormControl><Input {...field} type="email" dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
                 <IntakeAddressFields id="customer-address" value={createForm.watch('profileAddress')}
                   onChange={(key: IntakeAddressField, next) => createForm.setValue(`profileAddress.${key}`, next, { shouldValidate: true })}
                   errors={Object.fromEntries(Object.entries(createForm.formState.errors.profileAddress ?? {}).map(([key, error]) => [key, typeof error === 'object' && error && 'message' in error ? String(error.message) : undefined]))} />
                <Button data-testid="button-save-customer" type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('إضافة عميل', 'Add Customer')}
                </Button>
              </form>
            </Form>
          ) : mode === 'edit' ? (
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
                <FormField control={editForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>{t('الاسم', 'Name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>{t('البريد الإلكتروني', 'Email')}</FormLabel><FormControl><Input {...field} type="email" dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
                 {selectedCustomer?.profileAddress && <div className="rounded-md border p-3 text-sm">
                   <strong>{t('عنوان الملف', 'Profile address')}</strong>
                   <p>{[selectedCustomer.profileAddress.country, selectedCustomer.profileAddress.city,
                     selectedCustomer.profileAddress.nationalAddressShortCode, selectedCustomer.profileAddress.district,
                     selectedCustomer.profileAddress.street, selectedCustomer.profileAddress.buildingNo,
                     selectedCustomer.profileAddress.postalCode, selectedCustomer.profileAddress.additionalNumber,
                     selectedCustomer.profileAddress.additionalInfo].filter(Boolean).join('، ')}</p>
                 </div>}
                <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t('جاري الحفظ...', 'Saving...') : t('حفظ التغييرات', 'Save Changes')}
                </Button>
              </form>
            </Form>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input placeholder={t('البحث برقم الجوال أو الاسم...', 'Search customers...')} className="pl-9 rtl:pr-9 rtl:pl-3" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="border rounded-md">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t('الاسم', 'Name')}</TableHead>
            <TableHead>{t('رقم الجوال', 'Phone')}</TableHead>
            <TableHead>{t('البريد الإلكتروني', 'Email')}</TableHead>
            <TableHead>{t('الحالة', 'Status')}</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : customers?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">{t('لا يوجد عملاء', 'No customers found')}</TableCell></TableRow>
            ) : customers?.map((customer) => (
              <TableRow key={customer.id} data-testid={`row-customer-${customer.id}`}>
                <TableCell className="font-medium">{customer.name}</TableCell>
                <TableCell dir="ltr" className="text-right rtl:text-left">{customer.phone}</TableCell>
                <TableCell>{customer.email || '-'}</TableCell>
                <TableCell><Badge variant={customer.isActive ? 'default' : 'destructive'} className={customer.isActive ? 'bg-success text-success-foreground hover:bg-success/90' : ''}>
                  {customer.isActive ? t('نشط', 'Active') : t('موقوف', 'Suspended')}
                </Badge></TableCell>
                <TableCell>{hasPermission(currentUser, 'customers', 'edit') && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEdit(customer)} disabled={updateMutation.isPending}><Edit2 className="h-4 w-4" />{t('تعديل', 'Edit')}</DropdownMenuItem></DropdownMenuContent>
                  </DropdownMenu>
                )}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}