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
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card p-8 rounded-xl shadow-sm border">
        <div className="mb-8 text-center">
          <img
            src="/site-assets/admin-logo.png"
            alt="Musk Ellolo"
            className="h-28 w-auto max-w-full object-contain mx-auto mb-5"
          />
          <h1 className="text-2xl font-bold">
            {t('إدارة النظام مسك اللولو', 'Musk Ellolo System Management')}
          </h1>
          <p className="text-muted-foreground mt-2">{t('تسجيل الدخول للوحة التحكم', 'Sign in to admin panel')}</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('البريد الإلكتروني', 'Email')}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="username"
                      placeholder="admin@example.com"
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
                  <FormLabel>{t('كلمة المرور', 'Password')}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} dir="ltr" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full mt-6" disabled={loginMutation.isPending} data-testid="button-login-submit">
              {loginMutation.isPending ? t('جاري تسجيل الدخول...', 'Signing in...') : t('دخول', 'Sign In')}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
