import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetSalesReturnQueryKey, getListSalesReturnsQueryKey, useCancelSalesReturn, useCompleteSalesReturn,
  useCreateSalesReturn, useGetAdminMe, useGetSalesReturn, useListSalesReturnSources, useUpdateSalesReturn,
  getGetAdminMeQueryKey, type SalesReturn, type SalesReturnCondition, type SalesReturnSource, type SalesReturnSourceType,
} from '@workspace/api-client-react';
import { AlertTriangle, Loader2, Lock, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { useDestructiveConfirmation } from '@/hooks/use-destructive-confirmation';
import { hasPermission } from '@/lib/permissions';
import {
  CONDITIONS, COMPLETION_KEY_PREFIXES, errorText, newLineKey, serializeDraft, sourceModule, type DraftLine,
} from './sales-return-shared';

const POLL_MS = 15000;

export function conditionLabel(c: SalesReturnCondition, t: (ar: string, en: string) => string) {
  return c === 'new' ? t('جديد قابل للبيع', 'New (sellable)')
    : c === 'opened' ? t('مفتوح (مخزون التستر)', 'Opened (tester pool)')
    : t('تالف (بدون مخزون)', 'Damaged (no stock)');
}

export function SalesReturnEditor({ id, onClose, onSaved }: { id: number | null; onClose: () => void; onSaved: (id: number) => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { confirmAction, confirmationDialog } = useDestructiveConfirmation();
  const { data: me } = useGetAdminMe({ query: { queryKey: getGetAdminMeQueryKey() } });

  const detailQuery = useGetSalesReturn(id ?? 0, {
    query: { enabled: id !== null, queryKey: getGetSalesReturnQueryKey(id ?? 0), refetchInterval: POLL_MS, refetchOnMount: 'always' },
  });
  const record: SalesReturn | undefined = id !== null ? detailQuery.data : undefined;
  const isDraft = id === null || record?.status === 'draft';

  const [sourceType, setSourceType] = useState<SalesReturnSourceType>('individual');
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [baseline, setBaseline] = useState('');
  const [seenUpdatedAt, setSeenUpdatedAt] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const initFor = useRef<number | null>(null);

  const canInv = hasPermission(me, 'inventory', 'view') && hasPermission(me, 'inventory', 'edit');
  const canSource = (type: SalesReturnSourceType) =>
    hasPermission(me, sourceModule(type), 'view') && hasPermission(me, sourceModule(type), 'edit');
  const allowedTypes = (['individual', 'company'] as const).filter(canSource);
  const canMutate = canInv && (id === null ? allowedTypes.length > 0 : canSource(record?.sourceType ?? 'individual'));

  // Initialise local draft once per record id; later refetches never overwrite edits.
  useEffect(() => {
    if (id === null || !record || initFor.current === id) return;
    initFor.current = id;
    const mapped = record.lines.map((l) => ({ key: `s-${l.id}`, itemId: String(l.itemId), quantity: String(l.quantity), condition: l.condition }));
    setSourceType(record.sourceType);
    setSourceId(record.sourceId);
    setReason(record.reason ?? '');
    setLines(mapped);
    setBaseline(serializeDraft(record.reason ?? '', mapped));
    setSeenUpdatedAt(record.updatedAt);
  }, [id, record]);

  useEffect(() => {
    if (id === null && allowedTypes.length > 0 && !canSource(sourceType)) setSourceType(allowedTypes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, me]);

  const sourceSearch = id === null ? search.trim() : (record?.orderNumber ?? '');
  const activeType = id === null ? sourceType : (record?.sourceType ?? sourceType);
  const sourcesEnabled = (id === null && canSource(sourceType)) || (id !== null && isDraft && !!record);
  const sourcesParams = { sourceType: activeType, ...(id !== null && record ? { sourceId: record.sourceId } :
    sourceSearch ? { search: sourceSearch } : {}) };
  const sourcesQuery = useListSalesReturnSources(sourcesParams, {
    query: {
      enabled: sourcesEnabled,
      queryKey: ['/api/admin/sales-returns/sources', sourcesParams],
      refetchInterval: POLL_MS * 2,
    },
  });
  const sources: SalesReturnSource[] = sourcesQuery.data ?? [];
  const source = sources.find((s) => s.sourceId === sourceId && s.sourceType === activeType) ?? null;

  const createM = useCreateSalesReturn();
  const updateM = useUpdateSalesReturn();
  const completeM = useCompleteSalesReturn();
  const cancelM = useCancelSalesReturn();
  const busy = createM.isPending || updateM.isPending || completeM.isPending || cancelM.isPending;

  const dirty = serializeDraft(reason, lines) !== baseline;
  const remoteChanged = !!record && seenUpdatedAt !== null && record.updatedAt !== seenUpdatedAt;
  const readOnly = !isDraft || !canMutate;

  const itemById = useMemo(() => new Map((source?.items ?? []).map((i) => [String(i.id), i])), [source]);

  const validate = (): string | null => {
    if (!source) return t('اختر الطلب الأصلي أولاً', 'Select the original order first');
    if (!source.eligible) return source.blockedReason ?? t('هذا الطلب غير قابل للإرجاع', 'This order cannot be returned');
    if (lines.length === 0) return t('أضف بنداً واحداً على الأقل', 'Add at least one line');
    const seen = new Set<string>();
    const totals = new Map<string, number>();
    for (const l of lines) {
      const item = itemById.get(l.itemId);
      if (!item) return t('اختر المنتج في كل بند', 'Choose a product on every line');
      if (item.unitCost === null) return t('تكلفة خروج هذا البند غير موثقة؛ اختر بنداً موثقاً أو راجع المالية', 'This item has no documented exit cost; choose a documented item or request a financial review');
      if (!l.condition) return t(`اختر حالة المرتجع للمنتج ${item.productName}`, `Choose a condition for ${item.productName}`);
      const q = Number(l.quantity);
      if (!Number.isInteger(q) || q < 1) return t('الكمية يجب أن تكون عدداً صحيحاً موجباً', 'Quantity must be a positive whole number');
      const k = `${l.itemId}:${l.condition}`;
      if (seen.has(k)) return t(`تكرار نفس المنتج والحالة: ${item.productName}`, `Duplicate product and condition: ${item.productName}`);
      seen.add(k);
      totals.set(l.itemId, (totals.get(l.itemId) ?? 0) + q);
    }
    for (const [itemId, total] of totals) {
      const item = itemById.get(itemId)!;
      if (total > item.remainingQuantity) {
        return t(`الكمية المرتجعة للمنتج ${item.productName} (${total}) تتجاوز المتبقي (${item.remainingQuantity})`,
          `Return quantity for ${item.productName} (${total}) exceeds the remaining ${item.remainingQuantity}`);
      }
    }
    return null;
  };

  const payload = () => ({
    sourceType: activeType,
    sourceId: sourceId as number,
    reason: reason.trim() ? reason.trim() : null,
    lines: lines.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), condition: l.condition as SalesReturnCondition })),
  });

  const afterSave = (saved: SalesReturn) => {
    queryClient.setQueryData(getGetSalesReturnQueryKey(saved.id), saved);
    queryClient.invalidateQueries({ queryKey: getListSalesReturnsQueryKey() });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/sales-returns/sources'] });
    setSeenUpdatedAt(saved.updatedAt);
    setBaseline(serializeDraft(reason, lines));
  };

  const save = () => {
    const problem = validate();
    setFormError(problem);
    if (problem) return;
    if (id === null) {
      createM.mutate({ data: payload() }, {
        onSuccess: (saved) => {
          initFor.current = saved.id;
          afterSave(saved);
          toast({ title: t('تم حفظ مسودة المرتجع', 'Return draft saved') });
          onSaved(saved.id);
        },
        onError: (e) => setFormError(errorText(e, t('تعذر إنشاء المسودة', 'Could not create the draft'))),
      });
    } else if (record) {
      updateM.mutate({ id, data: { ...payload(), expectedUpdatedAt: record.updatedAt } }, {
        onSuccess: (saved) => { afterSave(saved); toast({ title: t('تم تحديث المسودة', 'Draft updated') }); },
        onError: (e) => setFormError(errorText(e, t('تعذر تحديث المسودة', 'Could not update the draft'))),
      });
    }
  };

  const reloadRemote = () => {
    initFor.current = null;
    void detailQuery.refetch();
  };

  const complete = () => {
    if (!record) return;
    if (dirty) { setFormError(t('احفظ التعديلات قبل إتمام المرتجع', 'Save your edits before completing the return')); return; }
    confirmAction({
      title: t('إتمام المرتجع مرة واحدة؟', 'Complete this return once?'),
      description: t(
        'سيعاد الجديد إلى المخزون القابل للبيع، والمفتوح إلى مخزون التستر، ولن يضاف التالف إلى المخزون. لا يتم صرف أي مبلغ نقدي ولا تعديل فاتورة صادرة ولا تغيير حالة الطلب الأصلي. لا يمكن التراجع.',
        'New items return to sellable stock, opened items go to the tester pool, damaged items add no stock. No cash refund is issued, no issued invoice is edited and the original order status is not changed. This cannot be undone.'),
      confirmLabel: t('إتمام المرتجع', 'Complete return'),
      onConfirm: async () => {
        try {
          const saved = await completeM.mutateAsync({ id: record.id, data: { expectedUpdatedAt: record.updatedAt } });
          queryClient.setQueryData(getGetSalesReturnQueryKey(saved.id), saved);
          await queryClient.invalidateQueries({
            predicate: (q) => typeof q.queryKey[0] === 'string' && COMPLETION_KEY_PREFIXES.some((p) => (q.queryKey[0] as string).startsWith(p)),
          });
          toast({ title: t('تم إتمام المرتجع', 'Return completed') });
        } catch (e) {
          setFormError(errorText(e, t('تعذر إتمام المرتجع', 'Could not complete the return')));
          throw e;
        }
      },
    });
  };

  const cancel = () => {
    if (!record) return;
    confirmAction({
      title: t('إلغاء مسودة المرتجع؟', 'Cancel this return draft?'),
      description: t('سيصبح السجل للقراءة فقط ولن يتأثر المخزون.', 'The record becomes read-only and inventory is not affected.'),
      confirmLabel: t('إلغاء المسودة', 'Cancel draft'),
      onConfirm: async () => {
        try {
          const saved = await cancelM.mutateAsync({ id: record.id, data: { expectedUpdatedAt: record.updatedAt } });
          queryClient.setQueryData(getGetSalesReturnQueryKey(saved.id), saved);
          queryClient.invalidateQueries({ queryKey: getListSalesReturnsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ['/api/admin/sales-returns/sources'] });
          toast({ title: t('تم إلغاء المسودة', 'Draft cancelled') });
        } catch (e) {
          setFormError(errorText(e, t('تعذر إلغاء المسودة', 'Could not cancel the draft')));
          throw e;
        }
      },
    });
  };

  const patchLine = (key: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  if (id !== null && detailQuery.isLoading) {
    return <div className="space-y-3" data-testid="loading-return"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-40 w-full" /></div>;
  }
  if (id !== null && !record) {
    return (
      <div className="space-y-3 text-sm" data-testid="error-return">
        <p className="text-destructive">{errorText(detailQuery.error, t('تعذر تحميل المرتجع', 'Could not load the return'))}</p>
        <Button size="sm" variant="outline" onClick={() => detailQuery.refetch()}>{t('إعادة المحاولة', 'Retry')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="editor-sales-return">
      {!canMutate && (
        <div className="flex gap-2 rounded-md border bg-muted/50 p-3 text-sm" data-testid="notice-view-only">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          {t('صلاحياتك لا تسمح بتعديل المرتجعات: يلزم تعديل المخزون وتعديل الطلبات الأصلية المعنية.', 'Your permissions are view-only here: inventory edit and edit on the original orders module are required.')}
        </div>
      )}
      {id !== null && !isDraft && (
        <div className="flex gap-2 rounded-md border bg-muted/50 p-3 text-sm" data-testid="notice-readonly">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          {record?.status === 'completed' ? t('مرتجع مكتمل: للقراءة فقط.', 'Completed return: read-only.') : t('مرتجع ملغي: للقراءة فقط.', 'Cancelled return: read-only.')}
        </div>
      )}
      <div className="flex gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
        <p>{t('إتمام المرتجع يعيد المخزون فقط. لا يصرف مبلغاً نقدياً، ولا يعدّل فاتورة صادرة، ولا يغيّر حالة الطلب الأصلي تلقائياً.',
          'Completing a return only restocks inventory. It issues no cash refund, does not edit an issued invoice and does not change the original order status.')}</p>
      </div>
      {remoteChanged && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/50 p-3 text-sm" data-testid="notice-remote-changed">
          <span>{t('تغير هذا السجل في مكان آخر. تعديلاتك محفوظة محلياً فقط.', 'This record changed elsewhere. Your edits are kept locally.')}</span>
          <Button size="sm" variant="outline" onClick={reloadRemote}><RefreshCw className="w-3.5 h-3.5 me-1" />{t('تحميل النسخة الجديدة', 'Load latest')}</Button>
        </div>
      )}

      {id === null && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['individual', 'company'] as const).map((type) => (
              <Button key={type} size="sm" type="button" variant={sourceType === type ? 'default' : 'outline'} disabled={!canSource(type) || lines.length > 0 && sourceId !== null && sourceType !== type}
                onClick={() => { setSourceType(type); setSourceId(null); setLines([]); }} data-testid={`button-source-${type}`}>
                {type === 'individual' ? t('طلب فرد', 'Individual order') : t('طلب شركة', 'Company order')}
              </Button>
            ))}
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('ابحث برقم الطلب أو اسم العميل', 'Search order number or customer')} data-testid="input-source-search" />
          {sourcesQuery.isLoading ? <Skeleton className="h-24 w-full" /> : sourcesQuery.isError ? (
            <p className="text-sm text-destructive">{errorText(sourcesQuery.error, t('تعذر تحميل الطلبات', 'Could not load orders'))}{' '}
              <button className="underline" onClick={() => sourcesQuery.refetch()}>{t('إعادة', 'Retry')}</button></p>
          ) : sources.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed rounded-md p-4 text-center" data-testid="empty-sources">{t('لا توجد طلبات مطابقة', 'No matching orders')}</p>
          ) : (
            <ul className="max-h-48 overflow-auto divide-y rounded-md border">
              {sources.map((s) => (
                <li key={`${s.sourceType}-${s.sourceId}`}>
                  <button type="button" disabled={!s.eligible} onClick={() => { setSourceId(s.sourceId); setLines([]); setFormError(null); }}
                    className={`w-full text-start px-3 py-2 text-sm flex justify-between gap-3 ${sourceId === s.sourceId ? 'bg-primary/10' : 'hover:bg-muted/50'} disabled:opacity-60`}
                    data-testid={`button-source-${s.sourceId}`}>
                    <span><span className="font-mono">{s.orderNumber}</span> · {s.customerName}</span>
                    <span className="text-xs text-muted-foreground">{s.eligible ? t('قابل للإرجاع', 'Eligible') : (s.blockedReason ?? t('غير قابل', 'Blocked'))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {id !== null && record && (
        <div className="text-sm grid grid-cols-2 gap-2">
          <div><span className="text-muted-foreground">{t('الطلب', 'Order')}: </span><span className="font-mono">{record.orderNumber}</span></div>
          <div><span className="text-muted-foreground">{t('العميل', 'Customer')}: </span>{record.customerName}</div>
        </div>
      )}

      {source && !source.eligible && <p className="text-sm text-destructive" data-testid="text-blocked">{source.blockedReason ?? t('هذا الطلب غير قابل للإرجاع', 'This order cannot be returned')}</p>}

      {isDraft && source && (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">{t('منتجات الطلب الأصلي', 'Original order items')}</h4>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50"><tr>
                {[t('المنتج', 'Product'), t('الأصلي', 'Ordered'), t('مرتجع سابقاً', 'Returned'), t('المتبقي', 'Remaining')].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}
              </tr></thead>
              <tbody>{source.items.map((i) => (
                <tr key={i.id} className="border-t" data-testid={`row-source-item-${i.id}`}>
                  <td className="px-2 py-1.5">{i.productName}</td><td className="px-2 py-1.5">{i.quantity}</td>
                  <td className="px-2 py-1.5">{i.returnedQuantity}</td><td className="px-2 py-1.5 font-semibold">{i.remainingQuantity}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </section>
      )}

      {isDraft && id !== null && !source && sourcesEnabled && !sourcesQuery.isLoading && (
        <p className="text-sm text-muted-foreground" data-testid="text-source-missing">{t('تعذر تحميل بنود الطلب الأصلي للتعديل.', 'The original order items could not be loaded for editing.')}</p>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">{t('بنود المرتجع', 'Return lines')}</h4>
          {!readOnly && (
            <Button size="sm" variant="outline" type="button" disabled={!source?.eligible}
              onClick={() => setLines((ls) => [...ls, { key: newLineKey(), itemId: '', quantity: '1', condition: '' }])} data-testid="button-add-line">
              <Plus className="w-3.5 h-3.5 me-1" />{t('إضافة بند', 'Add line')}
            </Button>
          )}
        </div>
        {readOnly && record ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>{[t('المنتج', 'Product'), t('الكمية', 'Qty'), t('الحالة', 'Condition'), t('تكلفة الوحدة', 'Unit cost')].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
              <tbody>{(isDraft ? record.lines : record.lines).map((l) => (
                <tr key={l.id} className="border-t" data-testid={`row-line-${l.id}`}>
                  <td className="px-2 py-1.5">{l.productName}</td><td className="px-2 py-1.5">{l.quantity}</td>
                  <td className="px-2 py-1.5">{conditionLabel(l.condition, t)}</td><td className="px-2 py-1.5 font-mono">{l.unitCost}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-md p-4 text-center" data-testid="empty-lines">{t('لا توجد بنود بعد. اختر طلباً ثم أضف بنداً.', 'No lines yet. Pick an order, then add a line.')}</p>
        ) : (
          <ul className="space-y-2">
            {lines.map((l, idx) => (
              <li key={l.key} className="grid grid-cols-12 gap-2 items-end rounded-md border p-2" data-testid={`row-draft-line-${idx}`}>
                <div className="col-span-12 md:col-span-5">
                  <Label className="text-xs">{t('المنتج', 'Product')}</Label>
                  <Select value={l.itemId} onValueChange={(v) => patchLine(l.key, { itemId: v })}>
                    <SelectTrigger data-testid={`select-line-item-${idx}`}><SelectValue placeholder={t('اختر', 'Choose')} /></SelectTrigger>
                    <SelectContent>{(source?.items ?? []).map((i) => (
                      <SelectItem key={i.id} value={String(i.id)} disabled={i.remainingQuantity < 1}>{i.productName} ({i.remainingQuantity})</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-7 md:col-span-4">
                  <Label className="text-xs">{t('الحالة', 'Condition')}</Label>
                  <Select value={l.condition} onValueChange={(v) => patchLine(l.key, { condition: v as SalesReturnCondition })}>
                    <SelectTrigger data-testid={`select-line-condition-${idx}`}><SelectValue placeholder={t('اختر الحالة', 'Choose condition')} /></SelectTrigger>
                    <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{conditionLabel(c, t)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 md:col-span-2">
                  <Label className="text-xs">{t('الكمية', 'Qty')}</Label>
                  <Input type="number" min={1} step={1} inputMode="numeric" value={l.quantity} onChange={(e) => patchLine(l.key, { quantity: e.target.value })} data-testid={`input-line-quantity-${idx}`} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <Button type="button" size="icon" variant="ghost" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={t('حذف البند', 'Remove line')} data-testid={`button-remove-line-${idx}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-1">
        <Label>{t('السبب', 'Reason')}</Label>
        <Textarea value={reason} maxLength={1000} disabled={readOnly} onChange={(e) => setReason(e.target.value)} rows={2} data-testid="input-return-reason" />
      </section>

      {formError && <p className="text-sm text-destructive" role="alert" data-testid="text-form-error">{formError}</p>}

      <div className="flex flex-wrap justify-between gap-2 pt-2 border-t">
        <Button variant="ghost" onClick={onClose} data-testid="button-close-editor">{t('إغلاق', 'Close')}</Button>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {id !== null && <Button variant="outline" disabled={busy} onClick={cancel} data-testid="button-cancel-return">{t('إلغاء المسودة', 'Cancel draft')}</Button>}
            <Button variant="secondary" disabled={busy || (id !== null && !dirty)} onClick={save} data-testid="button-save-return">
              {(createM.isPending || updateM.isPending) && <Loader2 className="w-4 h-4 me-1 animate-spin" />}
              {id === null ? t('حفظ كمسودة', 'Save draft') : t('حفظ التعديلات', 'Save changes')}
            </Button>
            {id !== null && <Button disabled={busy || dirty || lines.length === 0} onClick={complete} data-testid="button-complete-return">{t('إتمام المرتجع', 'Complete return')}</Button>}
          </div>
        )}
      </div>
      {confirmationDialog}
    </div>
  );
}
