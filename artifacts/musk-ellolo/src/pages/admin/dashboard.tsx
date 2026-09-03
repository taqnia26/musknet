import { useState } from 'react';
import { useLanguage } from '@/hooks/use-language';
import {
  useGetAdminDashboard,
  useGetAdminAnalyticsDashboard,
  getGetAdminAnalyticsDashboardQueryKey,
} from '@workspace/api-client-react';
import {
  DollarSign, ShoppingCart, Users, Package, RefreshCw, AlertTriangle,
  Eye, MousePointerClick, TrendingUp, Store, Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from 'recharts';

function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('T')[0].split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

const formatDateLabel = (dateStr: string, lang: string) => {
  if (!dateStr) return '';
  const date = parseLocalDate(dateStr);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { month: 'short', day: 'numeric' }).format(date);
};

type RangeDays = 7 | 30 | 90;
const RANGES: RangeDays[] = [7, 30, 90];

export default function AdminDashboard() {
  const { t, lang } = useLanguage();
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: dashboardData, isLoading: isLoadingDashboard, refetch: refetchDashboard } = useGetAdminDashboard();

  const analyticsParams = { rangeDays };
  const { data: analyticsData, isLoading: isLoadingAnalytics, refetch: refetchAnalytics } = useGetAdminAnalyticsDashboard(
    analyticsParams,
    {
      query: {
        queryKey: getGetAdminAnalyticsDashboardQueryKey(analyticsParams),
      }
    }
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchDashboard(), refetchAnalytics()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const locale = lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const formatCurrency = (val: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'SAR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
  const formatCompact = (val: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(val);
  const formatNumber = (val: number) => new Intl.NumberFormat(locale).format(val);
  const formatPercent = (val: number) => new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val / 100);

  if (isLoadingDashboard || isLoadingAnalytics) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between animate-pulse">
          <div className="h-10 w-48 bg-muted rounded-lg" />
          <div className="h-10 w-32 bg-muted rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="animate-pulse shadow-sm border-none">
              <CardContent className="h-28" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const kpis = [
    { label: t('الإيرادات', 'Revenue'), value: formatCurrency(analyticsData?.summary.revenue || 0), icon: DollarSign, fg: "hsl(var(--primary))", bg: "hsl(var(--primary) / 0.1)" },
    { label: t('الطلبات', 'Orders'), value: formatNumber(analyticsData?.summary.orders || 0), icon: ShoppingCart, fg: "hsl(var(--accent))", bg: "hsl(var(--accent) / 0.1)" },
    { label: t('الزيارات', 'Visits'), value: formatNumber(analyticsData?.summary.visits || 0), icon: Eye, fg: "hsl(320, 21%, 55%)", bg: "hsl(320, 21%, 55% / 0.1)" },
    { label: t('مشاهدات الصفحات', 'Page Views'), value: formatNumber(analyticsData?.summary.pageViews || 0), icon: Activity, fg: "hsl(139, 15%, 49%)", bg: "hsl(139, 15%, 49% / 0.1)" },
    { label: t('معدل التحويل', 'Conversion'), value: formatPercent(analyticsData?.summary.conversionRate || 0), icon: MousePointerClick, fg: "hsl(194, 42%, 45%)", bg: "hsl(194, 42%, 45% / 0.1)" },
    { label: t('متوسط قيمة الطلب', 'AOV'), value: formatCurrency(analyticsData?.summary.averageOrderValue || 0), icon: TrendingUp, fg: "hsl(40, 42%, 45%)", bg: "hsl(40, 42%, 45% / 0.1)" },
  ];

  const sourceLabels: Record<string, string> = {
    direct: t('مباشر', 'Direct'),
    search: t('بحث', 'Search'),
    social: t('تواصل اجتماعي', 'Social'),
    referral: t('إحالة', 'Referral')
  };

  const sourceColors: Record<string, string> = {
    direct: "hsl(var(--primary))",
    search: "hsl(var(--accent))",
    social: "hsl(320, 21%, 55%)",
    referral: "hsl(139, 15%, 49%)"
  };

  const trafficData = (analyticsData?.trafficSources || []).map(s => ({
    name: sourceLabels[s.source] || s.source,
    value: s.visits,
    color: sourceColors[s.source] || "hsl(var(--primary))"
  }));

  const overviewStats = [
    { label: t('المنتجات', 'Products'), value: dashboardData?.products || 0, icon: Package },
    { label: t('العملاء', 'Customers'), value: dashboardData?.customers || 0, icon: Users },
    { label: t('طلبات معلقة', 'Pending Orders'), value: dashboardData?.pendingOrders || 0, icon: ShoppingCart },
    { label: t('مخزون منخفض', 'Low Stock'), value: dashboardData?.lowStock || 0, icon: AlertTriangle, alert: (dashboardData?.lowStock || 0) > 0 },
    { label: t('الموزعين', 'Distributors'), value: dashboardData?.distributors || 0, icon: Store },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const formattedLabel = typeof label === 'string' && /^\d{4}-\d{2}-\d{2}/.test(label)
      ? formatDateLabel(label, lang)
      : label;
    return (
      <div className="bg-popover border border-border shadow-lg rounded-lg p-3 text-sm min-w-[150px]">
        {formattedLabel && <div className="font-semibold text-foreground mb-2 pb-2 border-b border-border/50">{formattedLabel}</div>}
        {payload.map((entry: any, index: number) => {
          const isRevenue = entry.dataKey === 'revenue' || entry.name === t('الإيرادات', 'Revenue');
          return (
            <div key={index} className="flex items-center justify-between gap-4 mt-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                <span className="text-muted-foreground">{entry.name}</span>
              </div>
              <span className="font-semibold text-foreground">
                {isRevenue ? formatCurrency(entry.value) : formatNumber(entry.value)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t('لوحة المتابعة', 'Dashboard')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('نظرة عامة على أداء المتجر', 'Storefront performance overview')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-card border border-border/50 rounded-lg p-1 shadow-sm">
            {RANGES.map(days => (
              <button
                key={days}
                onClick={() => setRangeDays(days)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  rangeDays === days
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {days} {t('يوم', 'Days')}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="bg-card shadow-sm h-10 w-10 border-border/50"
            title={t('تحديث البيانات', 'Refresh data')}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
          </Button>
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="border-border/50 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-card to-card/50">
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div className="flex justify-between items-start mb-4">
                <div className="text-sm font-medium text-muted-foreground">{kpi.label}</div>
                <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: kpi.bg, color: kpi.fg }}>
                  <kpi.icon className="h-4 w-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground" dir="ltr">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Revenue & Visits Trend Chart */}
        <Card className="xl:col-span-2 border-border/50 shadow-sm overflow-hidden flex flex-col">
          <CardHeader className="bg-card border-b border-border/50 pb-4">
            <CardTitle className="text-base font-semibold">{t('اتجاهات الإيرادات والزيارات', 'Revenue & Visits Trends')}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('رسمان منفصلان لقراءة أوضح بدون محاور متعاكسة', 'Separate charts for a clearer, consistent reading')}
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 2xl:grid-cols-2 gap-6 p-6 flex-1" dir="ltr">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                {t('الإيرادات', 'Revenue')}
              </div>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%" debounce={0}>
                  <AreaChart data={analyticsData?.series || []} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" className="opacity-50" />
                    <XAxis dataKey="date" tickFormatter={date => formatDateLabel(date, lang)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis orientation="left" tickFormatter={val => formatCompact(val)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', textAnchor: 'end' }} tickLine={false} axisLine={false} width={58} />
                    <RechartsTooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'hsl(var(--muted)/0.3)', stroke: 'none' }} />
                    <Area type="monotone" dataKey="revenue" name={t('الإيرادات', 'Revenue')} stroke="hsl(var(--primary))" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-[hsl(320,21%,55%)]" />
                {t('الزيارات', 'Visits')}
              </div>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%" debounce={0}>
                  <AreaChart data={analyticsData?.series || []} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(320, 21%, 55%)" stopOpacity={0.28}/>
                        <stop offset="95%" stopColor="hsl(320, 21%, 55%)" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" className="opacity-50" />
                    <XAxis dataKey="date" tickFormatter={date => formatDateLabel(date, lang)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis orientation="left" tickFormatter={val => formatCompact(val)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))', textAnchor: 'end' }} tickLine={false} axisLine={false} width={48} allowDecimals={false} />
                    <RechartsTooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'hsl(var(--muted)/0.3)', stroke: 'none' }} />
                    <Area type="monotone" dataKey="visits" name={t('الزيارات', 'Visits')} stroke="hsl(320, 21%, 55%)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorVisits)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Traffic Sources Pie */}
        <Card className="border-border/50 shadow-sm flex flex-col">
          <CardHeader className="bg-card border-b border-border/50 pb-4">
            <CardTitle className="text-base font-semibold">{t('مصادر الزيارات', 'Traffic Sources')}</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex-1 min-h-[350px] flex items-center justify-center" dir="ltr">
            {trafficData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" debounce={0}>
                <PieChart>
                  <Pie
                    data={trafficData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={65}
                    outerRadius={90}
                    paddingAngle={4}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {trafficData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<CustomTooltip />} isAnimationActive={false} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    formatter={(value) => <span className="text-muted-foreground text-sm font-medium">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-muted-foreground text-sm text-center">
                {t('لا توجد بيانات متاحة', 'No data available')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section: Top Products & Operations Overview */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Top Products */}
        <Card className="xl:col-span-2 shadow-sm border-border/50">
          <CardHeader className="bg-card border-b border-border/50 pb-4">
            <CardTitle className="text-base font-semibold">{t('المنتجات الأكثر مبيعاً', 'Top Products')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {analyticsData?.topProducts?.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {i + 1}
                    </div>
                    <span className="font-medium text-foreground">{p.name}</span>
                  </div>
                  <div className="text-left shrink-0" dir="ltr">
                    <div className="font-bold text-sm text-foreground">{formatCurrency(p.revenue)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{formatNumber(p.quantity)} {t('وحدة', 'units')}</div>
                  </div>
                </div>
              ))}
              {(!analyticsData?.topProducts || analyticsData.topProducts.length === 0) && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  {t('لا توجد بيانات', 'No data available')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Operations Overview */}
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-foreground px-1">{t('التشغيل', 'Operations')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
            {overviewStats.map((stat, i) => (
              <div key={i} className="flex items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 ${
                    stat.alert ? 'bg-destructive/10 text-destructive' : 'bg-secondary/80 text-secondary-foreground'
                  }`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div className="text-sm text-muted-foreground font-medium">{stat.label}</div>
                </div>
                <div className="text-2xl font-bold text-foreground shrink-0 text-left" dir="ltr">{formatNumber(stat.value)}</div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
