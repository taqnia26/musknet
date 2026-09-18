import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getAdminListCouponsQueryKey,
  getListInfluencersQueryKey,
  useAdminListCoupons,
  useCreateInfluencer,
  useLinkInfluencerCoupon,
  useListInfluencers,
  useUnlinkInfluencerCoupon,
  useUpdateInfluencer,
} from '@workspace/api-client-react';
import {
  BarChart3,
  CircleDollarSign,
  Crown,
  Medal,
  PackageCheck,
  Percent,
  Plus,
  Power,
  Search,
  TrendingUp,
  Unlink,
  UserRound,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Performance = {
  orders?: number;
  sales?: number;
  commission?: number;
  visits?: number;
  conversionRate?: number;
  averageOrderValue?: number;
  lastOrderAt?: string | null;
  couponOrders?: number;
  referralOrders?: number;
};

type InfluencerRow = {
  id: number;
  name: string;
  email: string;
  imageUrl?: string | null;
  referralCode: string;
  commissionRate: number;
  isActive?: boolean;
  couponIds?: number[];
  performance?: Performance;
};

const blank = {
  name: '',
  email: '',
  password: '',
  referralCode: '',
  commissionRate: '10',
  imageUrl: '',
};

const numberValue = (value: unknown) => Number(value ?? 0) || 0;

function formatSar(value: number, lang: string) {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-SA', {
    style: 'currency',
    currency: 'SAR',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null | undefined, lang: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export default function AdminInfluencers() {
  const { t, lang } = useLanguage();
  const queryClient = useQueryClient();
  const list = useListInfluencers({ query: { retry: false, queryKey: getListInfluencersQueryKey() } });
  const coupons = useAdminListCoupons(undefined, { query: { queryKey: getAdminListCouponsQueryKey() } });
  const create = useCreateInfluencer();
  const update = useUpdateInfluencer();
  const link = useLinkInfluencerCoupon();
  const unlink = useUnlinkInfluencerCoupon();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState('');
  const [linked, setLinked] = useState<Record<number, number[]>>({});
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'net' | 'sales' | 'orders' | 'average'>('net');

  const influencers = (list.data ?? []) as InfluencerRow[];
  const totals = useMemo(() => influencers.reduce((acc, item) => {
    const sales = numberValue(item.performance?.sales);
    const commission = numberValue(item.performance?.commission);
    const orders = numberValue(item.performance?.orders);
    acc.sales += sales;
    acc.commission += commission;
    acc.orders += orders;
    acc.visits += numberValue(item.performance?.visits);
    if (item.isActive !== false) acc.active += 1;
    return acc;
  }, { sales: 0, commission: 0, orders: 0, visits: 0, active: 0 }), [influencers]);

  const enriched = useMemo(() => influencers.map((item) => {
    const sales = numberValue(item.performance?.sales);
    const commission = numberValue(item.performance?.commission);
    const orders = numberValue(item.performance?.orders);
    const visits = numberValue(item.performance?.visits);
    return {
      ...item,
      sales,
      commission,
      orders,
      visits,
      net: sales - commission,
      average: numberValue(item.performance?.averageOrderValue) || (orders ? sales / orders : 0),
      conversion: numberValue(item.performance?.conversionRate) || (visits ? orders / visits : 0),
      couponOrders: numberValue(item.performance?.couponOrders),
      referralOrders: numberValue(item.performance?.referralOrders),
      lastOrderAt: item.performance?.lastOrderAt,
      efficiency: commission ? sales / commission : 0,
      share: totals.sales ? (sales / totals.sales) * 100 : 0,
    };
  }), [influencers, totals.sales]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return enriched
      .filter((item) => {
        const matchesSearch = !query
          || item.name.toLowerCase().includes(query)
          || item.email.toLowerCase().includes(query)
          || item.referralCode.toLowerCase().includes(query);
        const matchesStatus = status === 'all'
          || (status === 'active' ? item.isActive !== false : item.isActive === false);
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => b[sortBy] - a[sortBy]);
  }, [enriched, search, sortBy, status]);

  const bestNet = [...enriched].sort((a, b) => b.net - a.net)[0];
  const bestAverage = [...enriched].filter((item) => item.orders > 0).sort((a, b) => b.average - a.average)[0];
  const zeroSalesCount = enriched.filter((item) => item.sales === 0).length;
  const maxNet = Math.max(...enriched.map((item) => item.net), 1);
  const totalNet = totals.sales - totals.commission;
  const averageOrder = totals.orders ? totals.sales / totals.orders : 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListInfluencersQueryKey() });

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');
    const data: {
      name: string;
      email: string;
      referralCode: string;
      commissionRate: number;
      imageUrl: string | null;
      password?: string;
    } = {
      name: form.name,
      email: form.email,
      referralCode: form.referralCode,
      commissionRate: Number(form.commissionRate),
      imageUrl: form.imageUrl || null,
    };
    if (form.password) data.password = form.password;

    if (selected) {
      update.mutate({ id: selected, data }, {
        onSuccess: () => {
          setSelected(null);
          setOpen(false);
          void refresh();
        },
        onError: () => setMessage(t('تعذر تحديث الحساب', 'Could not update account')),
      });
    } else {
      create.mutate({ data: { ...data, password: form.password } }, {
        onSuccess: () => {
          setForm(blank);
          setOpen(false);
          void refresh();
        },
        onError: () => setMessage(t('تعذر إنشاء الحساب', 'Could not create account')),
      });
    }
  };

  const edit = (item: InfluencerRow) => {
    setSelected(item.id);
    setForm({
      name: item.name,
      email: item.email,
      password: '',
      referralCode: item.referralCode,
      commissionRate: String(item.commissionRate),
      imageUrl: item.imageUrl ?? '',
    });
    setOpen(true);
  };

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="space-y-6 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-accent">
            <BarChart3 className="h-4 w-4" />
            {t('تحليل الأداء منذ البداية', 'All-time performance analysis')}
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">{t('قيمة المشاهير للأعمال', 'Influencer business value')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('اعرف من يبيع فعلاً، وما تدفعه له، وما يبقى لك بعد العمولة.', 'See who actually sells, what you pay, and what remains after commission.')}
          </p>
        </div>
        <Button
          data-testid="button-new-influencer"
          onClick={() => {
            setSelected(null);
            setForm(blank);
            setOpen((value) => !value);
          }}
        >
          {open ? <X className="me-2 h-4 w-4" /> : <Plus className="me-2 h-4 w-4" />}
          {open ? t('إغلاق النموذج', 'Close form') : t('مشهور جديد', 'New influencer')}
        </Button>
      </div>

      {open && (
        <form onSubmit={save} className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <h2 className="font-bold">{selected ? t('تعديل حساب المشهور', 'Edit influencer account') : t('إضافة مشهور جديد', 'Add a new influencer')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('بيانات الحساب ورمز التتبع ونسبة العمولة.', 'Account, tracking code and commission settings.')}</p>
          </div>
          {([
            ['name', t('الاسم', 'Name')],
            ['email', t('البريد الإلكتروني', 'Email')],
            ['password', selected ? t('كلمة مرور جديدة (اختياري)', 'New password (optional)') : t('كلمة المرور', 'Password')],
            ['referralCode', t('رمز الإحالة', 'Referral code')],
            ['commissionRate', t('نسبة العمولة %', 'Commission %')],
            ['imageUrl', t('رابط الصورة', 'Photo URL')],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-sm font-medium">
              {label}
              <Input
                className="mt-2"
                required={!selected && ['name', 'email', 'password', 'referralCode'].includes(key)}
                type={key === 'password' ? 'password' : key === 'commissionRate' ? 'number' : key === 'email' ? 'email' : 'text'}
                dir={key === 'name' ? undefined : 'ltr'}
                value={form[key]}
                data-testid={`input-influencer-${key}`}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
              />
            </label>
          ))}
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <Button data-testid="button-save-influencer" disabled={create.isPending || update.isPending}>{t('حفظ', 'Save')}</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('إلغاء', 'Cancel')}</Button>
            {message && <span className="text-sm text-destructive" role="alert">{message}</span>}
          </div>
        </form>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={CircleDollarSign} label={t('المبيعات المنسوبة', 'Attributed sales')} value={formatSar(totals.sales, lang)} hint={t('طلبات مدفوعة فقط', 'Paid orders only')} tone="emerald" testId="metric-influencer-sales" />
        <MetricCard icon={WalletCards} label={t('إجمالي العمولات', 'Total commissions')} value={formatSar(totals.commission, lang)} hint={totals.sales ? `${((totals.commission / totals.sales) * 100).toFixed(1)}% ${t('من المبيعات', 'of sales')}` : '—'} tone="amber" testId="metric-influencer-commission" />
        <MetricCard icon={TrendingUp} label={t('الصافي بعد العمولة', 'Net after commission')} value={formatSar(totalNet, lang)} hint={t('قبل تكلفة المنتج والمصاريف', 'Before product cost and expenses')} tone="blue" testId="metric-influencer-net" />
        <MetricCard icon={PackageCheck} label={t('الطلبات المدفوعة', 'Paid orders')} value={totals.orders.toLocaleString()} hint={`${t('متوسط الطلب', 'Average order')} ${formatSar(averageOrder, lang)}`} tone="violet" testId="metric-influencer-orders" />
        <MetricCard icon={Users} label={t('زيارات الإحالة', 'Referral visits')} value={totals.visits.toLocaleString()} hint={totals.visits ? `${((totals.orders / totals.visits) * 100).toFixed(1)}% ${t('تحويل إلى طلب مدفوع', 'converted to paid orders')}` : t('لم تسجل زيارات بعد', 'No visits recorded yet')} tone="slate" testId="metric-influencer-visits" />
      </section>

      {!!influencers.length && (
        <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">{t('مقارنة صافي المساهمة', 'Net contribution comparison')}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t('المبيعات المدفوعة ناقص عمولة المشهور', 'Paid sales minus influencer commission')}</p>
              </div>
              <Badge variant="outline">{t('منذ البداية', 'All time')}</Badge>
            </div>
            <div className="space-y-4">
              {[...enriched].sort((a, b) => b.net - a.net).slice(0, 6).map((item, index) => (
                <div key={item.id} data-testid={`bar-influencer-${item.id}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-5 text-xs text-muted-foreground">#{index + 1}</span>
                      <span className="truncate font-medium">{item.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold">{formatSar(item.net, lang)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-l from-amber-400 to-emerald-500 transition-all" style={{ width: `${Math.max((item.net / maxNet) * 100, item.net > 0 ? 3 : 0)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="font-bold">{t('قراءة سريعة', 'Quick read')}</h2>
            <div className="mt-4 space-y-3">
              <InsightRow icon={Crown} label={t('أعلى صافي مساهمة', 'Highest net contribution')} value={bestNet?.name ?? '—'} detail={bestNet ? formatSar(bestNet.net, lang) : '—'} />
              <InsightRow icon={Medal} label={t('أعلى متوسط طلب', 'Highest average order')} value={bestAverage?.name ?? '—'} detail={bestAverage ? formatSar(bestAverage.average, lang) : '—'} />
              <InsightRow icon={Percent} label={t('معدل العمولة الكلي', 'Blended commission rate')} value={totals.sales ? `${((totals.commission / totals.sales) * 100).toFixed(1)}%` : '—'} detail={t('من المبيعات المنسوبة', 'of attributed sales')} />
              <InsightRow icon={UserRound} label={t('بحاجة للمراجعة', 'Needs review')} value={`${zeroSalesCount}`} detail={t('مشاهير بدون مبيعات', 'influencers without sales')} />
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-bold">{t('تفصيل أداء كل مشهور', 'Influencer performance detail')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('رتّب وقارن واتخذ قرارك من الأرقام الفعلية.', 'Sort, compare and decide from actual results.')}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-[220px]">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="ps-9" placeholder={t('ابحث بالاسم أو الكود…', 'Search name or code…')} data-testid="input-search-influencers" />
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-10 rounded-md border bg-background px-3 text-sm" data-testid="select-influencer-status">
              <option value="all">{t('كل الحالات', 'All statuses')}</option>
              <option value="active">{t('النشطون', 'Active')}</option>
              <option value="inactive">{t('غير النشطين', 'Inactive')}</option>
            </select>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="h-10 rounded-md border bg-background px-3 text-sm" data-testid="select-influencer-sort">
              <option value="net">{t('الأعلى صافيًا', 'Highest net')}</option>
              <option value="sales">{t('الأعلى مبيعات', 'Highest sales')}</option>
              <option value="orders">{t('الأكثر طلبات', 'Most orders')}</option>
              <option value="average">{t('أعلى متوسط طلب', 'Highest average')}</option>
            </select>
          </div>
        </div>

        {list.isLoading && <div className="p-12 text-center text-muted-foreground">{t('جاري تحميل وتحليل الأداء…', 'Loading and analyzing performance…')}</div>}
        {list.error && <div className="m-4 rounded-xl border border-destructive/30 p-10 text-center text-destructive">{t('تعذر تحميل بيانات المشاهير', 'Could not load influencer data')}</div>}
        {!list.isLoading && !list.error && !influencers.length && (
          <div className="p-14 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 text-accent"><UserRound className="h-7 w-7" /></div>
            <h3 className="mt-4 font-bold">{t('أضف أول مشهور لتبدأ قياس العائد', 'Add your first influencer to start measuring value')}</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t('بعد ربط كود الإحالة أو الكوبون، ستظهر هنا المبيعات والطلبات والعمولة والصافي لكل مشهور.', 'After linking a referral code or coupon, sales, orders, commission and net contribution will appear here.')}</p>
            <Button className="mt-5" onClick={() => setOpen(true)}><Plus className="me-2 h-4 w-4" />{t('إضافة مشهور', 'Add influencer')}</Button>
          </div>
        )}
        {!list.isLoading && !list.error && !!influencers.length && !filtered.length && (
          <div className="p-12 text-center text-muted-foreground">{t('لا توجد نتائج مطابقة للبحث', 'No influencers match these filters')}</div>
        )}
        {!!filtered.length && (
          <div className="divide-y">
            {filtered.map((item, index) => {
              const itemCouponIds = [...new Set([...(item.couponIds ?? []), ...(linked[item.id] ?? [])])];
              return (
                <article key={item.id} className="p-4 transition-colors hover:bg-muted/20" data-testid={`card-influencer-${item.id}`}>
                  <div className="grid gap-5 xl:grid-cols-[1.1fr_2fr_auto] xl:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="h-12 w-12 rounded-full border object-cover" />
                        ) : (
                          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted"><UserRound className="h-5 w-5" /></div>
                        )}
                        <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1 text-[10px] font-bold text-background">#{index + 1}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-bold">{item.name}</h3>
                          <Badge variant={item.isActive === false ? 'secondary' : 'default'} className="text-[10px]">
                            {item.isActive === false ? t('متوقف', 'Inactive') : t('نشط', 'Active')}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground" dir="ltr">{item.email}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <code className="rounded bg-muted px-2 py-1">{item.referralCode}</code>
                          <span className="text-muted-foreground">{item.commissionRate}% {t('عمولة', 'commission')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      <PerformanceCell label={t('المبيعات', 'Sales')} value={formatSar(item.sales, lang)} />
                      <PerformanceCell label={t('الطلبات', 'Orders')} value={item.orders.toLocaleString()} />
                      <PerformanceCell label={t('العمولة', 'Commission')} value={formatSar(item.commission, lang)} negative />
                      <PerformanceCell label={t('الصافي لك', 'Net to you')} value={formatSar(item.net, lang)} emphasized />
                      <PerformanceCell label={t('الزيارات', 'Visits')} value={item.visits.toLocaleString()} />
                      <PerformanceCell label={t('نسبة التحويل', 'Conversion')} value={`${(item.conversion * 100).toFixed(1)}%`} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:max-w-[190px] xl:justify-end">
                      <Button size="sm" variant="outline" onClick={() => update.mutate({ id: item.id, data: { isActive: item.isActive === false } }, { onSuccess: refresh })}>
                        <Power className="me-1 h-3.5 w-3.5" />{item.isActive === false ? t('تفعيل', 'Activate') : t('تعطيل', 'Deactivate')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => edit(item)}>{t('تعديل', 'Edit')}</Button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed pt-3">
                    <span className="text-xs font-medium text-muted-foreground">{t('الكوبونات:', 'Coupons:')}</span>
                    {itemCouponIds.map((couponId) => {
                      const coupon = (coupons.data ?? []).find((candidate: { id: number }) => candidate.id === couponId);
                      if (!coupon) return null;
                      return (
                        <button
                          key={coupon.id}
                          className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs hover:border-destructive/40 hover:text-destructive"
                          onClick={() => unlink.mutate({ id: item.id, couponId: coupon.id }, {
                            onSuccess: () => {
                              setLinked((value) => ({ ...value, [item.id]: (value[item.id] ?? []).filter((id) => id !== coupon.id) }));
                              void refresh();
                            },
                          })}
                        >
                          {coupon.code}<Unlink className="ms-1 inline h-3 w-3" />
                        </button>
                      );
                    })}
                    <select
                      className="h-7 max-w-[170px] rounded-full border bg-background px-2 text-xs"
                      value=""
                      onChange={(event) => {
                        const couponId = Number(event.target.value);
                        if (couponId) {
                          link.mutate({ id: item.id, data: { couponId } }, {
                            onSuccess: () => {
                              setLinked((value) => ({ ...value, [item.id]: [...(value[item.id] ?? []), couponId] }));
                              void refresh();
                            },
                          });
                        }
                      }}
                    >
                      <option value="">{t('ربط كوبون…', 'Link coupon…')}</option>
                      {(coupons.data ?? []).filter((coupon: { id: number; isActive?: boolean }) => coupon.isActive && !itemCouponIds.includes(coupon.id)).map((coupon: { id: number; code: string }) => (
                        <option value={coupon.id} key={coupon.id}>{coupon.code}</option>
                      ))}
                    </select>
                    <span className="rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                      {t('كوبون', 'Coupon')}: {item.couponOrders} · {t('رابط', 'Link')}: {item.referralOrders}
                    </span>
                    <span className="rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                      {t('متوسط الطلب', 'Avg. order')}: {formatSar(item.average, lang)}
                    </span>
                    <span className="rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                      {t('حصة المبيعات', 'Sales share')}: {item.share.toFixed(1)}%
                    </span>
                    <span className="rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                      {t('آخر بيع', 'Last sale')}: {formatDate(item.lastOrderAt, lang)}
                    </span>
                    <span className="ms-auto text-xs text-muted-foreground">
                      {item.efficiency > 0
                        ? `${formatSar(item.efficiency, lang)} ${t('مبيعات لكل ريال عمولة', 'sales per SAR commission')}`
                        : t('لا توجد عمولة مدفوعة بعد', 'No paid commission yet')}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-xs leading-6 text-muted-foreground">
        {t('ملاحظة: «الصافي بعد العمولة» يخصم عمولة المشهور من المبيعات المنسوبة فقط، ولا يمثل صافي الربح المحاسبي لأنه لا يشمل تكلفة المنتج والشحن والمصاريف الأخرى.', 'Note: “Net after commission” only subtracts influencer commission from attributed sales. It is not accounting net profit because product, shipping and other costs are not included.')}
      </p>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  testId,
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  hint: string;
  tone: 'emerald' | 'amber' | 'blue' | 'violet' | 'slate';
  testId: string;
}) {
  const tones = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  };
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm" data-testid={testId}>
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-accent to-transparent" />
      <div className={`mb-4 grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 min-h-4 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function InsightRow({ icon: Icon, label, value, detail }: { icon: typeof Crown; label: string; value: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background/60 p-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-bold">{value}</p>
        <p className="truncate text-[10px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function PerformanceCell({ label, value, negative, emphasized }: { label: string; value: string; negative?: boolean; emphasized?: boolean }) {
  return (
    <div className={`rounded-xl border p-2.5 ${emphasized ? 'border-emerald-500/25 bg-emerald-500/5' : 'bg-background/60'}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-sm font-bold ${negative ? 'text-amber-600 dark:text-amber-400' : emphasized ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{value}</p>
    </div>
  );
}