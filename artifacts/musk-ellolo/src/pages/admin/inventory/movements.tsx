import { useState } from 'react';
import { useLanguage } from '@/hooks/use-language';
import { useGetInventoryMovementReport } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Activity, ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export default function AdminInventoryMovements() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const [productId, setProductId] = useState('');

  const parsedProductId = productId ? Number(productId) : undefined;

  const { data: report, isLoading, isError } = useGetInventoryMovementReport({
    productId: !Number.isNaN(parsedProductId) ? parsedProductId : undefined,
    page,
    pageSize: 50
  });

  const pageData = typeof report === 'string' ? null : report;
  const items = pageData?.items || [];
  const totalPages = pageData ? Math.ceil(pageData.total / pageData.pageSize) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" />
            {t('سجل حركات المخزون', 'Inventory Movements Ledger')}
          </h1>
          <p className="mt-1 text-muted-foreground">{t('متابعة تفصيلية لجميع الحركات الواردة والصادرة', 'Detailed tracking of all incoming and outgoing movements')}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="bg-muted/20 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="w-full sm:w-64">
              <Label>{t('بحث برقم المنتج (ID)', 'Search by Product ID')}</Label>
              <Input
                className="mt-1"
                placeholder={t('أدخل رقم المنتج...', 'Enter product ID...')}
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setPage(1);
                }}
                data-testid="input-search-product-id"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('التاريخ', 'Date')}</TableHead>
                  <TableHead>{t('المنتج', 'Product ID')}</TableHead>
                  <TableHead>{t('نوع الحركة', 'Movement Type')}</TableHead>
                  <TableHead>{t('التغيير', 'Change')}</TableHead>
                  <TableHead>{t('قبل / بعد', 'Before / After')}</TableHead>
                  <TableHead>{t('السبب / المصدر', 'Reason / Source')}</TableHead>
                  <TableHead>{t('بواسطة', 'By')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      {t('جاري التحميل...', 'Loading...')}
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-destructive">
                      {t('حدث خطأ أثناء تحميل البيانات.', 'An error occurred while loading data.')}
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      {t('لا توجد حركات مطابقة للبحث.', 'No movements found matching the search.')}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id} data-testid={`row-movement-${item.id}`}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm')}
                      </TableCell>
                      <TableCell className="font-mono text-sm">#{item.productId}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            item.movementType === 'increase' ? 'border-success text-success bg-success/10' :
                            item.movementType === 'decrease' ? 'border-destructive text-destructive bg-destructive/10' :
                            'border-primary text-primary bg-primary/10'
                          }
                        >
                          {item.movementType === 'increase' ? t('وارد', 'In') :
                           item.movementType === 'decrease' ? t('صادر', 'Out') :
                           t('تسوية', 'Adjustment')}
                        </Badge>
                      </TableCell>
                      <TableCell className={`font-bold font-mono ${item.quantityChange > 0 ? 'text-success' : item.quantityChange < 0 ? 'text-destructive' : ''}`}>
                        {item.quantityChange > 0 ? '+' : ''}{item.quantityChange}
                      </TableCell>
                      <TableCell className="text-sm font-mono whitespace-nowrap text-muted-foreground">
                        {item.quantityBefore} <ArrowLeftRight className="inline h-3 w-3 mx-1 text-border" /> <span className="text-foreground">{item.quantityAfter}</span>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate text-sm" title={item.reason || ''}>{item.reason || '—'}</div>
                        {item.sourceType && (
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                            {item.sourceType} {item.sourceId ? `#${item.sourceId}` : ''}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.performerName || t('نظام آلي', 'System')}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t p-4">
              <span className="text-sm text-muted-foreground">
                {t(`صفحة ${page} من ${totalPages}`, `Page ${page} of ${totalPages}`)}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  data-testid="button-prev-page"
                >
                  <ChevronRight className="h-4 w-4 ml-1 hidden rtl:block" />
                  <ChevronLeft className="h-4 w-4 mr-1 hidden ltr:block" />
                  {t('السابق', 'Previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  data-testid="button-next-page"
                >
                  {t('التالي', 'Next')}
                  <ChevronLeft className="h-4 w-4 mr-1 hidden rtl:block" />
                  <ChevronRight className="h-4 w-4 ml-1 hidden ltr:block" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
