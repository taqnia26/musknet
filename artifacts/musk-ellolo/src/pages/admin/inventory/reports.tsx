import { useLanguage } from '@/hooks/use-language';
import {
  useGetInventoryAgingReport,
  useGetInventoryAuditReport,
  useGetInventoryReconciliationReport,
  useGetInventoryValuationReport,
  useGetInventoryValueReport,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart3, CheckCircle2, TriangleAlert } from 'lucide-react';

function StateRow({ loading, error, empty, columns, t }: { loading: boolean; error: boolean; empty: boolean; columns: number; t: (ar: string, en: string) => string }) {
  if (loading) return <TableRow><TableCell colSpan={columns} className="py-8 text-center">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>;
  if (error) return <TableRow><TableCell colSpan={columns} className="py-8 text-center text-destructive">{t('تعذر تحميل التقرير', 'Could not load report')}</TableCell></TableRow>;
  if (empty) return <TableRow><TableCell colSpan={columns} className="py-8 text-center text-muted-foreground">{t('لا توجد بيانات', 'No data')}</TableCell></TableRow>;
  return null;
}

export default function AdminInventoryReports() {
  const { t } = useLanguage();
  const value = useGetInventoryValueReport();
  const aging = useGetInventoryAgingReport();
  const valuation = useGetInventoryValuationReport();
  const audit = useGetInventoryAuditReport();
  const reconciliation = useGetInventoryReconciliationReport();
  const valueRows = Array.isArray(value.data) ? value.data : [];
  const valuationRows = Array.isArray(valuation.data) ? valuation.data : [];
  const auditRows = Array.isArray(audit.data) ? audit.data : [];
  const agingRows = (aging.data ?? []) as Array<NonNullable<typeof aging.data>[number] & { ageDays: number }>;
  const totalQuantity = valueRows.reduce((sum, row) => sum + row.available + row.reserved, 0);
  const totalValue = valueRows.reduce((sum, row) => sum + (row.available + row.reserved) * Number(row.averageCost), 0);
  const balanced = Math.abs(reconciliation.data?.difference ?? 0) < 0.01;

  return <div className="space-y-6">
    <div className="flex items-center gap-2"><BarChart3 className="size-5 text-primary" /><h2 className="text-lg font-semibold">{t('تقارير المخزون والتسوية', 'Inventory reports and reconciliation')}</h2></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{t('إجمالي الوحدات', 'Total units')}</p><p className="text-3xl font-bold">{totalQuantity.toLocaleString()}</p></CardContent></Card>
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{t('القيمة التشغيلية', 'Operational value')}</p><p className="text-3xl font-bold">{totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</p></CardContent></Card>
    </div>

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base">{balanced ? <CheckCircle2 className="size-5 text-success" /> : <TriangleAlert className="size-5 text-destructive" />}{t('التسوية مع المحاسبة', 'Accounting reconciliation')}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {reconciliation.isLoading ? <p>{t('جاري التحميل...', 'Loading...')}</p> : reconciliation.isError ? <p className="text-destructive">{t('تعذر تحميل التسوية', 'Could not load reconciliation')}</p> : reconciliation.data && <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">{t('المخزون التشغيلي', 'Operational')}</p><p className="font-bold">{reconciliation.data.operationalValue.toFixed(2)} SAR</p></div>
            <div><p className="text-xs text-muted-foreground">{t('حساب المخزون', 'Inventory account')}</p><p className="font-bold">{reconciliation.data.accountingInventoryValue.toFixed(2)} SAR</p></div>
            <div><p className="text-xs text-muted-foreground">{t('الفرق', 'Difference')}</p><p className={balanced ? 'font-bold text-success' : 'font-bold text-destructive'}>{reconciliation.data.difference.toFixed(2)} SAR</p></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div><h4 className="mb-2 text-sm font-medium">{t('حركات دون قيد مرتبط', 'Movements without a linked journal')}</h4>{reconciliation.data.unlinkedMovements.length ? reconciliation.data.unlinkedMovements.map((row, i) => <Badge key={i} variant="outline" className="me-2 mb-2">{row.sourceType ?? '—'} · {row.sourceId ?? '—'}</Badge>) : <p className="text-sm text-muted-foreground">{t('لا توجد استثناءات', 'No exceptions')}</p>}</div>
            <div><h4 className="mb-2 text-sm font-medium">{t('قيود مخزون دون حركة', 'Inventory journals without a movement')}</h4>{reconciliation.data.unlinkedInventoryJournals.length ? reconciliation.data.unlinkedInventoryJournals.map((row, i) => <Badge key={i} variant="outline" className="me-2 mb-2">{row.sourceType ?? '—'} · {row.sourceId ?? '—'}</Badge>) : <p className="text-sm text-muted-foreground">{t('لا توجد استثناءات', 'No exceptions')}</p>}</div>
          </div>
        </>}
      </CardContent>
    </Card>

    <Card><CardHeader><CardTitle className="text-base">{t('القيمة حسب الموقع والنوع', 'Value by location and type')}</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>{t('الموقع', 'Location')}</TableHead><TableHead>{t('النوع', 'Type')}</TableHead><TableHead>{t('الكمية', 'Quantity')}</TableHead><TableHead>{t('القيمة', 'Value')}</TableHead></TableRow></TableHeader><TableBody>
      <StateRow loading={valuation.isLoading} error={valuation.isError} empty={!valuationRows.length} columns={4} t={t} />
      {valuationRows.map((row) => <TableRow key={`${row.locationId}-${row.operationalType}`}><TableCell>{row.location}</TableCell><TableCell>{row.operationalType}</TableCell><TableCell>{row.quantity}</TableCell><TableCell>{row.value.toFixed(2)} SAR</TableCell></TableRow>)}
    </TableBody></Table></CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">{t('أعمار المخزون', 'Inventory aging')}</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>{t('الصنف', 'Product')}</TableHead><TableHead>{t('الموقع', 'Location')}</TableHead><TableHead>{t('المتاح', 'Available')}</TableHead><TableHead>{t('العمر بالأيام', 'Age in days')}</TableHead></TableRow></TableHeader><TableBody>
      <StateRow loading={aging.isLoading} error={aging.isError} empty={!agingRows.length} columns={4} t={t} />
      {agingRows.map((row) => <TableRow key={row.id}><TableCell>#{row.productId}</TableCell><TableCell>#{row.locationId}</TableCell><TableCell>{row.available}</TableCell><TableCell>{row.ageDays}</TableCell></TableRow>)}
    </TableBody></Table></CardContent></Card>

    <Card><CardHeader><CardTitle className="text-base">{t('أثر التدقيق', 'Audit trail')}</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>{t('المصدر', 'Source')}</TableHead><TableHead>{t('الصنف', 'Product')}</TableHead><TableHead>{t('التغير', 'Change')}</TableHead><TableHead>{t('المستخدم', 'User')}</TableHead><TableHead>{t('الوقت', 'Time')}</TableHead></TableRow></TableHeader><TableBody>
      <StateRow loading={audit.isLoading} error={audit.isError} empty={!auditRows.length} columns={5} t={t} />
      {auditRows.map((row) => <TableRow key={row.id}><TableCell>{row.sourceType ?? '—'} · {row.sourceId ?? '—'}</TableCell><TableCell>#{row.productId}</TableCell><TableCell className={row.quantityChange < 0 ? 'text-destructive' : 'text-success'}>{row.quantityChange > 0 ? '+' : ''}{row.quantityChange}</TableCell><TableCell>{row.performerName ?? (row.performedBy ? `#${row.performedBy}` : '—')}</TableCell><TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell></TableRow>)}
    </TableBody></Table></CardContent></Card>
  </div>;
}