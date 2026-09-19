import { useEffect, useState, useMemo } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import {
  useInfluencerLogin,
  useInfluencerMe,
  useInfluencerDashboard,
  getInfluencerMeQueryKey,
  getInfluencerDashboardQueryKey
} from '@workspace/api-client-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveInfluencerToken, getAuthToken, removeInfluencerToken } from '@/lib/auth-token';
import {
  Copy, ExternalLink, LogOut, Share2, TrendingUp, ShoppingBag, Eye, Wallet,
  UserRound, Activity, BarChart3, Check, Sparkles, Globe
} from 'lucide-react';

const money = (value: unknown) => `${Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR`;
const text = (value: unknown, fallback = '—') => value === undefined || value === null ? fallback : String(value);

function Login() {
  const [, setLocation] = useLocation();
  const { t, lang, setLang } = useLanguage();
  const mutation = useInfluencerLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <main
      className="min-h-[100dvh] flex items-center justify-center bg-stone-50 dark:bg-stone-950 p-6 relative overflow-hidden font-sans transition-colors duration-300"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-amber-500/10 dark:bg-amber-500/5 blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-screen" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] bg-stone-400/20 dark:bg-stone-700/20 blur-[100px] rounded-full mix-blend-multiply dark:mix-blend-screen" />
      </div>

      <section className="relative w-full max-w-[420px] rounded-2xl bg-white/80 dark:bg-stone-900/80 backdrop-blur-xl border border-stone-200 dark:border-stone-800 p-10 shadow-2xl">
        <div className="mb-10 text-center">
          <img src="/site-assets/musk-ellolo-wordmark-black.png" alt="Musk Ellolo" className="mx-auto mb-10 w-48 object-contain dark:hidden" />
          <img src="/site-assets/musk-ellolo-wordmark-white.png" alt="Musk Ellolo" className="mx-auto mb-10 hidden w-48 object-contain dark:block" />

          <div className="inline-flex items-center justify-center gap-2 px-3 py-1 mb-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 text-xs font-semibold tracking-widest uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            {t('بوابة الشركاء', 'Partner Portal')}
          </div>
          <h1 className="text-3xl font-bold text-stone-950 dark:text-white tracking-tight">{t('تسجيل الدخول', 'Sign In')}</h1>
          <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
            {t('تابع أداءك وأرباحك من مكان واحد', 'Track your performance and earnings securely')}
          </p>
        </div>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(
              { data: { email, password } },
              {
                onSuccess: (result) => {
                  saveInfluencerToken(result.token);
                  setLocation('/influencer');
                }
              }
            );
          }}
        >
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
              {t('البريد الإلكتروني', 'Email')}
            </label>
            <Input
              className="w-full h-12 bg-stone-50 dark:bg-stone-950 border-stone-200 dark:border-stone-800 focus-visible:ring-amber-500"
              dir="ltr"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              data-testid="input-email"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
              {t('كلمة المرور', 'Password')}
            </label>
            <Input
              className="w-full h-12 bg-stone-50 dark:bg-stone-950 border-stone-200 dark:border-stone-800 focus-visible:ring-amber-500"
              dir="ltr"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              data-testid="input-password"
            />
          </div>

          {mutation.isError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm flex items-start gap-2" data-testid="error-message">
              <Activity className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{t('تعذر تسجيل الدخول. تحقق من البيانات.', 'Unable to sign in. Check your credentials.')}</p>
            </div>
          )}

          <Button
            className="w-full h-12 text-base font-medium bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-white dark:text-stone-900 transition-all shadow-lg shadow-stone-900/20 dark:shadow-stone-100/20"
            disabled={mutation.isPending}
            data-testid="button-submit"
          >
            {mutation.isPending ? t('جاري الدخول…', 'Signing in…') : t('الدخول إلى البوابة', 'Access Portal')}
          </Button>
        </form>

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            data-testid="button-lang-toggle"
          >
            <Globe className="w-3.5 h-3.5" />
            {lang === 'ar' ? 'English (US)' : 'العربية'}
          </button>
        </div>
      </section>
    </main>
  );
}

