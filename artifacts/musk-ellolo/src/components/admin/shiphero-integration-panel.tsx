import { useEffect, useMemo, useState } from 'react';
import {
  getAdminListProductsQueryKey,
  getAdminGetShipHeroQueryKey,
  useAdminDeleteShipHeroMapping,
  useAdminCreateShipHeroProduct,
  useAdminGetShipHero,
  useAdminListProducts,
  useAdminSendShipHeroOrder,
  useAdminUpsertShipHeroMapping,
  useAdminUpdateShipHeroSettings,
  useGetAdminMe,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { AlertCircle, CheckCircle2, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, Truck, X } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { useDestructiveConfirmation } from '@/hooks/use-destructive-confirmation';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

const validRemoteStatuses = ['ready', 'in_transit', 'delivered'] as const;
const immutableMappingStatuses = new Set(['created', 'sending', 'uncertain', 'sent']);
const deletableMappingStatuses = new Set(['not_requested', 'failed']);

function isShipHeroMappingEditable(status: string): boolean {
  return !immutableMappingStatuses.has(status);
}

function isShipHeroMappingDeletable(status: string): boolean {
  return deletableMappingStatuses.has(status);
}

function isValidStatusMappings(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    return Object.values(parsed).every((value) => validRemoteStatuses.includes(value as typeof validRemoteStatuses[number]));
  } catch {
    return false;
  }
}

const settingsFormSchema = z.object({
  dryShippingCode: z.string().max(120, 'Maximum 120 characters / الحد الأقصى ١٢٠ حرفاً'),
  coldShippingCode: z.string().max(120, 'Maximum 120 characters / الحد الأقصى ١٢٠ حرفاً'),
  coldCoverageCities: z.string(),
  statusMappingsJson: z.string().refine(
    isValidStatusMappings,
    'Enter a JSON object mapping remote statuses to ready, in_transit, or delivered / أدخل كائن JSON يربط الحالات البعيدة بـ ready أو in_transit أو delivered',
  ),
});

const mappingFormSchema = z.object({
  productId: z.string().min(1, 'Choose a product / اختر منتجاً'),
  productName: z.string().trim().min(1, 'Partner-confirmed product name is required / أدخل اسم المنتج المعتمد من الشريك').max(200, 'Maximum 200 characters / الحد الأقصى ٢٠٠ حرف'),
  sku: z.string().trim().min(1, 'Partner-confirmed SKU is required / أدخل رمز SKU المعتمد من الشريك').max(120, 'Maximum 120 characters / الحد الأقصى ١٢٠ حرفاً'),
  registrationKind: z.enum(['existing', 'new']),
});

type MappingFormValues = z.infer<typeof mappingFormSchema>;

