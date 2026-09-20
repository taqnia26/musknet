import { useLocation, Link, Route, Switch } from 'wouter';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { 
  Package, MapPin, ArrowLeftRight, ShoppingCart, 
  ClipboardCheck, Bell, BarChart3
} from 'lucide-react';
import AdminInventoryOverview from './overview';
import AdminInventoryBalances from './balances';
import AdminInventoryLocations from './locations';
import AdminInventoryTransfers from './transfers';
import AdminInventoryPurchases from './purchases';
import AdminInventoryCounts from './cycle-counts';
import AdminInventoryAlerts from './alerts';
import AdminInventoryReports from './reports';
import AdminInventoryMovements from './movements';

export default function InventoryCenter() {
  const { t } = useLanguage();
  const [location] = useLocation();

  const navItems = [
    { path: '/admin/inventory', labelAr: 'نظرة عامة', labelEn: 'Overview', icon: BarChart3, exact: true },
    { path: '/admin/inventory/balances', labelAr: 'الأرصدة والأصناف', labelEn: 'Balances & Items', icon: Package },
    { path: '/admin/inventory/locations', labelAr: 'المواقع', labelEn: 'Locations', icon: MapPin },
    { path: '/admin/inventory/transfers', labelAr: 'التحويلات', labelEn: 'Transfers', icon: ArrowLeftRight },
    { path: '/admin/inventory/purchases', labelAr: 'أوامر الشراء', labelEn: 'Purchases', icon: ShoppingCart },
    { path: '/admin/inventory/counts', labelAr: 'الجرد الدوري', labelEn: 'Cycle Counts', icon: ClipboardCheck },
    { path: '/admin/inventory/alerts', labelAr: 'التنبيهات', labelEn: 'Alerts', icon: Bell },
    { path: '/admin/inventory/reports', labelAr: 'التقارير', labelEn: 'Reports', icon: BarChart3 },
    { path: '/admin/inventory/movements', labelAr: 'سجل الحركات', labelEn: 'Movement ledger', icon: ArrowLeftRight },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('مركز المخزون', 'Inventory Center')}</h1>
          <p className="mt-1 text-muted-foreground">
            {t('إدارة شاملة للمخزون التشغيلي والفروع والمستودعات', 'Comprehensive management of operational inventory, branches, and warehouses')}
          </p>
        </div>
      </div>

      <div className="flex overflow-x-auto pb-2 -mb-2 scrollbar-thin gap-2">
        {navItems.map(item => {
          const isActive = item.exact ? location === item.path : location.startsWith(item.path);
          return (
            <Link key={item.path} href={item.path}>
              <Button 
                variant={isActive ? "default" : "outline"} 
                className={`whitespace-nowrap ${isActive ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground'}`}
              >
                <item.icon className="w-4 h-4 me-2" />
                {t(item.labelAr, item.labelEn)}
              </Button>
            </Link>
          );
        })}
      </div>

      <div className="mt-6">
        <Switch>
          <Route path="/admin/inventory/balances" component={AdminInventoryBalances} />
          <Route path="/admin/inventory/locations" component={AdminInventoryLocations} />
          <Route path="/admin/inventory/transfers" component={AdminInventoryTransfers} />
          <Route path="/admin/inventory/purchases" component={AdminInventoryPurchases} />
          <Route path="/admin/inventory/counts" component={AdminInventoryCounts} />
          <Route path="/admin/inventory/alerts" component={AdminInventoryAlerts} />
          <Route path="/admin/inventory/reports" component={AdminInventoryReports} />
          <Route path="/admin/inventory/movements" component={AdminInventoryMovements} />
          <Route path="/admin/inventory" component={AdminInventoryOverview} />
          <Route>
            <div className="p-8 text-center bg-card rounded-xl border">
              <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-20" />
              <h2 className="text-xl font-semibold mb-2">{t('قيد التطوير', 'Under Construction')}</h2>
              <p className="text-muted-foreground">
                {t('هذا القسم قيد التطوير وسيتم توفيره قريباً.', 'This section is under development and will be available soon.')}
              </p>
            </div>
          </Route>
        </Switch>
      </div>
    </div>
  );
}
