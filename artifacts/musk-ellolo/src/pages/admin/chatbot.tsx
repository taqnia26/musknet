import { useLanguage } from '@/hooks/use-language';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { MessageCircle, CheckCircle2, MessageSquare, Twitter, Instagram } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SiTiktok } from 'react-icons/si';

const platforms = [
  { id: 'whatsapp', nameEn: 'WhatsApp', nameAr: 'واتساب', icon: MessageCircle, interactions: '4,281', status: 'active', color: 'text-green-500' },
  { id: 'tiktok', nameEn: 'TikTok', nameAr: 'تيك توك', icon: SiTiktok, interactions: '1,104', status: 'active', color: 'text-black dark:text-white' },
  { id: 'twitter', nameEn: 'X (Twitter)', nameAr: 'إكس (تويتر)', icon: Twitter, interactions: '852', status: 'paused', color: 'text-black dark:text-white' },
  { id: 'instagram', nameEn: 'Instagram', nameAr: 'انستقرام', icon: Instagram, interactions: '2,943', status: 'active', color: 'text-pink-600' },
];

const autoReplies = [
  { platform: 'whatsapp', triggerAr: 'ترحيب جديد', triggerEn: 'New Welcome', active: true },
  { platform: 'whatsapp', triggerAr: 'استفسار عن الطلب', triggerEn: 'Order Inquiry', active: true },
  { platform: 'whatsapp', triggerAr: 'أوقات العمل', triggerEn: 'Working Hours', active: false },
  
  { platform: 'tiktok', triggerAr: 'ترحيب تيك توك', triggerEn: 'TikTok Welcome', active: true },
  { platform: 'tiktok', triggerAr: 'رابط المتجر', triggerEn: 'Store Link', active: true },
  
  { platform: 'instagram', triggerAr: 'رد الستوري', triggerEn: 'Story Reply', active: true },
  { platform: 'instagram', triggerAr: 'السعر بالخاص', triggerEn: 'Price in DM', active: true },
];

export default function AdminChatbot() {
  const { t, lang } = useLanguage();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('الشات بوت', 'Chatbot')}</h1>
        <p className="text-muted-foreground mt-1">{t('إدارة الردود التلقائية والتواصل الآلي', 'Manage auto-replies and automated communication')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {platforms.map((platform) => (
          <Card key={platform.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <platform.icon className={`h-5 w-5 ${platform.color}`} />
                {lang === 'ar' ? platform.nameAr : platform.nameEn}
              </CardTitle>
              <Badge variant={platform.status === 'active' ? 'default' : 'secondary'} 
                     className={platform.status === 'active' ? 'bg-success hover:bg-success/90' : ''}>
                {platform.status === 'active' ? t('نشط', 'Active') : t('متوقف', 'Paused')}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{platform.interactions}</div>
              <p className="text-xs text-muted-foreground mt-1">{t('تفاعل هذا الشهر', 'Interactions this month')}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="text-lg">{t('الردود التلقائية النشطة', 'Active Auto-replies')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {platforms.filter(p => p.status === 'active').map(platform => (
                  <div key={platform.id} className="p-6">
                    <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
                      <platform.icon className={`h-5 w-5 ${platform.color}`} />
                      {lang === 'ar' ? platform.nameAr : platform.nameEn}
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {autoReplies.filter(r => r.platform === platform.id).map((reply, i) => (
                        <div key={i} className="flex items-center justify-between bg-muted/20 p-4 rounded-xl border border-white/5 shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <MessageSquare className="h-4 w-4 text-primary" />
                            </div>
                            <Label className="font-medium cursor-pointer" htmlFor={`toggle-${platform.id}-${i}`}>
                              {lang === 'ar' ? reply.triggerAr : reply.triggerEn}
                            </Label>
                          </div>
                          <Switch 
                            id={`toggle-${platform.id}-${i}`} 
                            defaultChecked={reply.active} 
                            dir="ltr"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="text-lg">{t('حالة الربط', 'Integration Status')}</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {platforms.map(platform => (
                <div key={`status-${platform.id}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <platform.icon className={`h-5 w-5 ${platform.color}`} />
                    <span className="font-medium">{lang === 'ar' ? platform.nameAr : platform.nameEn}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {platform.status === 'active' ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-success" />
                        <span className="text-sm font-medium text-success">{t('متصل', 'Connected')}</span>
                      </>
                    ) : (
                      <>
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">{t('غير متصل', 'Disconnected')}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}

              <Separator />
              
              <div className="rounded-xl bg-primary/10 border border-primary/20 p-4 text-sm text-primary-foreground/90">
                <p className="font-medium mb-1 text-primary">{t('ملاحظة النظام', 'System Note')}</p>
                {lang === 'ar' 
                  ? 'هذه الواجهة مخصصة للعرض وتفعيل الردود الجاهزة. الربط الفعلي يعتمد على توفر حسابات Meta Business و TikTok Business.'
                  : 'This interface is for managing predefined replies. Actual integration requires Meta Business and TikTok Business accounts.'}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}