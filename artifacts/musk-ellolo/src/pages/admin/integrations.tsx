import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Network, Database, CreditCard, Truck, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const integrations = [
  {
    id: 'zatca',
    nameEn: 'ZATCA Fatoora',
    nameAr: 'هيئة الزكاة والضريبة (فاتورة)',
    categoryEn: 'Finance',
    categoryAr: 'المالية',
    icon: Database,
    status: 'connected',
    descriptionAr: 'ربط مباشر مع منصة فاتورة لإصدار فواتير ضريبية إلكترونية معتمدة.',
    descriptionEn: 'Direct integration with Fatoora platform for approved electronic tax invoices.'
  },
  {
    id: 'moyasar',
    nameEn: 'Moyasar',
    nameAr: 'ميسر',
    categoryEn: 'Payments',
    categoryAr: 'المدفوعات',
    icon: CreditCard,
    status: 'connected',
    descriptionAr: 'بوابة الدفع الإلكتروني (مدى، فيزا، ماستركارد، أبل باي).',
    descriptionEn: 'Payment gateway (Mada, Visa, Mastercard, Apple Pay).'
  },
  {
    id: 'tabby',
    nameEn: 'Tabby',
    nameAr: 'تابي',
    categoryEn: 'Payments',
    categoryAr: 'المدفوعات',
    icon: CreditCard,
    status: 'connected',
    descriptionAr: 'خدمة الشراء الآن والدفع لاحقاً على أقساط.',
    descriptionEn: 'Buy Now Pay Later installment service.'
  },
  {
    id: 'smsa',
    nameEn: 'SMSA Express',
    nameAr: 'سمسا إكسبريس',
    categoryEn: 'Shipping',
    categoryAr: 'الشحن',
    icon: Truck,
    status: 'disconnected',
    descriptionAr: 'ربط بوليصات الشحن وتتبع الطلبات تلقائياً.',
    descriptionEn: 'Automated waybill generation and order tracking.'
  },
  {
    id: 'odoo',
    nameEn: 'Odoo ERP',
    nameAr: 'أودو ERP',
    categoryEn: 'Management',
    categoryAr: 'الإدارة',
    icon: Network,
    status: 'disconnected',
    descriptionAr: 'مزامنة المخزون، الحسابات، وشؤون الموظفين مع النظام المحاسبي.',
    descriptionEn: 'Sync inventory, accounting, and HR with the ERP system.'
  }
];

export default function AdminIntegrations() {
  const { t, lang } = useLanguage();

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('التكاملات', 'Integrations')}</h1>
          <p className="text-muted-foreground mt-1">{t('إدارة الربط مع الخدمات والأنظمة الخارجية', 'Manage connections with external services and systems')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((integration) => (
          <Card key={integration.id} className="flex flex-col h-full">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <integration.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{lang === 'ar' ? integration.nameAr : integration.nameEn}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{lang === 'ar' ? integration.categoryAr : integration.categoryEn}</p>
                </div>
              </div>
              <Badge variant={integration.status === 'connected' ? 'default' : 'outline'} 
                     className={integration.status === 'connected' ? 'bg-success hover:bg-success/90' : 'text-muted-foreground border-muted-foreground/30'}>
                {integration.status === 'connected' ? t('متصل', 'Connected') : t('غير متصل', 'Disconnected')}
              </Badge>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col pt-4">
              <p className="text-sm text-foreground/80 leading-relaxed mb-6 flex-1">
                {lang === 'ar' ? integration.descriptionAr : integration.descriptionEn}
              </p>
              
              <div className="mt-auto pt-4 border-t border-border">
                {integration.status === 'connected' ? (
                  <Button variant="outline" className="w-full text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30">
                    {t('إلغاء الربط', 'Disconnect')}
                  </Button>
                ) : (
                  <Button className="w-full gap-2">
                    <Link2 className="h-4 w-4" />
                    {t('إعداد الربط', 'Setup Integration')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}