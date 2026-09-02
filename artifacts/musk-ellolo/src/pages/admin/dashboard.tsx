import { useGetAdminDashboard } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { 
  DollarSign, 
  ShoppingCart, 
  Users, 
  Package, 
  AlertTriangle,
  Clock,
  Ticket,
  Truck
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminDashboard() {
  const { t, lang } = useLanguage();
  const { data, isLoading } = useGetAdminDashboard();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4,5,6,7,8].map(i => (
          <Card key={i} className="animate-pulse shadow-sm">
            <CardHeader className="h-14 bg-muted/30 rounded-t-lg" />
            <CardContent className="h-20" />
          </Card>
        ))}
      </div>
    );
  }

  const stats = [
    { labelAr: 'الإيرادات', labelEn: 'Revenue', value: `${data.revenue} SAR`, icon: DollarSign, color: 'text-success' },
    { labelAr: 'الطلبات', labelEn: 'Orders', value: data.orders, icon: ShoppingCart, color: 'text-primary' },
    { labelAr: 'العملاء', labelEn: 'Customers', value: data.customers, icon: Users, color: 'text-secondary-foreground' },
    { labelAr: 'المنتجات', labelEn: 'Products', value: data.products, icon: Package, color: 'text-ring' },
    { labelAr: 'طلبات قيد الانتظار', labelEn: 'Pending Orders', value: data.pendingOrders, icon: Clock, color: 'text-ring' },
    { labelAr: 'مخزون منخفض', labelEn: 'Low Stock', value: data.lowStock, icon: AlertTriangle, color: 'text-destructive' },
    { labelAr: 'كوبونات نشطة', labelEn: 'Active Coupons', value: data.activeCoupons, icon: Ticket, color: 'text-success' },
    { labelAr: 'الموزعين', labelEn: 'Distributors', value: data.distributors, icon: Truck, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('لوحة القيادة', 'Dashboard')}</h1>
        <p className="text-muted-foreground mt-1">{t('نظرة عامة على أداء المتجر', 'Store performance overview')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                {lang === 'ar' ? stat.labelAr : stat.labelEn}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid={`dashboard-stat-${i}`}>{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
