import { Link } from 'wouter';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useOwnerLogin } from '@workspace/api-client-react';
import { saveOwnerToken } from '@/lib/auth-token';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    loginMutation.mutate({ data }, {
      onSuccess: (response) => {
        saveOwnerToken(response.token);
        setLocation('/owner');
        toast({ title: t('تم تسجيل دخول المالك بنجاح', 'Owner login successful') });
      },
      onError: () => {
        toast({
          title: t('تعذر تسجيل الدخول', 'Login failed'),
          description: t('تأكد من بيانات دخول المالك', 'Check the owner email and password'),
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f0d0b] p-4 text-[#f0e4d0]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Card className="w-full max-w-md border-[#4a3329] bg-[#1b1512] text-[#f0e4d0]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#d99a68]/15 text-[#d99a68]">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle>{t('بوابة المالك', 'Owner portal')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-5 text-center text-sm text-[#c6b8a5]">
            {t('سجّل الدخول إلى المساحة الخاصة بمالك المتجر.', 'Sign in to the private owner workspace.')}
          </p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('البريد الإلكتروني', 'Email')}</FormLabel>
                  <FormControl><Input type="email" autoComplete="username" {...field} dir="ltr" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('كلمة المرور', 'Password')}</FormLabel>
                  <FormControl><Input type="password" autoComplete="current-password" {...field} dir="ltr" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? t('جاري التحقق...', 'Signing in...') : t('دخول المالك', 'Owner sign in')}
              </Button>
            </form>
          </Form>
          <Button variant="outline" asChild className="mt-4 w-full border-[#8e5845] text-[#f0e4d0] hover:bg-[#8e5845]/20">
            <Link href="/admin/login">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {t('العودة إلى دخول الأدمن', 'Back to admin sign in')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}