function displayDate(value: string | null | undefined, locale: string, empty: string): string {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return data.error;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export function ShipHeroIntegrationPanel() {
  const { t, lang } = useLanguage();
  const { confirmAction, confirmationDialog, isConfirming } = useDestructiveConfirmation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: admin } = useGetAdminMe();
  const canView = hasPermission(admin, 'integrations', 'view');
  const canEdit = hasPermission(admin, 'integrations', 'edit');
  const canDelete = hasPermission(admin, 'integrations', 'delete');
  const canViewOrders = hasPermission(admin, 'orders', 'view');
  const canEditOrders = hasPermission(admin, 'orders', 'edit');
  const canEditProducts = hasPermission(admin, 'products', 'edit');
  const canManageMappings = canEdit && canEditProducts;
  const canDeleteMappings = canDelete && canEditProducts;

  const snapshotQuery = useAdminGetShipHero({
    query: {
      queryKey: getAdminGetShipHeroQueryKey(),
      enabled: canView,
      refetchOnMount: 'always',
      staleTime: 15_000,
    },
  });
  const productsQuery = useAdminListProducts({}, {
    query: {
      queryKey: getAdminListProductsQueryKey({}),
      enabled: canView,
      refetchOnMount: 'always',
      staleTime: 60_000,
    },
  });
  const settingsMutation = useAdminUpdateShipHeroSettings();
  const upsertMappingMutation = useAdminUpsertShipHeroMapping();
  const deleteMappingMutation = useAdminDeleteShipHeroMapping();
  const sendOrderMutation = useAdminSendShipHeroOrder();
  const createProductMutation = useAdminCreateShipHeroProduct();

  const settingsForm = useForm<z.infer<typeof settingsFormSchema>>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      dryShippingCode: '',
      coldShippingCode: '',
      coldCoverageCities: '',
      statusMappingsJson: '{}',
    },
  });
  const mappingForm = useForm<MappingFormValues>({
    resolver: zodResolver(mappingFormSchema),
    defaultValues: { productId: '', productName: '', sku: '', registrationKind: 'existing' },
  });
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [registrationProductId, setRegistrationProductId] = useState('');
  const [registrationConfirmed, setRegistrationConfirmed] = useState(false);

  const snapshot = snapshotQuery.data;
  const products = productsQuery.data ?? [];
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  useEffect(() => {
    if (!snapshot || settingsForm.formState.isDirty) return;
    settingsForm.reset({
      dryShippingCode: snapshot.settings.dryShippingCode ?? '',
      coldShippingCode: snapshot.settings.coldShippingCode ?? '',
      coldCoverageCities: snapshot.settings.coldCoverageCities.join('\n'),
      statusMappingsJson: JSON.stringify(snapshot.settings.statusMappings, null, 2),
    });
  }, [snapshot, settingsForm, settingsForm.formState.isDirty]);

  const refreshSnapshot = () => queryClient.invalidateQueries({ queryKey: getAdminGetShipHeroQueryKey() });

  const saveSettings = settingsForm.handleSubmit((values) => {
    const parsedMappings = JSON.parse(values.statusMappingsJson || '{}') as Record<string, typeof validRemoteStatuses[number]>;
    settingsMutation.mutate({
      data: {
        dryShippingCode: values.dryShippingCode.trim() || null,
        coldShippingCode: values.coldShippingCode.trim() || null,
        coldCoverageCities: [...new Set(values.coldCoverageCities.split(/\r?\n/).map((city) => city.trim()).filter(Boolean))],
        statusMappings: parsedMappings,
      },
    }, {
      onSuccess: () => {
        void refreshSnapshot();
        settingsForm.reset(values);
        toast({ title: t('تم حفظ إعدادات ShipHero', 'ShipHero settings saved') });
      },
      onError: () => toast({
        title: t('تعذر حفظ إعدادات ShipHero', 'Could not save ShipHero settings'),
        description: t('تحقق من الحقول ثم حاول مجدداً.', 'Check the fields and try again.'),
        variant: 'destructive',
      }),
    });
  });

  const beginMappingEdit = (mapping: NonNullable<typeof snapshot>['mappings'][number]) => {
    if (!canManageMappings || !isShipHeroMappingEditable(mapping.createStatus)) return;
    setEditingProductId(mapping.productId);
    mappingForm.reset({
      productId: String(mapping.productId),
      productName: mapping.productName,
      sku: mapping.sku,
      registrationKind: mapping.registrationKind === 'new' ? 'new' : 'existing',
    });
  };

  const clearMappingForm = () => {
    setEditingProductId(null);
    mappingForm.reset({ productId: '', productName: '', sku: '', registrationKind: 'existing' });
  };

  const saveMapping = mappingForm.handleSubmit((values) => {
    if (!canManageMappings || upsertMappingMutation.isPending) return;
    if (editingProductId !== null) {
      const editingMapping = snapshot?.mappings.find((mapping) => mapping.productId === editingProductId);
      if (!editingMapping || !isShipHeroMappingEditable(editingMapping.createStatus)) {
        clearMappingForm();
        toast({
          title: t('لا يمكن تعديل ربط المنتج', 'Product mapping can no longer be edited'),
          description: t('الخرائط المسجلة أو قيد الإرسال أو غير المؤكدة أو ذات الحالة القديمة sent غير قابلة للتعديل.', 'Created, sending, uncertain, or legacy sent mappings are immutable.'),
          variant: 'destructive',
        });
        return;
      }
    }
    const productId = Number(values.productId);
    const duplicate = snapshot?.mappings.some((mapping) => mapping.productId === productId && mapping.productId !== editingProductId);
    if (!Number.isSafeInteger(productId) || productId < 1) {
      mappingForm.setError('productId', { message: t('اختر منتجاً صالحاً.', 'Choose a valid product.') });
      return;
    }
    if (duplicate) {
      mappingForm.setError('productId', { message: t('هذا المنتج مربوط مسبقاً.', 'This product already has a mapping.') });
      return;
    }
    upsertMappingMutation.mutate({
      productId,
      data: {
        productName: values.productName.trim(),
        sku: values.sku.trim(),
        registrationKind: values.registrationKind,
      },
    }, {
      onSuccess: () => {
        void refreshSnapshot();
        clearMappingForm();
        toast({ title: t('تم حفظ ربط المنتج', 'Product mapping saved') });
      },
      onError: () => toast({
        title: t('تعذر حفظ ربط المنتج', 'Could not save product mapping'),
        description: t('تأكد من القيم المعتمدة من الشريك ومن عدم تكرار SKU.', 'Verify the partner-confirmed values and that the SKU is unique.'),
        variant: 'destructive',
      }),
    });
  });

  const deleteMapping = (productId: number) => {
    const mapping = snapshot?.mappings.find((item) => item.productId === productId);
    if (!canDeleteMappings || deleteMappingMutation.isPending || isConfirming || !mapping || !isShipHeroMappingDeletable(mapping.createStatus)) return;
    const productName = mapping.productName.trim() || t('اسم غير محدد', 'unnamed product');
    const sku = mapping.sku.trim() || '—';
    confirmAction({
      title: t('حذف ربط ShipHero', 'Delete ShipHero mapping'),
      description: t(
        `سيُحذف الربط المحلي للمنتج "${productName}" (SKU: ${sku}) فقط. لن يُحذف المنتج من ShipHero أو من أي كتالوج بعيد.`,
        `Only the local mapping for "${productName}" (SKU: ${sku}) will be deleted. The product will not be deleted from ShipHero or any remote catalog.`,
      ),
      confirmLabel: t('حذف الربط', 'Delete mapping'),
      onConfirm: async () => {
        await deleteMappingMutation.mutateAsync({ productId }, {
          onSuccess: () => {
            void refreshSnapshot();
            if (editingProductId === productId) clearMappingForm();
            toast({ title: t('تم حذف ربط المنتج', 'Product mapping deleted') });
          },
          onError: () => toast({
            title: t('تعذر حذف ربط المنتج', 'Could not delete product mapping'),
            variant: 'destructive',
          }),
        });
      },
    });
  };

  const sendShipHeroOrder = (orderId: number) => {
    if (!snapshot?.readiness.configured || !canEdit || !canEditOrders || sendOrderMutation.isPending) return;
    sendOrderMutation.mutate({ orderId }, {
      onSuccess: async () => {
        await refreshSnapshot();
        toast({ title: t('تم إرسال الطلب إلى ShipHero', 'Order sent to ShipHero') });
      },
      onError: async (error) => {
        await refreshSnapshot();
        toast({
          title: t('تعذر إرسال الطلب إلى ShipHero', 'Could not send order to ShipHero'),
          description: getApiErrorMessage(error, t('تحقق من الجاهزية ثم حاول مجدداً.', 'Check readiness and try again.')),
          variant: 'destructive',
        });
      },
    });
  };

  const registerFutureProduct = () => {
    const productId = Number(registrationProductId);
    const candidate = snapshot?.mappings.find((mapping) => mapping.productId === productId);
    if (
      !Number.isSafeInteger(productId) ||
      productId < 1 ||
      !candidate ||
      candidate.registrationKind !== 'new' ||
      candidate.createStatus === 'created' ||
      candidate.remoteProductId
    ) {
      toast({
        title: t('المنتج غير مؤهل للتسجيل', 'Product is not eligible for registration'),
        description: t('يمكن تسجيل منتج مستقبلي جديد فقط، وليس منتجاً موجوداً في الكتالوج الأساسي.', 'Only a new future product outside the baseline catalog can be registered.'),
        variant: 'destructive',
      });
      return;
    }
    if (!registrationConfirmed || !canEdit || !canEditProducts || createProductMutation.isPending) return;

    createProductMutation.mutate({
      productId,
      data: { confirmNotRegistered: true },
    }, {
      onSuccess: async () => {
        await refreshSnapshot();
        setRegistrationProductId('');
        setRegistrationConfirmed(false);
        toast({ title: t('تم تسجيل المنتج لدى ShipHero', 'Product registered with ShipHero') });
      },
      onError: async (error) => {
        await refreshSnapshot();
        toast({
          title: t('تعذر تسجيل المنتج لدى ShipHero', 'Could not register product with ShipHero'),
          description: getApiErrorMessage(
            error,
            t('تحقق من أن المنتج جديد وخارج الكتالوج الأساسي ومن جاهزية ShipHero.', 'Verify this is a future product outside the baseline catalog and that ShipHero is ready.'),
          ),
          variant: 'destructive',
        });
      },
    });
  };

  if (!canView) {
    return (
      <>
        {confirmationDialog}
        <Card data-testid="panel-shiphero-integration">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />ShipHero</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground" data-testid="text-shiphero-view-permission">
              {t('تحتاج صلاحية عرض التكاملات لمشاهدة إعدادات ShipHero.', 'You need integrations:view permission to view ShipHero settings.')}
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  const locale = lang === 'ar' ? 'ar' : 'en';
  const latestDispatches = snapshot?.dispatches.slice(0, 50) ?? [];
  const latestEvents = snapshot?.events.slice(0, 50) ?? [];
  const futureRegistrationMappings = snapshot?.mappings.filter(
    (mapping) => mapping.registrationKind === 'new' && mapping.createStatus !== 'created' && !mapping.remoteProductId,
  ) ?? [];
  const canRetryShipHeroOrders = Boolean(snapshot?.readiness.configured && canEdit && canEditOrders);
  const disabledReason = !snapshot?.readiness.configured
    ? snapshot?.readiness.blockingReason || t('إعدادات ShipHero غير مكتملة بعد.', 'ShipHero readiness is not configured yet.')
    : !canEdit
      ? t('تحتاج صلاحية integrations:edit لإعادة الإرسال.', 'integrations:edit permission is required to retry.')
      : !canEditOrders
        ? t('تحتاج صلاحية orders:edit لإعادة الإرسال.', 'orders:edit permission is required to retry.')
        : '';
  const statusLabel = !snapshot?.readiness.configured
    ? t('معطّل — بانتظار التأكيدات', 'DISABLED — pending confirmations')
    : canRetryShipHeroOrders
      ? t('جاهز حسب الإعدادات والصلاحيات', 'Ready by configuration and permission')
      : t('مهيأ — الصلاحية مطلوبة', 'Configured — permission required');

  return (
    <section className="space-y-5" aria-label={t('إدارة ShipHero', 'ShipHero management')} data-testid="panel-shiphero-integration">
      {confirmationDialog}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl"><Truck className="h-5 w-5 text-primary" />ShipHero</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('إعدادات الشحن والخرائط وسجل المحاولات. لا توجد حقول اعتماد أو عناوين API هنا.', 'Shipping settings, mappings, and attempt history. Credentials and API URL fields are not collected here.')}
            </p>
          </div>
          <Badge variant={canRetryShipHeroOrders ? 'default' : 'destructive'} className="w-fit" data-testid="status-shiphero-release-gate">
            {statusLabel}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className={`rounded-lg border p-4 ${canRetryShipHeroOrders ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`} role="status" data-testid="notice-shiphero-release-gate">
            <div className="flex items-start gap-2">
              {canRetryShipHeroOrders
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
              <div className="space-y-1 text-sm">
                <p className="font-semibold">
                  {canRetryShipHeroOrders
                    ? t('إعادة الإرسال متاحة حسب الجاهزية والصلاحيات', 'Retry is available by readiness and permission')
                    : t('الإرسال غير متاح بعد', 'Sending is not available yet')}
                </p>
                {!canRetryShipHeroOrders && <p className="text-muted-foreground">{disabledReason}</p>}
                {snapshot?.readiness.missing.length ? (
                  <p className="text-muted-foreground">
                    {t('نواقص الجاهزية:', 'Readiness missing:')} {snapshot.readiness.missing.join(', ')}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {snapshotQuery.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('جارٍ تحميل إعدادات ShipHero…', 'Loading ShipHero settings…')}</div>}
          {snapshotQuery.isError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert" data-testid="error-shiphero-load">
              {t('تعذر تحميل بيانات ShipHero. حاول تحديث الصفحة.', 'Could not load ShipHero data. Please refresh the page.')}
            </p>
          )}

          {snapshot && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="shiphero-readiness">
                <ReadinessItem id="configured" label={t('مهيأ للإرسال', 'Configured')} value={snapshot.readiness.configured} t={t} />
                <ReadinessItem id="contract" label={t('تأكيد عقد الشريك', 'Partner contract confirmed')} value={snapshot.readiness.partnerContractConfirmed} t={t} />
                <ReadinessItem id="webhook" label={t('Webhook مهيأ', 'Webhook configured')} value={snapshot.readiness.webhookConfigured} t={t} />
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{t('حالة المحفّز', 'Trigger status')}</p>
                  <p className="mt-1 break-words text-sm font-medium" data-testid="text-shiphero-trigger-status">{snapshot.readiness.triggerStatus || '—'}</p>
                </div>
              </div>

              <div className="border-t pt-5">
                <div className="mb-3">
                  <h3 className="font-semibold">{t('إعدادات الشحن والخرائط', 'Shipping settings and status mappings')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('اترك الأكواد فارغة حتى يؤكدها الشريك. لا تُدخل قيماً تخمينية.', 'Leave shipping codes blank until confirmed by the partner. Do not guess values.')}
                  </p>
                </div>
                <Form {...settingsForm}>
                  <form onSubmit={saveSettings} className="space-y-4" noValidate>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={settingsForm.control} name="dryShippingCode" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('رمز الشحن الجاف', 'Dry shipping code')}</FormLabel>
                          <FormControl><Input {...field} maxLength={120} disabled={!canEdit} data-testid="input-shiphero-dry-code" /></FormControl>
                          <FormDescription>{t('يُترك فارغاً إلى حين تأكيد القيمة.', 'Leave blank until the value is confirmed.')}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={settingsForm.control} name="coldShippingCode" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('رمز الشحن المبرد', 'Cold shipping code')}</FormLabel>
                          <FormControl><Input {...field} maxLength={120} disabled={!canEdit} data-testid="input-shiphero-cold-code" /></FormControl>
                          <FormDescription>{t('يُترك فارغاً إلى حين تأكيد القيمة.', 'Leave blank until the value is confirmed.')}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={settingsForm.control} name="coldCoverageCities" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('مدن تغطية الشحن المبرد', 'Cold-shipping coverage cities')}</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} disabled={!canEdit} placeholder="" data-testid="input-shiphero-cold-cities" />
                        </FormControl>
                        <FormDescription>{t('مدينة واحدة في كل سطر؛ اتركها فارغة حتى يتم التأكيد.', 'One city per line; leave blank until confirmed.')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={settingsForm.control} name="statusMappingsJson" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('خرائط الحالة عن بُعد (JSON)', 'Remote status mappings (JSON)')}</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={5} dir="ltr" disabled={!canEdit} spellCheck={false} data-testid="input-shiphero-status-mappings" />
                        </FormControl>
                        <FormDescription>
                          {t('كائن JSON من الحالة البعيدة إلى ready أو in_transit أو delivered.', 'JSON object mapping remote statuses to ready, in_transit, or delivered.')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {canEdit && (
                      <Button type="submit" disabled={settingsMutation.isPending || !settingsForm.formState.isDirty} data-testid="button-save-shiphero-settings">
                        {settingsMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}
                        {t('حفظ الإعدادات', 'Save settings')}
                      </Button>
                    )}
                    {!canEdit && <p className="text-sm text-muted-foreground">{t('تحتاج صلاحية integrations:edit لتغيير الإعدادات.', 'integrations:edit permission is required to change settings.')}</p>}
                  </form>
                </Form>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {snapshot && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('ربط المنتجات', 'Product mappings')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('اختر منتجاً من الكتالوج الحالي. اسم المنتج وSKU لدى الشريك فارغان حتى يؤكد المدير القيم.', 'Choose a product from the existing catalog. Partner product name and SKU remain blank until an admin confirms them.')}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <Form {...mappingForm}>
                <form onSubmit={saveMapping} className="grid gap-4 rounded-lg border p-4 md:grid-cols-2" noValidate>
                  <FormField control={mappingForm.control} name="productId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('منتج المتجر', 'Store product')}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={!canManageMappings || productsQuery.isLoading || productsQuery.isError || editingProductId !== null}>
                        <FormControl><SelectTrigger data-testid="select-shiphero-local-product"><SelectValue placeholder={t('اختر من الكتالوج', 'Select from catalog')} /></SelectTrigger></FormControl>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={String(product.id)}>
                              {product.displayNameEn || product.nameEn || product.nameAr || `#${product.id}`} · #{product.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={mappingForm.control} name="registrationKind" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('نوع التسجيل لدى الشريك', 'Partner registration kind')}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={!canManageMappings}>
                        <FormControl><SelectTrigger data-testid="select-shiphero-registration-kind"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="existing">{t('منتج موجود لدى الشريك', 'Existing partner product')}</SelectItem>
                          <SelectItem value="new">{t('منتج مستقبلي جديد', 'Future new product')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={mappingForm.control} name="productName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('اسم المنتج لدى الشريك', 'Partner product name')}</FormLabel>
                          <FormControl><Input {...field} maxLength={200} disabled={!canManageMappings} data-testid="input-shiphero-partner-product-name" /></FormControl>
                      <FormDescription>{t('أدخل الاسم المؤكد فقط؛ لا توجد قيمة افتراضية.', 'Enter only the confirmed name; no default value is supplied.')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={mappingForm.control} name="sku" render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                          <FormControl><Input {...field} maxLength={120} dir="ltr" disabled={!canManageMappings} data-testid="input-shiphero-partner-sku" /></FormControl>
                      <FormDescription>{t('أدخل SKU المؤكد فقط؛ لا توجد قيمة افتراضية.', 'Enter only the confirmed SKU; no default value is supplied.')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {canManageMappings && (
                    <div className="flex flex-wrap gap-2 md:col-span-2">
                      <Button type="submit" disabled={upsertMappingMutation.isPending || productsQuery.isLoading} data-testid="button-save-shiphero-mapping">
                        {upsertMappingMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : editingProductId === null ? <Plus className="me-2 h-4 w-4" /> : <Save className="me-2 h-4 w-4" />}
                        {editingProductId === null ? t('إضافة الربط', 'Add mapping') : t('حفظ التعديل', 'Save changes')}
                      </Button>
                      {editingProductId !== null && (
                        <Button type="button" variant="outline" onClick={clearMappingForm} data-testid="button-cancel-shiphero-mapping-edit">
                          <X className="me-2 h-4 w-4" />{t('إلغاء التعديل', 'Cancel edit')}
                        </Button>
                      )}
                    </div>
                  )}
                  {!canManageMappings && (
                    <p className="text-sm text-muted-foreground md:col-span-2" data-testid="text-shiphero-mapping-edit-permission">
                      {t('إضافة الخرائط وتعديلها يتطلبان صلاحيتَي integrations:edit وproducts:edit.', 'Adding and editing mappings require both integrations:edit and products:edit permissions.')}
                    </p>
                  )}
                </form>
              </Form>

              {productsQuery.isError && (
                <p className="text-sm text-destructive" role="alert" data-testid="error-shiphero-products">
                  {t('تعذر تحميل كتالوج المنتجات. تحقق من صلاحية عرض المنتجات ثم أعد المحاولة.', 'Could not load the product catalog. Check product-view permission and try again.')}
                </p>
              )}

              {snapshot.mappings.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="empty-shiphero-mappings">
                  {t('لا توجد خرائط منتجات. لم تتم إضافة قيم شريك افتراضية.', 'No product mappings yet. No partner values have been prefilled.')}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('منتج المتجر', 'Store product')}</TableHead>
                        <TableHead>{t('اسم المنتج لدى الشريك', 'Partner product name')}</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>{t('النوع / الحالة', 'Kind / status')}</TableHead>
                        {(canManageMappings || canDeleteMappings) && <TableHead>{t('الإجراءات', 'Actions')}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshot.mappings.map((mapping) => {
                        const product = productById.get(mapping.productId);
                        return (
                          <TableRow key={mapping.productId} data-testid={`row-shiphero-mapping-${mapping.productId}`}>
                            <TableCell>
                              <span className="block font-medium">{product?.displayNameEn || product?.nameEn || product?.nameAr || `#${mapping.productId}`}</span>
                              <span className="text-xs text-muted-foreground">ID {mapping.productId}</span>
                            </TableCell>
                            <TableCell data-testid={`text-shiphero-partner-name-${mapping.productId}`}>{mapping.productName || '—'}</TableCell>
                            <TableCell dir="ltr" data-testid={`text-shiphero-sku-${mapping.productId}`}>{mapping.sku || '—'}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <Badge variant="outline">{mapping.registrationKind === 'new' ? t('جديد مستقبلاً', 'Future new') : t('موجود', 'Existing')}</Badge>
                                <p className="text-xs text-muted-foreground">{mapping.createStatus}</p>
                                {!isShipHeroMappingEditable(mapping.createStatus) && (
                                  <p className="max-w-64 text-xs text-muted-foreground" data-testid={`text-shiphero-mapping-immutable-${mapping.productId}`}>
                                    {t('الخرائط المنشأة أو قيد الإرسال أو غير المؤكدة أو ذات الحالة القديمة sent غير قابلة للتعديل أو الحذف.', 'Created, sending, uncertain, and legacy sent mappings cannot be edited or deleted.')}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            {(canManageMappings || canDeleteMappings) && (
                              <TableCell>
                                <div className="flex gap-2">
                                  {canManageMappings && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={!isShipHeroMappingEditable(mapping.createStatus) || upsertMappingMutation.isPending}
                                      onClick={() => beginMappingEdit(mapping)}
                                      data-testid={`button-edit-shiphero-mapping-${mapping.productId}`}
                                    >
                                      <Pencil className="me-1 h-3.5 w-3.5" />{t('تعديل', 'Edit')}
                                    </Button>
                                  )}
                                  {canDeleteMappings && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="text-destructive"
                                      disabled={!isShipHeroMappingDeletable(mapping.createStatus) || deleteMappingMutation.isPending || isConfirming}
                                      onClick={() => deleteMapping(mapping.productId)}
                                      data-testid={`button-delete-shiphero-mapping-${mapping.productId}`}
                                    >
                                      {deleteMappingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="me-1 h-3.5 w-3.5" />}
                                      {t('حذف', 'Delete')}
                                    </Button>
                                  )}
                                </div>
                                {isShipHeroMappingEditable(mapping.createStatus) && !isShipHeroMappingDeletable(mapping.createStatus) && (
                                  <p className="mt-1 max-w-64 text-xs text-muted-foreground" data-testid={`text-shiphero-mapping-delete-restricted-${mapping.productId}`}>
                                    {t('لا يمكن حذف الربط إلا في حالتي not_requested أو failed؛ الحالات الأخرى محمية.', 'Mappings can be deleted only in not_requested or failed status; other states are protected.')}
                                  </p>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!canDeleteMappings && (
                <p className="text-sm text-muted-foreground" data-testid="text-shiphero-mapping-delete-permission">
                  {t('حذف الخرائط يتطلب صلاحيتَي integrations:delete وproducts:edit.', 'Deleting mappings requires both integrations:delete and products:edit permissions.')}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('تسجيل منتج لدى الشريك', 'Register a product with the partner')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('هذا المسار مخصص لمنتج مستقبلي أُضيف بعد خط أساس الكتالوج. ترفض API المنتجات الموجودة في الكتالوج الأساسي؛ والتأكيد وحده لا يتجاوز هذا القيد.', 'This flow is only for a future product added after the catalog baseline. The API rejects products in the baseline catalog; confirmation alone cannot bypass that guard.')}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {futureRegistrationMappings.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('المنتجات الموجودة في خط أساس الكتالوج غير مؤهلة. أضف منتجاً مستقبلياً جديداً وخريطته بعد تأكيد قيم الشريك.', 'Products already in the catalog baseline are not eligible. Add a future product and its mapping after partner values are confirmed.')}</p>
              ) : (
                <>
                  <div className="max-w-xl space-y-2">
                    <Label htmlFor="shiphero-registration-product">{t('منتج مستقبلي', 'Future product')}</Label>
                    <Select value={registrationProductId} onValueChange={(value) => { setRegistrationProductId(value); setRegistrationConfirmed(false); }} disabled={!canEdit || !canEditProducts}>
                      <SelectTrigger id="shiphero-registration-product" data-testid="select-shiphero-future-product">
                        <SelectValue placeholder={t('اختر منتجاً جديداً', 'Select a new product')} />
                      </SelectTrigger>
                      <SelectContent>
                        {futureRegistrationMappings.map((mapping) => (
                          <SelectItem key={mapping.productId} value={String(mapping.productId)}>
                            {productById.get(mapping.productId)?.displayNameEn || productById.get(mapping.productId)?.nameEn || `#${mapping.productId}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-start gap-2 text-sm" htmlFor="shiphero-not-registered-confirmation">
                    <input
                      id="shiphero-not-registered-confirmation"
                      type="checkbox"
                      checked={registrationConfirmed}
                      onChange={(event) => setRegistrationConfirmed(event.target.checked)}
                      disabled={!canEdit || !canEditProducts}
                      className="mt-1"
                      data-testid="checkbox-shiphero-not-registered"
                    />
                    <span>{t('أؤكد أن هذا المنتج المستقبلي غير مسجل لدى الشريك.', 'I confirm this future product is not registered with the partner.')}</span>
                  </label>
                  <Button
                    type="button"
                    onClick={registerFutureProduct}
                    disabled={
                      !canEdit ||
                      !canEditProducts ||
                      !registrationProductId ||
                      !registrationConfirmed ||
                      createProductMutation.isPending ||
                      !futureRegistrationMappings.some((mapping) => String(mapping.productId) === registrationProductId)
                    }
                    data-testid="button-create-shiphero-product"
                  >
                    {createProductMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Plus className="me-2 h-4 w-4" />}
                    {t('تسجيل المنتج المستقبلي', 'Register future product')}
                  </Button>
                  <p className="text-sm text-muted-foreground" role="note" data-testid="text-shiphero-registration-blocked">
                    {registrationConfirmed
                      ? t('سيُرسل الطلب عند الضغط؛ تتحقق API من أن المنتج خارج خط الأساس ومن جاهزية الربط قبل التسجيل.', 'Submitting will send a registration request; the API verifies the product is beyond the baseline and checks integration readiness.')
                      : t('يتطلب التسجيل تأكيداً صريحاً وصلاحيات integrations:edit وproducts:edit. تتحقق API من خط الأساس ولا يمكن تجاوز الحظر من الواجهة.', 'Registration requires explicit confirmation and integrations:edit plus products:edit. The API enforces the baseline and the UI cannot bypass it.')}
                  </p>
                  {(!canEdit || !canEditProducts) && (
                    <p className="text-sm text-muted-foreground">
                      {t('تحتاج صلاحية integrations:edit وproducts:edit لتسجيل منتج.', 'integrations:edit and products:edit permissions are required to register a product.')}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('محاولات إرسال الطلبات', 'Order dispatch attempts')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {canViewOrders
                  ? t('أحدث 50 محاولة. تفاصيل الطلب والأخطاء ظاهرة لأن لديك صلاحية orders:view.', 'Latest 50 attempts. Order details and errors are visible because you have orders:view permission.')
                  : t('يتطلب عرض أرقام الطلبات وتفاصيل المحاولات صلاحية orders:view.', 'orders:view permission is required to view order numbers and attempt details.')}
              </p>
            </CardHeader>
            <CardContent>
              {!canViewOrders ? (
                <p className="text-sm text-muted-foreground" data-testid="text-shiphero-orders-permission">
                  {t('سجل محاولات الشحن مخفي؛ لن تُعرض بيانات الطلبات أو تفاصيل الأخطاء دون صلاحية orders:view.', 'Dispatch history is hidden; order data and error details are not shown without orders:view permission.')}
                </p>
              ) : latestDispatches.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="empty-shiphero-dispatches">{t('لا توجد محاولات إرسال مسجلة.', 'No dispatch attempts recorded.')}</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('الطلب', 'Order')}</TableHead>
                        <TableHead>{t('الحالة', 'Status')}</TableHead>
                        <TableHead>{t('معرّف الشريك', 'Remote ID')}</TableHead>
                        <TableHead>{t('المحاولات', 'Attempts')}</TableHead>
                        <TableHead>{t('آخر خطأ', 'Last error')}</TableHead>
                        <TableHead>{t('وقت الإرسال', 'Sent at')}</TableHead>
                        <TableHead>{t('إعادة المحاولة', 'Retry')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {latestDispatches.map((dispatch) => (
                        <TableRow key={dispatch.id} data-testid={`row-shiphero-dispatch-${dispatch.id}`}>
                          <TableCell>
                            <span className="font-medium">{dispatch.orderNumber}</span>
                            <span className="block text-xs text-muted-foreground">ID {dispatch.orderId}</span>
                          </TableCell>
                          <TableCell><Badge variant={dispatch.status === 'sent' ? 'default' : 'outline'}>{dispatch.status}</Badge></TableCell>
                          <TableCell dir="ltr">{dispatch.remoteOrderId || '—'}</TableCell>
                          <TableCell>{dispatch.attempts}</TableCell>
                          <TableCell className="max-w-xs whitespace-normal text-sm text-destructive">{dispatch.lastError || '—'}</TableCell>
                          <TableCell>{displayDate(dispatch.sentAt, locale, t('لم يُرسل', 'Not sent'))}</TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!canRetryShipHeroOrders || dispatch.status !== 'blocked' || sendOrderMutation.isPending}
                              onClick={() => sendShipHeroOrder(dispatch.orderId)}
                              data-testid={`button-retry-shiphero-order-${dispatch.orderId}`}
                            >
                              {sendOrderMutation.isPending ? <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="me-1 h-3.5 w-3.5" />}
                              {t('إعادة الإرسال', 'Retry send')}
                            </Button>
                            {!canRetryShipHeroOrders && <span className="mt-1 block max-w-40 text-xs text-muted-foreground">{disabledReason}</span>}
                            {canRetryShipHeroOrders && dispatch.status !== 'blocked' && (
                              <span className="mt-1 block max-w-40 text-xs text-muted-foreground">
                                {t('تُتاح الإعادة للمحاولات المحظورة فقط.', 'Only blocked attempts can be retried.')}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('أحداث Webhook', 'Webhook events')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('النوع والنتيجة والوقت فقط؛ لا يتم عرض الحمولة أو التفاصيل التي قد تحتوي بيانات شخصية.', 'Type, outcome, and time only; payload and potentially personal event details are never displayed.')}
              </p>
            </CardHeader>
            <CardContent>
              {latestEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="empty-shiphero-events">{t('لا توجد أحداث مسجلة.', 'No events recorded.')}</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('نوع الحدث', 'Event type')}</TableHead>
                        <TableHead>{t('النتيجة', 'Outcome')}</TableHead>
                        <TableHead>{t('حالة المعالجة', 'Handling')}</TableHead>
                        <TableHead>{t('وقت الحدث', 'Event time')}</TableHead>
                        <TableHead>{t('وقت الاستلام', 'Received')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {latestEvents.map((event) => {
                        const type = event.eventType.toLowerCase();
                        const outcome = event.outcome.toLowerCase();
                        const inert = type === 'unknown' || type.includes('inventory') || outcome.includes('unknown') || outcome.includes('ignored_') || outcome.includes('inventory');
                        return (
                          <TableRow key={event.id} data-testid={`row-shiphero-event-${event.id}`}>
                            <TableCell className="font-medium">{event.eventType}</TableCell>
                            <TableCell><Badge variant="outline">{event.outcome}</Badge></TableCell>
                            <TableCell>
                              <Badge variant={inert ? 'secondary' : 'outline'} data-testid={`status-shiphero-event-handling-${event.id}`}>
                                {inert ? t('خامل — لا تغيير مخزون', 'Inert — no inventory changes') : t('مُسجل', 'Recorded')}
                              </Badge>
                            </TableCell>
                            <TableCell>{displayDate(event.eventAt, locale, '—')}</TableCell>
                            <TableCell>{displayDate(event.receivedAt, locale, '—')}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  );
}

function ReadinessItem({ id, label, value, t }: { id: string; label: string; value: boolean; t: (ar: string, en: string) => string }) {
  return (
    <div className="rounded-lg border p-3" data-testid={`status-shiphero-${id}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
        {value ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
        {value ? t('نعم', 'Yes') : t('لا', 'No')}
      </p>
    </div>
  );
}