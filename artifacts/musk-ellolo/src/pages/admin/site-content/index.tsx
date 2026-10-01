import { useEffect, useRef, useState } from 'react';
import { useAdminListSiteContent, useAdminUpsertSiteContent, useAdminDeleteSiteContent, useAdminRestoreSiteContent, useGetAdminMe, getAdminListSiteContentQueryKey, getAdminListSiteContentHistoryQueryKey, type SiteContent, type SiteContentHistory } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Save, Building2, MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { sellerDefaults, sellerNumberLabel, sellerProfile } from '../contracts/seller-defaults';
import { useLanguage } from '@/hooks/use-language';
import { useDestructiveConfirmation } from '@/hooks/use-destructive-confirmation';
import { hasPermission } from '@/lib/permissions';
import { DeletionHistory } from './deletion-history';

const defaultSellerLegalProfile = sellerDefaults;

export default function AdminSiteContent() {
  const { data: content, isLoading } = useAdminListSiteContent();
  const upsert = useAdminUpsertSiteContent();
  const deleteContent = useAdminDeleteSiteContent();
  const restoreContent = useAdminRestoreSiteContent();
  const { data: admin } = useGetAdminMe();
  const { t } = useLanguage();
  const { confirmAction, confirmationDialog, isConfirming } = useDestructiveConfirmation();
  const busy = isConfirming || upsert.isPending || deleteContent.isPending || restoreContent.isPending;
  const canDelete = hasPermission(admin, 'site-content', 'delete');
  const canEdit = hasPermission(admin, 'site-content', 'edit');
  const canView = hasPermission(admin, 'site-content', 'view');
  const dirtyRef = useRef(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [localItems, setLocalItems] = useState<{ key: string; data: string; isNew?: boolean; canDelete?: boolean }[]>([]);
  const [sellerLegalProfile, setSellerLegalProfile] = useState(defaultSellerLegalProfile);

  useEffect(() => {
    if (content && !dirtyRef.current) {
      setLocalItems(content.filter(c => c.key !== 'seller_legal_profile').map(c => ({
        key: c.key,
        canDelete: c.canDelete,
        data: typeof c.data === 'string' ? c.data : JSON.stringify(c.data, null, 2)
      })));

      const legalProfile = content.find(c => c.key === 'seller_legal_profile');
      if (legalProfile && typeof legalProfile.data === 'object' && legalProfile.data) {
        setSellerLegalProfile(sellerProfile(legalProfile.data));
      }
    }
  }, [content]);

  const handleSave = () => {
    if (busy || !canEdit) return;
    const savedKeys = new Set(content?.map(item => item.key));
    const keys = localItems.map(item => item.key);
    if (new Set(keys).size !== keys.length || localItems.some(item => item.isNew && (savedKeys.has(item.key) || item.key === 'seller_legal_profile'))) {
      toast({ title: t('المفتاح مستخدم بالفعل', 'Key already in use'), description: t('اختر مفتاحاً مختلفاً للمسودة؛ لا تستبدل محتوى محفوظاً بمسودة جديدة.', 'Choose a different draft key; do not overwrite saved content with a new draft.'), variant: 'destructive' });
      return;
    }
    try {
      const itemsToSave = localItems.map(item => {
        let parsedData: unknown = item.data;
        if (typeof item.data === 'string' && (item.data.trim().startsWith('{') || item.data.trim().startsWith('['))) {
          try {
            parsedData = JSON.parse(item.data);
          } catch (e) {
            // Keep as string if parsing fails
          }
        }
        return {
          key: item.key,
          data: parsedData
        };
      });

      // Always include the seller_legal_profile in the upsert
      itemsToSave.push({
        key: 'seller_legal_profile',
        data: sellerLegalProfile
      });

      upsert.mutate(
        { data: { items: itemsToSave } },
        {
          onSuccess: (rows) => {
            dirtyRef.current = false;
            queryClient.setQueryData(getAdminListSiteContentQueryKey(), rows);
            queryClient.invalidateQueries({ queryKey: getAdminListSiteContentQueryKey() });
            void queryClient.invalidateQueries({ queryKey: getAdminListSiteContentHistoryQueryKey() });
            toast({ title: 'تم الحفظ', description: 'تم حفظ المحتوى بنجاح / Content saved successfully' });
          },
          onError: (error: any) => {
            toast({
              title: 'خطأ / Error',
              description: error?.response?.data?.error || error?.message || 'فشل في حفظ المحتوى / Failed to save content',
              variant: 'destructive'
            });
          }
        }
      );
    } catch (err: any) {
      toast({
        title: 'خطأ / Error',
        description: err?.message || 'حدث خطأ أثناء حفظ البيانات / An error occurred while saving',
        variant: 'destructive'
      });
    }
  };

  const handleAdd = () => {
    if (busy || !canEdit) return;
    dirtyRef.current = true;
    setLocalItems([{ key: '', data: '', isNew: true }, ...localItems]);
  };

  const handleRemove = (index: number) => {
    if (busy || !localItems[index]?.isNew) return;
    dirtyRef.current = true;
    const newItems = [...localItems];
    newItems.splice(index, 1);
    setLocalItems(newItems);
  };

  const handleDeleteSaved = (key: string) => {
    if (busy || !canDelete) return;
    confirmAction({
      title: t('حذف محتوى محفوظ', 'Delete saved content'),
      description: t(
        `سيُحذف المفتاح «${key}» وقيمته من المحتوى النشط مع حفظ نسخة في سجل المحذوفات. لن يعود تلقائياً بعد التحديث؛ يمكن استعادته لاحقاً بالصلاحيات المناسبة ما لم يُعد إنشاء المفتاح. ستُفقد التعديلات غير المحفوظة لهذا السطر فقط. لن تُحذف المفاتيح الأخرى أو بيانات الفوترة والإعدادات المحمية.`,
        `The saved key “${key}” and its value will be removed from active content, with a copy kept in deletion history. It will not return automatically after reload. Authorized users can restore it unless the key is recreated. Unsaved edits to this row only will be lost. Other keys, billing data, and protected settings will not be deleted.`,
      ),
      confirmLabel: t('تأكيد حذف المحفوظ', 'Confirm deletion'),
      onConfirm: async () => {
        await deleteContent.mutateAsync({ key });
        setLocalItems(items => items.filter(item => item.key !== key || item.isNew));
        queryClient.setQueryData<SiteContent[]>(getAdminListSiteContentQueryKey(), rows => rows?.filter(item => item.key !== key));
        // Dirty drafts remain local even when this refresh updates the saved list.
        void queryClient.invalidateQueries({ queryKey: getAdminListSiteContentQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getAdminListSiteContentHistoryQueryKey() });
        toast({ title: t('تم حذف المحتوى المحفوظ', 'Saved content deleted'), description: key });
      },
    });
  };

  const handleRestore = (entry: SiteContentHistory) => {
    if (busy || !canEdit || !canDelete || !entry.canRestore || localItems.some(item => item.key === entry.key)) return;
    confirmAction({
      title: t('استعادة محتوى مخصص', 'Restore custom content'),
      description: t(
        `ستتم استعادة النسخة المحفوظة للمفتاح «${entry.key}» إلى المحتوى النشط. لن تُستبدل أي قيمة موجودة، ولن تُستعاد عناصر أخرى أو إعدادات محمية. ستبقى تعديلاتك غير المحفوظة على الأسطر الأخرى كما هي.`,
        `The saved copy of “${entry.key}” will be restored to active content. No existing value will be replaced. No other items or protected settings will be restored. Unsaved edits to other rows will be preserved.`,
      ),
      confirmLabel: t('تأكيد استعادة هذا العنصر', 'Confirm restoring this item'),
      onConfirm: async () => {
        try {
          const restored = await restoreContent.mutateAsync({ id: entry.id });
          setLocalItems(items => items.some(item => item.key === restored.key) ? items : [...items, {
            key: restored.key,
            data: typeof restored.data === 'string' ? restored.data : JSON.stringify(restored.data, null, 2),
            canDelete: restored.canDelete,
          }]);
          queryClient.setQueryData<SiteContent[]>(getAdminListSiteContentQueryKey(), rows => rows
            ? [...rows.filter(item => item.key !== restored.key), restored]
            : [restored]);
          toast({ title: t('تمت استعادة المحتوى', 'Content restored'), description: restored.key });
        } finally {
          void queryClient.invalidateQueries({ queryKey: getAdminListSiteContentQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getAdminListSiteContentHistoryQueryKey() });
        }
      },
    });
  };

  const updateItem = (index: number, field: 'key' | 'data', value: string) => {
    dirtyRef.current = true;
    const newItems = [...localItems];
    newItems[index][field] = value;
    setLocalItems(newItems);
  };

  const updateSellerField = (field: keyof typeof defaultSellerLegalProfile, value: string) => {
    dirtyRef.current = true;
    setSellerLegalProfile(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return <div className="flex h-[200px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <>
    {confirmationDialog}
    <fieldset disabled={busy} className="space-y-8 min-w-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">محتوى الموقع / Site Content</h1>
          <p className="text-muted-foreground mt-2">إدارة نصوص ومحتويات الموقع (Staging) والبيانات المركزية</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAdd} disabled={!canEdit || busy}>
            <Plus className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
            إضافة مفتاح جديد
          </Button>
           <Button onClick={handleSave} disabled={!canEdit || busy}>
            {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin rtl:ml-2 rtl:mr-0" />}
            <Save className="mr-2 h-4 w-4 rtl:ml-2 rtl:mr-0" />
            حفظ التغييرات
          </Button>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>البيانات القانونية المركزية للشركة</CardTitle>
          </div>
          <CardDescription>هذه البيانات ستستخدم افتراضياً عند إنشاء عقود التوزيع الجديدة</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="sellerName">اسم الشركة / المؤسسة *</Label>
            <Input
              id="sellerName"
              name="sellerName"
              required
              value={sellerLegalProfile.sellerName}
              onChange={(e) => updateSellerField('sellerName', e.target.value)}
            />
          </div>
          <div className="space-y-2">
             <Label htmlFor="sellerCrNumber">{sellerNumberLabel(sellerLegalProfile.sellerCrNumber)}</Label>
            <Input
              id="sellerCrNumber"
              name="sellerCrNumber"
              required
              value={sellerLegalProfile.sellerCrNumber}
              onChange={(e) => updateSellerField('sellerCrNumber', e.target.value)}
              dir="ltr"
              className="text-right"
            />
          </div>
          <div className="space-y-2">
             <Label htmlFor="sellerCrDate">تاريخ إصدار شهادة السجل</Label>
            <Input
              id="sellerCrDate"
              name="sellerCrDate"
              required
              value={sellerLegalProfile.sellerCrDate}
              onChange={(e) => updateSellerField('sellerCrDate', e.target.value)}
              dir="ltr"
              className="text-right"
            />
          </div>
          <div className="space-y-2">
             <Label htmlFor="sellerCrIssuer">الجهة المصدرة</Label>
            <Input
              id="sellerCrIssuer"
              name="sellerCrIssuer"
              required
              value={sellerLegalProfile.sellerCrIssuer}
              onChange={(e) => updateSellerField('sellerCrIssuer', e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="sellerAddress">العنوان الوطني / مقر الشركة *</Label>
            <Input
              id="sellerAddress"
              name="sellerAddress"
              required
              value={sellerLegalProfile.sellerAddress}
              onChange={(e) => updateSellerField('sellerAddress', e.target.value)}
            />
             <p className="text-xs text-muted-foreground">إثبات العنوان المرفق انتهى في 25/05/2024؛ تحقق من العنوان قبل الاعتماد.</p>
          </div>
          <div className="space-y-2">
             <Label htmlFor="sellerRepName">الممثل القانوني الافتراضي (اختياري هنا)</Label>
            <Input
              id="sellerRepName"
              name="sellerRepName"
              value={sellerLegalProfile.sellerRepName}
              onChange={(e) => updateSellerField('sellerRepName', e.target.value)}
            />
          </div>
          <div className="space-y-2">
             <Label htmlFor="sellerRepTitle">صفة الممثل الافتراضي (اختياري هنا)</Label>
            <Input
              id="sellerRepTitle"
              name="sellerRepTitle"
              value={sellerLegalProfile.sellerRepTitle}
              onChange={(e) => updateSellerField('sellerRepTitle', e.target.value)}
            />
             <p className="text-xs text-muted-foreground">الاسم والصفة غير واردين في المرفقات؛ يلزم إدخالهما عند إنشاء العقد.</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-bold">محتويات عامة (Key/Value)</h2>
        <p className="text-sm text-muted-foreground">
          {t('الحفظ يضيف أو يعدل فقط، ولا يحذف المفاتيح الغائبة. للحذف استخدم «حذف المحتوى المحفوظ». المفاتيح المخصصة القابلة للحذف تبدأ بـ custom. ثم حروف إنجليزية صغيرة أو أرقام أو _ أو -. بقية المفاتيح محمية.', 'Save only adds or updates; missing keys are not deleted. Use “Delete saved content” for deletion. Deletable custom keys start with custom. followed by lowercase letters, digits, _ or -. All other keys are protected.')}
        </p>
        <div className="grid gap-4">
          {localItems.map((item, index) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <p className="text-sm mb-4" data-testid="site-content-row-status">
                  {item.isNew
                    ? t('مسودة جديدة — لم تُحفظ بعد. إزالتها لا تحذف أي محتوى محفوظ.', 'New draft — not saved yet. Removing it does not delete any saved content.')
                    : item.canDelete
                      ? t('محتوى محفوظ — مفتاح مخصص قابل للحذف.', 'Saved content — deletable custom key.')
                      : t('محتوى محفوظ — مفتاح محمي من الحذف.', 'Saved content — protected from deletion.')}
                </p>
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-4">
                    <div className="space-y-2">
                      <Label>المفتاح (Key)</Label>
                      <Input
                        value={item.key}
                        onChange={(e) => updateItem(index, 'key', e.target.value)}
                        disabled={!canEdit || !item.isNew}
                        placeholder="custom.example"
                        className="font-mono text-left"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>القيمة (Data / JSON)</Label>
                      <Textarea
                        disabled={!canEdit}
                        value={item.data}
                        onChange={(e) => updateItem(index, 'data', e.target.value)}
                        rows={typeof item.data === 'string' && (item.data.trim().startsWith('{') || item.data.trim().startsWith('[')) ? 6 : 2}
                        className="font-mono text-left"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button disabled={busy} variant="ghost" size="icon" className="shrink-0 mt-8" aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {item.isNew ? (
                        <DropdownMenuItem disabled={busy} onClick={() => handleRemove(index)}><Trash2 className="h-4 w-4 mr-2" />{t('إزالة المسودة فقط', 'Remove draft only')}</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem disabled={busy || !item.canDelete || !canDelete} className="text-destructive focus:text-destructive" onClick={() => handleDeleteSaved(item.key)}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          {!item.canDelete ? t('مفتاح محمي — لا يمكن حذفه', 'Protected key — cannot delete') : !canDelete ? t('الحذف يحتاج صلاحية', 'Delete permission required') : t('حذف المحتوى المحفوظ', 'Delete saved content')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
          {localItems.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border rounded-xl border-dashed">
              لا يوجد محتوى إضافي. أضف مفتاحاً جديداً للبدء.
            </div>
          )}
        </div>
      </div>
      <DeletionHistory canView={canView} canRestore={canEdit && canDelete} busy={busy} localKeys={new Set(localItems.map(item => item.key))} onRestore={handleRestore} />
    </fieldset>
    </>
  );
}