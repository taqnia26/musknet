import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { getGetOwnerMeQueryKey, useGetOwnerMe, useOwnerLogout } from '@workspace/api-client-react';
import { getOwnerToken, removeOwnerToken } from '@/lib/auth-token';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, ShieldCheck } from 'lucide-react';

export default function OwnerPortal() {
  const [, setLocation] = useLocation();
  const { t, lang } = useLanguage();
  const hasToken = !!getOwnerToken();
  const { data: owner, isLoading, error } = useGetOwnerMe({
    query: { enabled: hasToken, retry: false, queryKey: getGetOwnerMeQueryKey() },
  });
  const logoutMutation = useOwnerLogout();

  useEffect(() => {
    if (!hasToken || (error as { status?: number } | null)?.status === 401) {
      removeOwnerToken();
      setLocation('/owner/login');
    }
  }, [error, hasToken, setLocation]);

  const logout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        removeOwnerToken();
        setLocation('/owner/login');
      },
    });
  };

  if (isLoading) {
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
      </div>
    </main>
  );
}