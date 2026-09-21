import { useLanguage } from '@/hooks/use-language';
import { useListInventoryAlerts } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Bell, ShoppingCart } from 'lucide-react';
import { Link } from 'wouter';

export default function AdminInventoryAlerts() {
  const { t } = useLanguage();
  const { data: alerts, isLoading } = useListInventoryAlerts();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-500" />
          {t('تنبيهات نواقص المخزون', 'Inventory Alerts')}
        </h2>
        <Link href="/admin/inventory/purchases">
          <Button size="sm">
            <ShoppingCart className="w-4 h-4 me-2" />
            {t('تسجيل استلام مشتريات', 'Record purchase receipt')}
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('معرف المنتج', 'Product ID')}</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>{t('الرصيد', 'Available')}</TableHead>
                <TableHead>{t('الكمية القادمة', 'Incoming')}</TableHead>
                <TableHead>{t('حد الطلب', 'Reorder Pt')}</TableHead>
                <TableHead>{t('الكمية المطلوبة', 'Reorder Qty')}</TableHead>
                <TableHead>{t('الحالة', 'Status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">{t('جاري التحميل...', 'Loading...')}</TableCell></TableRow>
              ) : !alerts?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
                        <Bell className="w-6 h-6 text-success" />
                      </div>
                      <p>{t('جميع المنتجات فوق حد الطلب', 'All products are above reorder point')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map(alert => (
                  <TableRow key={alert.productId}>
                    <TableCell className="font-mono">#{alert.productId}</TableCell>
                    <TableCell className="font-mono">{alert.sku || '-'}</TableCell>
                    <TableCell className="font-bold text-destructive">{alert.available}</TableCell>
                    <TableCell className="text-muted-foreground">{alert.incoming}</TableCell>
                    <TableCell>{alert.reorderPoint}</TableCell>
                    <TableCell className="font-semibold text-primary">{alert.reorderQuantity}</TableCell>
                    <TableCell>
                      <Badge variant={alert.status === 'out' ? 'destructive' : 'outline'} className={alert.status === 'low' ? 'border-amber-500 text-amber-500' : ''}>
                        {alert.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
