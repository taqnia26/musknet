import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent } from '@/components/ui/card';
import { FileQuestion } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function AdminNotFound() {
  const { t } = useLanguage();
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <FileQuestion className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-bold mb-2">{t('الصفحة غير موجودة', 'Page not found')}</h2>
          <p className="text-muted-foreground mb-6">
            {t('المسار الذي تحاول الوصول إليه غير موجود أو تم نقله.', 'The path you are trying to access does not exist or has been moved.')}
          </p>
          <Button asChild>
            <Link href="/admin">
              {t('العودة للرئيسية', 'Back to dashboard')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
