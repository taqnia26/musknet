import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, LogIn, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useOwnerLogin } from '@workspace/api-client-react';
import { saveOwnerToken } from '@/lib/auth-token';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export default function OwnerLogin() {
  const [, setLocation] = useLocation();
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const loginMutation = useOwnerLogin();
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    setLoginError(false);
    loginMutation.mutate({ data }, {
      onSuccess: (response) => {
        saveOwnerToken(response.token);
        toast({
          title: t('تم تسجيل دخول المالك بنجاح', 'Owner login successful'),
          description: t(
            `جلسة جديدة: ${response.session.browser} على ${response.session.operatingSystem}`,
            `New session: ${response.session.browser} on ${response.session.operatingSystem}`,
          ),
        });
        setLocation('/owner');
      },
      onError: () => setLoginError(true),
    });
  };

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#302f2d] px-4 py-10 text-[#171717]"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <section className="relative w-full max-w-[465px] rounded-[17px] border-2 border-[#222] bg-[#fbfaf7] p-[3px] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <div className="rounded-[13px] border border-[#8f8d87] px-7 py-7 sm:px-8 sm:py-8">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="absolute end-4 top-4 h-8 w-8 rounded-full text-[#6d6d6d] hover:bg-black/5"
          >
            <Link href="/admin/login" data-testid="link-close-owner-login" aria-label={t('إغلاق', 'Close')}>
              <X className="h-5 w-5" />
            </Link>
          </Button>

          <div className="mb-6 text-center">
            <div className="mb-3 flex items-center justify-center gap-2">
              <LockKeyhole className="h-6 w-6 text-[#e5b526]" strokeWidth={1.8} />
              <h1 className="text-[25px] font-semibold tracking-tight">
                {t('تسجيل دخول إدارة المالك', 'Owner management sign in')}
              </h1>
            </div>
            <p className="mx-auto max-w-sm text-[16px] leading-7 text-[#747474]">
              {t(
                'هذا القسم يحتوي على بيانات حساسة ويتطلب تسجيل دخول منفصل',
                'This area contains sensitive data and requires a separate sign-in.',
              )}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-[16px] font-medium">{t('البريد الإلكتروني', 'Email')}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="username"
                      {...field}
                      dir="ltr"
                      data-testid="input-owner-email"
                      className="h-12 rounded-[10px] border-[#deddd8] bg-white px-4 text-[16px] shadow-sm focus-visible:ring-[#e5b526]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-[16px] font-medium">{t('كلمة المرور', 'Password')}</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        {...field}
                        dir="ltr"
                        data-testid="input-owner-password"
                        className="h-12 rounded-[10px] border-[#deddd8] bg-white px-4 pe-12 text-[16px] shadow-sm focus-visible:ring-[#e5b526]"
                      />
                    </FormControl>
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute inset-y-0 end-1 flex w-11 items-center justify-center text-[#777] transition-colors hover:text-black"
                      data-testid="button-toggle-owner-password"
                      aria-label={showPassword ? t('إخفاء كلمة المرور', 'Hide password') : t('إظهار كلمة المرور', 'Show password')}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              {loginError && (
                <p className="text-center text-[15px] text-[#d33b32]" role="alert" data-testid="status-owner-login-error">
                  {t('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'The email or password is incorrect')}
                </p>
              )}

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                data-testid="button-owner-login"
                className="h-[54px] w-full rounded-[16px] bg-gradient-to-l from-[#f0b807] to-[#ffd338] text-[18px] font-bold text-white shadow-[0_8px_20px_rgba(226,172,0,0.28)] transition-transform hover:scale-[1.01] hover:from-[#eeb000] hover:to-[#ffce25]"
              >
                <LogIn className="me-3 h-5 w-5" />
                {loginMutation.isPending ? t('جاري التحقق...', 'Signing in...') : t('دخول', 'Sign in')}
              </Button>
            </form>
          </Form>

          <div className="mt-7 flex items-center justify-center gap-2 text-sm text-[#777]">
            <LockKeyhole className="h-4 w-4" />
            <span>{t('بيانات المالك محمية ومشفّرة', 'Owner credentials are protected and encrypted')}</span>
          </div>
        </div>
      </section>
    </main>
  );
}