import { useAdminListSiteContentHistory, getAdminListSiteContentHistoryQueryKey, type SiteContentHistory } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/hooks/use-language';
import { Loader2, RotateCcw } from 'lucide-react';

type Props = {
  canView: boolean;
  canRestore: boolean;
  busy: boolean;
  localKeys: Set<string>;
  onRestore: (entry: SiteContentHistory) => void;
};

export function DeletionHistory({ canView, canRestore, busy, localKeys, onRestore }: Props) {
  const { t, lang } = useLanguage();
  const { data: history, isLoading, isError, refetch } = useAdminListSiteContentHistory({
    query: { queryKey: getAdminListSiteContentHistoryQueryKey(), enabled: canView, staleTime: 0, refetchOnMount: 'always', refetchInterval: 30_000 },
  });
  if (!canView) return null;
  const formatTime = (value: string) => new Date(value).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB');

  return (
    <Card data-testid="site-content-deletion-history">
      <CardHeader>
        <CardTitle>{t('سجل المحتوى المخصص المحذوف', 'Deleted custom content history')}</CardTitle>
        <CardDescription>
          {t('استعد عنصراً واحداً بعد التأكيد. لا تُستبدل المفاتيح الموجودة، ولا يشمل السجل الإعدادات المحمية أو بيانات الفوترة. الاستعادة تتطلب صلاحيتي التعديل والحذف.', 'Restore one item after confirmation. Existing keys are never replaced. Protected settings and billing data are excluded. Restoration requires edit and delete permissions.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" disabled={busy || isLoading} onClick={() => void refetch()}>
          {t('تحديث السجل', 'Refresh history')}
        </Button>
        {isLoading && <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t('جارٍ تحميل السجل…', 'Loading history…')}</p>}
        {isError && <p role="alert" className="text-destructive">{t('تعذر تحميل السجل. أعد المحاولة باستخدام تحديث السجل.', 'Could not load history. Retry using Refresh history.')}</p>}
        {!isLoading && !isError && history?.length === 0 && <p className="text-muted-foreground">{t('لا يوجد محتوى مخصص محذوف في السجل بعد.', 'No deleted custom content has been recorded yet.')}</p>}
        {!isError && history?.map(entry => {
          const existsLocally = localKeys.has(entry.key);
          const disabled = busy || !canRestore || !entry.canRestore || existsLocally;
          return (
            <div key={entry.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
              <div className="min-w-0 space-y-1">
                <p dir="ltr" className="font-mono break-all">{entry.key}</p>
                <p className="text-sm text-muted-foreground">
                  {t('حُذف في', 'Deleted at')} {formatTime(entry.deletedAt)} — {t('بواسطة المستخدم رقم', 'by user ID')} {entry.deletedBy}
                </p>
                {entry.restoredAt ? (
                  <p className="text-sm">{t('تمت الاستعادة في', 'Restored at')} {formatTime(entry.restoredAt)} — {t('بواسطة المستخدم رقم', 'by user ID')} {entry.restoredBy}</p>
                ) : existsLocally || !entry.canRestore ? (
                  <p className="text-sm text-muted-foreground">{t('الاستعادة غير متاحة: المفتاح موجود أو لم يعد مؤهلاً للاستعادة.', 'Restoration unavailable: the key exists or is no longer eligible.')}</p>
                ) : !canRestore ? (
                  <p className="text-sm text-muted-foreground">{t('تحتاج الاستعادة إلى صلاحيتي التعديل والحذف.', 'Edit and delete permissions are required to restore.')}</p>
                ) : null}
              </div>
              <Button variant="outline" disabled={disabled} onClick={() => onRestore(entry)} aria-label={t(`استعادة ${entry.key}`, `Restore ${entry.key}`)}>
                <RotateCcw className="h-4 w-4 me-2" />
                {t('استعادة', 'Restore')}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}