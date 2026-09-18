import { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAdminLogin } from '@workspace/api-client-react';
import { saveAdminToken } from '@/lib/auth-token';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, KeyRound } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const loginMutation = useAdminLogin();

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    loginMutation.mutate({ data }, {
      onSuccess: (res) => {
        saveAdminToken(res.token);
        setLocation('/admin');
        toast({ title: t('تم تسجيل الدخول بنجاح', 'Login successful') });
      },
      onError: () => {
        toast({ 
          title: t('خطأ في تسجيل الدخول', 'Login failed'), 
          description: t('تأكد من صحة البريد الإلكتروني وكلمة المرور', 'Check your email and password'),
          variant: 'destructive'
        });
      }
    });
  };

  const submitRecoveryRequest = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!recoveryIdentifier.trim()) return;
    toast({
      title: t('تواصل مع مالك النظام', 'Contact the system owner'),
      description: t(
        'سيتم إرسال رمز الاستعادة بعد ربط خدمة البريد أو الرسائل بحساب الإدارة.',
        'Recovery codes can be sent after email or SMS delivery is connected to the admin account.',
      ),
    });
    setForgotPasswordOpen(false);
    setRecoveryIdentifier('');
  };

  return (
    <div className="admin-theme min-h-screen bg-background text-foreground flex">
      {/* Visual Side */}
      <div className="hidden lg:flex w-1/2 relative bg-primary items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="/site-assets/admin-profile-brand.jpg"
            alt="Brand Pattern"
            className="w-full h-full object-cover opacity-30 mix-blend-overlay grayscale"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent" />
        </div>
      </div>

      {/* Form Side */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-md bg-card p-10 rounded-2xl shadow-sm border border-border">
          <div className="mb-10 text-center">
            <img
              src="/site-assets/musk-ellolo-wordmark-black.png"
              alt="Musk Ellolo"
              className="mx-auto mb-7 w-[300px] max-w-full object-contain dark:hidden"
            />
            <img
              src="/site-assets/musk-ellolo-wordmark-white.png"
              alt="Musk Ellolo"
              className="mx-auto mb-7 hidden w-[300px] max-w-full object-contain dark:block"
            />
            <h1 className="text-2xl font-bold tracking-tight">
              {t('إدارة النظام مسك اللولو', 'Musk Ellolo Atelier')}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {t('تسجيل الدخول للوحة التحكم', 'Sign in to admin panel')}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground/80">{t('البريد الإلكتروني', 'Email')}</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="username"
                        placeholder="admin@example.com"
                        className="bg-background"
                        {...field}
                        dir="ltr"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground/80">{t('كلمة المرور', 'Password')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          className="bg-background pr-11"
                          {...field}
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((visible) => !visible)}
                          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          aria-label={showPassword
                            ? t('إخفاء كلمة المرور', 'Hide password')
                            : t('إظهار كلمة المرور', 'Show password')}
                          aria-pressed={showPassword}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setForgotPasswordOpen(true)}
                        className="text-sm font-medium text-accent underline-offset-4 transition-colors hover:underline hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {t('هل نسيت كلمة المرور؟', 'Forgot password?')}
                      </button>
                    </div>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full mt-8 h-12 text-md" disabled={loginMutation.isPending} data-testid="button-login-submit">
                {loginMutation.isPending ? t('جاري تسجيل الدخول...', 'Signing in...') : t('دخول', 'Sign In')}
              </Button>
            </form>
          </Form>
        </div>
      </div>

      {forgotPasswordOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-recovery-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setForgotPasswordOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 id="admin-recovery-title" className="font-bold text-foreground">
                  {t('استعادة كلمة المرور', 'Reset password')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(
                    'أدخل البريد الإلكتروني أو اسم المستخدم أو رقم الجوال المرتبط بحساب الإدارة.',
                    'Enter the email, username, or phone number linked to the admin account.',
                  )}
                </p>
              </div>
            </div>
            <form onSubmit={submitRecoveryRequest} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="recovery-identifier" className="text-sm font-medium text-foreground/80">
                  {t('بيانات الحساب', 'Account details')}
                </label>
                <Input
                  id="recovery-identifier"
                  value={recoveryIdentifier}
                  onChange={(event) => setRecoveryIdentifier(event.target.value)}
                  placeholder={t('البريد أو اسم المستخدم أو رقم الجوال', 'Email, username, or phone')}
                  autoComplete="username"
                  required
                  autoFocus
                  dir="ltr"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  {t('متابعة', 'Continue')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setForgotPasswordOpen(false)}>
                  {t('إلغاء', 'Cancel')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
