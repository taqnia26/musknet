import {
  getAdminGetFinanceMonthlyQueryKey,
  getAdminListOrdersQueryKey,
  useAdminGetFinanceMonthly,
  useAdminListOrders,
  useGetAdminDashboard,
  useGetAdminMe,
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { hasPermission } from '@/lib/permissions';
import { DollarSign, ShoppingCart, Users, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const monthName = (month: string, lang: string) => new Intl.DateTimeFormat(
  lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US',
  { month: 'short', timeZone: 'UTC' },
).format(new Date(`${month}-01T00:00:00Z`));

export default function AdminDashboard() {
  const { t, lang } = useLanguage();
  const { data, isLoading } = useGetAdminDashboard();
  const { data: user } = useGetAdminMe();
  const canViewFinance = hasPermission(user, 'finance', 'view');
  const canViewOrders = hasPermission(user, 'orders', 'view');
  const { data: monthlyMetrics } = useAdminGetFinanceMonthly({
    query: {
      enabled: canViewFinance,
      queryKey: getAdminGetFinanceMonthlyQueryKey(),
    },
  });
  const orderParams = { status: 'all' as const };
  const { data: orders } = useAdminListOrders(
    orderParams,
    {
      query: {
        enabled: canViewOrders,
        queryKey: getAdminListOrdersQueryKey(orderParams),
      },
    },
  );

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <Card key={i} className="animate-pulse shadow-sm">
            <CardHeader className="h-14 bg-muted/30 rounded-t-lg" />
            <CardContent className="h-20" />
          </Card>
        ))}
      </div>
    );
  }

  const stats = [
    { labelAr: 'المنتجات النشطة', labelEn: 'Active Products', value: data.products, icon: Package, color: 'text-primary' },
    { labelAr: 'العملاء', labelEn: 'Customers', value: data.customers, icon: Users, color: 'text-primary' },
    { labelAr: 'الطلبات', labelEn: 'Orders', value: data.orders, icon: ShoppingCart, color: 'text-primary' },
    { labelAr: 'الإيرادات', labelEn: 'Revenue', value: `${data.revenue} SAR`, icon: DollarSign, color: 'text-primary' },
  ];
  const revenueData = (monthlyMetrics ?? []).map((metric) => ({
    name: monthName(metric.month, lang),
    revenue: metric.revenue,
    profit: metric.netProfit,
  }));
  const orderStatusData = [
    {
      name: t('قيد الانتظار', 'Pending'),
      value: (orders ?? []).filter((order) => order.status === 'new' || order.status === 'processing' || order.status === 'shipped').length,
      color: 'hsl(31 78% 66%)',
    },
    {
      name: t('مكتمل', 'Completed'),
      value: (orders ?? []).filter((order) => order.status === 'delivered').length,
      color: 'hsl(145 45% 39%)',
    },
    {
      name: t('ملغي', 'Cancelled'),
      value: (orders ?? []).filter((order) => order.status === 'cancelled').length,
      color: 'hsl(0 48% 31%)',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-card p-6 rounded-xl border shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-primary">
          {t('نظرة عامة', 'Overview')}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t('مرحباً بك، ', 'Welcome, ')} {user?.name || ''}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-none shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {lang === 'ar' ? stat.labelAr : stat.labelEn}
              </CardTitle>
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground" data-testid={`dashboard-stat-${i}`}>{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-none shadow-sm">
          <CardHeader>
            <CardTitle>{t('الإيرادات والأرباح (12 شهر)', 'Revenue & Profits (12 Months)')}</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(31 78% 66%)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="hsl(31 78% 66%)" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(17 57% 46%)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="hsl(17 57% 46%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" />
                <YAxis />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10" />
                <RechartsTooltip />
                <Legend />
                <Area type="monotone" name={t('الإيرادات', 'Revenue')} dataKey="revenue" stroke="hsl(31 78% 66%)" fillOpacity={1} fill="url(#colorRevenue)" />
                <Area type="monotone" name={t('الأرباح', 'Profit')} dataKey="profit" stroke="hsl(17 57% 46%)" fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>{t('حالة الطلبات', 'Orders Status')}</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={orderStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  nameKey="name"
                >
                  {orderStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}