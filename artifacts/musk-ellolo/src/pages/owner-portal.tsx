import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetOwnerMeQueryKey,
  getListOwnerSessionNotificationsQueryKey,
  getListOwnerSessionsQueryKey,
  type OwnerSession,
  useGetOwnerMe,
  useListOwnerSessionNotifications,
  useListOwnerSessions,
  useOwnerLogout,
  useReadOwnerSessionNotification,
  useRevokeOtherOwnerSessions,
  useRevokeOwnerSession,
} from '@workspace/api-client-react';
import { getOwnerToken, removeOwnerToken } from '@/lib/auth-token';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { BellRing, Clock3, Laptop, LogOut, ShieldCheck, Smartphone, Tablet, Trash2 } from 'lucide-react';

function SessionDeviceIcon({ deviceLabel }: { deviceLabel: string }) {
  if (deviceLabel === 'Mobile device') return <Smartphone className="h-5 w-5" />;
  if (deviceLabel === 'Tablet') return <Tablet className="h-5 w-5" />;
  return <Laptop className="h-5 w-5" />;
}

export default function OwnerPortal() {
  const [, setLocation] = useLocation();
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasToken = !!getOwnerToken();
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
  const logoutMutation = useOwnerLogout();
  const revokeMutation = useRevokeOwnerSession();
  const revokeOthersMutation = useRevokeOtherOwnerSessions();
  const readNotificationMutation = useReadOwnerSessionNotification();
  const deliveredNotificationIds = useRef(new Set<number>());

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

    for (const notification of pending) {
      deliveredNotificationIds.current.add(notification.id);
    }
    const latest = pending[0];
    toast({
      title: t(
        pending.length === 1 ? 'تنبيه دخول من جهاز جديد' : `${pending.length} تنبيهات دخول جديدة`,
        pending.length === 1 ? 'New device sign-in alert' : `${pending.length} new sign-in alerts`,
      ),
      description: t(
        pending.length === 1
          ? `${latest.browser} على ${latest.operatingSystem} — ${formatDate(latest.sessionCreatedAt)}`
          : `أحدثها: ${latest.browser} على ${latest.operatingSystem} — ${formatDate(latest.sessionCreatedAt)}`,
        pending.length === 1
          ? `${latest.browser} on ${latest.operatingSystem} — ${formatDate(latest.sessionCreatedAt)}`
          : `Latest: ${latest.browser} on ${latest.operatingSystem} — ${formatDate(latest.sessionCreatedAt)}`,
      ),
      variant: 'destructive',
      action: (
        <ToastAction
          altText={t('راجع الجلسات النشطة', 'Review active sessions')}
          onClick={() => document.getElementById('owner-active-sessions')?.scrollIntoView({ behavior: 'smooth' })}
        >
          {t('مراجعة', 'Review')}
        </ToastAction>
      ),
    });

    for (const notification of pending) {
      readNotificationMutation.mutate({ id: notification.id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOwnerSessionNotificationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOwnerSessionsQueryKey() });
        },
        onError: () => {
          deliveredNotificationIds.current.delete(notification.id);
        },
      });
    }
  }, [sessionNotifications]);

  const logout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        removeOwnerToken();
        setLocation('/owner/login');
      },
    });
  };

  const formatDate = (value: string | Date) => new Intl.DateTimeFormat(
    lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'short' },
  ).format(new Date(value));

  const revokeSession = (session: OwnerSession) => {
    const confirmed = window.confirm(t(
      session.isCurrent
        ? 'سيؤدي هذا إلى تسجيل خروجك من هذه الجلسة. هل تريد المتابعة؟'
        : 'هل تريد إلغاء هذه الجلسة؟',
      session.isCurrent
        ? 'This will sign you out of this session. Continue?'
        : 'Revoke this session?',
    ));
    if (!confirmed) return;

    revokeMutation.mutate({ id: session.id }, {
      onSuccess: () => {
        if (session.isCurrent) {
          removeOwnerToken();
          queryClient.removeQueries({ queryKey: getGetOwnerMeQueryKey() });
          queryClient.removeQueries({ queryKey: getListOwnerSessionsQueryKey() });
          setLocation('/owner/login');
          return;
        }
        queryClient.invalidateQueries({ queryKey: getListOwnerSessionsQueryKey() });
        toast({ title: t('تم إلغاء الجلسة', 'Session revoked') });
      },
      onError: () => {
        toast({
          title: t('تعذر إلغاء الجلسة', 'Could not revoke session'),
          variant: 'destructive',
        });
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
      onError: () => {
        toast({
          title: t('تعذر إلغاء الجلسات الأخرى', 'Could not revoke other sessions'),
          variant: 'destructive',
        });
      },
    });
  };

  if (isLoading || sessionsLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#0f0d0b] text-[#f0e4d0]"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#d99a68]" /></main>;
  }
  if (!owner) return null;

  return (
    <main className="min-h-screen bg-[#0f0d0b] p-4 text-[#f0e4d0]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between border-b border-[#4a3329] py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#d99a68]/15 text-[#d99a68]"><ShieldCheck className="h-6 w-6" /></div>
            <div>
              <p className="text-sm text-[#c6b8a5]">{t('مساحة المالك', 'Owner workspace')}</p>
              <h1 className="text-2xl font-semibold">{t(`مرحبًا، ${owner.name}`, `Welcome, ${owner.name}`)}</h1>
            </div>
          </div>
          <Button variant="outline" onClick={logout} disabled={logoutMutation.isPending} className="border-[#8e5845] text-[#f0e4d0] hover:bg-[#8e5845]/20">
            <LogOut className="me-2 h-4 w-4" />{t('تسجيل الخروج', 'Sign out')}
          </Button>
        </header>
        <Card className="mt-8 border-[#4a3329] bg-[#1b1512] text-[#f0e4d0]">
          <CardHeader><CardTitle>{t('بوابة المالك الخاصة', 'Private owner portal')}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-[#c6b8a5]">{t('تم تسجيل الدخول بجلسة مالك مستقلة وآمنة.', 'You are signed in with an independent, secure owner session.')}</p>
            <p className="mt-3 text-sm text-[#8f8173]" dir="ltr">{owner.email}</p>
          </CardContent>
        </Card>

        <Alert className="mt-6 border-[#76513d] bg-[#d99a68]/10 text-[#f0e4d0]">
          <BellRing className="h-4 w-4 text-[#d99a68]" />
          <AlertTitle>{t('تنبيهات دخول فورية', 'Instant sign-in alerts')}</AlertTitle>
          <AlertDescription className="text-[#c6b8a5]">
            {t(
              'يصل تنبيه داخل البوابة إلى جلساتك المفتوحة خلال ثوانٍ، ويبقى محفوظًا حتى عودتك. راجع الأجهزة وألغِ أي وصول غير متوقع.',
              'Your existing sessions receive an in-portal alert within seconds, and it stays queued until you return. Review devices below and revoke unexpected access.',
            )}
          </AlertDescription>
        </Alert>

        <Card id="owner-active-sessions" className="mt-6 scroll-mt-6 border-[#4a3329] bg-[#1b1512] text-[#f0e4d0]">
          <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{t('الجلسات النشطة', 'Active sessions')}</CardTitle>
              <p className="mt-2 text-sm text-[#a99a89]">
                {t(`${sessions.length} جلسة نشطة`, `${sessions.length} active session${sessions.length === 1 ? '' : 's'}`)}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={revokeOtherSessions}
              disabled={sessions.length < 2 || revokeOthersMutation.isPending}
              className="border-[#8e5845] text-[#f0e4d0] hover:bg-[#8e5845]/20"
            >
              <ShieldCheck className="me-2 h-4 w-4" />
              {t('إلغاء كل الجلسات الأخرى', 'Revoke all other sessions')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                  session.isCurrent ? 'border-[#d99a68]/70 bg-[#d99a68]/10' : 'border-[#3b2d27] bg-[#15100e]'
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d99a68]/15 text-[#d99a68]">
                    <SessionDeviceIcon deviceLabel={session.deviceLabel} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {t(
                          session.deviceLabel === 'Mobile device' ? 'جهاز جوّال' : session.deviceLabel === 'Tablet' ? 'جهاز لوحي' : 'كمبيوتر',
                          session.deviceLabel,
                        )}
                      </p>
                      {session.isCurrent && (
                        <span className="rounded-full bg-[#d99a68]/20 px-2 py-0.5 text-xs text-[#efb487]">
                          {t('الجلسة الحالية', 'Current session')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[#c6b8a5]" dir="ltr">
                      {session.browser} · {session.operatingSystem}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-[#8f8173]">
                      <Clock3 className="h-3.5 w-3.5" />
                      {t('بدأت', 'Started')} {formatDate(session.createdAt)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeSession(session)}
                  disabled={revokeMutation.isPending}
                  className="self-end text-[#e49a82] hover:bg-[#8e5845]/20 hover:text-[#ffc1aa] sm:self-auto"
                >
                  <Trash2 className="me-2 h-4 w-4" />
                  {t('إلغاء الجلسة', 'Revoke')}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}