import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminListInventory, useListInventoryAlerts, useListInventoryLocations, type InventoryLocation } from '@workspace/api-client-react';
import { Boxes, CircleDollarSign, AlertTriangle, XCircle, MapPin } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMemo } from 'react';

export default function AdminInventoryOverview() {
  const { t, lang } = useLanguage();
  
  const { data: inventoryData } = useAdminListInventory();
  const { data: alerts = [] } = useListInventoryAlerts();
  const { data: rawLocations } = useListInventoryLocations();
  const locations = (rawLocations as unknown as InventoryLocation[] | undefined) ?? [];
  
  const summary = inventoryData?.summary ?? { totalUnits: 0, totalValue: 0, lowStockProducts: 0, outOfStockProducts: 0 };
  const items = inventoryData?.items ?? [];

  const chartData = useMemo(() => 
    items.slice(0, 10).map((item) => ({ 
      name: lang === 'ar' ? item.nameAr : item.nameEn, 
      current: item.stockQuantity, 
      reorder: item.reorderPoint, 
      target: item.targetStockQuantity 
    })), [items, lang]
  );

  const cards = [
    { title: t('إجمالي الوحدات', 'Total units'), value: summary.totalUnits.toLocaleString(), icon: Boxes, color: 'text-blue-500' },
    { title: t('قيمة المخزون', 'Inventory value'), value: `${summary.totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR`, icon: CircleDollarSign, color: 'text-green-500' },
    { title: t('تنبيهات المخزون', 'Inventory alerts'), value: alerts.length.toLocaleString(), icon: AlertTriangle, color: 'text-amber-500' },
    { title: t('المواقع النشطة', 'Active locations'), value: locations.filter(l => l.active).length.toLocaleString(), icon: MapPin, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ title, value, icon: Icon, color }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('نظرة عامة على الأرصدة (أهم 10 منتجات)', 'Stock Overview (Top 10 products)')}</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Legend />
                <Bar dataKey="current" name={t('الحالي', 'Current')} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="reorder" name={t('حد الطلب', 'Reorder')} fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              {t('تنبيهات المخزون', 'Inventory Alerts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[280px] text-center text-muted-foreground">
                <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
                  <XCircle className="w-6 h-6 text-success" />
                </div>
                <p>{t('المخزون بحالة جيدة', 'Inventory is in good shape')}</p>
                <p className="text-xs mt-1">{t('لا توجد تنبيهات حالية', 'No active alerts')}</p>
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto max-h-[280px] pr-2">
                {alerts.map((alert, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                    <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${alert.status === 'out' ? 'bg-destructive' : 'bg-amber-500'}`} />
                    <div>
                      <p className="text-sm font-medium">Product #{alert.productId}</p>
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                        <span>{t('المتوفر:', 'Available:')} <b className="text-foreground">{alert.available}</b></span>
                        <span>{t('الحد:', 'Point:')} {alert.reorderPoint}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
