import { useEffect, useState } from 'react';
import { Link, Route, Switch, useLocation } from 'wouter';
import { useInfluencerLogin, useInfluencerMe, useInfluencerDashboard, getInfluencerMeQueryKey, getInfluencerDashboardQueryKey } from '@workspace/api-client-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveInfluencerToken, getAuthToken, removeInfluencerToken } from '@/lib/auth-token';
import { Copy, ExternalLink, LogOut, Share2, TrendingUp, ShoppingBag, Eye, Wallet, UserRound } from 'lucide-react';

const money = (value: unknown) => `${Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR`;
const text = (value: unknown, fallback = '—') => value === undefined || value === null ? fallback : String(value);

function Login() {
  const [, setLocation] = useLocation();
  const { t, lang, setLang } = useLanguage();
  const mutation = useInfluencerLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return <main className="admin-theme min-h-screen bg-background text-foreground flex items-center justify-center p-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <section className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-xl">
      <div className="mb-8 text-center">
        <img src="/site-assets/musk-ellolo-wordmark-black.png" alt="Musk Ellolo" className="mx-auto mb-8 w-56 object-contain dark:hidden" />
        <img src="/site-assets/musk-ellolo-wordmark-white.png" alt="Musk Ellolo" className="mx-auto mb-8 hidden w-56 object-contain dark:block" />
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent"><TrendingUp /></div>
        <h1 className="text-2xl font-bold">{t('بوابة المشاهير', 'Influencer portal')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('تابع أداءك وأرباحك من مكان واحد', 'Track your performance and earnings in one place')}</p>
      </div>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate({ data: { email, password } }, { onSuccess: (result) => { saveInfluencerToken(result.token); setLocation('/infulancer'); } }); }}>
        <label className="block text-sm font-medium">{t('البريد الإلكتروني', 'Email')}<Input className="mt-2" dir="ltr" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="block text-sm font-medium">{t('كلمة المرور', 'Password')}<Input className="mt-2" dir="ltr" type="password" autoComplete="current-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} /></label>
        {mutation.isError && <p className="text-sm text-destructive">{t('تعذر تسجيل الدخول. تحقق من البيانات.', 'Unable to sign in. Check your credentials.')}</p>}
        <Button className="w-full" disabled={mutation.isPending}>{mutation.isPending ? t('جاري الدخول…', 'Signing in…') : t('تسجيل الدخول', 'Sign in')}</Button>
      </form>
      <button className="mt-5 w-full text-center text-xs text-muted-foreground hover:text-foreground" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'English' : 'العربية'}</button>
    </section>
  </main>;
}