function MetricCard({ title, value, subtitle, icon: Icon, trend, valueColor, testId }: any) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-5 transition-all hover:shadow-md group">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-950 text-stone-700 dark:text-stone-300 group-hover:bg-amber-50 group-hover:text-amber-600 dark:group-hover:bg-amber-950/30 dark:group-hover:text-amber-400 transition-colors">
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full">
            <TrendingUp className="w-3 h-3" />
            <span>{trend}</span>
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-medium text-stone-500 dark:text-stone-400 mb-1">{title}</h3>
        <div className="flex items-baseline gap-2">
          <p className={`text-3xl font-bold tracking-tight ${valueColor || 'text-stone-950 dark:text-white'}`} data-testid={testId}>
            {value}
          </p>
          {subtitle && <span className="text-sm text-stone-500 dark:text-stone-400 font-medium">{subtitle}</span>}
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [, setLocation] = useLocation();
  const { t, lang, setLang } = useLanguage();
  const hasToken = !!getAuthToken();

  const me = useInfluencerMe({
    query: { enabled: hasToken, retry: false, queryKey: getInfluencerMeQueryKey() }
  });

  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const [copied, setCopied] = useState(false);

  const dashboard = useInfluencerDashboard(
    { rangeDays: Number(range) as 7 | 30 | 90 },
    { query: { enabled: hasToken, retry: false, queryKey: getInfluencerDashboardQueryKey({ rangeDays: Number(range) as 7 | 30 | 90 }) } }
  );

  useEffect(() => {
    if (!hasToken || (me.error as any)?.status === 401) {
      removeInfluencerToken();
      setLocation('/influencer/login');
    }
  }, [hasToken, me.error, setLocation]);

  const smartInsight = useMemo(() => {
    const summary = (dashboard.data as any)?.summary;
    if (!summary) return null;
    const paid = Number(summary.attributedPaidOrders || 0);
    const conv = Number(summary.conversionRate || 0);
    const comm = Number(summary.commission || 0);
    const visits = Number(summary.visits || 0);

    if (paid > 0 && comm > 0) {
      return t(
        `أداء رائع! لقد حققت ${paid} طلبات مدفوعة، بعمولة إجمالية قدرها ${money(comm)}.`,
        `Great performance! You generated ${paid} paid orders, earning a total of ${money(comm)}.`
      );
    } else if (visits > 50 && paid === 0) {
      return t(
        'لديك زيارات جيدة ولكن لم تتحول إلى طلبات بعد. جرب التحدث عن تجربتك الشخصية مع المنتجات.',
        'You have good traffic but no paid orders yet. Try sharing your personal experience with the products.'
      );
    } else if (conv > 0.03) {
      return t(
        `معدل التحويل الخاص بك يبلغ ${(conv * 100).toFixed(1)}% وهو معدل ممتاز. استمر في مشاركة الرابط!`,
        `Your conversion rate is ${(conv * 100).toFixed(1)}%, which is excellent. Keep sharing your link!`
      );
    }
    return t('شارك رابطك للحصول على زيارات وطلبات إضافية.', 'Share your link to generate more visits and orders.');
  }, [dashboard.data, t]);

  if (!hasToken || me.isLoading) {
    return (
      <div className="min-h-[100dvh] bg-stone-50 dark:bg-stone-950 grid place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900 dark:border-stone-700 dark:border-t-white" />
          <p className="text-sm font-medium text-stone-500">{t('جاري تحميل البوابة...', 'Loading portal...')}</p>
        </div>
      </div>
    );
  }

  if (me.error || dashboard.error) {
    return (
      <main className="min-h-[100dvh] grid place-items-center bg-stone-50 dark:bg-stone-950 p-6 text-center">
        <div className="max-w-md w-full bg-white dark:bg-stone-900 p-8 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm">
          <Activity className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <p className="mb-6 text-stone-900 dark:text-white font-medium">
            {t('حدث خطأ أثناء تحميل البيانات.', 'Something went wrong loading your data.')}
          </p>
          <Button
            className="w-full bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            onClick={() => { void me.refetch(); void dashboard.refetch(); }}
            data-testid="button-retry"
          >
            {t('إعادة المحاولة', 'Try again')}
          </Button>
        </div>
      </main>
    );
  }

  const user = me.data;
  const data = dashboard.data as any;
  const summary = data?.summary ?? {};

  const copyLink = async () => {
    if (data?.referralUrl) {
      const url = new URL(data.referralUrl, window.location.origin).toString();
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const logout = async () => {
    await fetch('/api/influencer/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAuthToken()}` }
    }).catch(() => undefined);
    removeInfluencerToken();
    setLocation('/influencer/login');
  };

  return (
    <div className="min-h-[100dvh] bg-stone-50 dark:bg-stone-950 font-sans text-stone-900 dark:text-stone-50 transition-colors duration-300" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Navigation */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-stone-950/80 backdrop-blur-xl border-b border-stone-200 dark:border-stone-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 h-16">
          <div className="flex items-center gap-3">
            <img src="/site-assets/musk-ellolo-mark-black.png" alt="" className="h-7 w-7 object-contain dark:hidden" />
            <img src="/site-assets/musk-ellolo-mark-white.png" alt="" className="hidden h-7 w-7 object-contain dark:block" />
            <span className="font-bold text-sm tracking-wide uppercase text-stone-900 dark:text-white">
              {t('بوابة الشركاء', 'Partner Portal')}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              className="text-xs font-semibold uppercase tracking-wider text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white transition-colors"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              data-testid="button-lang-toggle"
            >
              {lang === 'ar' ? 'EN' : 'عربي'}
            </button>
            <div className="w-px h-4 bg-stone-200 dark:bg-stone-800" />
            <button
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white transition-colors"
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t('تسجيل الخروج', 'Sign Out')}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 space-y-10 pb-20">

        {/* Top Header & Actions */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" className="h-16 w-16 rounded-full object-cover border-2 border-white dark:border-stone-800 shadow-md" data-testid="img-avatar" />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-full bg-stone-200 dark:bg-stone-800 text-stone-500 dark:text-stone-400 shadow-inner" data-testid="img-avatar-fallback">
                  <UserRound className="h-7 w-7" />
                </div>
              )}
              {user?.isActive && (
                <div className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-stone-950 rounded-full shadow-sm" title={t('حساب نشط', 'Active Account')} />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500 dark:text-stone-400 mb-0.5">
                {t('مرحباً بك مجدداً،', 'Welcome back,')}
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-stone-950 dark:text-white" data-testid="text-username">
                {user?.name}
              </h1>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="inline-flex bg-stone-200/50 dark:bg-stone-800/50 p-1 rounded-lg">
              {(['7', '30', '90'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  data-testid={`button-range-${r}`}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    range === r
                      ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm'
                      : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  {r === '7' ? t('7 أيام', '7D') : r === '30' ? t('30 يوم', '30D') : t('90 يوم', '90D')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Smart Insight Banner */}
        {smartInsight && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/50 rounded-2xl p-4 flex items-start gap-4 shadow-sm">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-full shrink-0">
              <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200 mb-1">{t('لمحة سريعة', 'Quick Insight')}</h4>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300/80 leading-relaxed" data-testid="text-insight">
                {smartInsight}
              </p>
            </div>
          </div>
        )}

        {/* Action Bar (Referral Link) */}
        <section className="bg-stone-900 dark:bg-stone-100 rounded-2xl p-6 md:p-8 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-stone-800 to-stone-900 dark:from-stone-200 dark:to-stone-100" />

          <div className="relative z-10 flex-1 w-full flex items-center gap-5">
            <div className="p-3.5 bg-white/10 dark:bg-black/10 rounded-xl shrink-0">
              <Share2 className="w-6 h-6 text-white dark:text-stone-900" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white dark:text-stone-900 mb-1">{t('رابط الإحالة الخاص بك', 'Your Referral Link')}</h2>
              <p className="text-sm text-stone-400 dark:text-stone-600 font-medium">
                {t('شارك هذا الرابط لاحتساب الزيارات والعمولات تلقائياً.', 'Share this link to automatically track visits and commissions.')}
              </p>
            </div>
          </div>

          <div className="relative z-10 flex w-full md:w-auto items-center gap-2 bg-white/10 dark:bg-black/5 p-1.5 rounded-xl border border-white/10 dark:border-black/10">
            <Input
              readOnly
              dir="ltr"
              value={data?.referralUrl ? new URL(data.referralUrl, window.location.origin).toString() : ''}
              className="bg-transparent border-0 h-10 text-white dark:text-stone-900 placeholder:text-stone-400 focus-visible:ring-0 w-full md:w-72 font-medium truncate"
              data-testid="input-referral-link"
            />
            <Button
              onClick={copyLink}
              className={`h-10 px-6 shrink-0 transition-all shadow-md ${copied ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-white text-stone-900 hover:bg-stone-100 dark:bg-stone-900 dark:text-white dark:hover:bg-stone-800'}`}
              data-testid="button-copy-link"
            >
              {copied ? <Check className="w-4 h-4 me-2" /> : <Copy className="w-4 h-4 me-2" />}
              {copied ? t('تم النسخ', 'Copied') : t('نسخ الرابط', 'Copy Link')}
            </Button>
          </div>
        </section>

        {/* Metrics Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <MetricCard
            title={t('إجمالي الأرباح', 'Total Earnings')}
            value={money(summary.commission)}
            icon={Wallet}
            valueColor="text-emerald-600 dark:text-emerald-400"
            testId="metric-earnings"
          />
          <MetricCard
            title={t('المبيعات المحققة', 'Generated Sales')}
            value={money(summary.sales)}
            icon={TrendingUp}
            testId="metric-sales"
          />
          <MetricCard
            title={t('الطلبات المدفوعة', 'Paid Orders')}
            value={text(summary.attributedPaidOrders, '0')}
            icon={ShoppingBag}
            testId="metric-orders"
          />
          <MetricCard
            title={t('الزيارات', 'Link Visits')}
            value={text(summary.visits, '0')}
            icon={Eye}
            testId="metric-visits"
          />
          <MetricCard
            title={t('معدل التحويل', 'Conversion Rate')}
            value={`${(Number(summary.conversionRate ?? 0) * 100).toFixed(1)}%`}
            icon={Activity}
            testId="metric-conversion"
          />
          <MetricCard
            title={t('متوسط قيمة الطلب', 'Average Order Value')}
            value={money(summary.averageOrderValue)}
            icon={BarChart3}
            testId="metric-aov"
          />
        </section>

        {/* Charts & Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* Main Chart */}
          <section className="lg:col-span-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-1">{t('مؤشر الأداء', 'Performance Trend')}</h2>
                <p className="text-sm font-medium text-stone-500">{t('المبيعات خلال الفترة المحددة', 'Sales over selected period')}</p>
              </div>
            </div>

            {!data?.series?.length ? (
              <div className="h-72 flex items-center justify-center border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-xl bg-stone-50 dark:bg-stone-950/50">
                <p className="text-sm font-medium text-stone-500">{t('لا توجد بيانات كافية في هذا النطاق', 'Not enough data in this range')}</p>
              </div>
            ) : (
              <div className="h-72 w-full" data-testid="chart-performance">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.series as any[]} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d97706" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-stone-200 dark:text-stone-800" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: 'currentColor' }}
                      className="text-stone-500"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'currentColor' }}
                      className="text-stone-500"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value.toLocaleString()}`}
                    />
                    <Tooltip
                      formatter={(value: number) => [money(value), t('المبيعات', 'Sales')]}
                      contentStyle={{ backgroundColor: 'var(--tw-colors-stone-900)', borderColor: 'var(--tw-colors-stone-800)', borderRadius: '12px', fontWeight: 600, color: 'white' }}
                      itemStyle={{ color: '#d97706' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="#d97706"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorSales)"
                      activeDot={{ r: 6, fill: '#d97706', stroke: 'white', strokeWidth: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Right Column (Coupons & Orders) */}
          <div className="space-y-6">

            {/* Coupons */}
            <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-stone-900 dark:text-white">{t('أكواد الخصم', 'Discount Codes')}</h2>
              </div>

              {!data?.codes?.length ? (
                <div className="py-8 text-center text-sm font-medium text-stone-500 border border-dashed border-stone-200 dark:border-stone-800 rounded-xl bg-stone-50 dark:bg-stone-950/50">
                  {t('لا توجد أكواد مرتبطة بحسابك بعد.', 'No active coupons linked to your account.')}
                </div>
              ) : (
                <div className="space-y-4">
                  {data.codes.map((code: any) => (
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-stone-50 dark:bg-stone-950/50 border border-stone-100 dark:border-stone-800/80" key={code.id} data-testid={`row-coupon-${code.id}`}>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-stone-900 dark:text-white tracking-wider" dir="ltr">{code.code}</span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${code.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400'}`}>
                            {code.isActive ? t('نشط', 'Active') : t('متوقف', 'Inactive')}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-stone-500">
                          {code.discountType === 'percentage' ? `${code.discountValue}% ${t('خصم', 'Off')}` : `${money(code.discountValue)} ${t('خصم', 'Off')}`}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="text-lg font-bold text-stone-900 dark:text-white">{text(code.attributedUses, '0')}</p>
                        <p className="text-[10px] font-bold uppercase text-stone-400">{t('استخدام', 'Uses')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Recent Orders */}
            <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-stone-900 dark:text-white">{t('أحدث الطلبات', 'Recent Orders')}</h2>
              </div>

              {!data?.orders?.length ? (
                <div className="py-8 text-center text-sm font-medium text-stone-500 border border-dashed border-stone-200 dark:border-stone-800 rounded-xl bg-stone-50 dark:bg-stone-950/50">
                  {t('لم يتم تسجيل طلبات مدفوعة بعد.', 'No paid orders recorded yet.')}
                </div>
              ) : (
                <div className="space-y-4">
                  {data.orders.slice(0, 5).map((order: any) => (
                    <div className="group flex items-center justify-between" key={order.orderNumber} data-testid={`row-order-${order.orderNumber}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0 group-hover:bg-amber-50 dark:group-hover:bg-amber-900/20 transition-colors">
                          <ShoppingBag className="w-4 h-4 text-stone-500 group-hover:text-amber-600 dark:group-hover:text-amber-400" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-stone-900 dark:text-white" dir="ltr">#{order.orderNumber}</p>
                          <p className="text-xs font-medium text-stone-500">
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' }) : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-end">
                        <p className="font-bold text-sm text-stone-900 dark:text-white">{money(order.total)}</p>
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">+{money(order.commission)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {data?.orders?.length > 0 && (
                <div className="mt-6 pt-4 border-t border-stone-100 dark:border-stone-800 text-center">
                  <p className="text-xs font-medium text-stone-400 flex items-center justify-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    {t('تعرض هذه القائمة الطلبات المدفوعة فقط', 'Showing only paid & verified orders')}
                  </p>
                </div>
              )}
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}

export default function InfluencerRoutes() {
  return (
    <Switch>
      <Route path="/influencer/login" component={Login} />
      <Route path="/influencer" component={Dashboard} />
      <Route path="/infulancer/login" component={Login} />
      <Route path="/infulancer" component={Dashboard} />
    </Switch>
  );
}
