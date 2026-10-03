import { useEffect, useRef } from 'react';
import { getGetCurrentUserQueryKey, useGetCurrentUser, useResolveCustomerCartLink } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/use-language';
import { removeAuthToken } from '@/lib/auth-token';

export default function CartLink() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const token = new URLSearchParams(window.location.hash.slice(1)).get('link') ?? '';
  const returnTo = `/cart/open#link=${encodeURIComponent(token)}`;
  const loginPath = `/auth/register?returnTo=${encodeURIComponent(returnTo)}`;
  const { data: user, isPending: isUserPending, error: userError } = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const { mutate, error } = useResolveCustomerCartLink();
  const started = useRef('');
  useEffect(() => {
    if (!token || isUserPending) return;
    if (userError) {
      if ((userError as { status?: number }).status === 401) setLocation(loginPath);
      return;
    }
    if (!user) return;
    const requestKey = `${user.id}:${token}`;
    if (started.current === requestKey) return;
    started.current = requestKey;
    mutate({ data: { token } }, { onSuccess: (result) => setLocation(result.cartPath) });
  }, [token, user?.id, isUserPending, userError, mutate, setLocation, loginPath]);
  const switchAccount = () => {
    removeAuthToken();
    queryClient.clear();
    setLocation(loginPath);
  };
  const requestError = error ?? userError;
  return <div className="container mx-auto max-w-xl px-4 py-16">
    <section className="space-y-5 rounded-2xl border bg-card p-6 shadow-sm md:p-8">
      <h1 className="text-2xl font-bold">{t('فتح سلة العميل', 'Open customer cart')}</h1>
      {!token ? <p role="alert">{t('رابط السلة غير صالح أو غير مكتمل', 'The cart link is invalid or incomplete')}</p> : requestError ? <>
        <p role="alert" className="text-sm text-destructive">{(requestError as { data?: { error?: string } }).data?.error ?? t('تعذر فتح رابط السلة. أعد المحاولة أو تواصل مع المتجر.', 'Unable to open the cart link. Retry or contact the store.')}</p>
        {(requestError as { status?: number }).status === 403
          ? <Button onClick={switchAccount}>{t('تسجيل الدخول بحساب العميل', 'Sign in as the customer')}</Button>
          : <Button onClick={() => window.location.reload()}>{t('إعادة المحاولة', 'Retry')}</Button>}
      </> : <p role="status">{t('جاري التحقق من حساب العميل...', 'Verifying the customer account...')}</p>}
      <p className="text-sm text-muted-foreground">{t('الرابط يفتح السلة الحالية فقط؛ لا يغيّر محتواها ولا يفعّل الدفع.', 'This link only opens the current cart; it does not change its contents or enable payment.')}</p>
      <Button variant="outline" onClick={() => setLocation('/')}>{t('العودة للمتجر', 'Back to store')}</Button>
    </section>
  </div>;
}