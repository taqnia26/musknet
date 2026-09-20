import { useState } from 'react';
import { useAdminListStaff, useAdminCreateStaff, useAdminUpdateStaff, useAdminDisableStaff, useGetAdminMe, useAdminListPermissions, useAdminSetStaffPermissions } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Edit2, Trash2, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useQueryClient } from '@tanstack/react-query';
import { getAdminListStaffQueryKey } from '@workspace/api-client-react';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';

import { useToast } from '@/hooks/use-toast';

const staffSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional().or(z.literal('')),
  isSuperAdmin: z.boolean().default(false),
  isActive: z.boolean().default(true),
  permissionIds: z.array(z.number()).default([]),
});

const permissionModuleLabels: Record<string, { ar: string; en: string }> = {
  dashboard: { ar: 'لوحة القيادة', en: 'Dashboard' },
  products: { ar: 'المنتجات', en: 'Products' },
  categories: { ar: 'الأقسام', en: 'Categories' },
  orders: { ar: 'الطلبات', en: 'Orders' },
  invoices: { ar: 'الفواتير', en: 'Invoices' },
  coupons: { ar: 'الكوبونات', en: 'Coupons' },
  customers: { ar: 'العملاء', en: 'Customers' },
  inventory: { ar: 'المخزون', en: 'Inventory' },
  distributors: { ar: 'الموزعين', en: 'Distributors' },
  staff: { ar: 'فريق العمل', en: 'Staff' },
  hr: { ar: 'الموارد البشرية', en: 'Human Resources' },
  finance: { ar: 'المالية', en: 'Finance' },
  accounting: { ar: 'المحاسبة', en: 'Accounting' },
  manufacturing: { ar: 'التصنيع', en: 'Manufacturing' },
  exhibitions: { ar: 'المعارض', en: 'Exhibitions' },
};

const permissionActionLabels: Record<string, { ar: string; en: string }> = {
  view: { ar: 'مشاهدة', en: 'View' },
  edit: { ar: 'تعديل', en: 'Edit' },
  delete: { ar: 'حذف', en: 'Delete' },
};
const permissionActionOrder: Record<string, number> = { view: 0, edit: 1, delete: 2 };

