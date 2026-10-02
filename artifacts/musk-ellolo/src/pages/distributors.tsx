import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetDistributorPortalCatalogQueryKey,
  getGetDistributorPortalOrderQueryKey,
  getGetDistributorPortalSessionQueryKey,
  getListDistributorPortalOrdersQueryKey,
  useGetDistributorPortalCatalog,
  useGetDistributorPortalOrder,
  useGetDistributorPortalSession,
  useListDistributorPortalOrders,
  useLoginDistributorPortal,
  useRevokeDistributorPortalSession,
  useSubmitDistributorPortalOrder,
  type CompanyOrder,
  type DistributorPortalTerms,
} from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { distributorOrderTotals } from '@/lib/distributor-order-totals';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LogOut, Minus, Plus, RefreshCw, Search } from 'lucide-react';

const TOKEN_KEY = 'musk-ellolo-distributor-portal-token';
const STALE = 30_000;
const money = (n: number | null | undefined, lang: string) =>
  n == null ? '-' : `${new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${lang === 'ar' ? 'ر.س' : 'SAR'}`;
const newKey = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-portal`);
const errMsg = (e: unknown, fallback: string) => {
  const c = e as { data?: { error?: string }; message?: string };
  return c?.data?.error ?? c?.message ?? fallback;
};
const status = (s: string, t: (a: string, e: string) => string) =>
  s === 'approved' ? t('معتمد', 'Approved') : s === 'rejected' ? t('مرفوض', 'Rejected') : t('قيد المراجعة', 'Pending review');
const statusClass = (s: string) =>
  s === 'approved' ? 'bg-emerald-100 text-emerald-800' : s === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';

function TermsList({ terms, lang, t }: { terms: DistributorPortalTerms; lang: string; t: (a: string, e: string) => string }) {
  const rows: [string, string][] = [
    [t('نسبة الخصم', 'Discount'), `${terms.discountPercent}%`],
    [t('ضريبة القيمة المضافة', 'VAT'), `${terms.vatRate}%`],
    [t('شروط السداد', 'Payment terms'), terms.paymentTerm ? `${terms.paymentTerm}${terms.paymentDays != null ? ` (${terms.paymentDays} ${t('يوم', 'days')})` : ''}` : '-'],
    [t('الحد الأدنى للطلب', 'Minimum order'), terms.minOrderValue != null ? money(terms.minOrderValue, lang) : '-'],
    [t('رقم العقد', 'Contract'), terms.contractNumber ?? (terms.contractId ? `#${terms.contractId}` : '-')],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
      ))}
    </dl>
  );
}

const NOTICE_AR = 'هذا الطلب لا يُنشئ فاتورة أو دفعة أو حجزاً للمخزون فور إرساله. تتم مراجعته واعتماده من فريق الإدارة أولاً.';
const NOTICE_EN = 'Submitting an order does not issue an invoice, take payment or reserve stock. Our team reviews and approves it first.';

