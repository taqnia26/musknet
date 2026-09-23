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
import { 
  MapPin, 
  Mail, 
  Landmark, 
  FileText, 
  Loader2, 
  CreditCard,
  Building,
  ChevronDown,
  Wallet,
  Banknote,
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

export const hasSupplierInvoice = (purchase: { archivedAt?: unknown; invoiceObjectPath?: string | null; invoiceContentType?: string | null }) =>
  !purchase.archivedAt && !!purchase.invoiceObjectPath &&
  ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(purchase.invoiceContentType ?? '');

export function WalletBalanceCards({ t }: { t: (ar: string, en: string) => string }) {
  const balances = [
    { key: 'store', icon: Wallet, title: t('رصيد المتجر', 'Store balance'), note: t('لا يوجد مصدر لرصيد المتجر', 'No store balance source is connected') },
    { key: 'online', icon: CreditCard, title: t('رصيد المدفوعات الإلكترونية', 'Online payments balance'), note: t('رصيد المدفوعات الإلكترونية غير متصل', 'Online payment balance is not connected') },
    { key: 'cod', icon: Banknote, title: t('رصيد الدفع عند الاستلام', 'Cash on delivery balance'), note: t('رصيد الدفع عند الاستلام غير متصل', 'Cash on delivery balance is not connected') },
  ];
  return <section aria-label={t('الأرصدة', 'Balances')} className="grid gap-4 md:grid-cols-3" data-testid="wallet-balances">
    {balances.map(({ key, icon: Icon, title, note }) => (
      <Card key={key} className="min-w-0" data-testid={`card-balance-${key}`}>
        <CardContent className="flex h-full min-h-44 flex-col p-5 sm:p-6">
          <div className="flex items-center gap-3 font-semibold"><span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></span>{title}</div>
          <div className="mt-6 text-xl font-semibold" data-testid={`status-balance-${key}`}>{t('غير متاح', 'Unavailable')}</div>
          <p className="mt-1 text-sm text-muted-foreground">{note}</p>
        </CardContent>
      </Card>
    ))}
  </section>;
}

function UnavailableTable({ title, columns, message, testId }: { title: string; columns: string[]; message: string; testId: string }) {
  return <Card data-testid={testId} className="min-w-0">
    <CardHeader><CardTitle className="text-lg">{title}</CardTitle></CardHeader>
    <CardContent>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground"><tr>{columns.map((column) => <th scope="col" key={column} className="px-4 py-3 text-start font-medium">{column}</th>)}</tr></thead>
          <tbody><tr><td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">{message}</td></tr></tbody>
        </table>
      </div>
      <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground md:hidden">{message}</p>
    </CardContent>
  </Card>;
}

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

  const supplierPurchases = (purchases || []).filter(hasSupplierInvoice);
  if (user && !hasPermission(user, 'finance', 'view')) {
    return <div role="alert" className="rounded-lg border p-8">{t('ليس لديك صلاحية عرض المالية', 'You do not have finance viewing permission')}</div>;
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t('المحفظة والفواتير', 'Wallet & Billing')}</h1>
        <p className="text-muted-foreground">{t('إعدادات الفوترة ومستندات مشتريات مسك اللولو. بيانات سلة غير متصلة بهذا النظام.', 'Musk Ellolo billing settings and supplier documents. Salla data is not connected to this system.')}</p>
      </div>

      <WalletBalanceCards t={t} />

      <section aria-label={t('إعدادات الفوترة', 'Billing settings')} data-testid="billing-settings">
        <Card>
          <CardHeader><CardTitle>{t('إعدادات الفوترة', 'Billing settings')}</CardTitle></CardHeader>
          <CardContent className="p-0">
            {settingsLoading ? <div role="status" className="p-8 text-muted-foreground">{t('جارٍ تحميل إعدادات الفوترة', 'Loading billing settings')} <Loader2 className="inline h-5 w-5 animate-spin" /></div>
              : settingsError || !settings ? <div role="alert" className="p-6">{t('تعذر تحميل إعدادات الفوترة', 'Could not load billing settings')} <Button variant="outline" onClick={() => void retrySettings()}>{t('إعادة المحاولة', 'Retry')}</Button></div>
              : [
                { key: 'payment', icon: CreditCard, title: t('طريقة الدفع الافتراضية', 'Default payment method'), summary: settings.preferredPaymentMethod === 'bank_transfer' ? t('حوالة بنكية (تفضيل فقط)', 'Bank transfer (preference only)') : t('غير محدد', 'Not set'), details: t('هذا تفضيل محفوظ فقط؛ لا تنفذ هذه الصفحة مدفوعات.', 'This is a saved preference only; this page does not execute payments.'), editable: true },
                { key: 'card', icon: CreditCard, title: t('البطاقة الائتمانية', 'Credit card'), summary: t('غير متاحة', 'Unavailable'), details: t('لا يمكن إضافة بطاقة أو تنفيذ دفعات هنا.', 'Cards and actual payments are not supported here.'), editable: false },
                { key: 'bank', icon: Landmark, title: t('الحساب البنكي', 'Bank account'), summary: isFinanceEdit ? (settings.bankName || t('غير محدد', 'Not set')) : t('البيانات مخفية', 'Details hidden'), details: isFinanceEdit ? `${settings.bankName || '-'} · ${settings.accountHolder || '-'} · ${settings.iban || '-'} · ${settings.accountNumber || '-'}` : t('تظهر بيانات الحساب فقط لمن يملك صلاحية تعديل المالية.', 'Bank details are visible only to finance editors.'), editable: true },
                { key: 'email', icon: Mail, title: t('بريد الفواتير', 'Invoice email'), summary: settings.invoiceEmail || t('غير محدد', 'Not set'), details: settings.invoiceEmail || t('غير محدد', 'Not set'), editable: true },
                { key: 'address', icon: MapPin, title: t('عنوان الشركة', 'Company address'), summary: [settings.streetAddress, settings.city, settings.country].filter(Boolean).join('، ') || t('غير محدد', 'Not set'), details: [settings.streetAddress, settings.city, settings.country].filter(Boolean).join('، ') || t('غير محدد', 'Not set'), editable: true },
                { key: 'company', icon: Building, title: t('بيانات الشركة', 'Company details'), summary: settings.companyName || t('غير محدد', 'Not set'), details: `${settings.companyName || '-'} · ${t('الرقم الضريبي', 'Tax number')}: ${settings.taxNumber || '-'}`, editable: true },
              ].map(({ key, icon: Icon, title, summary, details, editable }) => (
                <details key={key} className="group border-t px-5 py-1" data-testid={`billing-row-${key}`}>
                  <summary className="flex min-w-0 cursor-pointer list-none items-center gap-3 py-4 [&::-webkit-details-marker]:hidden">
                    <Icon className="h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="block truncate text-sm text-muted-foreground">{summary}</span></span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 ps-8 text-sm text-muted-foreground">
                    <span className="min-w-0 break-all">{details}</span>
                    {editable && isFinanceEdit && <Button variant="outline" size="sm" data-testid={`button-edit-${key}`} onClick={() => openEdit(key as 'payment' | 'bank' | 'email' | 'address' | 'company')}>{t('تعديل', 'Edit')}</Button>}
                  </div>
                </details>
              ))}
          </CardContent>
        </Card>
      </section>

      <UnavailableTable testId="platform-subscriptions" title={t('الاشتراكات المفعلة', 'Active subscriptions')}
        columns={[t('تفاصيل الاشتراك', 'Subscription details'), t('المدة', 'Duration'), t('تاريخ الاشتراك', 'Start date'), t('تاريخ التجديد القادم', 'Next renewal'), t('رسوم الاشتراك', 'Fee'), t('التجديد التلقائي', 'Auto-renewal')]}
        message={t('غير متاح — لا يوجد مصدر متصل لاشتراكات المنصة.', 'Unavailable — no platform subscription source is connected.')} />
      <UnavailableTable testId="platform-invoices" title={t('فواتير المشتريات — اشتراكات المنصة', 'Purchase invoices — platform subscriptions')}
        columns={[t('رقم الفاتورة', 'Invoice number'), t('المجموع', 'Total'), t('تاريخ الفاتورة', 'Invoice date'), t('المستند', 'Document')]}
        message={t('غير متاح — لا يوجد مصدر متصل لفواتير اشتراك المنصة.', 'Unavailable — no platform subscription invoice source is connected.')} />

      <Card data-testid="supplier-invoices" className="min-w-0">
        <CardHeader><CardTitle className="text-lg">{t('فواتير مشتريات الموردين المحلية', 'Local supplier purchase invoices')}</CardTitle>
          <CardDescription>{t('مستندات المشتريات المحلية، وليست فواتير اشتراك المنصة', 'Local purchase documents, not platform subscription invoices')}</CardDescription></CardHeader>
        <CardContent>
          {purchasesLoading ? <div role="status" className="p-6 text-muted-foreground">{t('جارٍ تحميل فواتير الموردين', 'Loading supplier invoices')} <Loader2 className="inline h-5 w-5 animate-spin" /></div>
            : purchasesError ? <div role="alert" className="p-6 text-destructive">{t('تعذر تحميل فواتير المشتريات', 'Could not load purchase invoices')} <Button variant="outline" onClick={() => void retryPurchases()}>{t('إعادة المحاولة', 'Retry')}</Button></div>
            : supplierPurchases.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{t('لا توجد فواتير مشتريات مرفقة', 'No attached purchase invoices found')}</p>
            : <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>
                  {[t('المشتريات / المرجع المحلي', 'Purchase / local reference'), t('المجموع', 'Total'), t('تاريخ الشراء', 'Purchase date'), t('المستند', 'Document')].map(label => <th scope="col" key={label} className="px-4 py-3 text-start font-medium">{label}</th>)}
                </tr></thead><tbody>{supplierPurchases.map(purchase => <tr key={purchase.id} className="border-t" data-testid={`row-supplier-${purchase.id}`}>
                  <td className="px-4 py-3"><span className="font-medium">{purchase.title}</span><span className="block text-xs text-muted-foreground">#{purchase.id}</span></td>
                  <td className="px-4 py-3"><Money value={purchase.amount} lang={lang} /></td><td className="px-4 py-3">{purchase.purchaseDate}</td>
                  <td className="px-4 py-3"><Button variant="outline" size="sm" data-testid={`button-download-${purchase.id}`} onClick={() => void openInvoice(purchase.id)}><FileText className="me-2 h-4 w-4" />{t('تنزيل المستند', 'Download document')}</Button></td>
                </tr>)}</tbody></table>
              </div>
              <div className="space-y-3 md:hidden">{supplierPurchases.map(purchase => <div key={purchase.id} className="rounded-lg border p-4 text-sm" data-testid={`mobile-supplier-${purchase.id}`}>
                <div className="font-medium">{purchase.title} <span className="text-muted-foreground">#{purchase.id}</span></div>
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-muted-foreground"><Money value={purchase.amount} lang={lang} /><span>{purchase.purchaseDate}</span></div>
                <Button variant="outline" size="sm" className="mt-3" data-testid={`button-mobile-download-${purchase.id}`} onClick={() => void openInvoice(purchase.id)}>{t('تنزيل المستند', 'Download document')}</Button>
              </div>)}</div>
            </>}
        </CardContent>
      </Card>
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
