import { useState } from 'react';
import { useLanguage } from '@/hooks/use-language';
import {
  useGetAdminRevenueAnalytics,
  getGetAdminRevenueAnalyticsQueryKey,
} from '@workspace/api-client-react';
import {
  DollarSign, Building2, ShoppingCart, Info, TrendingUp, TrendingDown, RefreshCw, Layers, AlertCircle, Truck, Package
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatInteger, formatPercent } from '@/lib/formatters';
import {
  XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
  ComposedChart, Line, Area, BarChart, Bar, Legend
} from 'recharts';

type RangeDays = 7 | 30 | 90 | 365;
const RANGES: RangeDays[] = [7, 30, 90, 365];

function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('T')[0].split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

const formatDateLabel = (dateStr: string, lang: string) => {
  if (!dateStr) return '';
  const date = parseLocalDate(dateStr);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { month: 'short', day: 'numeric' }).format(date);
};

export default function AdminRevenueAnalytics() {
  const { t, lang } = useLanguage();
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useGetAdminRevenueAnalytics(
    { rangeDays },
    {
      query: {
        queryKey: getGetAdminRevenueAnalyticsQueryKey({ rangeDays }),
      }
    }
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const locale = lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const money = (val: number) => `${formatCurrency(val, lang)} SAR`;
  const formatCompact = (val: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(val);
  const formatNumber = (val: number) => formatInteger(val, lang);

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="revenue-analytics-loading">
        <div className="flex items-center justify-between animate-pulse">
          <div className="space-y-2">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-6 w-64 bg-muted rounded" />
          </div>
          <div className="h-10 w-48 bg-muted rounded-lg" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse shadow-none border border-border">
              <CardContent className="h-[120px]" />
            </Card>
          ))}
        </div>
        <Card className="animate-pulse shadow-none border border-border">
          <CardContent className="h-[350px]" />
        </Card>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-12 text-center bg-card border border-border rounded-xl shadow-sm" data-testid="revenue-analytics-error">
        <AlertCircle className="h-10 w-10 text-destructive/70 mx-auto mb-3" />
        <h2 className="font-semibold text-foreground">{t('تعذر تحميل بيانات الإيرادات', 'Could not load revenue data')}</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">{t('تحقق من الاتصال ثم أعد المحاولة.', 'Check the connection, then try again.')}</p>
        <Button variant="outline" onClick={() => refetch()} data-testid="button-retry-revenue">
          <RefreshCw className="h-4 w-4 me-2" />
          {t('إعادة المحاولة', 'Try again')}
        </Button>
      </div>
    );
  }

  const ChangeIndicator = ({ value, label }: { value: number | null | undefined, label?: string }) => {
    if (typeof value !== 'number') return null;
    const isPositive = value > 0;
    const isNegative = value < 0;
    return (
      <div className={`flex items-center gap-1 text-[12.5px] font-medium ${isPositive ? 'text-emerald-600 dark:text-emerald-500' : isNegative ? 'text-destructive' : 'text-muted-foreground'}`}>
        {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : isNegative ? <TrendingDown className="h-3.5 w-3.5" /> : null}
        <span dir="ltr">{value > 0 ? '+' : ''}{formatPercent(value, lang)}</span>
        {label && <span className="text-muted-foreground ml-1 rtl:ml-0 rtl:mr-1 font-normal">{label}</span>}
      </div>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const formattedLabel = typeof label === 'string' && /^\d{4}-\d{2}-\d{2}/.test(label)
      ? formatDateLabel(label, lang)
      : label;
    
    return (
      <div className="bg-popover border border-border shadow-lg rounded-lg p-3 text-[12.5px] min-w-[160px]">
        {formattedLabel && <div className="font-semibold text-foreground mb-2 pb-1.5 border-b border-border/60">{formattedLabel}</div>}
        <div className="flex flex-col gap-1.5">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-muted-foreground">{entry.name}</span>
              </div>
              <span className="font-semibold text-foreground" dir="ltr">
                {money(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-10" data-testid="page-revenue-analytics">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            {t('لوحة الإيرادات التفصيلية', 'Detailed Revenue Dashboard')}
          </h1>
          <p className="text-[13.5px] text-muted-foreground">
            {t('عرض تفصيلي لأداء الإيرادات وتوزيعها بين الأفراد والشركات.', 'Detailed view of revenue performance and breakdown between individuals and companies.')}
          </p>
          <p className="text-xs text-muted-foreground" data-testid="text-revenue-period">
            {formatDateLabel(data.period.from, lang)} – {formatDateLabel(data.period.to, lang)}
            <span className="mx-1.5">•</span>
            {t('مقارنة مع', 'Compared with')} {formatDateLabel(data.previousPeriod.from, lang)} – {formatDateLabel(data.previousPeriod.to, lang)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-card border border-border rounded-lg p-1 shadow-sm">
            {RANGES.map(days => (
              <button
                key={days}
                data-testid={`button-range-${days}`}
                onClick={() => setRangeDays(days)}
                className={`px-3.5 py-1.5 text-[12px] font-semibold rounded-md transition-all ${
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
            data-testid="button-refresh"
            className="bg-card shadow-sm h-8 w-8 border-border rounded-lg"
            title={t('تحديث البيانات', 'Refresh data')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
          </Button>
        </div>
      </div>

      {/* Info Alert */}
      <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex gap-3 text-[13.5px] text-foreground/80 leading-relaxed shadow-sm">
        <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" />
        <div className="flex flex-col gap-1">
          <strong className="text-foreground">{t('دليل الإيرادات:', 'Revenue Guide:')}</strong>
          <span>
            {t('إيرادات الأفراد تعني الطلبات المدفوعة غير الملغاة والتي لم يتم ربطها بفاتورة شركة، بينما إيرادات الشركات تعني الفواتير المصدرة المرتبطة بالشركات بغض النظر عن حالة دفعها.', 'Online revenue means paid non-cancelled orders not attributed to a company invoice, while company revenue means issued invoices linked to companies regardless of payment status.')}
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
        {/* Total Revenue */}
        <Card className="border border-border shadow-sm rounded-xl overflow-hidden bg-card" data-testid="card-total-revenue">
          <CardContent className="p-5 flex flex-col justify-between h-full min-h-[140px]">
            <div className="flex justify-between items-start mb-4">
              <div className="text-[13px] font-medium text-muted-foreground">{t('إجمالي الإيرادات', 'Total Revenue')}</div>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5 mt-auto">
              <div className="text-3xl font-bold text-foreground tracking-tight" dir="ltr">{money(data.summary.totalRevenue)}</div>
              <ChangeIndicator value={data.summary.changePct} label={t('مقارنة بالفترة السابقة', 'vs previous period')} />
              <div className="text-xs text-muted-foreground">
                {t('الفترة السابقة:', 'Previous period:')} <span dir="ltr">{money(data.previousSummary.totalRevenue)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Online Revenue */}
        <Card className="border border-border shadow-sm rounded-xl overflow-hidden bg-card relative group" data-testid="card-online-revenue">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500/80" />
          <CardContent className="p-5 flex flex-col justify-between h-full min-h-[140px]">
            <div className="flex justify-between items-start mb-4">
              <div className="text-[13px] font-medium text-muted-foreground">{t('إيرادات الأفراد', 'Online Revenue')}</div>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-500">
                <ShoppingCart className="h-4 w-4" />
              </div>
            </div>
            <div className="flex flex-col gap-1 mt-auto">
              <div className="text-2xl font-bold text-foreground" dir="ltr">{money(data.summary.onlineRevenue)}</div>
              <div className="text-[13px] text-muted-foreground mt-1 flex items-center gap-1.5">
                <span className="font-semibold text-foreground">{formatNumber(data.summary.onlineOrders)}</span> {t('طلب أفراد', 'Online orders')}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Company Revenue */}
        <Card className="border border-border shadow-sm rounded-xl overflow-hidden bg-card relative group" data-testid="card-company-revenue">
          <div className="absolute top-0 left-0 w-full h-1 bg-purple-500/80" />
          <CardContent className="p-5 flex flex-col justify-between h-full min-h-[140px]">
            <div className="flex justify-between items-start mb-4">
              <div className="text-[13px] font-medium text-muted-foreground">{t('إيرادات الشركات', 'Company Revenue')}</div>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-purple-500/10 text-purple-500">
                <Building2 className="h-4 w-4" />
              </div>
            </div>
            <div className="flex flex-col gap-1 mt-auto">
              <div className="text-2xl font-bold text-foreground" dir="ltr">{money(data.summary.companyRevenue)}</div>
              <div className="text-[13px] text-muted-foreground mt-1 flex items-center gap-3">
                <span><span className="font-semibold text-foreground">{formatNumber(data.summary.companyInvoices)}</span> {t('فاتورة', 'Invoices')}</span>
                <span className="w-1 h-1 rounded-full bg-border" />
                <span><span className="font-semibold text-foreground">{formatNumber(data.summary.activeCompanies)}</span> {t('شركة نشطة', 'Active companies')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Trend Chart */}
      <Card className="border border-border shadow-sm bg-card rounded-xl overflow-hidden" data-testid="card-trend-chart">
        <CardHeader className="border-b border-border/50 py-4 px-6 bg-muted/20">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-[15px] font-bold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              {t('اتجاهات الإيرادات', 'Revenue Trends')}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-[12px] font-medium">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
                <span className="text-muted-foreground">{t('الأفراد', 'Online')}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-purple-500" />
                <span className="text-muted-foreground">{t('شركات', 'Companies')}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-4 bg-primary" />
                <span className="text-muted-foreground">{t('الإجمالي', 'Total')}</span>
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6" dir="ltr">
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorCompany" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={date => formatDateLabel(date, lang)} 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
                  tickLine={false} 
                  axisLine={false} 
                  minTickGap={30} 
                  dy={10}
                />
                <YAxis 
                  tickFormatter={formatCompact} 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
                  tickLine={false} 
                  axisLine={false} 
                  width={45} 
                  dx={-10}
                />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '4 4' }} />
                
                <Area type="monotone" dataKey="onlineRevenue" name={t('الأفراد', 'Online')} stroke="#3b82f6" strokeWidth={2} fill="url(#colorOnline)" />
                <Area type="monotone" dataKey="companyRevenue" name={t('شركات', 'Companies')} stroke="#a855f7" strokeWidth={2} fill="url(#colorCompany)" />
                <Line type="monotone" dataKey="totalRevenue" name={t('الإجمالي', 'Total')} stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border shadow-sm bg-card rounded-xl overflow-hidden" data-testid="card-company-comparison-chart">
        <CardHeader className="border-b border-border/50 py-4 px-6 bg-muted/20">
          <CardTitle className="text-[15px] font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {t('مقارنة إيرادات الشركات', 'Company Revenue Comparison')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6" dir="ltr">
          {data.byCompany.length > 0 ? (
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.byCompany.slice(0, 8)}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 24, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis
                    type="number"
                    tickFormatter={formatCompact}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="companyName"
                    width={120}
                    tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                  <Bar dataKey="revenue" name={t('الفترة الحالية', 'Current period')} fill="#a855f7" radius={[0, 5, 5, 0]} />
                  <Bar dataKey="previousRevenue" name={t('الفترة السابقة', 'Previous period')} fill="#94a3b8" radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[220px] flex flex-col items-center justify-center text-muted-foreground text-sm" data-testid="empty-company-comparison">
              <Building2 className="h-10 w-10 opacity-30 mb-3" />
              {t('لا توجد إيرادات شركات للمقارنة في هذه الفترة', 'No company revenue to compare in this period')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product movement by sales channel */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {[
          {
            id: 'online',
            title: t('حركة منتجات الأفراد', 'Online Product Movement'),
            icon: <ShoppingCart className="h-4 w-4 text-blue-500" />,
            rows: data.productMovements.online,
          },
          {
            id: 'companies',
            title: t('حركة منتجات الشركات', 'Company Product Movement'),
            icon: <Building2 className="h-4 w-4 text-purple-500" />,
            rows: data.productMovements.companies,
          },
        ].map((section) => (
          <Card key={section.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm" data-testid={`card-product-movement-${section.id}`}>
            <CardHeader className="border-b border-border/50 bg-muted/20 px-6 py-4">
              <CardTitle className="flex items-center gap-2 text-[15px] font-bold">
                {section.icon}
                {section.title}
              </CardTitle>
            </CardHeader>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-border/60 bg-muted">
                  <tr>
                    <th className="px-4 py-3">{t('المنتج', 'Product')}</th>
                    <th className="px-4 py-3">{t('الرمز', 'SKU')}</th>
                    <th className="px-4 py-3">{t('الحركة', 'Movement')}</th>
                    <th className="px-4 py-3">{t('الطلبات / الفواتير', 'Orders / Invoices')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {section.rows.length ? section.rows.map((row) => (
                    <tr key={row.productId} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        {lang === 'ar' ? row.nameAr : row.nameEn}
                        <div className="mt-0.5 text-xs text-muted-foreground">{lang === 'ar' ? row.nameEn : row.nameAr}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.sku || '—'}</td>
                      <td className="px-4 py-3 text-lg font-bold text-primary">{formatNumber(row.quantity)}</td>
                      <td className="px-4 py-3">{formatNumber(row.transactions)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">{t('لا توجد حركة منتجات في هذه الفترة', 'No product movement in this period')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      {/* Shipping Financials Section */}
      <Card className="border border-border shadow-sm bg-card rounded-xl overflow-hidden" data-testid="card-shipping-financials">
        <CardHeader className="border-b border-border/50 py-4 px-6 bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-[15px] font-bold text-foreground flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              {t('مالية الشحن والتوصيل', 'Shipping Financials')}
            </CardTitle>
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground bg-background/50 px-3 py-1.5 rounded-md border border-border/50">
              <Info className="h-3.5 w-3.5 shrink-0 text-primary/70" />
              <span>
                {t('تُمثل الكميات إجمالي كميات الطلبات المرتبطة (لا يتم حساب الشحن الجزئي).', 'Quantities represent full linked order quantities (partial shipments not modeled).')}
              </span>
            </div>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right" data-testid="table-shipping-financials">
            <thead className="text-[12px] text-muted-foreground bg-muted/30 uppercase border-b border-border/60">
              <tr>
                <th className="px-6 py-3.5 font-semibold">{t('القطاع', 'Category')}</th>
                <th className="px-6 py-3.5 font-semibold text-center">{t('الشحنات (المرسلة / الإجمالي)', 'Shipments (Shipped / Total)')}</th>
                <th className="px-6 py-3.5 font-semibold text-center">{t('الكمية', 'Quantity')}</th>
                <th className="px-6 py-3.5 font-semibold">{t('تكلفة الناقل', 'Carrier Cost')}</th>
                <th className="px-6 py-3.5 font-semibold">{t('المحصل من العميل', 'Collected')}</th>
                <th className="px-6 py-3.5 font-semibold">{t('صافي تكلفة الشركة', 'Net Company Cost')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {[
                  { id: 'total', label: t('الإجمالي', 'Total'), icon: <Layers className="h-4 w-4 text-primary" />, data: data.shipping.total },
                  { id: 'domestic', label: t('شحن داخلي', 'Domestic Shipping'), icon: <Truck className="h-4 w-4 text-emerald-500" />, data: data.shipping.domestic },
                  { id: 'international', label: t('شحن دولي', 'International Shipping'), icon: <Truck className="h-4 w-4 text-orange-500" />, data: data.shipping.international },
                  { id: 'online', label: t('الأفراد', 'Online'), icon: <ShoppingCart className="h-4 w-4 text-blue-500" />, data: data.shipping.online },
                  { id: 'companies', label: t('شركات', 'Companies'), icon: <Building2 className="h-4 w-4 text-purple-500" />, data: data.shipping.companies }
                ].map(row => (
                  <tr key={row.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-shipping-${row.id}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                          {row.icon}
                        </div>
                        <span className="font-semibold text-[13.5px] text-foreground">{row.label}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-muted/50 text-foreground font-medium text-[13px] min-w-[70px]" dir="ltr">
                        {formatNumber(row.data.shippedCount)} / {formatNumber(row.data.shipmentCount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-[13.5px] text-muted-foreground">
                      {formatNumber(row.data.quantity)}
                    </td>
                    <td className="px-6 py-4 font-medium text-[13.5px] text-foreground" dir="ltr">
                      {money(row.data.actualCost)}
                    </td>
                    <td className="px-6 py-4 font-medium text-[13.5px] text-emerald-600 dark:text-emerald-500" dir="ltr">
                      {money(row.data.collectedCost)}
                    </td>
                    <td className={`px-6 py-4 font-bold text-[13.5px] ${row.data.netCost > 0 ? 'text-destructive' : 'text-emerald-600'}`} dir="ltr">
                      {money(row.data.netCost)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Company Breakdown Table */}
      <Card className="border border-border shadow-sm bg-card rounded-xl overflow-hidden" data-testid="card-company-breakdown">
        <CardHeader className="border-b border-border/50 py-4 px-6 bg-muted/20">
          <CardTitle className="text-[15px] font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {t('توزيع إيرادات الشركات', 'Company Revenue Breakdown')}
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right" data-testid="table-company-revenue">
            <thead className="text-[12px] text-muted-foreground bg-muted/30 uppercase border-b border-border/60">
              <tr>
                <th className="px-6 py-3.5 font-semibold">{t('الشركة', 'Company')}</th>
                <th className="px-6 py-3.5 font-semibold text-center">{t('الفواتير', 'Invoices')}</th>
                <th className="px-6 py-3.5 font-semibold" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{t('الإيرادات', 'Revenue')}</th>
                <th className="px-6 py-3.5 font-semibold">{t('الفترة السابقة', 'Previous period')}</th>
                <th className="px-6 py-3.5 font-semibold">{t('النسبة من الإجمالي', 'Share %')}</th>
                <th className="px-6 py-3.5 font-semibold text-center">{t('النمو', 'Trend')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {data.byCompany.map((company, index) => (
                <tr key={company.companyId} className="hover:bg-muted/20 transition-colors" data-testid={`row-company-${company.companyId}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-7 w-7 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-[12px] shrink-0">
                        {index + 1}
                      </div>
                      <span className="font-semibold text-[13.5px] text-foreground">{company.companyName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-muted/50 text-foreground font-medium text-[13px] min-w-[32px]">
                      {formatNumber(company.invoices)}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-bold text-[14px] text-foreground" dir="ltr">
                    {money(company.revenue)}
                  </td>
                  <td className="px-6 py-4 text-[13px] text-muted-foreground" dir="ltr">
                    {money(company.previousRevenue)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                        <div 
                          className="h-full bg-purple-500 rounded-full" 
                          style={{ width: `${Math.min(100, Math.max(0, company.sharePct))}%` }}
                        />
                      </div>
                      <span className="text-[12px] font-medium text-muted-foreground w-10" dir="ltr">
                        {formatPercent(company.sharePct, lang)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 flex justify-center">
                    <ChangeIndicator value={company.changePct} />
                  </td>
                </tr>
              ))}
              {data.byCompany.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground text-[13.5px]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                      <p>{t('لا توجد إيرادات شركات في هذه الفترة', 'No company revenue in this period')}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
