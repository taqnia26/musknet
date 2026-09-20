import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetOwnerMeQueryKey,
  getListOwnerSessionNotificationsQueryKey,
  getListOwnerSessionsQueryKey,
  getGetOwnerOperationsSummaryQueryKey,
  type OwnerSession,
  type OwnerOperationsSummary,
  useGetOwnerMe,
  useListOwnerSessionNotifications,
  useListOwnerSessions,
  useOwnerLogout,
  useReadOwnerSessionNotification,
  useRevokeOtherOwnerSessions,
  useRevokeOwnerSession,
  useGetOwnerOperationsSummary,
} from '@workspace/api-client-react';
import {
  BellRing,
  Boxes,
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Crown,
  FileText,
  Grid2X2,
  HandCoins,
  CircleHelp,
  Laptop,
  LogOut,
  Menu,
  Moon,
  Package,
  ReceiptText,
  Settings,
  ShieldCheck,
  Smartphone,
  Store,
  Sun,
  Tablet,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react';
import { getOwnerToken, removeOwnerToken } from '@/lib/auth-token';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from 'next-themes';
import { OwnerObligations } from '@/components/owner/owner-obligations';
import { OwnerWorkbookSection } from '@/components/owner/owner-workbook-section';
import { GuidedTour } from '@/components/guided-tour/guided-tour';
import { ownerTourSteps } from '@/components/guided-tour/tour-definitions';
import { OWNER_TOUR_STORAGE_KEY } from '@/components/guided-tour/tour-state';

type OwnerNavItem = {
  href: string;
  labelAr: string;
  labelEn: string;
  icon: ComponentType<{ className?: string }>;
};

const managementItems: OwnerNavItem[] = [
  { href: '/owner', labelAr: 'الرئيسية', labelEn: 'Overview', icon: Grid2X2 },
  { href: '/owner/products', labelAr: 'المنتجات', labelEn: 'Products', icon: Package },
  { href: '/owner/obligations', labelAr: 'الالتزامات', labelEn: 'Obligations', icon: WalletCards },
  { href: '/owner/payment-plan', labelAr: 'خطة السداد', labelEn: 'Payment plan', icon: CalendarClock },
  { href: '/owner/manufacturing', labelAr: 'التصنيع', labelEn: 'Manufacturing', icon: Boxes },
  { href: '/owner/exhibitions', labelAr: 'المعارض', labelEn: 'Exhibitions', icon: Store },
  { href: '/owner/invoices', labelAr: 'الفواتير', labelEn: 'Invoices', icon: FileText },
  { href: '/owner/debt-payments', labelAr: 'سداد الديون', labelEn: 'Debt payments', icon: HandCoins },
];

function formatOwnerDate(value: string | Date, lang: string) {
  return new Intl.DateTimeFormat(
    lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'short' },
  ).format(new Date(value));
}

function SessionDeviceIcon({ deviceLabel }: { deviceLabel: string }) {
  if (deviceLabel === 'Mobile device') return <Smartphone className="h-5 w-5" />;
  if (deviceLabel === 'Tablet') return <Tablet className="h-5 w-5" />;
  return <Laptop className="h-5 w-5" />;
}

