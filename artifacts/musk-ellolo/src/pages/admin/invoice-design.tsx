import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAdminMe, useAdminGetInvoiceDesign, useAdminSaveInvoiceDesign, useAdminPublishInvoiceDesign,
  useAdminResetInvoiceDesign, getAdminGetInvoiceDesignQueryKey, getAdminGetPublishedInvoiceDesignQueryKey,
} from '@workspace/api-client-react';
import {
  applyEditorPatch, browserAssets, createTemplate, editorView, designErrors, designSchema, retainRenderableDesign,
  type DesignElement, type InvoiceDesign,
} from '@workspace/invoice-document';
import {
  AlertTriangle, Undo2, Redo2, ZoomIn, ZoomOut, Type, Minus, Save, Rocket, RotateCcw, Lock, RefreshCw, ShieldAlert, History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { InvoiceCanvas } from '@/components/admin/invoice-design/canvas';
import { EditorDialogs, type Dlg } from '@/components/admin/invoice-design/dialogs';
import { PropertiesPanel, selCls } from '@/components/admin/invoice-design/properties-panel';
import { ColumnsPanel, TemplatesPanel } from '@/components/admin/invoice-design/side-panels';
import { apiErrorMessage, clamp, fmt, key, MAX_X, MAX_Y, r1, type DocReport } from '@/components/admin/invoice-design/helpers';
import { useDesignHistory } from '@/components/admin/invoice-design/use-design-history';
import { useInvoiceSource } from '@/components/admin/invoice-design/use-invoice-source';
import { useLeaveGuard } from '@/components/admin/invoice-design/use-leave-guard';


function Blocked({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-card p-8 text-center" data-testid="invoice-design-blocked">
      <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-accent" />
      <h1 className="mb-2 text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default function AdminInvoiceDesign() {
  const { data: me, isLoading } = useGetAdminMe();
  if (isLoading) return <Skeleton className="h-[70vh] w-full rounded-2xl" />;
  if (!hasPermission(me, 'finance', 'view')) return <Blocked title="لا تملك صلاحية الوصول" body="تصميم الفاتورة متاح لفريق المالية فقط. تواصل مع مدير النظام لمنحك صلاحية عرض المالية." />;
  return <Editor canEdit={hasPermission(me, 'finance', 'edit')} canInvoices={hasPermission(me, 'invoices', 'view')} />;
}

function Editor({ canEdit, canInvoices }: { canEdit: boolean; canInvoices: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const designQuery = useAdminGetInvoiceDesign({
    query: { queryKey: getAdminGetInvoiceDesignQueryKey(), refetchOnWindowFocus: true, refetchInterval: 30000 },
  });
  const server = designQuery.data;
  const parsed = useMemo(() => {
    if (!server) return null;
    const d = designSchema.safeParse(server.draft);
    return d.success ? { state: server, draft: d.data } : null;
  }, [server]);
  const badServer = !!server && !parsed;

  const h = useDesignHistory();
  const { design } = h;
  const [baseline, setBaseline] = useState<InvoiceDesign | null>(null);
  const [rev, setRev] = useState<number | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.8);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [conflict, setConflict] = useState(false);
  const [report, setReport] = useState<DocReport>({ design: null, ready: false, errors: [] });
  const [renderDesign, setRenderDesign] = useState<InvoiceDesign | null>(null);
  const dirty = key(design) !== key(baseline);
  const guard = useLeaveGuard(dirty);
  const src = useInvoiceSource(canInvoices, server?.sampleQr);
  const assets = useMemo(() => browserAssets(import.meta.env.BASE_URL), []);
  const miniDesigns = useMemo(() => (['reference', 'formal', 'modern'] as const).map((t) => createTemplate(t)), []);

  const load = useCallback((d: InvoiceDesign, r: number) => { h.reset(d); setBaseline(d); setRev(r); setConflict(false); }, [h.reset]);
  const stale = !!parsed && rev !== null && parsed.state.revision !== rev;
  useEffect(() => {
    if (!parsed) return;
    if (rev === null || (!dirty && stale)) load(parsed.draft, parsed.state.revision);
  }, [parsed, rev, dirty, stale, load]);
  useEffect(() => {
    if (!design) return undefined;
    const t = setTimeout(() => setRenderDesign(previous => retainRenderableDesign(design, previous)), 150);
    return () => clearTimeout(t);
  }, [design]);

  const errors = useMemo(() => (design ? designErrors(design) : []), [design]);
  // Correcting/undoing back to identical HTML does not reload the iframe.
  // Match the measured configuration by value, not state-object identity.
  const docIsCurrent = !!design && key(report.design) === key(design);
  const docReady = docIsCurrent && report.ready;
  const docErrors = docIsCurrent ? report.errors : [];
  const allErrors = [...errors, ...docErrors.filter((e) => !errors.includes(e))];

  const after = (s: NonNullable<typeof server>, msg: string, replaceWorking = false) => {
    const d = designSchema.safeParse(s.draft);
    if (d.success) {
      if (replaceWorking) load(d.data, s.revision);
      else {
        // A response acknowledges the submitted snapshot, not newer working edits.
        // Keep present/past/future untouched, including invalid intermediate input.
        setBaseline(d.data); setRev(s.revision); setConflict(false);
      }
    }
    qc.setQueryData(getAdminGetInvoiceDesignQueryKey(), s);
    qc.invalidateQueries({ queryKey: getAdminGetInvoiceDesignQueryKey() });
    qc.invalidateQueries({ queryKey: getAdminGetPublishedInvoiceDesignQueryKey() });
    toast({ title: msg });
  };
  const onErr = (e: unknown) => {
    setDlg(null);
    if ((e as { status?: number })?.status === 409) {
      setConflict(true);
      designQuery.refetch();
      toast({ variant: 'destructive', title: 'تعارض في المراجعة', description: `${apiErrorMessage(e)} تعديلاتك محفوظة محلياً.` });
    } else toast({ variant: 'destructive', title: 'تعذر تنفيذ العملية', description: apiErrorMessage(e) });
  };
  const save = useAdminSaveInvoiceDesign({ mutation: { onSuccess: (s) => after(s, 'تم حفظ المسودة'), onError: onErr } });
  const publish = useAdminPublishInvoiceDesign({ mutation: { onSuccess: (s) => { setDlg(null); after(s, 'تم اعتماد التصميم على جميع الفواتير'); }, onError: onErr } });
  const reset = useAdminResetInvoiceDesign({ mutation: { onSuccess: (s) => { setDlg(null); after(s, 'تمت استعادة التصميم الافتراضي', true); }, onError: onErr } });
  const busy = save.isPending || publish.isPending || reset.isPending;

  const { edit, gestureEdit, undo, redo } = h;
  const patchEl = useCallback((id: string, p: Partial<DesignElement>, k?: string) =>
    edit((d) => applyEditorPatch(d, id, p), k), [edit]);
  const onGesture = useCallback((id: string, p: Partial<DesignElement>, first: boolean) =>
    gestureEdit((d) => applyEditorPatch(d, id, p), first), [gestureEdit]);
  const view = design ? editorView(design) : null;
  const sel = view?.elements.find((e) => e.id === selId) ?? null;
  const removeSel = () => {
    if (!sel || (sel.kind !== 'text' && sel.kind !== 'divider')) return;
    edit((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== sel.id) }));
    setSelId(null);
  };
  const addCustom = (kind: 'text' | 'divider') => {
    if (!design) return;
    let n = 1; while (design.elements.some((e) => e.id === `${kind}-${n}`)) n++;
    const id = `${kind}-${n}`;
    const el: DesignElement = {
      ...design.elements[0], id, kind, x: 14, y: kind === 'text' ? 98.5 : 100, width: kind === 'text' ? 70 : 182, height: kind === 'text' ? 5 : 0.4,
      text: kind === 'text' ? 'نص ثابت' : undefined, heading: undefined, fontSize: 10, fontWeight: 'normal',
      background: '#ffffff', borderWidth: 0, padding: 0.5, align: 'start',
    };
    if (kind === 'divider') { delete el.text; el.borderColor = '#d5d5d5'; }
    edit((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelId(id);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (ro) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (!sel || !canEdit) return;
    const st = e.shiftKey ? 5 : 0.5;
    const mv: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] };
    if (mv[e.key]) {
      e.preventDefault();
      patchEl(sel.id, { x: r1(clamp(sel.x + mv[e.key][0], 8, MAX_X - sel.width)), y: r1(clamp(sel.y + mv[e.key][1], 8, MAX_Y - sel.height)) }, `k-${sel.id}`);
    } else if (e.key === 'Delete' || e.key === 'Backspace') removeSel();
  };

  if (designQuery.isLoading || (!design && !designQuery.isError && !badServer)) {
    return <div className="space-y-4"><Skeleton className="h-14 w-full" /><Skeleton className="h-[70vh] w-full rounded-2xl" /></div>;
  }
  if (designQuery.isError || badServer || !design) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-2xl border border-destructive/40 bg-card p-8 text-center" data-testid="invoice-design-error">
        <AlertTriangle className="mx-auto mb-3 h-9 w-9 text-destructive" />
        <h1 className="mb-1 font-semibold">تعذر تحميل تصميم الفاتورة</h1>
        <p className="mb-4 text-sm text-muted-foreground">{badServer ? 'بنية التصميم المحفوظ غير صالحة.' : 'تحقق من الاتصال ثم أعد المحاولة.'}</p>
        <Button onClick={() => designQuery.refetch()} data-testid="button-retry-design"><RefreshCw className="me-2 h-4 w-4" />إعادة المحاولة</Button>
      </div>
    );
  }
  const ro = !canEdit || reset.isPending;
  const isPublished = !!server && JSON.stringify(server.published) === JSON.stringify(design);
  const chip = 'rounded-full px-2.5 py-0.5';

  return (
    <div className="space-y-4" dir="rtl" onKeyDown={onKey}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">تصميم الفاتورة</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            المراجعة {server?.revision} · آخر حفظ {fmt(server?.updatedAt ?? null)}{server?.updatedBy ? ` بواسطة المستخدم #${server.updatedBy}` : ''} · آخر اعتماد {fmt(server?.publishedAt ?? null)}{server?.publishedBy ? ` بواسطة المستخدم #${server.publishedBy}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className={cn(chip, dirty ? 'bg-amber-500/15 text-amber-500' : 'bg-emerald-500/15 text-emerald-500')} data-testid="status-draft">{dirty ? 'تعديلات غير محفوظة' : 'المسودة محفوظة'}</span>
            <span className={cn(chip, 'bg-muted text-muted-foreground')} data-testid="status-published">{isPublished ? 'مطابق للمعتمد' : 'يختلف عن التصميم المعتمد'}</span>
            <span className={cn(chip, docReady ? (docErrors.length ? 'bg-destructive/15 text-destructive' : 'bg-emerald-500/15 text-emerald-500') : 'bg-muted text-muted-foreground')} data-testid="status-document">
              {docReady ? (docErrors.length ? 'المستند يحتوي أخطاء' : 'المستند جاهز') : 'جارٍ قياس المستند'}
            </span>
            {ro && <span className={cn(chip, 'inline-flex items-center gap-1 bg-muted')}><Lock className="h-3 w-3" />للقراءة فقط</span>}
          </div>
        </div>
        {!ro && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || !dirty} onClick={() => setDlg('discard')} data-testid="button-discard"><History className="me-2 h-4 w-4" />تجاهل التعديلات</Button>
            <Button variant="outline" disabled={busy} onClick={() => setDlg('reset')} data-testid="button-restore-default"><RotateCcw className="me-2 h-4 w-4" />استعادة الافتراضي العام</Button>
            <Button variant="secondary" disabled={busy || rev === null || !dirty || errors.length > 0} onClick={() => save.mutate({ data: { revision: rev!, design } })} data-testid="button-save-draft"><Save className="me-2 h-4 w-4" />حفظ المسودة</Button>
            <Button disabled={busy || allErrors.length > 0 || !docReady || rev === null} onClick={() => setDlg('publish')} data-testid="button-publish"><Rocket className="me-2 h-4 w-4" />اعتماد وتطبيق على جميع الفواتير</Button>
          </div>
        )}
      </div>

      {(conflict || (stale && dirty)) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm" data-testid="banner-conflict">
          <span>تغيّر التصميم على الخادم (المراجعة {parsed?.state.revision}) أثناء تحريرك. تعديلاتك المحلية ما زالت محفوظة هنا.</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { if (parsed) { setBaseline(parsed.draft); setRev(parsed.state.revision); setConflict(false); } }} data-testid="button-keep-edits">متابعة تعديلاتي على الأحدث</Button>
            <Button size="sm" variant="outline" onClick={() => parsed && load(parsed.draft, parsed.state.revision)} data-testid="button-reload-server">تحميل نسخة الخادم</Button>
          </div>
        </div>
      )}

      {!designSchema.safeParse(design).success && <p role="status" data-testid="preview-retained" className="text-sm text-amber-600">تعرض المعاينة آخر إعدادات صالحة. تعديلاتك باقية في المحرر ولم تُفقد؛ صحح القيم غير الصالحة للمتابعة.</p>}
      {allErrors.length > 0 && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs" data-testid="list-design-errors">
          <div className="mb-1 flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" />لا يمكن الاعتماد قبل إصلاح {allErrors.length} ملاحظة</div>
          <ul className="list-disc space-y-0.5 pe-4 ps-5">{allErrors.map((er) => <li key={er}>{er}</li>)}</ul>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
            <Button size="icon" variant="ghost" disabled={!h.canUndo || ro} onClick={undo} aria-label="تراجع" data-testid="button-undo"><Undo2 className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" disabled={!h.canRedo || ro} onClick={redo} aria-label="إعادة" data-testid="button-redo"><Redo2 className="h-4 w-4" /></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button size="icon" variant="ghost" onClick={() => setZoom((z) => clamp(r1(z - 0.1), 0.4, 1.6))} aria-label="تصغير" data-testid="button-zoom-out"><ZoomOut className="h-4 w-4" /></Button>
            <span className="w-10 text-center text-xs tabular-nums" data-testid="text-zoom">{Math.round(zoom * 100)}%</span>
            <Button size="icon" variant="ghost" onClick={() => setZoom((z) => clamp(r1(z + 0.1), 0.4, 1.6))} aria-label="تكبير" data-testid="button-zoom-in"><ZoomIn className="h-4 w-4" /></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button size="sm" variant="ghost" disabled={ro} onClick={() => addCustom('text')} data-testid="button-add-text"><Type className="me-1 h-4 w-4" />نص ثابت</Button>
            <Button size="sm" variant="ghost" disabled={ro} onClick={() => addCustom('divider')} data-testid="button-add-divider"><Minus className="me-1 h-4 w-4" />فاصل</Button>
            <select className={cn(selCls, 'ms-auto')} value={src.sample} onChange={(e) => src.setSample(e.target.value)} data-testid="select-sample" aria-label="مصدر المعاينة">
              <option value="short">عينة قصيرة</option>
              <option value="long">عينة طويلة</option>
              {src.list.slice(0, 100).map((i) => <option key={i.id} value={`inv:${i.id}`}>فاتورة {i.invoiceNumber}</option>)}
            </select>
          </div>
          <InvoiceCanvas design={view!} renderDesign={renderDesign ?? design} invoice={src.invoice} assets={assets} qrUrl={src.qrUrl}
            zoom={zoom} selId={selId} canEdit={canEdit} onSelect={setSelId} onGesture={onGesture} onReport={setReport} />
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            اسحب العنصر أو مقابضه لتحريكه بحرية. الأسهم تحرك 0.5 مم، ومع Shift خمسة مم. المواضع بالمليمتر من الزاوية العليا اليسرى للورقة A4 وبدون عكس في العربية. بعد ترقيم الصفحات تُعرض الإطارات على مواضع العناصر الفعلية في كل صفحة، والبيانات المالية في المعاينة لا تُعدَّل من هنا.
          </p>
        </div>

        <div className="space-y-4">
          <TemplatesPanel design={design} ro={ro} miniDesigns={miniDesigns} invoice={src.shortInv} assets={assets} qrUrl={src.sampleQr}
            onApply={(t) => { edit(() => createTemplate(t)); setSelId(null); }} />
          <PropertiesPanel sel={sel} ro={ro} patch={patchEl} onDelete={removeSel} />
          <ColumnsPanel design={design} ro={ro}
            setCol={(k, v) => edit((d) => ({ ...d, columns: { ...d.columns, [k]: v } }), `col-${k}`)}
            balance={() => edit((d) => ({ ...d, columns: { ...d.columns, product: r1(100 - d.columns.quantity - d.columns.unitPrice - d.columns.total) } }))} />
        </div>
      </div>

      <EditorDialogs dlg={dlg} close={() => setDlg(null)} dirty={dirty} leaveOpen={guard.open} stay={guard.stay} leave={guard.leave}
        publishing={publish.isPending} resetting={reset.isPending}
        onPublish={() => rev !== null && publish.mutate({ data: { revision: rev, design } })}
        onReset={() => rev !== null && reset.mutate({ data: { revision: rev } })}
        onDiscard={() => { if (baseline && rev !== null) load(baseline, rev); setDlg(null); }} />
    </div>
  );
}