function OrderDetails({ id, token, onClose }: { id: number; token: string; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const req = { headers: { authorization: `Bearer ${token}` } };
  const q = useGetDistributorPortalOrder(id, { query: { queryKey: getGetDistributorPortalOrderQueryKey(id), staleTime: STALE }, request: req });
  const o = q.data;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="dialog-order-details">
        <DialogHeader><DialogTitle>{o ? `${t('طلب', 'Order')} ${o.orderNumber}` : t('تفاصيل الطلب', 'Order details')}</DialogTitle></DialogHeader>
        {q.isLoading && <Skeleton className="h-40 w-full" />}
        {q.isError && <div className="text-sm"><p className="text-destructive">{errMsg(q.error, t('تعذر تحميل الطلب', 'Could not load order'))}</p><Button size="sm" variant="outline" className="mt-2" onClick={() => q.refetch()}>{t('إعادة المحاولة', 'Retry')}</Button></div>}
        {o && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <Badge className={statusClass(o.status)}>{status(o.status, t)}</Badge>
              <span className="text-muted-foreground" dir="ltr">{new Date(o.createdAt).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB')}</span>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-muted/50"><tr><th className="p-2 text-start">{t('المنتج', 'Product')}</th><th className="p-2">{t('الكمية', 'Qty')}</th><th className="p-2">{t('السعر', 'Unit')}</th><th className="p-2">{t('الإجمالي', 'Total')}</th></tr></thead>
                <tbody>{o.items.map((i) => (
                  <tr key={i.productId} className="border-t"><td className="p-2">{lang === 'ar' ? i.productName : i.productNameEn}</td><td className="p-2 text-center">{i.quantity}</td><td className="p-2 text-center">{money(i.unitPrice, lang)}</td><td className="p-2 text-center">{money(i.totalAmount, lang)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <div className="ms-auto max-w-xs space-y-1">
              <div className="flex justify-between"><span>{t('المجموع', 'Subtotal')}</span><span>{money(o.subtotal, lang)}</span></div>
              <div className="flex justify-between"><span>{t('الخصم', 'Discount')}</span><span>-{money(o.discountAmount, lang)}</span></div>
              <div className="flex justify-between"><span>{t('الضريبة', 'VAT')}</span><span>{money(o.vatAmount, lang)}</span></div>
              <div className="flex justify-between border-t pt-1 font-bold"><span>{t('الإجمالي', 'Total')}</span><span>{money(o.totalAmount, lang)}</span></div>
            </div>
            <div><p className="mb-2 text-xs font-semibold text-muted-foreground">{t('الشروط المعروضة وقت الإرسال', 'Terms shown at submission')}</p><TermsList terms={o.snapshotTerms} lang={lang} t={t} /></div>
            {(o.reviewedByName || o.reviewedByAdminId != null) && <p>{t('المراجع', 'Reviewed by')}: {o.reviewedByName ?? `user#${o.reviewedByAdminId}`}</p>}
            {o.decisionAt && <p>{t('وقت القرار', 'Decided at')}: <span dir="ltr">{new Date(o.decisionAt).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB')}</span></p>}
            {o.decisionReason && <p className="rounded-md bg-muted p-3">{t('سبب القرار', 'Decision reason')}: {o.decisionReason}</p>}
            <p className="text-xs text-muted-foreground">{t(NOTICE_AR, NOTICE_EN)}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const { t, lang, setLang } = useLanguage();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLoginDistributorPortal();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ data: { email: email.trim(), password } }, {
      onSuccess: (r) => onLogin(r.token),
      onError: (err) => toast({ title: t('تعذر تسجيل الدخول', 'Sign-in failed'), description: errMsg(err, t('تحقق من البيانات', 'Check your details')), variant: 'destructive' }),
    });
  };
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(42_20%_97%)] p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-lg border bg-white p-6 shadow-sm" data-testid="form-portal-login">
        <div className="text-center">
          <p className="text-xs tracking-[0.3em] text-muted-foreground">MUSK ELLOLO</p>
          <h1 className="mt-2 text-xl font-bold">{t('بوابة الموزعين', 'Distributor portal')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('سجّل الدخول بحساب شركتك لإنشاء الطلبات ومتابعتها', 'Sign in with your company account to place and track orders')}</p>
        </div>
        <div className="space-y-2"><Label htmlFor="pe">{t('البريد الإلكتروني', 'Email')}</Label><Input id="pe" type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-portal-email" /></div>
        <div className="space-y-2"><Label htmlFor="pp">{t('كلمة المرور', 'Password')}</Label><Input id="pp" type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-portal-password" /></div>
        <Button type="submit" className="w-full" disabled={login.isPending} data-testid="button-portal-login">{login.isPending ? t('جاري الدخول...', 'Signing in...') : t('دخول', 'Sign in')}</Button>
        <p className="text-center text-xs text-muted-foreground">{t('الحسابات يفعّلها فريق الإدارة فقط.', 'Accounts are activated by our team only.')}</p>
        <Button type="button" variant="ghost" className="w-full" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} data-testid="button-portal-login-language">
          {lang === 'ar' ? 'English' : 'العربية'}
        </Button>
      </form>
    </div>
  );
}

function Portal({ token, onLogout }: { token: string; onLogout: () => void }) {
  const { t, lang, setLang } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const req = useMemo(() => ({ headers: { authorization: `Bearer ${token}` } }), [token]);
  const [tab, setTab] = useState<'new' | 'orders'>('new');
  const [cart, setCart] = useState<Record<number, number>>({});
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<number | null>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);

  const session = useGetDistributorPortalSession({ query: { queryKey: getGetDistributorPortalSessionQueryKey(), staleTime: STALE, retry: false }, request: req });
  const catalog = useGetDistributorPortalCatalog({ query: { queryKey: getGetDistributorPortalCatalogQueryKey(), staleTime: STALE, enabled: session.isSuccess }, request: req });
  const orders = useListDistributorPortalOrders({ query: { queryKey: getListDistributorPortalOrdersQueryKey(), staleTime: STALE, enabled: session.isSuccess }, request: req });
  const submit = useSubmitDistributorPortalOrder({ request: req });
  const logout = useRevokeDistributorPortalSession({ request: req });

  const sessionErr = session.error as { status?: number } | null;
  if (session.isError && (sessionErr?.status === 401 || sessionErr?.status === 403)) {
    queueMicrotask(onLogout);
  }

  const lines = useMemo(() => (catalog.data?.catalog ?? []).filter((p) => cart[p.id] > 0).map((p) => ({ p, q: cart[p.id] })), [catalog.data, cart]);
  const sig = lines.map((l) => `${l.p.id}:${l.q}`).join(',');
  const estimate = distributorOrderTotals(lines.map((line) => ({ unitPrice: line.p.unitPrice, quantity: line.q })),
    catalog.data?.discountPercent ?? 0, catalog.data?.vatRate ?? 0);
  const minOrder = catalog.data?.terms.minOrderValue ?? null;
  const belowMin = minOrder != null && estimate.totalAmount < minOrder;

  const setQty = (id: number, q: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(10000, q || 0)) }));

  const send = () => {
    if (!lines.length) return;
    // Same cart => same key, so retries after failures stay idempotent.
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: newKey() };
    submit.mutate({ data: { idempotencyKey: keyRef.current.key, items: lines.map((l) => ({ productId: l.p.id, quantity: l.q })) } }, {
      onSuccess: (o: CompanyOrder) => {
        keyRef.current = null;
        setCart({});
        qc.invalidateQueries({ queryKey: getListDistributorPortalOrdersQueryKey() });
        toast({ title: t('تم إرسال الطلب للمراجعة', 'Order submitted for review'), description: o.orderNumber });
        setTab('orders');
      },
      onError: (err) => toast({ title: t('تعذر إرسال الطلب', 'Could not submit order'), description: errMsg(err, t('يمكنك المحاولة مرة أخرى بأمان', 'You can safely retry')), variant: 'destructive' }),
    });
  };

  const doLogout = () => logout.mutate(undefined, { onSettled: onLogout });
  const company = session.data?.company ?? catalog.data?.company;
  const list = (catalog.data?.catalog ?? []).filter((p) => `${p.nameAr} ${p.nameEn} ${p.sku ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="min-h-[100dvh] bg-[hsl(42_20%_97%)]">
      <header className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0"><p className="text-[10px] tracking-[0.3em] text-muted-foreground">MUSK ELLOLO</p><p className="truncate text-sm font-bold" data-testid="text-portal-company">{company?.companyName ?? t('بوابة الموزعين', 'Distributor portal')}</p></div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} data-testid="button-portal-lang">{lang === 'ar' ? 'EN' : 'عربي'}</Button>
            <Button variant="outline" size="sm" onClick={doLogout} disabled={logout.isPending} data-testid="button-portal-logout"><LogOut className="me-1 h-4 w-4 rtl:rotate-180" />{t('خروج', 'Log out')}</Button>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 px-4">
          {(['new', 'orders'] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`tab-portal-${k}`} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? 'border-[hsl(231_80%_9%)] text-foreground' : 'border-transparent text-muted-foreground'}`}>
              {k === 'new' ? t('طلب جديد', 'New order') : t('طلباتي', 'My orders')}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4">
        {session.isLoading || catalog.isLoading ? <Skeleton className="h-64 w-full" /> : catalog.isError ? (
          <div className="rounded-lg border bg-white p-6 text-center"><p className="text-destructive">{errMsg(catalog.error, t('تعذر تحميل الكتالوج', 'Could not load the catalog'))}</p><Button className="mt-3" variant="outline" onClick={() => catalog.refetch()}><RefreshCw className="me-1 h-4 w-4" />{t('إعادة المحاولة', 'Retry')}</Button></div>
        ) : catalog.data && tab === 'new' ? (
          <>
            <section className="rounded-lg border bg-white p-4"><p className="mb-3 text-sm font-semibold">{t('شروط شركتك الحالية', 'Your current terms')}</p><TermsList terms={catalog.data.terms} lang={lang} t={t} /></section>
            <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
              <section className="space-y-3">
                <div className="relative"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="ps-9" placeholder={t('ابحث بالاسم أو الرمز', 'Search by name or SKU')} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-portal-search" /></div>
                {list.length === 0 ? <p className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">{t('لا توجد منتجات مطابقة', 'No matching products')}</p> : (
                  <ul className="space-y-2">{list.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-lg border bg-white p-3" data-testid={`row-portal-product-${p.id}`}>
                      {p.image ? <img src={p.image} alt="" className="h-14 w-14 rounded object-cover" /> : <div className="h-14 w-14 rounded bg-muted" />}
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{lang === 'ar' ? p.nameAr : p.nameEn}</p><p className="text-xs text-muted-foreground" dir="ltr">{p.sku ?? ''}</p><p className="text-sm">{money(p.unitPrice, lang)}</p></div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-8 w-8" aria-label={t('إنقاص', 'Decrease')} onClick={() => setQty(p.id, (cart[p.id] ?? 0) - 1)}><Minus className="h-3 w-3" /></Button>
                        <Input type="number" min={0} max={10000} className="h-8 w-16 text-center" value={cart[p.id] ?? 0} onChange={(e) => setQty(p.id, Number(e.target.value))} data-testid={`input-qty-${p.id}`} />
                        <Button size="icon" variant="outline" className="h-8 w-8" aria-label={t('زيادة', 'Increase')} onClick={() => setQty(p.id, (cart[p.id] ?? 0) + 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                    </li>
                  ))}</ul>
                )}
              </section>
              <aside className="h-fit space-y-3 rounded-lg border bg-white p-4 lg:sticky lg:top-28" data-testid="panel-portal-summary">
                <p className="text-sm font-semibold">{t('ملخص الطلب', 'Order summary')}</p>
                {lines.length === 0 ? <p className="text-sm text-muted-foreground">{t('لم تضف منتجات بعد', 'No products added yet')}</p> : (
                  <>
                    <ul className="space-y-1 text-sm">{lines.map((l) => <li key={l.p.id} className="flex justify-between gap-2"><span className="truncate">{lang === 'ar' ? l.p.nameAr : l.p.nameEn} x {l.q}</span><span>{money(l.p.unitPrice * l.q, lang)}</span></li>)}</ul>
                    <div className="space-y-1 border-t pt-2 text-sm">
                      <div className="flex justify-between"><span>{t('المجموع شامل الضريبة', 'Subtotal incl. VAT')}</span><span>{money(estimate.listSubtotal, lang)}</span></div>
                      <div className="flex justify-between"><span>{t('الخصم', 'Discount')} ({catalog.data.discountPercent}%)</span><span>-{money(estimate.discountAmount, lang)}</span></div>
                      <div className="flex justify-between"><span>{t('الضريبة المشمولة', 'Included VAT')} ({catalog.data.vatRate}%)</span><span>{money(estimate.vatAmount, lang)}</span></div>
                      <div className="flex justify-between font-bold"><span>{t('الإجمالي التقديري', 'Estimated total')}</span><span>{money(estimate.totalAmount, lang)}</span></div>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('الأسعار النهائية يحسبها الخادم عند الإرسال.', 'Final prices are calculated by the server on submission.')}</p>
                    {belowMin && <p className="text-xs text-destructive">{t('أقل من الحد الأدنى للطلب', 'Below the minimum order value')}: {money(minOrder, lang)}</p>}
                  </>
                )}
                <p className="rounded bg-muted p-2 text-xs">{t(NOTICE_AR, NOTICE_EN)}</p>
                <Button className="w-full" disabled={!lines.length || submit.isPending} onClick={send} data-testid="button-portal-submit">{submit.isPending ? t('جاري الإرسال...', 'Submitting...') : t('إرسال الطلب للمراجعة', 'Submit for review')}</Button>
              </aside>
            </div>
          </>
        ) : tab === 'orders' ? (
          orders.isLoading ? <Skeleton className="h-40 w-full" /> : orders.isError ? (
            <div className="rounded-lg border bg-white p-6 text-center"><p className="text-destructive">{errMsg(orders.error, t('تعذر تحميل الطلبات', 'Could not load orders'))}</p><Button className="mt-3" variant="outline" onClick={() => orders.refetch()}>{t('إعادة المحاولة', 'Retry')}</Button></div>
          ) : !orders.data?.length ? (
            <div className="rounded-lg border bg-white p-10 text-center"><p className="font-semibold">{t('لا توجد طلبات بعد', 'No orders yet')}</p><Button className="mt-3" onClick={() => setTab('new')}>{t('أنشئ أول طلب', 'Create your first order')}</Button></div>
          ) : (
            <ul className="space-y-2">{orders.data.map((o) => (
              <li key={o.id}><button className="flex w-full items-center justify-between gap-3 rounded-lg border bg-white p-4 text-start hover:bg-muted/40" onClick={() => setDetailId(o.id)} data-testid={`row-portal-order-${o.id}`}>
                <div><p className="font-semibold" dir="ltr">{o.orderNumber}</p><p className="text-xs text-muted-foreground" dir="ltr">{new Date(o.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB')}</p></div>
                <div className="text-end"><p className="text-sm font-medium">{money(o.totalAmount, lang)}</p><Badge className={statusClass(o.status)}>{status(o.status, t)}</Badge></div>
              </button></li>
            ))}</ul>
          )
        ) : null}
      </main>
      {detailId != null && <OrderDetails id={detailId} token={token} onClose={() => setDetailId(null)} />}
    </div>
  );
}

export default function DistributorsPortal() {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const clearScoped = () => qc.removeQueries({ predicate: (q) => String(q.queryKey[0] ?? '').startsWith('/api/distributor-portal') });
  const onLogin = (tk: string) => { clearScoped(); sessionStorage.setItem(TOKEN_KEY, tk); setToken(tk); };
  const onLogout = () => { sessionStorage.removeItem(TOKEN_KEY); clearScoped(); setToken(null); };
  return token ? <Portal key={token} token={token} onLogout={onLogout} /> : <Login onLogin={onLogin} />;
}
