import { useEffect, useMemo, useState } from 'react';
import {
  getAdminListOpeningBalanceImportsQueryKey,
  useAdminApproveOpeningBalanceImport,
  useAdminCreateOpeningBalanceImport,
  useAdminListOpeningBalanceImports,
  useAdminMapOpeningBalanceLine,
  useAdminReviewOpeningBalanceImport,
  useAdminListProducts,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { sortProductsForSelection } from '@/lib/product-sort';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import workbookUrl from '../../../../../attached_assets/التزامات_مسك_1789830735422.xlsx?url';

type ParsedLine = {
  sourceRow: number;
  sourceLabel: string;
  sourceQuantity: number;
  openingQuantity: number;
  fullBatchUnitCost: number;
  provenance: { file: string; sheet: string; row: number; columns: Record<string, string> };
};

type ReconciliationLine = ParsedLine & {
  id: number;
  productId?: number | null;
  mappingState?: 'mapped' | 'unmapped' | 'rejected';
  openingValue?: string;
};

type Reconciliation = {
  id: number;
  importKey: string;
  sourceFileName: string;
  sourceSheet: string;
  status: 'draft' | 'review' | 'approved' | 'rejected';
  lineCount?: number;
  mappedCount?: number;
  unmappedCount?: number;
  lines?: ReconciliationLine[];
};

const numberValue = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

function parseSheet(rows: unknown[][], sheet: string, file: string) {
  const blocks = new Map<string, ParsedLine>();
  [0, 7].forEach((base) => {
    rows.forEach((row, index) => {
      const title = String(row?.[base] ?? '').trim();
      if (!/^تكاليف بضاعة/.test(title)) return;
      let actualQuantity: number | null = null;
      let packagingQuantity: number | null = null;
      for (let cursor = index + 1; cursor < Math.min(rows.length, index + 26); cursor += 1) {
        const label = String(rows[cursor]?.[base] ?? '').trim();
        if (cursor > index + 1 && /^(تكاليف بضاعة|حساب تكلفة)/.test(label)) break;
        if (label.includes('الاجمال')) break;
        const candidate = numberValue(rows[cursor]?.[base + 1]);
        if (candidate !== null && candidate > 0) {
          if (label.includes('التعبئة والتغليف')) packagingQuantity = Math.floor(candidate);
          if (actualQuantity === null) actualQuantity = Math.floor(candidate);
        }
      }
      actualQuantity = packagingQuantity ?? actualQuantity;
      if (actualQuantity !== null && actualQuantity > 0) {
        blocks.set(title, {
          sourceRow: index + 1,
          sourceLabel: title,
          sourceQuantity: actualQuantity,
          openingQuantity: actualQuantity,
          fullBatchUnitCost: 0,
          provenance: { file, sheet, row: index + 1, columns: { quantity: `${String.fromCharCode(65 + base + 1)}:${index + 1}` } },
        });
      }
    });
  });
  return blocks;
}

function parseFullBatchCosts(rows: unknown[][]) {
  const costs = new Map<string, number>();
  [0, 7].forEach((base) => rows.forEach((row, index) => {
    const title = String(row?.[base] ?? '').trim();
    if (!/^تكاليف بضاعة/.test(title)) return;
    for (let cursor = index + 1; cursor < Math.min(rows.length, index + 30); cursor += 1) {
      const label = String(rows[cursor]?.[base] ?? '').trim();
      if (cursor > index + 1 && /^(تكاليف بضاعة|حساب تكلفة)/.test(label)) break;
      if (label.includes('الاجمال')) {
        const cost = numberValue(rows[cursor]?.[base + 4]);
        if (cost !== null) costs.set(title, cost);
        break;
      }
    }
  }));
  return costs;
}

// Kept separate from the source-table viewer: this parser creates only a reviewable draft.
async function parseOpeningLines() {
  const [response, XLSX] = await Promise.all([fetch(workbookUrl), import('xlsx')]);
  if (!response.ok) throw new Error('Workbook request failed');
  const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array', cellDates: true });
  const actualSheet = 'المخوزن الفعلي';
  const fullSheet = 'المخزون الكلي';
  const actualRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[actualSheet], { header: 1, raw: false, defval: '', blankrows: true });
  const fullRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[fullSheet], { header: 1, raw: false, defval: '', blankrows: true });
  const costs = parseFullBatchCosts(fullRows);
  return [...parseSheet(actualRows, actualSheet, 'التزامات_مسك_1789830735422.xlsx').values()]
    .filter((line) => costs.has(line.sourceLabel))
    .map((line) => ({ ...line, fullBatchUnitCost: costs.get(line.sourceLabel) ?? 0 }));
}

