import { useLanguage } from '@/hooks/use-language';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  const { t } = useLanguage();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 text-center bg-background animate-in fade-in">
      <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center text-destructive mb-6">
        <AlertCircle className="w-10 h-10" />
      </div>
      <h1 className="text-4xl md:text-5xl font-bold mb-4">404</h1>
      <h2 className="text-2xl font-bold mb-4">{t('الصفحة غير موجودة', 'Page Not Found')}</h2>
      <p className="text-muted-foreground max-w-md mb-8">
        {t('عذراً، الصفحة التي تحاول الوصول إليها غير موجودة أو تم نقلها.', 'Sorry, the page you are trying to access does not exist or has been moved.')}
      </p>
      <Link href="/" className="inline-flex items-center justify-center whitespace-nowrap font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 rounded-full text-base">
        {t('العودة للرئيسية', 'Return Home')}
      </Link>
    </div>
  );
}