function Dashboard() {
  const [, setLocation] = useLocation();
  const { t, lang, setLang } = useLanguage();
  const hasToken = !!getAuthToken();
  const me = useInfluencerMe({ query: { enabled: hasToken, retry: false, queryKey: getInfluencerMeQueryKey() } });
  const [range, setRange] = useState('30');
  const [copied, setCopied] = useState(false);
  const dashboard = useInfluencerDashboard({ rangeDays: Number(range) as 7 | 30 | 90 }, { query: { enabled: hasToken, retry: false, queryKey: getInfluencerDashboardQueryKey({ rangeDays: Number(range) as 7 | 30 | 90 }) } });
  useEffect(() => { if (!hasToken || (me.error as any)?.status === 401) { removeInfluencerToken(); setLocation('/infulancer/login'); } }, [hasToken, me.error, setLocation]);
  if (!hasToken || me.isLoading) return <div className="admin-theme min-h-screen grid place-items-center bg-background"><div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>;
  if (me.error || dashboard.error) return <main className="admin-theme min-h-screen grid place-items-center bg-background p-6 text-center"><div><p className="mb-4 text-destructive">{t('حدث خطأ أثناء تحميل البيانات.', 'Something went wrong loading your data.')}</p><Button onClick={() => { void me.refetch(); void dashboard.refetch(); }}>{t('إعادة المحاولة', 'Try again')}</Button></div></main>;
  const user = me.data;
  const data = dashboard.data as any;
  const summary = data?.summary ?? {};
  const cards = [
    [Wallet, t('الأرباح', 'Earnings'), money(summary.commission), 'text-emerald-600'],
    [ShoppingBag, t('الطلبات المدفوعة', 'Paid orders'), text(summary.attributedPaidOrders, '0'), 'text-blue-600'],
    [Eye, t('الزيارات', 'Visits'), text(summary.visits, '0'), 'text-violet-600'],
    [TrendingUp, t('المبيعات', 'Sales'), money(summary.sales), 'text-amber-600'],
    [TrendingUp, t('نسبة التحويل', 'Conversion'), `${(Number(summary.conversionRate ?? 0) * 100).toFixed(1)}%`, 'text-cyan-600'],
    [ShoppingBag, t('متوسط الطلب', 'Average order value'), money(summary.averageOrderValue), 'text-pink-600'],
  ] as const;
  const copy = async () => { if (data?.referralUrl) { await navigator.clipboard?.writeText(new URL(data.referralUrl, window.location.origin).toString()); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } };
  const logout = async () => { await fetch('/api/influencer/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${getAuthToken()}` } }).catch(() => undefined); removeInfluencerToken(); setLocation('/infulancer/login'); };
  return <main className="admin-theme min-h-screen bg-background text-foreground" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
    <header className="border-b bg-card"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 md:px-8">
      <div className="flex items-center gap-3"><img src="/site-assets/musk-ellolo-mark-black.png" alt="" className="h-9 w-9 object-contain dark:hidden" /><img src="/site-assets/musk-ellolo-mark-white.png" alt="" className="hidden h-9 w-9 object-contain dark:block" /><span className="font-semibold">{t('بوابة المشاهير', 'Influencer portal')}</span></div>
      <div className="flex items-center gap-2"><button className="px-2 text-xs text-muted-foreground" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'EN' : 'العربية'}</button><Button variant="ghost" size="sm" onClick={logout}><LogOut className="me-2 h-4 w-4" />{t('خروج', 'Logout')}</Button></div>
    </div></header>
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4">{user?.imageUrl ? <img src={user.imageUrl} alt="" className="h-14 w-14 rounded-full object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-full bg-accent/15 text-accent"><UserRound /></div>}<div><p className="text-sm text-muted-foreground">{t('مرحباً بعودتك', 'Welcome back')}</p><h1 className="text-2xl font-bold">{user?.name}</h1></div></div><select aria-label={t('النطاق الزمني', 'Time range')} value={range} onChange={e => setRange(e.target.value)} className="rounded-lg border bg-card px-3 py-2 text-sm"><option value="7">{t('آخر 7 أيام', 'Last 7 days')}</option><option value="30">{t('آخر 30 يوماً', 'Last 30 days')}</option><option value="90">{t('آخر 90 يوماً', 'Last 90 days')}</option></select></div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([Icon, label, value, color]) => <div className="rounded-xl border bg-card p-5 shadow-sm" key={label}><Icon className={`mb-4 h-5 w-5 ${color}`} /><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}</section>
      <section className="rounded-xl border bg-card p-5"><div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-semibold">{t('رابط الإحالة', 'Referral link')}</h2><p className="text-sm text-muted-foreground">{t('شارك الرابط لاحتساب الزيارات والطلبات', 'Share this link to track visits and orders')}</p></div><Share2 className="h-5 w-5 text-accent" /></div><div className="flex gap-2"><Input readOnly dir="ltr" value={data?.referralUrl ? new URL(data.referralUrl, window.location.origin).toString() : ''} /><Button onClick={copy}><Copy className="me-2 h-4 w-4" />{copied ? t('تم النسخ', 'Copied') : t('نسخ', 'Copy')}</Button></div></section>
      <section className="rounded-xl border bg-card p-5"><h2 className="mb-4 font-semibold">{t('الأداء اليومي', 'Daily performance')}</h2>{!data?.series?.length ? <p className="py-8 text-center text-sm text-muted-foreground">{t('لا توجد بيانات في هذا النطاق', 'No data in this range')}</p> : <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.series as any[]}><XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value: number) => money(value)} /><Line type="monotone" dataKey="sales" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>}</section>
      <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-xl border bg-card p-5"><h2 className="mb-4 font-semibold">{t('أداء الأكواد', 'Coupon performance')}</h2>{!data?.codes?.length ? <p className="py-8 text-center text-sm text-muted-foreground">{t('لا توجد أكواد مرتبطة بعد', 'No linked coupons yet')}</p> : <div className="space-y-3">{data.codes.map((code: any) => <div className="flex items-center justify-between border-b pb-3 last:border-0" key={code.id}><div><p className="font-medium" dir="ltr">{code.code}</p><p className="text-xs text-muted-foreground">{code.discountType === 'percentage' ? `${code.discountValue}%` : money(code.discountValue)} · {code.isActive ? t('فعال', 'Active') : t('غير فعال', 'Inactive')}</p></div><span className="text-sm">{text(code.attributedUses, '0')} {t('منسوب', 'attributed')}</span></div>)}</div>}</section>
      <section className="rounded-xl border bg-card p-5"><h2 className="mb-4 font-semibold">{t('سجل الطلبات المدفوعة', 'Paid order history')}</h2>{!data?.orders?.length ? <p className="py-8 text-center text-sm text-muted-foreground">{t('لا توجد طلبات منسوبة بعد', 'No attributed orders yet')}</p> : <div className="space-y-3">{data.orders.slice(0, 8).map((order: any) => <div className="flex items-center justify-between border-b pb-3 last:border-0" key={order.orderNumber}><div><p className="font-medium" dir="ltr">{order.orderNumber}</p><p className="text-xs text-muted-foreground">{order.source} · {order.createdAt ? new Date(order.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US') : ''}</p></div><div className="text-end"><p className="font-medium">{money(order.total)}</p><p className="text-xs text-emerald-600">{money(order.commission)} · {text(order.status)}</p></div></div>)}</div>}</section></div>
      <div className="text-center text-xs text-muted-foreground"><ExternalLink className="me-1 inline h-3 w-3" />{t('البيانات مبنية على الطلبات المدفوعة فقط', 'Metrics are based on paid orders only')}</div>
    </div>
  </main>;
}

export default function InfluencerRoutes() {
  return <Switch><Route path="/infulancer/login" component={Login} /><Route path="/infulancer" component={Dashboard} /></Switch>;
}