export default function OwnerPortal() {
  const [location, setLocation] = useLocation();
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const hasToken = Boolean(getOwnerToken());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(true);
  const [tourRestart, setTourRestart] = useState(0);
  const managementBeforeTour = useRef(true);
  const deliveredNotificationIds = useRef(new Set<number>());

  const { data: owner, isLoading, error } = useGetOwnerMe({
    query: { enabled: hasToken, retry: false, queryKey: getGetOwnerMeQueryKey() },
  });
  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useListOwnerSessions({
    query: {
      enabled: hasToken,
      retry: false,
      queryKey: getListOwnerSessionsQueryKey(),
      refetchOnMount: 'always',
      refetchInterval: 60_000,
    },
  });
  const {
    data: sessionNotifications = [],
    error: notificationsError,
  } = useListOwnerSessionNotifications({
    query: {
      enabled: hasToken,
      retry: false,
      queryKey: getListOwnerSessionNotificationsQueryKey(),
      refetchOnMount: 'always',
      refetchInterval: 5_000,
    },
  });
  const { data: operationsSummary, isLoading: operationsLoading } = useGetOwnerOperationsSummary({
    query: { enabled: hasToken, retry: false, refetchInterval: 30_000, queryKey: getGetOwnerOperationsSummaryQueryKey() },
  });
  const logoutMutation = useOwnerLogout();
  const revokeMutation = useRevokeOwnerSession();
  const revokeOthersMutation = useRevokeOtherOwnerSessions();
  const readNotificationMutation = useReadOwnerSessionNotification();
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    const unauthorized = [error, sessionsError, notificationsError].some(
      (requestError) => (requestError as { status?: number } | null)?.status === 401,
    );
    if (!hasToken || unauthorized) {
      removeOwnerToken();
      setLocation('/owner/login');
    }
  }, [error, hasToken, notificationsError, sessionsError, setLocation]);

  useEffect(() => {
    const pending = sessionNotifications.filter(
      (notification) => !deliveredNotificationIds.current.has(notification.id),
    );
    if (pending.length === 0) return;

    pending.forEach((notification) => deliveredNotificationIds.current.add(notification.id));
    const latest = pending[0];
    toast({
      title: t('تنبيه دخول من جهاز جديد', 'New device sign-in alert'),
      description: `${latest.browser} · ${latest.operatingSystem}`,
      variant: 'destructive',
    });
    pending.forEach((notification) => {
      readNotificationMutation.mutate({ id: notification.id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOwnerSessionNotificationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOwnerSessionsQueryKey() });
        },
        onError: () => deliveredNotificationIds.current.delete(notification.id),
      });
    });
  }, [sessionNotifications]);

  const logout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        removeOwnerToken();
        queryClient.clear();
        setLocation('/owner/login');
      },
    });
  };

  const revokeSession = (session: OwnerSession) => {
    if (!window.confirm(t(
      session.isCurrent ? 'سيتم تسجيل خروجك من هذه الجلسة. هل تريد المتابعة؟' : 'هل تريد إلغاء هذه الجلسة؟',
      session.isCurrent ? 'This will sign you out. Continue?' : 'Revoke this session?',
    ))) return;

    revokeMutation.mutate({ id: session.id }, {
      onSuccess: () => {
        if (session.isCurrent) {
          removeOwnerToken();
          queryClient.clear();
          setLocation('/owner/login');
          return;
        }
        queryClient.invalidateQueries({ queryKey: getListOwnerSessionsQueryKey() });
        toast({ title: t('تم إلغاء الجلسة', 'Session revoked') });
      },
    });
  };

  const revokeOtherSessions = () => {
    if (!window.confirm(t(
      'سيتم تسجيل خروج كل الأجهزة الأخرى. هل تريد المتابعة؟',
      'All other devices will be signed out. Continue?',
    ))) return;
    revokeOthersMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOwnerSessionsQueryKey() });
        toast({ title: t('تم إلغاء كل الجلسات الأخرى', 'All other sessions revoked') });
      },
    });
  };

  if (isLoading || sessionsLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f6f2] dark:bg-[#090a0c]">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#e2b92f] border-t-transparent" />
      </main>
    );
  }
  if (!owner) return null;

  const selectedItem = managementItems.find((item) => item.href === location);
  const isSecurityPage = location === '/owner/security';

  const sidebar = (
    <div className="flex h-full flex-col bg-[#fbfaf7] text-[#1c1c1c] transition-colors duration-300 dark:bg-[#111214] dark:text-[#f4f4f2]">
      <div className="flex h-[82px] items-center justify-between border-b border-[#e9e7e1] px-5 dark:border-[#24262a]">
        <div className="flex items-center gap-3">
          <img src="/site-assets/musk-ellolo-mark-black.png" alt="" className="h-10 w-10 object-contain dark:hidden" />
          <img src="/site-assets/musk-ellolo-mark-white.png" alt="" className="hidden h-10 w-10 object-contain dark:block" />
          <div>
            <p className="text-xs text-[#8a8985] dark:text-[#85878c]">{t('نظام إدارة مسك اللولو', 'Musk Ellolo System')}</p>
            <p className="font-semibold text-[#1c1c1c] dark:text-[#f4f4f2]">{t('لوحة المالك', 'Owner console')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="rounded-lg p-2 text-[#666] hover:bg-black/5 dark:text-[#aaa] dark:hover:bg-white/5 lg:hidden"
          data-testid="button-close-owner-menu"
          aria-label={t('إغلاق القائمة', 'Close menu')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <button type="button" className="mb-1 flex w-full items-center justify-between rounded-xl px-4 py-3 text-[#555] hover:bg-[#f3f1ec] dark:text-[#c1c2c5] dark:hover:bg-white/5">
          <span className="flex items-center gap-3"><CircleDollarSign className="h-5 w-5" />B2B</span>
          <ChevronDown className="h-4 w-4" />
        </button>
        <button type="button" className="mb-1 flex w-full items-center justify-between rounded-xl px-4 py-3 text-[#555] hover:bg-[#f3f1ec] dark:text-[#c1c2c5] dark:hover:bg-white/5">
          <span className="flex items-center gap-3"><ReceiptText className="h-5 w-5" />{t('التكاملات', 'Integrations')}</span>
          <ChevronDown className="h-4 w-4" />
        </button>
        <button type="button" className="mb-2 flex w-full items-center justify-between rounded-xl px-4 py-3 text-[#555] hover:bg-[#f3f1ec] dark:text-[#c1c2c5] dark:hover:bg-white/5">
          <span className="flex items-center gap-3"><Settings className="h-5 w-5" />{t('الإعدادات', 'Settings')}</span>
          <ChevronDown className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setManagementOpen((value) => !value)}
          className="flex w-full items-center justify-between rounded-xl px-4 py-3 font-medium text-[#202020] hover:bg-[#f3f1ec] dark:text-[#f1f1ef] dark:hover:bg-white/5"
          data-testid="button-toggle-owner-management"
          data-tour="owner-management"
        >
          <span className="flex items-center gap-3"><Crown className="h-5 w-5" />{t('إدارة المالك', 'Owner management')}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${managementOpen ? 'rotate-180' : ''}`} />
        </button>

        {managementOpen && (
          <div className="ms-5 mt-1 space-y-1 border-s-2 border-[#f0c62d] ps-3">
            {managementItems.map((item) => {
              const Icon = item.icon;
              const active = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid={`link-owner-${item.href.split('/').pop() || 'overview'}`}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition-colors ${
                    active
                      ? 'bg-[#f5efd9] font-medium text-[#9b7400] dark:bg-[#282619] dark:text-[#e5bb2c]'
                      : 'text-[#777] hover:bg-[#f5f3ee] hover:text-[#333] dark:text-[#a9aaad] dark:hover:bg-white/5 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  <span>{t(item.labelAr, item.labelEn)}</span>
                </Link>
              );
            })}
          </div>
        )}

        <Link
          href="/owner/security"
          onClick={() => setMobileMenuOpen(false)}
          data-testid="link-owner-security"
          data-tour="owner-security"
          className={`mt-3 flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition-colors ${
            isSecurityPage
              ? 'bg-[#f5efd9] font-medium text-[#9b7400] dark:bg-[#282619] dark:text-[#e5bb2c]'
              : 'text-[#777] hover:bg-[#f5f3ee] hover:text-[#333] dark:text-[#a9aaad] dark:hover:bg-white/5 dark:hover:text-white'
          }`}
        >
          <ShieldCheck className="h-[18px] w-[18px]" />
          {t('الأمان والجلسات', 'Security & sessions')}
          {sessionNotifications.length > 0 && <span className="ms-auto h-2 w-2 rounded-full bg-red-500" />}
        </Link>
      </nav>

      <div className="border-t border-[#e9e7e1] p-4 dark:border-[#24262a]">
        <div className="mb-3 rounded-xl bg-[#f2f0eb] px-4 py-3 dark:bg-[#1a1b1e]">
          <p className="truncate text-sm font-medium text-[#292929] dark:text-[#f1f1ef]" data-testid="text-owner-name">{owner.name}</p>
          <p className="mt-1 truncate text-xs text-[#83817c] dark:text-[#86888d]" dir="ltr" data-testid="text-owner-email">{owner.email}</p>
        </div>
        <Button
          variant="ghost"
          onClick={logout}
          disabled={logoutMutation.isPending}
          data-testid="button-owner-logout"
          className="w-full justify-start gap-3 text-[#a53c36] hover:bg-red-50 hover:text-[#a53c36]"
        >
          <LogOut className="h-4 w-4" />
          {t('تسجيل الخروج', 'Sign out')}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f7f6f2] text-[#1c1c1c] transition-colors duration-300 dark:bg-[#090a0c] dark:text-[#f4f4f2]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {mobileMenuOpen && (
        <>
          <button
            type="button"
            aria-label={t('إغلاق القائمة', 'Close menu')}
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] lg:hidden"
          />
          <aside className="fixed inset-y-0 start-0 z-50 w-[286px] border-e border-[#e3e1db] dark:border-[#24262a] lg:hidden">
            {sidebar}
          </aside>
        </>
      )}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-[286px] border-e border-[#e3e1db] dark:border-[#24262a] lg:block">
        {sidebar}
      </aside>

      <main className="min-h-screen lg:ms-[286px]">
        <header data-tour="owner-header" className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[#e4e2dc] bg-[#fbfaf7]/95 px-4 backdrop-blur transition-colors duration-300 dark:border-[#24262a] dark:bg-[#0d0e10]/95 sm:px-7">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            data-testid="button-open-owner-menu"
            className="rounded-xl border border-[#dedbd4] bg-white p-2.5 text-[#333] shadow-sm dark:border-[#2b2d31] dark:bg-[#17181b] dark:text-white lg:hidden"
            aria-label={t('فتح القائمة', 'Open menu')}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden items-center gap-3 text-sm text-[#74726d] dark:text-[#8f9196] sm:flex">
            <span>{new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB', { dateStyle: 'full' }).format(new Date())}</span>
          </div>
          <div className="pointer-events-none absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2">
            <img src="/site-assets/musk-ellolo-wordmark-black.png" alt="Musk Ellolo" className="w-[150px] object-contain dark:hidden sm:w-[210px]" />
            <img src="/site-assets/musk-ellolo-wordmark-white.png" alt="Musk Ellolo" className="hidden w-[150px] object-contain dark:block sm:w-[210px]" />
          </div>
          <div className="flex items-center gap-1" data-tour="owner-tools">
            <button
              type="button"
              onClick={() => setTourRestart((value) => value + 1)}
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#e4dfd2] bg-white text-[#696762] transition-colors hover:text-[#b48700] dark:border-[#353022] dark:bg-[#17181b] dark:text-[#d7ad23]"
              aria-label={t('إعادة تشغيل الجولة التعليمية', 'Restart guided tour')}
              title={t('جولة مساعدة', 'Help tour')}
            >
              <CircleHelp className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              data-testid="button-toggle-owner-theme"
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#e4dfd2] bg-white text-[#696762] transition-colors hover:text-[#b48700] dark:border-[#353022] dark:bg-[#17181b] dark:text-[#d7ad23]"
              aria-label={t('تغيير الوضع الليلي', 'Toggle dark mode')}
            >
              <Moon className="h-5 w-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
              <Sun className="absolute h-5 w-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e4dfd2] bg-white text-[#b48700] dark:border-[#2b2d31] dark:bg-[#17181b] dark:text-[#d7ad23]">
              <BellRing className="h-5 w-5" />
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1220px] p-4 sm:p-7 lg:p-9">
          {isSecurityPage ? (
            <SecuritySessions
              sessions={sessions}
              lang={lang}
              revokePending={revokeMutation.isPending}
              revokeOthersPending={revokeOthersMutation.isPending}
              onRevoke={revokeSession}
              onRevokeOthers={revokeOtherSessions}
              t={t}
            />
          ) : location === '/owner' ? (
            <OwnerOverview ownerName={owner.name} t={t} summary={operationsSummary} loading={operationsLoading} />
          ) : location === '/owner/obligations' ? (
            <OwnerObligations />
          ) : location === '/owner/products' ? (
            <OwnerWorkbookSection title={t('المنتجات', 'Products')} sheetNames={['المخزون الكلي', 'المخوزن الفعلي']} />
          ) : location === '/owner/payment-plan' ? (
            <OwnerWorkbookSection title={t('خطة السداد', 'Payment plan')} sheetNames={['خطة السداد']} />
          ) : location === '/owner/manufacturing' ? (
            <OwnerWorkbookSection title={t('التصنيع', 'Manufacturing')} sheetNames={['الكميات التي تم تصنيعها ']} />
          ) : (
            <PendingOwnerSection item={selectedItem} t={t} />
          )}
        </div>
      </main>
      <GuidedTour
        steps={ownerTourSteps}
        lang={lang}
        storageKey={OWNER_TOUR_STORAGE_KEY}
        restartSignal={tourRestart}
        onStepChange={(step) => {
          if (step.sidebar && window.innerWidth < 1024) setMobileMenuOpen(true);
          if (step.id === 'owner-navigation') setManagementOpen(true);
        }}
        onActiveChange={(active) => {
          if (active) {
            managementBeforeTour.current = managementOpen;
          } else {
            setMobileMenuOpen(false);
            setManagementOpen(managementBeforeTour.current);
          }
        }}
      />
    </div>
  );
}

function OwnerOverview({ ownerName, t, summary, loading }: { ownerName: string; t: (ar: string, en: string) => string; summary?: OwnerOperationsSummary; loading: boolean }) {
  const opening = summary?.openingBalance;
  const openingLabel = opening?.status === 'approved' ? t('معتمد ومرحل', 'Approved & posted') : opening ? `${t('قيد', 'In')} ${opening.status}` : t('لم تُنشأ مسودة', 'No draft');
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" data-testid="text-owner-page-title">
          {t('نظرة عامة', 'Overview')}
        </h1>
        <p className="mt-2 text-[16px] text-[#7d7a74] dark:text-[#8f9196]">
          {t(`مرحباً ${ownerName}، إليك ملخص أداء مسك اللولو`, `Welcome ${ownerName}, here is your Musk Ellolo overview`)}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { labelAr: 'كمية المخزون', labelEn: 'Inventory quantity', value: loading ? '…' : String(summary?.inventory?.quantity ?? 0), noteAr: 'الكمية الحالية', noteEn: 'Current quantity', icon: Boxes },
          { labelAr: 'قيمة المخزون', labelEn: 'Inventory value', value: loading ? '…' : `${summary?.inventory?.value ?? '0.0000'} SAR`, noteAr: 'بالمتوسط المرجح', noteEn: 'Weighted average', icon: Package },
          { labelAr: 'حركات مرحّلة', labelEn: 'Posted events', value: loading ? '…' : `${summary?.events?.posted ?? 0}/${summary?.events?.total ?? 0}`, noteAr: 'حركات مترابطة', noteEn: 'Linked events', icon: CircleDollarSign },
          { labelAr: 'الرصيد الافتتاحي', labelEn: 'Opening balance', value: openingLabel, noteAr: opening?.sourceFileName ?? 'مصدر الملف غير مرحل', noteEn: opening?.sourceFileName ?? 'Workbook source not posted', icon: FileText },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <section key={metric.labelEn} className="relative overflow-hidden rounded-2xl border border-[#e5e2dc] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-colors dark:border-[#24262a] dark:bg-[#111214]">
              <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-[#e0aa00] to-[#f5d459]" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-[#7e7b75] dark:text-[#96989d]">{t(metric.labelAr, metric.labelEn)}</p>
                   <p className="mt-7 text-2xl font-bold">{metric.value}</p>
                   <p className="mt-2 text-xs text-[#a09d96] dark:text-[#6f7176]">{t(metric.noteAr, metric.noteEn)}</p>
                </div>
                <div className="rounded-xl bg-[#fbf4d8] p-3 text-[#ba8d00] dark:bg-[#282619] dark:text-[#e3b723]"><Icon className="h-5 w-5" /></div>
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border border-[#e5e2dc] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors dark:border-[#24262a] dark:bg-[#111214]">
        <div className="flex items-center gap-3 border-b border-dashed border-[#e8e5de] pb-5 dark:border-[#2a2c30]">
          <div className="rounded-lg bg-[#fbf4d8] p-2 text-[#c09300] dark:bg-[#282619] dark:text-[#e3b723]"><CircleDollarSign className="h-5 w-5" /></div>
          <h2 className="text-lg font-bold">{t('الإيرادات والأرباح', 'Revenue and profit')}</h2>
        </div>
        <div className="grid gap-3 pt-5 sm:grid-cols-3">
          <Link href="/owner/products" className="rounded-xl border border-[#e5e2dc] p-4 transition hover:border-[#d4ad31] dark:border-[#2c2e32]">
            <Package className="mb-2 h-5 w-5 text-[#ba8d00]" />
            <p className="font-medium">{t('المنتجات والمخزون', 'Products & inventory')}</p>
            <p className="mt-1 text-xs text-[#89867f]">{t('عرض المصدر الخام والمطابقة التشغيلية', 'View raw source and operational reconciliation')}</p>
          </Link>
          <Link href="/owner/manufacturing" className="rounded-xl border border-[#e5e2dc] p-4 transition hover:border-[#d4ad31] dark:border-[#2c2e32]">
            <Boxes className="mb-2 h-5 w-5 text-[#ba8d00]" />
            <p className="font-medium">{t('التصنيع', 'Manufacturing')}</p>
            <p className="mt-1 text-xs text-[#89867f]">{t('دفعات التصنيع واستهلاك المواد', 'Batches and material consumption')}</p>
          </Link>
          <Link href="/owner/obligations" className="rounded-xl border border-[#e5e2dc] p-4 transition hover:border-[#d4ad31] dark:border-[#2c2e32]">
            <WalletCards className="mb-2 h-5 w-5 text-[#ba8d00]" />
            <p className="font-medium">{t('الالتزامات والقيود', 'Liabilities & journals')}</p>
            <p className="mt-1 text-xs text-[#89867f]">{t('متابعة أثر الحركات على المالية', 'Follow financial impact of linked events')}</p>
          </Link>
        </div>
      </section>
    </div>
  );
}

function PendingOwnerSection({ item, t }: { item?: OwnerNavItem; t: (ar: string, en: string) => string }) {
  const Icon = item?.icon ?? Grid2X2;
  return (
    <div>
      <h1 className="text-3xl font-bold">{item ? t(item.labelAr, item.labelEn) : t('إدارة المالك', 'Owner management')}</h1>
      <section className="mt-7 flex min-h-[430px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#d9d4c8] bg-white p-8 text-center shadow-sm dark:border-[#303238] dark:bg-[#111214]">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#fbf4d8] text-[#bd9000] dark:bg-[#282619] dark:text-[#e3b723]">
          <Icon className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold">{t('جاهز لاستقبال ملفاتك', 'Ready for your files')}</h2>
        <p className="mt-3 max-w-md leading-7 text-[#85817a] dark:text-[#8f9196]">
          {t('تم تجهيز هذا القسم بنفس هيكل لوحة المالك، وسيتم وضع البيانات فيه عند تزويدي بالملفات.', 'This owner section is prepared and will be populated when you provide the files.')}
        </p>
      </section>
    </div>
  );
}

function SecuritySessions({
  sessions,
  lang,
  revokePending,
  revokeOthersPending,
  onRevoke,
  onRevokeOthers,
  t,
}: {
  sessions: OwnerSession[];
  lang: string;
  revokePending: boolean;
  revokeOthersPending: boolean;
  onRevoke: (session: OwnerSession) => void;
  onRevokeOthers: () => void;
  t: (ar: string, en: string) => string;
}) {
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('الأمان والجلسات', 'Security & sessions')}</h1>
          <p className="mt-2 text-[#7d7a74] dark:text-[#8f9196]">{t('راجع الأجهزة التي دخلت إلى لوحة المالك.', 'Review devices signed into the owner console.')}</p>
        </div>
        <Button
          variant="outline"
          onClick={onRevokeOthers}
          disabled={sessions.length < 2 || revokeOthersPending}
          data-testid="button-revoke-other-owner-sessions"
          className="border-[#d7c36e] bg-white hover:bg-[#fff9df] dark:border-[#514723] dark:bg-[#17181b] dark:hover:bg-[#282619]"
        >
          <ShieldCheck className="me-2 h-4 w-4" />
          {t('إلغاء الجلسات الأخرى', 'Revoke other sessions')}
        </Button>
      </div>
      <div className="mt-7 space-y-3">
        {sessions.map((session) => (
          <section key={session.id} className={`flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm transition-colors dark:bg-[#111214] sm:flex-row sm:items-center sm:justify-between ${
            session.isCurrent ? 'border-[#e0bd39] dark:border-[#9b7b17]' : 'border-[#e5e2dc] dark:border-[#24262a]'
          }`}>
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f3f1eb] text-[#4c4a46] dark:bg-[#1d1f22] dark:text-[#c0c2c6]">
                <SessionDeviceIcon deviceLabel={session.deviceLabel} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{session.browser} · {session.operatingSystem}</p>
                  {session.isCurrent && <span className="rounded-full bg-[#fff3bd] px-2 py-0.5 text-xs text-[#8b6800] dark:bg-[#332c16] dark:text-[#e4bb32]">{t('الحالية', 'Current')}</span>}
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-[#89867f] dark:text-[#85878c]">
                  <Clock3 className="h-4 w-4" />{formatOwnerDate(session.createdAt, lang)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRevoke(session)}
              disabled={revokePending}
              data-testid={`button-revoke-owner-session-${session.id}`}
              className="self-end text-[#a53c36] hover:bg-red-50 hover:text-[#a53c36] sm:self-auto"
            >
              <Trash2 className="me-2 h-4 w-4" />{t('إلغاء الجلسة', 'Revoke')}
            </Button>
          </section>
        ))}
      </div>
    </div>
  );
}