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

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { t, lang } = useLanguage();
  const { toast } = useToast();

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
              src="/site-assets/admin-wordmark-brandguide.png"
              alt="Musk Ellolo"
              className="h-16 w-auto max-w-full object-contain mx-auto mb-6 dark:invert"
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
                      <Input type="password" autoComplete="current-password" className="bg-background" {...field} dir="ltr" />
                    </FormControl>
                    <FormMessage />
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
    </div>
  );
}
