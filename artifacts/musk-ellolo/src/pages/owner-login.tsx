import { Link } from 'wouter';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function OwnerLogin() {
  const { t, lang } = useLanguage();
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f0d0b] p-4 text-[#f0e4d0]" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Card className="w-full max-w-md border-[#4a3329] bg-[#1b1512] text-[#f0e4d0]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#d99a68]/15 text-[#d99a68]">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle>{t('بوابة المالك', 'Owner portal')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-center">
          <p className="text-sm text-[#c6b8a5]">
            {t('هذه نقطة دخول منفصلة للمالك. لم يتم ربطها بجلسة الأدمن أو إضافة مصادقة جديدة في هذه المرحلة.', 'This is a separate owner entry point. It is not linked to the admin session and does not add a new authentication system at this stage.')}
          </p>
          <Button variant="outline" asChild className="w-full border-[#8e5845] text-[#f0e4d0] hover:bg-[#8e5845]/20">
            <Link href={lang === 'ar' ? '/admin' : '/admin'}>
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {t('العودة إلى لوحة الأدمن', 'Back to admin panel')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}