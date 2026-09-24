import { useState } from 'react';
import { useLanguage } from '@/hooks/use-language';
import {
  useGetInventoryValuationReport,
  getGetInventoryValuationReportQueryKey,
  useGetInventoryAgingReport,
  getGetInventoryAgingReportQueryKey,
  useGetInventoryAuditReport,
  getGetInventoryAuditReportQueryKey,
  useGetInventoryReconciliationReport,
  getGetInventoryReconciliationReportQueryKey
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, AlertCircle, Clock, CheckSquare, Scale, Search, FileText, Download } from 'lucide-react';
import { format } from 'date-fns';
import { formatInteger } from '@/lib/formatters';
import { Money } from '@/components/money';
import { Button } from '@/components/ui/button';

export default function AdminInventoryReports() {
  const { t, lang } = useLanguage();
  const [activeTab, setActiveTab] = useState('valuation');

  // Hooks for various reports
  const valuationQuery = useGetInventoryValuationReport({ format: 'json' }, { query: { enabled: activeTab === 'valuation', queryKey: getGetInventoryValuationReportQueryKey({ format: 'json' }) } });
  const agingQuery = useGetInventoryAgingReport({ query: { enabled: activeTab === 'aging', queryKey: getGetInventoryAgingReportQueryKey() } });
  const auditQuery = useGetInventoryAuditReport({ page: 1 }, { query: { enabled: activeTab === 'audit', queryKey: getGetInventoryAuditReportQueryKey({ page: 1 }) } });
  const reconciliationQuery = useGetInventoryReconciliationReport({ query: { enabled: activeTab === 'reconciliation', queryKey: getGetInventoryReconciliationReportQueryKey() } });

  // Format helpers
  const money = (val: number) => <Money value={val} lang={lang} />;

  // Safe data extraction
  const valuationData = typeof valuationQuery.data === 'string' ? null : valuationQuery.data;
  const auditData = typeof auditQuery.data === 'string' ? null : auditQuery.data;
  const agingData = agingQuery.data;
  const reconciliationData = reconciliationQuery.data;

  const activeReportRows = activeTab === 'valuation'
    ? valuationData ?? []
    : activeTab === 'aging'
      ? agingData ?? []
      : activeTab === 'audit'
        ? auditData?.items ?? []
        : reconciliationData
          ? [reconciliationData]
          : [];

  const downloadActiveReport = () => {
    if (activeReportRows.length === 0) return;
    const flattened = activeReportRows.map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value !== null && typeof value === 'object' ? JSON.stringify(value) : value,
      ]),
    ));
    const headers = Array.from(new Set(flattened.flatMap((row) => Object.keys(row))));
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [
      headers.map(escape).join(','),
      ...flattened.map((row) => headers.map((header) => escape(row[header])).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" />
            {t('تقارير المخزون', 'Inventory Reports')}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {t('تحليلات مالية وعملياتية دقيقة للأرصدة والحركات', 'Precise financial and operational analytics for balances and movements')}
          </p>
        </div>
        <Button variant="outline" className="gap-2" disabled={activeReportRows.length === 0} onClick={downloadActiveReport}>
          <Download className="h-4 w-4" />
          {t('تنزيل التقرير', 'Download report')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-3xl h-auto">
          <TabsTrigger value="valuation" className="py-2.5" data-testid="tab-valuation">
            <FileText className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
            {t('تقييم المخزون', 'Valuation')}
          </TabsTrigger>
          <TabsTrigger value="aging" className="py-2.5" data-testid="tab-aging">
            <Clock className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
            {t('أعمار المخزون', 'Aging')}
          </TabsTrigger>
          <TabsTrigger value="audit" className="py-2.5" data-testid="tab-audit">
            <CheckSquare className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
            {t('مراجعة الحركات', 'Audit Trail')}
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="py-2.5" data-testid="tab-reconciliation">
            <Scale className="h-4 w-4 mr-2 rtl:ml-2 rtl:mr-0" />
            {t('مطابقة المخزون', 'Reconciliation')}
          </TabsTrigger>
        </TabsList>

        {/* Valuation Tab */}
        <TabsContent value="valuation" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('قيمة المخزون حسب الموقع', 'Inventory Value by Location')}</CardTitle>
              <CardDescription>{t('إجمالي قيمة الأرصدة المتوفرة مقيمة بمتوسط التكلفة', 'Total value of available balances evaluated at average cost')}</CardDescription>
            </CardHeader>
            <CardContent>
              {valuationQuery.isLoading ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground">{t('جاري التحميل...', 'Loading...')}</div>
              ) : valuationQuery.isError ? (
                <div className="h-40 flex items-center justify-center text-destructive">{t('تعذر تحميل التقرير', 'Failed to load report')}</div>
              ) : !valuationData || valuationData.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground">{t('لا توجد بيانات', 'No data')}</div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>{t('رمز الموقع', 'Location ID')}</TableHead>
                        <TableHead>{t('الموقع', 'Location Name')}</TableHead>
                        <TableHead>{t('النوع', 'Type')}</TableHead>
                        <TableHead className="text-end">{t('إجمالي الكمية', 'Total Quantity')}</TableHead>
                        <TableHead className="text-end">{t('القيمة الإجمالية', 'Total Value')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {valuationData.map((row, i) => (
                        <TableRow key={i} data-testid={`row-valuation-${row.locationId}`}>
                          <TableCell className="font-mono">{row.locationId}</TableCell>
                          <TableCell className="font-medium">{row.location}</TableCell>
                          <TableCell>{row.operationalType}</TableCell>
                          <TableCell className="text-end font-bold">{formatInteger(row.quantity)}</TableCell>
                          <TableCell className="text-end font-bold text-primary">{money(row.value)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/20 font-bold">
                        <TableCell colSpan={3}>{t('الإجمالي الكلي', 'Grand Total')}</TableCell>
                        <TableCell className="text-end">{formatInteger(valuationData.reduce((sum, r) => sum + r.quantity, 0))}</TableCell>
                        <TableCell className="text-end text-primary">
                           {money(valuationData.reduce((sum, r) => sum + r.value, 0))}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aging Tab */}
        <TabsContent value="aging" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('تقرير أعمار المخزون', 'Inventory Aging Report')}</CardTitle>
              <CardDescription>{t('المنتجات الراكدة التي لم تشهد حركات لفترة طويلة', 'Stagnant products that have not seen movements for a long time')}</CardDescription>
            </CardHeader>
            <CardContent>
              {agingQuery.isLoading ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground">{t('جاري التحميل...', 'Loading...')}</div>
              ) : agingQuery.isError ? (
                <div className="h-40 flex items-center justify-center text-destructive">{t('تعذر تحميل التقرير', 'Failed to load report')}</div>
              ) : !agingData || agingData.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground">{t('لا توجد بيانات راكدة', 'No stagnant data')}</div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>{t('المنتج', 'Product ID')}</TableHead>
                        <TableHead>{t('الموقع', 'Location ID')}</TableHead>
                        <TableHead className="text-end">{t('الكمية المتوفرة', 'Available Qty')}</TableHead>
                        <TableHead className="text-end">{t('آخر تحديث', 'Last Updated')}</TableHead>
                        <TableHead className="text-end">{t('العمر (بالأيام)', 'Age (Days)')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agingData.map((row, i) => (
                        <TableRow key={i} data-testid={`row-aging-${row.productId}`}>
                          <TableCell className="font-mono font-medium">#{row.productId}</TableCell>
                          <TableCell className="font-mono">{row.locationId}</TableCell>
                          <TableCell className="text-end">{row.available}</TableCell>
                          <TableCell className="text-end text-muted-foreground text-sm">
                            {format(new Date(row.updatedAt), 'yyyy-MM-dd')}
                          </TableCell>
                          <TableCell className="text-end">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              row.ageDays > 180 ? 'bg-destructive/10 text-destructive' :
                              row.ageDays > 90 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-500' :
                              'bg-muted text-foreground'
                            }`}>
                              {row.ageDays} {t('يوم', 'days')}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('مسار المراجعة للأرصدة', 'Inventory Audit Trail')}</CardTitle>
              <CardDescription>{t('سجل تفصيلي يعرض كل حركة أثرت على الأرصدة', 'Detailed log showing every movement that affected balances')}</CardDescription>
            </CardHeader>
            <CardContent>
              {auditQuery.isLoading ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground">{t('جاري التحميل...', 'Loading...')}</div>
              ) : auditQuery.isError ? (
                <div className="h-40 flex items-center justify-center text-destructive">{t('تعذر تحميل التقرير', 'Failed to load report')}</div>
              ) : !auditData || auditData.items.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground">{t('لا توجد بيانات', 'No data')}</div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>{t('المعرف', 'ID')}</TableHead>
                        <TableHead>{t('التاريخ', 'Date')}</TableHead>
                        <TableHead>{t('المنتج', 'Product')}</TableHead>
                        <TableHead>{t('التغيير', 'Change')}</TableHead>
                        <TableHead>{t('المصدر', 'Source')}</TableHead>
                        <TableHead>{t('المستخدم', 'User')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditData.items.map((row) => (
                        <TableRow key={row.id} data-testid={`row-audit-${row.id}`}>
                          <TableCell className="font-mono text-xs text-muted-foreground">#{row.id}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{format(new Date(row.createdAt), 'yyyy-MM-dd HH:mm')}</TableCell>
                          <TableCell className="font-mono">#{row.productId}</TableCell>
                          <TableCell className={`font-bold font-mono ${row.quantityChange > 0 ? 'text-success' : row.quantityChange < 0 ? 'text-destructive' : ''}`}>
                            {row.quantityChange > 0 ? '+' : ''}{row.quantityChange}
                          </TableCell>
                          <TableCell>
                            {row.sourceType ? (
                              <span className="text-xs px-2 py-1 rounded bg-muted/50 border">
                                {row.sourceType} {row.sourceId && `#${row.sourceId}`}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.performerName || (row.performedBy ? `#${row.performedBy}` : t('نظام', 'System'))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* Reconciliation Tab */}
        <TabsContent value="reconciliation" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('مطابقة المخزون', 'Inventory Reconciliation')}</CardTitle>
              <CardDescription>{t('مقارنة القيم التشغيلية بالقيم المحاسبية واكتشاف الفروقات', 'Comparison of operational vs accounting values and discrepancy detection')}</CardDescription>
            </CardHeader>
            <CardContent>
              {reconciliationQuery.isLoading ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground">{t('جاري التحميل...', 'Loading...')}</div>
              ) : reconciliationQuery.isError ? (
                <div className="h-40 flex items-center justify-center text-destructive">{t('تعذر تحميل التقرير', 'Failed to load report')}</div>
              ) : !reconciliationData ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground">{t('لا توجد بيانات', 'No data')}</div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border bg-card p-4">
                      <div className="text-sm font-medium text-muted-foreground mb-1">{t('القيمة التشغيلية (أرصدة)', 'Operational Value')}</div>
                      <div className="text-2xl font-bold font-mono">{money(reconciliationData.operationalValue)}</div>
                    </div>
                    <div className="rounded-lg border bg-card p-4">
                      <div className="text-sm font-medium text-muted-foreground mb-1">{t('القيمة المحاسبية (دفاتر)', 'Accounting Value')}</div>
                      <div className="text-2xl font-bold font-mono">{money(reconciliationData.accountingInventoryValue)}</div>
                    </div>
                    <div className={`rounded-lg border p-4 ${reconciliationData.difference !== 0 ? 'bg-destructive/10 border-destructive/20' : 'bg-success/10 border-success/20'}`}>
                      <div className="text-sm font-medium mb-1 flex items-center gap-2">
                        {reconciliationData.difference !== 0 ? (
                          <><AlertCircle className="h-4 w-4 text-destructive" /> <span className="text-destructive">{t('الفرق (غير متطابق)', 'Difference (Unbalanced)')}</span></>
                        ) : (
                          <><CheckSquare className="h-4 w-4 text-success" /> <span className="text-success">{t('متطابق', 'Balanced')}</span></>
                        )}
                      </div>
                      <div className={`text-2xl font-bold font-mono ${reconciliationData.difference !== 0 ? 'text-destructive' : 'text-success'}`}>
                         {money(Math.abs(reconciliationData.difference))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <h3 className="font-semibold mb-2">{t('حركات مخزون غير مرتبطة بقيود', 'Unlinked Movements')}</h3>
                      <div className="text-3xl font-bold">{reconciliationData.unlinkedMovements?.length || 0}</div>
                      <p className="text-sm text-muted-foreground mt-1">{t('حركات لم تنعكس محاسبياً', 'Movements not reflected in accounting')}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <h3 className="font-semibold mb-2">{t('قيود مخزون غير مرتبطة بحركات', 'Unlinked Journals')}</h3>
                      <div className="text-3xl font-bold">{reconciliationData.unlinkedInventoryJournals?.length || 0}</div>
                      <p className="text-sm text-muted-foreground mt-1">{t('قيود محاسبية بدون أثر تشغيلي', 'Journals without operational trace')}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
