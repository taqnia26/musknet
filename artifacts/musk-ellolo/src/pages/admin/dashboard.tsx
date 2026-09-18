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
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer
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
          <div className="space-y-2">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-6 w-64 bg-muted rounded" />
          </div>
          <div className="h-10 w-32 bg-muted rounded-lg" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="animate-pulse shadow-none border border-border">
              <CardContent className="h-[104px]" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const kpis = [
    { label: t('الإيرادات', 'Revenue'), value: formatCurrency(analyticsData?.summary.revenue || 0), icon: DollarSign, color: "hsl(42, 45%, 55%)" },
    { label: t('الطلبات', 'Orders'), value: formatNumber(analyticsData?.summary.orders || 0), icon: ShoppingCart, color: "hsl(210, 80%, 65%)" },
    { label: t('العملاء', 'Customers'), value: formatNumber(dashboardData?.customers || 0), icon: Users, color: "hsl(270, 60%, 65%)" },
    { label: t('المنتجات النشطة', 'Active Products'), value: formatNumber(dashboardData?.products || 0), icon: Package, color: "hsl(150, 50%, 55%)" },
  ];

  const orderStatus = [
    { label: t('طلبات معلقة', 'Pending Orders'), value: dashboardData?.pendingOrders || 0, icon: ShoppingCart },
    { label: t('مخزون منخفض', 'Low Stock'), value: dashboardData?.lowStock || 0, icon: AlertTriangle, alert: (dashboardData?.lowStock || 0) > 0 },
    { label: t('الموزعين', 'Distributors'), value: dashboardData?.distributors || 0, icon: Store },
  ];

  const activitySummary = [
    { label: t('الزيارات', 'Visits'), value: formatNumber(analyticsData?.summary.visits || 0), icon: Eye, color: "hsl(270, 60%, 65%)" },
    { label: t('مشاهدات الصفحات', 'Page Views'), value: formatNumber(analyticsData?.summary.pageViews || 0), icon: Activity, color: "hsl(150, 50%, 55%)" },
    { label: t('معدل التحويل', 'Conversion'), value: formatPercent(analyticsData?.summary.conversionRate || 0), icon: MousePointerClick, color: "hsl(30, 90%, 60%)" },
    { label: t('متوسط قيمة الطلب', 'Average Order Value'), value: formatCurrency(analyticsData?.summary.averageOrderValue || 0), icon: TrendingUp, color: "hsl(330, 70%, 65%)" },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const formattedLabel = typeof label === 'string' && /^\d{4}-\d{2}-\d{2}/.test(label)
      ? formatDateLabel(label, lang)
      : label;
    return (
      <div className="bg-popover border border-border shadow-md rounded-md p-2.5 text-xs min-w-[130px]">
        {formattedLabel && <div className="font-semibold text-foreground mb-1.5 pb-1.5 border-b border-border/60">{formattedLabel}</div>}
        {payload.map((entry: any, index: number) => {
          const isRevenue = entry.dataKey === 'revenue' || entry.name === t('الإيرادات', 'Revenue');
          return (
            <div key={index} className="flex items-center justify-between gap-4 mt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Header section matching reference */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-2">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-bold text-foreground uppercase tracking-wider">{t('نظرة عامة', 'Overview')}</div>
          <h1 className="text-[15px] font-medium text-muted-foreground">
            {t('مرحباً بك، إليك ملخص أداء مسك اللولو', 'Welcome, here is a summary of Musk Ellolo performance')}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-card border border-border rounded-md p-0.5 shadow-sm">
            {RANGES.map(days => (
              <button
                key={days}
                onClick={() => setRangeDays(days)}
                className={`px-3 py-1 text-[11px] font-semibold rounded-[4px] transition-all ${
                  rangeDays === days
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted-foreground hover:text-foreground'
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
            className="bg-card shadow-sm h-7 w-7 border-border rounded-md"
            title={t('تحديث البيانات', 'Refresh data')}
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin text-accent' : 'text-muted-foreground'}`} />
          </Button>
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="border border-border shadow-sm rounded-lg overflow-hidden bg-card transition-shadow hover:shadow-md" style={{ borderTopWidth: '3px', borderTopColor: kpi.color }}>
            <CardContent className="p-4 flex flex-col justify-between h-full min-h-[104px]">
              <div className="flex justify-between items-start mb-2">
                <div className="text-[12.5px] font-medium text-muted-foreground">{kpi.label}</div>
                <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-black/5 dark:bg-white/5" style={{ color: kpi.color }}>
                  <kpi.icon className="h-[14px] w-[14px]" />
                </div>
              </div>
              <div className="text-xl font-bold text-foreground mt-auto" dir="ltr">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Combined Revenue & Visits Trend Chart */}
        <Card className="lg:col-span-2 border border-border shadow-sm bg-card flex flex-col rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border/60 py-3.5 px-5">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" />
                {t('الإيرادات والزيارات', 'Revenue and Visits')}
              </CardTitle>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[hsl(42,45%,55%)]" />
                  {t('الإيرادات', 'Revenue')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[hsl(150,50%,55%)]" />
                  {t('الزيارات', 'Visits')}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 flex-1" dir="ltr">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%" debounce={0}>
                <AreaChart data={analyticsData?.series || []} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(42, 45%, 55%)" stopOpacity={0.16}/>
                      <stop offset="95%" stopColor="hsl(42, 45%, 55%)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(150, 50%, 55%)" stopOpacity={0.12}/>
                      <stop offset="95%" stopColor="hsl(150, 50%, 55%)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={date => formatDateLabel(date, lang)} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis yAxisId="revenue" orientation="left" tickFormatter={formatCompact} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={42} />
                  <YAxis yAxisId="visits" orientation="right" tickFormatter={formatCompact} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={34} allowDecimals={false} />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '3 3' }} />
                  <Area yAxisId="revenue" type="monotone" dataKey="revenue" name={t('الإيرادات', 'Revenue')} stroke="hsl(42, 45%, 55%)" strokeWidth={2} fill="url(#colorRev)" isAnimationActive={false} />
                  <Area yAxisId="visits" type="monotone" dataKey="visits" name={t('الزيارات', 'Visits')} stroke="hsl(150, 50%, 55%)" strokeWidth={2} fill="url(#colorVisits)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Order and operations status */}
        <Card className="border border-border shadow-sm flex flex-col bg-card rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border/60 py-3.5 px-5">
            <CardTitle className="text-[13px] font-semibold text-foreground flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-accent" />
              {t('حالة الطلبات والتشغيل', 'Orders and Operations')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-center p-0">
            <div className="divide-y divide-border/60">
              {orderStatus.map((stat) => (
                <div key={stat.label} className="flex items-center justify-between px-5 py-5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
                      stat.alert ? 'bg-destructive/10 text-destructive' : 'bg-accent/10 text-accent'
                    }`}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                    <div className="text-[13px] font-medium text-foreground">{stat.label}</div>
                  </div>
                  <div className="text-xl font-bold text-foreground" dir="ltr">{formatNumber(stat.value)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section: Activity summary and Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <Card className="shadow-sm border border-border bg-card rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border/60 py-3.5 px-5">
            <CardTitle className="text-[13px] font-semibold text-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              {t('ملخص النشاط', 'Activity Summary')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-px bg-border/60 p-0">
            {activitySummary.map((stat) => (
              <div key={stat.label} className="bg-card p-5 hover:bg-muted/30 transition-colors">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-muted-foreground">{stat.label}</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-black/5 dark:bg-white/5" style={{ color: stat.color }}>
                    <stat.icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="text-lg font-bold text-foreground" dir="ltr">{stat.value}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-border bg-card rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border/60 py-3.5 px-5">
            <CardTitle className="text-[13px] font-semibold text-foreground flex items-center gap-2">
              <Package className="h-4 w-4 text-accent" />
              {t('المنتجات الأكثر مبيعاً', 'Top Products')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/60">
              {analyticsData?.topProducts?.map((product, index) => (
                <div key={`${product.name}-${index}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-7 w-7 rounded-md bg-accent/10 flex items-center justify-center text-accent font-bold text-xs shrink-0">
                      {index + 1}
                    </div>
                    <span className="truncate font-medium text-[13.5px] text-foreground">{product.name}</span>
                  </div>
                  <div className="text-left shrink-0 ps-3" dir="ltr">
                    <div className="font-bold text-[13.5px] text-foreground">{formatCurrency(product.revenue)}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{formatNumber(product.quantity)} {t('وحدة', 'units')}</div>
                  </div>
                </div>
              ))}
              {(!analyticsData?.topProducts || analyticsData.topProducts.length === 0) && (
                <div className="p-8 text-center text-muted-foreground text-[13px]">
                  {t('لا توجد بيانات', 'No data available')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

      </div>

    </div>
  );
}
