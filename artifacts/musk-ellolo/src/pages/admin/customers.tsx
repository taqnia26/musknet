import { useState } from 'react';
import { useAdminListCustomers, useAdminUpdateCustomer, useGetAdminMe } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Edit2, MoreHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useQueryClient } from '@tanstack/react-query';
import { getAdminListCustomersQueryKey } from '@workspace/api-client-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const customerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  isActive: z.boolean().default(true),
});

export default function AdminCustomers() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  const queryClient = useQueryClient();
  const { data: currentUser } = useGetAdminMe();
  const { data: customers, isLoading } = useAdminListCustomers({ search });
  const updateMutation = useAdminUpdateCustomer();

  const form = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', email: null, isActive: true }
  });

  const onSubmit = (data: z.infer<typeof customerSchema>) => {
    if (selectedCustomer) {
      updateMutation.mutate({ id: selectedCustomer.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListCustomersQueryKey() });
          setIsDialogOpen(false);
          setSelectedCustomer(null);
        }
      });
    }
  };

  const handleEdit = (customer: any) => {
    setSelectedCustomer(customer);
    form.reset({
      name: customer.name,
      email: customer.email,
      isActive: customer.isActive
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('الأفراد', 'Individuals')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة حسابات عملاء المتجر', 'Manage storefront customer accounts')}</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(v) => { setIsDialogOpen(v); if (!v) { setSelectedCustomer(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('تعديل بيانات العميل', 'Edit Customer')}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>{t('الاسم', 'Name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>{t('البريد الإلكتروني', 'Email')}</FormLabel><FormControl><Input {...field} value={field.value || ''} dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                  {t('حفظ التغييرات', 'Save Changes')}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground rtl:right-2.5 rtl:left-auto" />
          <Input 
            placeholder={t('البحث برقم الهاتف أو الاسم...', 'Search customers...')} 
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
              <TableHead>{t('الهاتف', 'Phone')}</TableHead>
              <TableHead>{t('البريد الإلكتروني', 'Email')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : customers?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">{t('لا يوجد عملاء', 'No customers found')}</TableCell></TableRow>
            ) : (
              customers?.map((customer) => (
                <TableRow key={customer.id} data-testid={`row-customer-${customer.id}`}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell dir="ltr" className="text-right rtl:text-left">{customer.phone}</TableCell>
                  <TableCell>{customer.email || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={customer.isActive ? "default" : "destructive"} className={customer.isActive ? "bg-success text-success-foreground hover:bg-success/90" : ""}>
                      {customer.isActive ? t('نشط', 'Active') : t('موقوف', 'Suspended')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {hasPermission(currentUser, 'customers', 'edit') && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(customer)} disabled={updateMutation.isPending}><Edit2 className="h-4 w-4" />{t('تعديل', 'Edit')}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
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
