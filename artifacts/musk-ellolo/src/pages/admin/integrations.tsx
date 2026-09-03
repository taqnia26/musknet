import { useMemo, useState } from 'react';
import {
  getAdminListIntegrationsQueryKey,
  useAdminConfigureIntegration,
  useAdminDisconnectIntegration,
  useAdminListIntegrations,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Database,
  Link2,
  Loader2,
  Network,
  Settings2,
  Truck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type IntegrationDefinition = {
  id: string;
  nameEn: string;
  nameAr: string;
  categoryEn: string;
  categoryAr: string;
  icon: typeof Database;
  descriptionAr: string;
  descriptionEn: string;
};

const integrationDefinitions: IntegrationDefinition[] = [
  {
    id: 'zatca',
    nameEn: 'ZATCA Fatoora',
    nameAr: 'هيئة الزكاة والضريبة (فاتورة)',
    categoryEn: 'Finance',
    categoryAr: 'المالية',
    icon: Database,
    descriptionAr: 'الفواتير المبسطة متاحة داخل النظام. الربط المباشر مع منصة فاتورة يحتاج بيانات الاعتماد واعتماد واجهة الربط.',
    descriptionEn: 'Simplified invoices are available in the system. Direct Fatoora connectivity requires credentials and API approval.',
  },
  {
    id: 'moyasar',
    nameEn: 'Moyasar',
    nameAr: 'ميسر',
    categoryEn: 'Payments',
    categoryAr: 'المدفوعات',
    icon: CreditCard,
    descriptionAr: 'جاهز لحفظ إعدادات الحساب، ويحتاج مفاتيح ميسر وتفعيل مسارات الدفع والاسترداد والإشعارات.',
    descriptionEn: 'Ready for account setup; live payments require Moyasar keys plus payment, refund, and webhook handlers.',
  },
  {
    id: 'tabby',
    nameEn: 'Tabby',
    nameAr: 'تابي',
    categoryEn: 'Payments',
    categoryAr: 'المدفوعات',
    icon: CreditCard,
    descriptionAr: 'جاهز لتسجيل إعدادات التاجر، ويحتاج اعتماد حساب تابي وربط دورة الدفع والإلغاء والإشعارات.',
    descriptionEn: 'Ready for merchant setup; live operation requires an approved Tabby account and payment lifecycle integration.',
  },
  {
    id: 'smsa',
    nameEn: 'SMSA Express',
    nameAr: 'سمسا إكسبريس',
    categoryEn: 'Shipping',
    categoryAr: 'الشحن',
    icon: Truck,
    descriptionAr: 'جاهز لإعداد بيانات الحساب، ويحتاج API سمسا لإنشاء البوليصات وتتبع الشحنات وتحديث الطلبات.',
    descriptionEn: 'Ready for account setup; live labels and tracking require the SMSA API and order status handlers.',
  },
  {
    id: 'storage-station',
    nameEn: 'Storage Station',
    nameAr: 'ستورج ستيشن',
    categoryEn: 'Shipping & Fulfillment',
    categoryAr: 'الشحن والتجهيز',
    icon: Truck,
    descriptionAr: 'مضاف كخيار شحن وتجهيز مستقبلي. يمكن حفظ بيانات العقد وعنوان API الآن، ويكتمل الربط بعد استلام توثيقهم الفني.',
    descriptionEn: 'Added as a future shipping and fulfillment option. Account and API details can be saved pending technical documentation.',
  },
  {
    id: 'odoo',
    nameEn: 'Odoo ERP',
    nameAr: 'أودو ERP',
    categoryEn: 'Management',
    categoryAr: 'الإدارة',
    icon: Network,
    descriptionAr: 'جاهز لحفظ عنوان النظام والحساب، ويحتاج تحديد وحدات أودو وخرائط مزامنة المخزون والحسابات والموظفين.',
    descriptionEn: 'Ready for instance setup; live sync requires selecting Odoo modules and mapping inventory, accounting, and HR data.',
  },
];

export default function AdminIntegrations() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: savedIntegrations = [], isLoading, isError } = useAdminListIntegrations();
  const configureMutation = useAdminConfigureIntegration();
  const disconnectMutation = useAdminDisconnectIntegration();
  const [selected, setSelected] = useState<IntegrationDefinition | null>(null);
  const [disconnecting, setDisconnecting] = useState<IntegrationDefinition | null>(null);
  const [accountLabel, setAccountLabel] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');

  const savedByProvider = useMemo(
    () => new Map(savedIntegrations.map((item) => [item.providerId, item])),
    [savedIntegrations],
  );

  const openSetup = (integration: IntegrationDefinition) => {
    const saved = savedByProvider.get(integration.id);
    setSelected(integration);
    setAccountLabel(saved?.accountLabel ?? '');
    setApiBaseUrl(saved?.apiBaseUrl ?? '');
  };

  const saveSetup = () => {
    if (!selected) return;
    configureMutation.mutate({
      providerId: selected.id,
      data: {
        accountLabel: accountLabel.trim() || null,
        apiBaseUrl: apiBaseUrl.trim() || null,
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListIntegrationsQueryKey() });
        setSelected(null);
        toast({
          title: t('تم حفظ إعدادات الربط', 'Integration setup saved'),
          description: t(
            'الحالة الآن «مهيأ». لن تظهر «متصل» حتى يتم تركيب واختبار واجهة API الفعلية.',
            'The provider is now configured. It will not show as connected until the live API is installed and verified.',
          ),
        });
      },
      onError: () => toast({
        title: t('تعذر حفظ إعدادات الربط', 'Could not save integration setup'),
        variant: 'destructive',
      }),
    });
  };

  const disconnect = () => {
    if (!disconnecting) return;
    disconnectMutation.mutate({ providerId: disconnecting.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListIntegrationsQueryKey() });
        setDisconnecting(null);
        toast({ title: t('تم إلغاء الإعداد', 'Integration setup removed') });
      },
      onError: () => toast({
        title: t('تعذر إلغاء الإعداد', 'Could not remove integration setup'),
        variant: 'destructive',
      }),
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('التكاملات', 'Integrations')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('إدارة جاهزية الربط مع الخدمات والأنظمة الخارجية', 'Manage readiness for external services and systems')}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">{t('حالة الربط الحقيقية', 'Real connection status')}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t(
              '«مهيأ» يعني أن بيانات الحساب غير السرية محفوظة. الاتصال الفعلي يبدأ فقط بعد إضافة بيانات الاعتماد في أسرار المشروع وتركيب واجهة API الخاصة بالجهة واختبارها.',
              'Configured means non-secret account details are saved. A live connection starts only after credentials are added to project secrets and the provider API is implemented and tested.',
            )}
          </p>
        </div>
      </div>

      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {t('تعذر تحميل حالات التكامل. حاول تحديث الصفحة.', 'Could not load integration states. Please refresh the page.')}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrationDefinitions.map((integration) => {
          const saved = savedByProvider.get(integration.id);
          const configured = Boolean(saved);
          const Icon = integration.icon;
          return (
            <Card key={integration.id} className="flex flex-col h-full">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{lang === 'ar' ? integration.nameAr : integration.nameEn}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {lang === 'ar' ? integration.categoryAr : integration.categoryEn}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={configured
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'text-muted-foreground border-muted-foreground/30'}
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : configured ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {t('مهيأ', 'Configured')}
                    </span>
                  ) : t('غير مهيأ', 'Not configured')}
                </Badge>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col pt-4">
                <p className="text-sm text-foreground/80 leading-relaxed mb-4 flex-1">
                  {lang === 'ar' ? integration.descriptionAr : integration.descriptionEn}
                </p>
                {configured && (saved?.accountLabel || saved?.apiBaseUrl) && (
                  <div className="rounded-lg bg-muted/40 p-3 mb-4 text-xs text-muted-foreground space-y-1">
                    {saved.accountLabel && <p>{t('الحساب:', 'Account:')} {saved.accountLabel}</p>}
                    {saved.apiBaseUrl && <p className="truncate" dir="ltr">{saved.apiBaseUrl}</p>}
                  </div>
                )}
                <div className="mt-auto pt-4 border-t border-border flex gap-2">
                  <Button
                    className="flex-1 gap-2"
                    variant={configured ? 'outline' : 'default'}
                    onClick={() => openSetup(integration)}
                    disabled={isLoading}
                    data-testid={`button-setup-${integration.id}`}
                  >
                    {configured ? <Settings2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                    {configured ? t('تعديل الإعداد', 'Edit setup') : t('إعداد الربط', 'Setup integration')}
                  </Button>
                  {configured && (
                    <Button
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                      onClick={() => setDisconnecting(integration)}
                      data-testid={`button-disconnect-${integration.id}`}
                    >
                      {t('إلغاء', 'Remove')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('إعداد ربط', 'Configure')} {selected && (lang === 'ar' ? selected.nameAr : selected.nameEn)}
            </DialogTitle>
            <DialogDescription>
              {t(
                'احفظ بيانات التعريف غير السرية الآن. لا تدخل مفتاح API أو كلمة مرور في هذه الشاشة.',
                'Save non-secret identification details. Do not enter API keys or passwords on this screen.',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="integration-account">{t('اسم الحساب أو رقم العقد', 'Account name or contract number')}</Label>
              <Input
                id="integration-account"
                value={accountLabel}
                onChange={(event) => setAccountLabel(event.target.value)}
                placeholder={t('مثال: حساب المتجر الرئيسي', 'Example: Main store account')}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="integration-url">{t('عنوان API إن زودتكم به الشركة', 'API base URL, if provided')}</Label>
              <Input
                id="integration-url"
                type="url"
                dir="ltr"
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                placeholder="https://api.provider.com"
                maxLength={500}
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground flex gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {t(
                  'حفظ هذه البيانات يجهز السجل فقط. سنحتاج لاحقاً توثيق API وبيانات الاعتماد الرسمية لتفعيل المزامنة الحية.',
                  'Saving prepares the provider record only. API documentation and official credentials are still required for live sync.',
                )}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              {t('إلغاء', 'Cancel')}
            </Button>
            <Button onClick={saveSetup} disabled={configureMutation.isPending}>
              {configureMutation.isPending && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('حفظ الإعداد', 'Save setup')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(disconnecting)} onOpenChange={(open) => { if (!open) setDisconnecting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('إلغاء إعداد الربط؟', 'Remove integration setup?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'سيتم حذف اسم الحساب وعنوان API المحفوظين لهذه الجهة. لن تتأثر الطلبات أو الفواتير الحالية.',
                'Saved account details and API URL will be removed. Existing orders and invoices are not affected.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('رجوع', 'Back')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); disconnect(); }}
              disabled={disconnectMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('تأكيد الإلغاء', 'Confirm removal')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}