export default function AdminStaff() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { data: currentUser } = useGetAdminMe();
  const { data: staff, isLoading } = useAdminListStaff();
  const { data: permissions } = useAdminListPermissions();

  const createMutation = useAdminCreateStaff();
  const updateMutation = useAdminUpdateStaff();
  const disableMutation = useAdminDisableStaff();
  const setPermissionsMutation = useAdminSetStaffPermissions();

  const handleDisable = (id: number) => {
    if (confirm(t('هل أنت متأكد من تعطيل/حذف هذا المستخدم؟', 'Are you sure you want to disable/delete this user?'))) {
      disableMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getAdminListStaffQueryKey() });
          toast({ title: t('تم تعطيل المستخدم بنجاح', 'User disabled successfully') });
        },
        onError: () => toast({ title: t('خطأ في تعطيل المستخدم', 'Error disabling user'), variant: 'destructive' })
      });
    }
  };

  const form = useForm<z.infer<typeof staffSchema>>({
    resolver: zodResolver(staffSchema),
    defaultValues: { name: '', email: '', password: '', isSuperAdmin: false, isActive: true, permissionIds: [] }
  });

  const onSubmit = (data: z.infer<typeof staffSchema>) => {
    const payload = { ...data };
    if (!payload.password) delete payload.password; // Don't send empty password

    const handlePermissions = (staffId: number) => {
      if (!data.isSuperAdmin) {
        setPermissionsMutation.mutate({ id: staffId, data: { permissionIds: data.permissionIds } }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getAdminListStaffQueryKey() });
            setIsDialogOpen(false);
            setEditingId(null);
            form.reset();
            toast({ title: t('تم الحفظ بنجاح', 'Saved successfully') });
          },
          onError: () => {
            toast({ title: t('خطأ في حفظ الصلاحيات', 'Error saving permissions'), variant: 'destructive' });
          }
        });
      } else {
        queryClient.invalidateQueries({ queryKey: getAdminListStaffQueryKey() });
        setIsDialogOpen(false);
        setEditingId(null);
        form.reset();
        toast({ title: t('تم الحفظ بنجاح', 'Saved successfully') });
      }
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload as any }, {
        onSuccess: () => handlePermissions(editingId),
        onError: () => toast({ title: t('خطأ في حفظ المستخدم', 'Error saving user'), variant: 'destructive' })
      });
    } else {
      createMutation.mutate({ data: payload as any }, {
        onSuccess: (res: any) => handlePermissions(res.id),
        onError: () => toast({ title: t('خطأ في إنشاء المستخدم', 'Error creating user'), variant: 'destructive' })
      });
    }
  };

  const handleEdit = (user: any) => {
    setEditingId(user.id);
    
    // Map string keys from user.permissions to their numeric IDs
    const currentPermIds = (user.permissions || [])
      .map((key: string) => {
        const found = permissions?.find(p => p.key === key);
        return found ? found.id : null;
      })
      .filter((id: number | null) => id !== null);

    form.reset({
      name: user.name,
      email: user.email,
      password: '',
      isSuperAdmin: user.isSuperAdmin,
      isActive: user.isActive,
      permissionIds: currentPermIds
    });
    setIsDialogOpen(true);
  };

  if (currentUser && !currentUser.isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{t('غير مصرح لك', 'Access Denied')}</h2>
          <p className="text-muted-foreground">{t('هذه الصفحة متاحة فقط للمدراء العامين', 'This page is only available to super admins')}</p>
        </div>
      </div>
    );
  }

  const filteredStaff = staff?.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()));
  const groupedPermissions = (permissions ?? []).reduce((groups, permission) => {
    (groups[permission.module] ??= []).push(permission);
    return groups;
  }, {} as Record<string, NonNullable<typeof permissions>>);
  const permissionModules = Object.keys(groupedPermissions).sort((a, b) => {
    const moduleNames = Object.keys(permissionModuleLabels);
    const aIndex = moduleNames.indexOf(a);
    const bIndex = moduleNames.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('فريق العمل', 'Staff')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة حسابات وصلاحيات فريق العمل', 'Manage staff accounts and permissions')}</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(v) => { setIsDialogOpen(v); if (!v) { setEditingId(null); form.reset(); } }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-staff">
              <Plus className="h-4 w-4 ms-2 rtl:ms-0 rtl:me-2" />
              {t('إضافة مستخدم', 'Add User')}
            </Button>
          </DialogTrigger>
          <DialogContent
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            className="max-h-[90vh] max-w-3xl overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle>{editingId ? t('تعديل مستخدم', 'Edit User') : t('إضافة مستخدم', 'Add User')}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>{t('الاسم', 'Name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>{t('البريد الإلكتروني', 'Email')}</FormLabel><FormControl><Input {...field} dir="ltr" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('كلمة المرور', 'Password')} {editingId && <span className="text-muted-foreground text-xs">({t('اتركه فارغاً لعدم التغيير', 'leave blank to keep current')})</span>}</FormLabel>
                     <FormControl><Input {...field} type="password" autoComplete="new-password" dir="ltr" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex items-center gap-6 pt-4">
                  <FormField control={form.control} name="isSuperAdmin" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <FormLabel className="m-0 cursor-pointer">{t('مدير عام', 'Super Admin')}</FormLabel>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="isActive" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      <FormLabel className="m-0 cursor-pointer">{t('حساب نشط', 'Active Account')}</FormLabel>
                    </FormItem>
                  )} />
                </div>

                {!form.watch('isSuperAdmin') && permissions && (
                  <div className="pt-4 border-t mt-4">
                    <div className="mb-3">
                      <div className="text-sm font-semibold text-foreground">{t('الصلاحيات حسب القسم', 'Permissions by section')}</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('اختر الإجراء المطلوب داخل كل قسم رئيسي', 'Choose the required actions inside each main section')}
                      </p>
                    </div>
                    <div className="max-h-[46vh] space-y-3 overflow-y-auto pe-1">
                      {permissionModules.map((module) => {
                        const modulePermissions = [...groupedPermissions[module]].sort(
                          (a, b) => (permissionActionOrder[a.action] ?? 99) - (permissionActionOrder[b.action] ?? 99),
                        );
                        const moduleLabel = permissionModuleLabels[module];
                        return (
                          <section key={module} className="rounded-xl border border-border/80 bg-muted/20 p-3">
                            <div className="mb-3 flex items-center justify-between gap-3 border-b border-border/60 pb-2">
                              <h3 className="text-sm font-bold text-foreground">
                                {moduleLabel
                                  ? t(moduleLabel.ar, moduleLabel.en)
                                  : module}
                              </h3>
                              <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {modulePermissions.length} {t('صلاحيات', 'permissions')}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {modulePermissions.map((perm) => (
                                <FormField
                                  key={perm.id}
                                  control={form.control}
                                  name="permissionIds"
                                  render={({ field }) => (
                                    <FormItem className="flex min-h-10 flex-row items-center gap-3 space-y-0 rounded-lg border border-border/60 bg-background/70 px-3 py-2 transition-colors hover:bg-background">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(perm.id)}
                                          onCheckedChange={(checked) => (
                                            checked
                                              ? field.onChange([...field.value, perm.id])
                                              : field.onChange(field.value?.filter((value) => value !== perm.id))
                                          )}
                                        />
                                      </FormControl>
                                      <FormLabel className="cursor-pointer text-sm font-medium">
                                        {permissionActionLabels[perm.action]
                                          ? t(permissionActionLabels[perm.action].ar, permissionActionLabels[perm.action].en)
                                          : perm.action}
                                      </FormLabel>
                                    </FormItem>
                                  )}
                                />
                              ))}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Button type="submit" className="w-full mt-4" disabled={createMutation.isPending || updateMutation.isPending}>
                  {t('حفظ', 'Save')}
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
            placeholder={t('البحث عن مستخدم...', 'Search staff...')} 
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
              <TableHead>{t('البريد الإلكتروني', 'Email')}</TableHead>
              <TableHead>{t('الدور', 'Role')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground animate-pulse">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
            ) : filteredStaff?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">{t('لا يوجد مستخدمين', 'No users found')}</TableCell></TableRow>
            ) : (
              filteredStaff?.map((user) => (
                <TableRow key={user.id} data-testid={`row-staff-${user.id}`}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={user.isSuperAdmin ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}>
                      {user.isSuperAdmin ? t('مدير عام', 'Super Admin') : t('مستخدم', 'User')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "default" : "destructive"} className={user.isActive ? "bg-success text-success-foreground hover:bg-success/90" : ""}>
                      {user.isActive ? t('نشط', 'Active') : t('موقوف', 'Suspended')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(user)} data-testid={`btn-edit-staff-${user.id}`} disabled={user.id === currentUser?.id}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      {user.isActive && (
                        <Button variant="ghost" size="icon" onClick={() => handleDisable(user.id)} data-testid={`btn-disable-staff-${user.id}`} disabled={user.id === currentUser?.id} className="text-destructive">
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
