import { useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/hooks/use-language';
import { Money } from '@/components/money';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Mail, 
  Landmark, 
  FileText, 
  Loader2, 
  CreditCard,
  Building,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { 
  useAdminGetBillingSettings, 
  useAdminUpdateBillingSettings, 
  getAdminGetBillingSettingsQueryKey,
  useAdminListPurchases,
  useGetAdminMe,
  type AdminBillingSettingsUpdate,
} from '@workspace/api-client-react';
import { getAdminToken } from '@/lib/auth-token';
import { hasPermission } from '@/lib/permissions';

export default function AdminWalletBilling() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: user } = useGetAdminMe();
  const isFinanceEdit = hasPermission(user, 'finance', 'edit');
  
  const { data: settings, isLoading: settingsLoading, isError: settingsError, refetch: retrySettings } = useAdminGetBillingSettings();
  const updateSettings = useAdminUpdateBillingSettings();
  
  const { data: purchases, isLoading: purchasesLoading, isError: purchasesError, refetch: retryPurchases } = useAdminListPurchases();
  
  const [editingSection, setEditingSection] = useState<'company' | 'email' | 'address' | 'bank' | 'payment' | null>(null);

  const [formData, setFormData] = useState<{
    companyName: string;
    taxNumber: string;
    streetAddress: string;
    city: string;
    country: string;
    invoiceEmail: string;
    bankName: string;
    accountHolder: string;
    accountNumber: string;
    iban: string;
    preferredPaymentMethod: string;
  }>({
    companyName: '',
    taxNumber: '',
    streetAddress: '',
    city: '',
    country: '',
    invoiceEmail: '',
    bankName: '',
    accountHolder: '',
    accountNumber: '',
    iban: '',
    preferredPaymentMethod: 'not_set',
  });

  const openEdit = (section: 'company' | 'email' | 'address' | 'bank' | 'payment') => {
    if (!settings) return;
    setFormData({
      companyName: settings.companyName ?? '',
      taxNumber: settings.taxNumber ?? '',
      streetAddress: settings.streetAddress ?? '',
      city: settings.city ?? '',
      country: settings.country ?? '',
      invoiceEmail: settings.invoiceEmail ?? '',
      bankName: settings.bankName ?? '',
      accountHolder: settings.accountHolder ?? '',
      accountNumber: settings.accountNumber ?? '',
      iban: settings.iban ?? '',
      preferredPaymentMethod: settings.preferredPaymentMethod ?? 'not_set',
    });
    setEditingSection(section);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    let payload: AdminBillingSettingsUpdate;
    const optional = (value: string) => value.trim() || null;
    if (editingSection === 'company') {
      payload = { companyName: optional(formData.companyName), taxNumber: optional(formData.taxNumber) };
    } else if (editingSection === 'email') {
      payload = { invoiceEmail: optional(formData.invoiceEmail) };
    } else if (editingSection === 'address') {
      payload = { streetAddress: optional(formData.streetAddress), city: optional(formData.city), country: optional(formData.country) };
    } else if (editingSection === 'bank') {
      payload = { bankName: optional(formData.bankName), accountHolder: optional(formData.accountHolder), accountNumber: optional(formData.accountNumber), iban: optional(formData.iban.toUpperCase()) };
    } else if (editingSection === 'payment') {
      payload = { preferredPaymentMethod: formData.preferredPaymentMethod === 'bank_transfer' ? 'bank_transfer' : 'not_set' };
    } else return;

    updateSettings.mutate({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminGetBillingSettingsQueryKey() });
        setEditingSection(null);
        toast({ title: t('تم تحديث الإعدادات', 'Settings updated') });
      },
      onError: () => toast({ title: t('تعذر التحديث', 'Update failed'), variant: 'destructive' })
    });
  };

  async function openInvoice(id: number) {
    try {
      const response = await fetch(`/api/admin/finance/purchases/${id}/invoice`, {
        headers: { Authorization: `Bearer ${getAdminToken() ?? ''}` },
      });
      if (!response.ok) throw new Error('Invoice unavailable');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      const extension = ({
        'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
      } as Record<string, string>)[response.headers.get('Content-Type')?.split(';')[0] ?? ''] ?? 'invoice';
      link.download = `supplier-invoice-${id}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast({ title: t('تعذر فتح الفاتورة', 'Could not open invoice'), variant: 'destructive' });
    }
  }

  const supplierPurchases = (purchases || []).filter(p => !p.archivedAt && !!p.invoiceObjectPath);
  if (user && !hasPermission(user, 'finance', 'view')) {
    return <div role="alert" className="rounded-lg border p-8">{t('ليس لديك صلاحية عرض المالية', 'You do not have finance viewing permission')}</div>;
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t('المحفظة والفواتير', 'Wallet & Billing')}</h1>
        <p className="text-muted-foreground">{t('إعدادات الفوترة ومستندات مشتريات مسك اللولو. بيانات سلة غير متصلة بهذا النظام.', 'Musk Ellolo billing settings and supplier documents. Salla data is not connected to this system.')}</p>
      </div>

      {/* Wallet Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center space-x-2 space-x-reverse text-primary">
                <CreditCard className="h-5 w-5" />
                 <span className="font-semibold">{t('رصيد المحفظة', 'Wallet balance')}</span>
              </div>
              <div>
                 <div className="text-xl font-bold">{t('غير متاح', 'Unavailable')}</div>
                 <p className="text-sm text-muted-foreground mt-1">{t('لا يوجد مصدر لرصيد محفظة المتجر أو رصيد سلة', 'No source for a store wallet or Salla balance')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center space-x-2 space-x-reverse">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold">{t('آخر حركة وسجل العمليات', 'Latest activity & transaction history')}</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{t('غير متاح', 'Unavailable')}</div>
                  <p className="text-sm text-muted-foreground mt-1">{t('لا توجد حركات محفظة موثقة في النظام', 'No wallet transactions are recorded in this system')}</p>
                </div>
                <Badge variant="outline" className="text-muted-foreground">N/A</Badge>
        </div>
        <Card><CardContent className="p-6"><div className="font-semibold">{t('رصيد المدفوعات', 'Payment balance')}</div><p className="mt-4 text-xl font-bold">{t('غير متاح', 'Unavailable')}</p><p className="mt-2 text-sm text-muted-foreground">{t('رصيد المدفوعات الإلكترونية أو عند الاستلام في سلة غير متصل', 'Salla online and cash-on-delivery payment balances are not connected')}</p></CardContent></Card>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Settings Grid */}
      {settingsLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : settingsError || !settings ? (
        <div role="alert" className="rounded-lg border border-destructive/50 p-6 text-sm">
          {t('تعذر تحميل إعدادات الفوترة', 'Could not load billing settings')}
          <Button variant="outline" className="ms-3" onClick={() => void retrySettings()}>{t('إعادة المحاولة', 'Retry')}</Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
          {/* Company Settings */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  {t('بيانات الشركة', 'Company Details')}
                </CardTitle>
              </div>
              {isFinanceEdit && (
                <Button variant="ghost" size="sm" onClick={() => openEdit('company')}>
                  {t('تعديل', 'Edit')}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground mb-1">{t('اسم الشركة', 'Company Name')}</div>
                  <div className="font-medium">{settings?.companyName || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">{t('الرقم الضريبي', 'Tax Number')}</div>
                  <div className="font-medium">{settings?.taxNumber || '-'}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" />{t('البريد الإلكتروني لاستلام الفواتير', 'Invoice receiving email')}</CardTitle>
              {isFinanceEdit && <Button variant="ghost" size="sm" onClick={() => openEdit('email')}>{t('تعديل', 'Edit')}</Button>}
            </CardHeader>
            <CardContent className="text-sm">
              <div>
                  <div className="text-muted-foreground mb-1 flex items-center gap-1">
                    {t('البريد الإلكتروني للفواتير', 'Invoice Email')}
                  </div>
                  <div className="font-medium break-all" dir="ltr">{settings.invoiceEmail || t('غير محدد', 'Not set')}</div>
              </div>
            </CardContent>
          </Card>

          {/* Address Settings */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                   {t('عنوان الشركة', 'Company address')}
                </CardTitle>
              </div>
              {isFinanceEdit && (
                <Button variant="ghost" size="sm" onClick={() => openEdit('address')}>
                  {t('تعديل', 'Edit')}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="col-span-2">
                  <div className="text-muted-foreground mb-1">{t('الشارع والحي', 'Street Address')}</div>
                  <div className="font-medium">{settings?.streetAddress || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">{t('المدينة', 'City')}</div>
                  <div className="font-medium">{settings?.city || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">{t('الدولة', 'Country')}</div>
                  <div className="font-medium">{settings?.country || '-'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bank Settings */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                  {t('الحساب البنكي', 'Bank Account')}
                </CardTitle>
              </div>
              {isFinanceEdit && (
                <Button variant="ghost" size="sm" onClick={() => openEdit('bank')}>
                  {t('تعديل', 'Edit')}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground mb-1">{t('البنك', 'Bank Name')}</div>
                  <div className="font-medium">{settings?.bankName || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">{t('صاحب الحساب', 'Account Holder')}</div>
                  <div className="font-medium">{settings?.accountHolder || '-'}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground mb-1">{t('الآيبان (IBAN)', 'IBAN')}</div>
                   <div className="font-medium font-mono text-[13px] break-all" dir="ltr">{settings.iban || '-'}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground mb-1">{t('رقم الحساب', 'Account Number')}</div>
                   <div className="font-medium font-mono text-[13px] break-all" dir="ltr">{settings.accountNumber || '-'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Method */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  {t('طريقة الدفع المفضلة', 'Preferred Payment Method')}
                </CardTitle>
              </div>
              {isFinanceEdit && (
                <Button variant="ghost" size="sm" onClick={() => openEdit('payment')}>
                  {t('تعديل', 'Edit')}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                {settings?.preferredPaymentMethod === 'bank_transfer' ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <div>
                      <div className="font-medium">{t('حوالة بنكية', 'Bank Transfer')}</div>
                       <div className="text-xs text-muted-foreground">{t('تفضيل محفوظ فقط؛ لا ينفذ أي مدفوعات', 'Saved preference only; no payments are executed')}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{t('غير محدد', 'Not Set')}</div>
                      <div className="text-xs text-muted-foreground">{t('لم يتم تعيين طريقة دفع مفضلة', 'No preferred payment method set')}</div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>{t('الاشتراكات المفعلة', 'Active subscriptions')}</CardTitle></CardHeader>
        <CardContent className="rounded-lg text-sm text-muted-foreground">{t('غير متاح — لا توجد بيانات لاشتراكات المنصة متصلة بهذا النظام.', 'Unavailable — no platform subscription source is connected to this system.')}</CardContent>
      </Card>

      {/* Invoices and Purchases */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Supplier Purchases */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">{t('فواتير مشتريات الموردين', 'Supplier purchase invoices')}</CardTitle>
            <CardDescription>{t('سجل المشتريات التي تحتوي على فواتير مرفقة', 'Purchase records with attached invoices')}</CardDescription>
          </CardHeader>
          <CardContent>
            {purchasesLoading ? (
              <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : purchasesError ? (
              <div role="alert" className="text-sm text-destructive">{t('تعذر تحميل فواتير المشتريات', 'Could not load purchase invoices')} <Button variant="outline" onClick={() => void retryPurchases()}>{t('إعادة المحاولة', 'Retry')}</Button></div>
            ) : supplierPurchases.length === 0 ? (
              <div className="text-center p-6 text-sm text-muted-foreground border border-dashed rounded-lg">
                {t('لا توجد فواتير مشتريات', 'No purchase invoices found')}
              </div>
            ) : (
              <div className="space-y-4">
                {supplierPurchases.map((purchase) => (
                   <div key={purchase.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="bg-muted p-2 rounded-md">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{purchase.title}</div>
                        <div className="text-xs text-muted-foreground">{purchase.purchaseDate}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="font-semibold text-sm"><Money value={purchase.amount} lang={lang} /></div>
                      {purchase.invoiceObjectPath && ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(purchase.invoiceContentType ?? '') && (
                        <Button variant="outline" size="sm" onClick={() => void openInvoice(purchase.id)}>
                          {t('تنزيل المستند', 'Download document')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Platform Invoices */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">{t('فواتير المنصة', 'Platform Invoices')}</CardTitle>
            <CardDescription>{t('فواتير اشتراك المنصة ليست فواتير الموردين أو المبيعات', 'Platform subscriptions are separate from supplier and sales invoices')}</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="text-center p-12 text-sm text-muted-foreground border border-dashed rounded-lg">
                <AlertCircle className="h-8 w-8 mx-auto mb-3 opacity-50" />
                 {t('غير متاح — لا يوجد مصدر لفواتير اشتراك المنصة', 'Unavailable — no platform subscription invoice source')}
              </div>
          </CardContent>
        </Card>
      </div>
      {hasPermission(user, 'invoices', 'view') && <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">{t('فواتير المبيعات الصادرة:', 'Issued sales invoices:')} <Link href="/admin/sales/online" className="text-primary underline">{t('الأفراد', 'Individuals')}</Link><Link href="/admin/sales/companies" className="text-primary underline">{t('الشركات', 'Companies')}</Link><Link href="/admin/sales/exhibitions" className="text-primary underline">{t('المعارض', 'Exhibitions')}</Link></p>}

      {/* Edit Dialog */}
      <Dialog open={!!editingSection} onOpenChange={(open) => !open && setEditingSection(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle>
              {editingSection === 'company' && t('تعديل بيانات الشركة', 'Edit Company Details')}
               {editingSection === 'email' && t('البريد الإلكتروني لاستلام الفواتير', 'Invoice receiving email')}
               {editingSection === 'address' && t('تعديل عنوان الشركة', 'Edit Company Address')}
              {editingSection === 'bank' && t('تعديل الحساب البنكي', 'Edit Bank Account')}
              {editingSection === 'payment' && t('تعديل طريقة الدفع', 'Edit Payment Method')}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleUpdate} className="space-y-4 pt-2">
            {editingSection === 'company' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">{t('اسم الشركة', 'Company Name')}</Label>
                  <Input id="companyName" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxNumber">{t('الرقم الضريبي', 'Tax Number')}</Label>
                  <Input id="taxNumber" pattern="[0-9]{15}" value={formData.taxNumber} onChange={e => setFormData({...formData, taxNumber: e.target.value})} />
                </div>
              </div>
            )}
            {editingSection === 'email' && <div className="space-y-2">
              <Label htmlFor="invoiceEmail">{t('البريد الإلكتروني للفواتير', 'Invoice Email')}</Label>
              <Input id="invoiceEmail" type="email" maxLength={254} value={formData.invoiceEmail} onChange={e => setFormData({...formData, invoiceEmail: e.target.value})} />
            </div>}

            {editingSection === 'address' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="streetAddress">{t('الشارع والحي', 'Street Address')}</Label>
                  <Input id="streetAddress" value={formData.streetAddress} onChange={e => setFormData({...formData, streetAddress: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">{t('المدينة', 'City')}</Label>
                    <Input id="city" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">{t('الدولة', 'Country')}</Label>
                    <Input id="country" value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} />
                  </div>
                </div>
              </div>
            )}

            {editingSection === 'bank' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bankName">{t('البنك', 'Bank Name')}</Label>
                  <Input id="bankName" value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountHolder">{t('صاحب الحساب', 'Account Holder')}</Label>
                  <Input id="accountHolder" value={formData.accountHolder} onChange={e => setFormData({...formData, accountHolder: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="iban">{t('الآيبان (IBAN)', 'IBAN')}</Label>
                   <Input id="iban" dir="ltr" className="text-left" pattern="SA[0-9]{22}" title={t('صيغة آيبان سعودي: SA متبوعة بـ22 رقماً', 'Saudi IBAN: SA followed by 22 digits')} value={formData.iban} onChange={e => setFormData({...formData, iban: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">{t('رقم الحساب', 'Account Number')}</Label>
                   <Input id="accountNumber" dir="ltr" className="text-left" pattern="[0-9]{6,24}" value={formData.accountNumber} onChange={e => setFormData({...formData, accountNumber: e.target.value})} />
                </div>
              </div>
            )}

            {editingSection === 'payment' && (
              <div className="space-y-4">
                <div className="space-y-2">
                   <Label htmlFor="preferredPaymentMethod">{t('طريقة الدفع', 'Payment Method')}</Label>
                  <select 
                     id="preferredPaymentMethod"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={formData.preferredPaymentMethod} 
                    onChange={e => setFormData({...formData, preferredPaymentMethod: e.target.value})}
                  >
                    <option value="not_set">{t('غير محدد', 'Not Set')}</option>
                    <option value="bank_transfer">{t('حوالة بنكية', 'Bank Transfer')}</option>
                  </select>
                   <p className="text-xs text-muted-foreground">{t('لا يمكن إضافة بطاقة أو تنفيذ دفعة من هذه الصفحة', 'Cards and actual payments are not supported here')}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setEditingSection(null)}>
                {t('إلغاء', 'Cancel')}
              </Button>
              <Button type="submit" disabled={updateSettings.isPending}>
                {updateSettings.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t('حفظ', 'Save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
