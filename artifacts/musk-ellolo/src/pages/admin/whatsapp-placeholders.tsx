import { Link } from 'wouter';
import { CheckCircle2, MessageCircle, Phone } from 'lucide-react';
import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function WhatsAppPlaceholder({
  titleAr,
  titleEn,
  descriptionAr,
  descriptionEn,
  icon: Icon,
}: {
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  icon: typeof MessageCircle;
}) {
  const { t } = useLanguage();
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <CardTitle>{t(titleAr, titleEn)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-muted-foreground">{t(descriptionAr, descriptionEn)}</p>
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {t('هذه واجهة تجريبية محلية ولا تتصل بخدمة WhatsApp خارجية.', 'This is a local demo surface and does not connect to an external WhatsApp service.')}
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/whatsapp/inbox">{t('فتح صندوق المحادثات', 'Open inbox')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function AdminWhatsAppTemplates() {
  return (
    <WhatsAppPlaceholder
      titleAr="قوالب WhatsApp"
      titleEn="WhatsApp templates"
      descriptionAr="جهّز القوالب النصية التي يمكن استخدامها لاحقاً في المحادثات."
      descriptionEn="Prepare message templates that can be used in conversations later."
      icon={MessageCircle}
    />
  );
}

export function AdminWhatsAppSettings() {
  const { t } = useLanguage();
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Phone className="h-6 w-6" />
        </div>
        <CardTitle>{t('واتساب الإدارة العامة', 'General Administration WhatsApp')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-muted-foreground">
          {t('للتواصل المباشر مع الإدارة العامة عبر واتساب.', 'Contact General Administration directly through WhatsApp.')}
        </p>
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
          <div className="text-sm text-muted-foreground">{t('رقم الإدارة العامة', 'General Administration number')}</div>
          <div dir="ltr" className="mt-1 text-2xl font-bold tracking-wide">055 611 4848</div>
        </div>
        <Button asChild>
          <a href="https://wa.me/966556114848" target="_blank" rel="noreferrer">
            <MessageCircle className="me-2 h-4 w-4" />
            {t('فتح محادثة واتساب', 'Open WhatsApp chat')}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}