export function OpeningBalanceReconciliation() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const { data: imports = [], isLoading, isError } = useAdminListOpeningBalanceImports();
  const { data: products = [] } = useAdminListProducts({});
  const productOptions = useMemo(() => sortProductsForSelection(products, lang), [products, lang]);
  const createMutation = useAdminCreateOpeningBalanceImport();
  const mapMutation = useAdminMapOpeningBalanceLine();
  const reviewMutation = useAdminReviewOpeningBalanceImport();
  const approveMutation = useAdminApproveOpeningBalanceImport();
  const selected = (imports as Reconciliation[]).find((item) => item.id === selectedId) ?? (imports as Reconciliation[])[0];
  const lines = selected?.lines ?? [];
  const mapped = lines.filter((line) => line.mappingState === 'mapped' && line.productId).length;
  const unmapped = lines.length - mapped;

  useEffect(() => {
    if (!selectedId && imports.length) setSelectedId((imports[0] as Reconciliation).id);
  }, [imports, selectedId]);

  const createDraft = async () => {
    setIsParsing(true);
    try {
      const lines = await parseOpeningLines();
      if (!lines.length) throw new Error('No finished-product opening lines could be read from the workbook');
      createMutation.mutate({
        data: {
          importKey: 'musk-ellolo-opening-balances-2026-09-19',
          sourceFileName: 'التزامات_مسك_1789830735422.xlsx',
          sourceSheet: 'المخوزن الفعلي + المخزون الكلي',
          lines,
        },
      }, {
        onSuccess: (created) => {
          setSelectedId(created.id);
          queryClient.invalidateQueries({ queryKey: getAdminListOpeningBalanceImportsQueryKey() });
          toast({ title: t('تم إنشاء مسودة المراجعة', 'Review draft created') });
        },
        onError: (error) => toast({ title: t('تعذر إنشاء المسودة', 'Could not create draft'), description: String((error as Error).message), variant: 'destructive' }),
      });
    } catch (error) {
      toast({ title: t('تعذر قراءة ملف Excel', 'Could not read workbook'), description: String((error as Error).message), variant: 'destructive' });
    } finally {
      setIsParsing(false);
    }
  };

  const mapLine = (line: ReconciliationLine, value: string) => {
    const productId = value ? Number(value) : null;
    mapMutation.mutate({ id: selected!.id, lineId: line.id, data: { productId, mappingNote: productId ? null : t('تم ترك السطر للمراجعة', 'Left for review') } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getAdminListOpeningBalanceImportsQueryKey() }),
      onError: (error) => toast({ title: t('تعذر حفظ المطابقة', 'Could not save mapping'), description: String((error as Error).message), variant: 'destructive' }),
    });
  };

  const review = () => reviewMutation.mutate({ id: selected!.id }, {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getAdminListOpeningBalanceImportsQueryKey() }),
    onError: (error) => toast({ title: t('تعذر نقل المسودة للمراجعة', 'Could not move draft to review'), description: String((error as Error).message), variant: 'destructive' }),
  });

  const approve = () => approveMutation.mutate({ id: selected!.id, data: { entryDate } }, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getAdminListOpeningBalanceImportsQueryKey() });
      toast({ title: t('تم اعتماد الرصيد الافتتاحي', 'Opening balance approved') });
    },
    onError: (error) => toast({ title: t('تعذر الاعتماد', 'Approval failed'), description: String((error as Error).message), variant: 'destructive' }),
  });

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm space-y-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('مطابقة الرصيد الافتتاحي', 'Opening balance reconciliation')}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('مصدر الكمية: المخوزن الفعلي · مصدر التكلفة: المخزون الكلي · التقييم: المتوسط المرجح', 'Quantity: المخوزن الفعلي · cost: المخزون الكلي · valuation: weighted average')}
          </p>
        </div>
        <Button variant="outline" onClick={createDraft} disabled={isParsing || createMutation.isPending}>
          <RefreshCw className={`me-2 h-4 w-4 ${isParsing ? 'animate-spin' : ''}`} />
          {t('إنشاء مسودة من الملف', 'Create workbook review draft')}
        </Button>
      </div>

      {isError && <p className="text-sm text-destructive">{t('تعذر تحميل مسودات المطابقة.', 'Could not load reconciliation drafts.')}</p>}
      {isLoading ? <p className="text-sm text-muted-foreground">{t('جاري التحميل...', 'Loading...')}</p> : !selected ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t('لا توجد مسودة. إنشاء المسودة لا يرحّل أي حركة حتى تتم المطابقة والاعتماد.', 'No draft yet. Creating a draft posts nothing until mappings and approval are complete.')}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(imports as Reconciliation[]).map((item) => (
              <Button key={item.id} variant={item.id === selected.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedId(item.id)}>
                #{item.id} · {item.status}
              </Button>
            ))}
            <Badge variant={selected.status === 'approved' ? 'default' : 'outline'}>{selected.status}</Badge>
            <Badge variant={unmapped ? 'destructive' : 'secondary'}>{mapped}/{lines.length} {t('مطابق', 'mapped')}</Badge>
          </div>
          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t('المصدر', 'Source')}</TableHead>
                <TableHead>{t('الكمية الافتتاحية', 'Opening qty')}</TableHead>
                <TableHead>{t('تكلفة الوحدة', 'Full-batch unit cost')}</TableHead>
                <TableHead>{t('المنتج المطابق', 'Mapped product')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell><div className="font-medium">{line.sourceLabel}</div><div className="text-xs text-muted-foreground">{line.provenance?.sheet} · {t('صف', 'row')} {line.provenance?.row}</div></TableCell>
                    <TableCell>{line.openingQuantity}</TableCell>
                    <TableCell>{line.fullBatchUnitCost}</TableCell>
                    <TableCell>
                      {selected.status === 'approved' ? (
                        <span>{products.find((product) => product.id === line.productId)?.nameAr ?? line.productId ?? '—'}</span>
                      ) : (
                        <select className="h-9 min-w-[220px] rounded-md border bg-background px-2 text-sm" value={line.productId ?? ''} onChange={(event) => mapLine(line, event.target.value)}>
                          <option value="">{t('اختر يدويًا — لا يوجد تخمين', 'Select manually — no fuzzy match')}</option>
                           {productOptions.map((product) => <option key={product.id} value={product.id}>{lang === 'ar' ? product.nameAr : product.nameEn}</option>)}
                        </select>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="text-sm text-muted-foreground">
              <p>{t('الملف الخام للمرجع فقط؛ لا يتم تسجيل قيمة سعر البيع كمخزون.', 'Raw workbook is reference only; sale value is never posted as inventory.')}</p>
              {unmapped > 0 && <p className="mt-1 flex items-center gap-1 text-destructive"><AlertTriangle className="h-4 w-4" />{unmapped} {t('سطر يحتاج مطابقة', 'lines require mapping')}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selected.status === 'draft' && <Button onClick={review} disabled={unmapped > 0 || reviewMutation.isPending}>{t('نقل للمراجعة', 'Move to review')}</Button>}
              {selected.status === 'review' && (
                <>
                  <Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} className="w-[150px]" />
                  <Button onClick={approve} disabled={unmapped > 0 || approveMutation.isPending}><CheckCircle2 className="me-2 h-4 w-4" />{t('اعتماد وترحيل', 'Approve & post')}</Button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}