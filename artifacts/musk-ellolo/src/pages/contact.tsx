import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Phone, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export default function Contact() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      toast({
        title: t('تم الإرسال بنجاح', 'Message Sent Successfully'),
        description: t('سنقوم بالرد عليك في أقرب وقت ممكن.', 'We will get back to you as soon as possible.'),
      });
      (e.target as HTMLFormElement).reset();
    }, 1000);
  };

  return (
    <div className="w-full bg-background animate-in fade-in duration-500 min-h-[calc(100vh-200px)]">
      
      <div className="bg-card py-16 md:py-24 border-b">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 text-foreground">
            {t('تواصل معنا', 'Contact Us')}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t('نحن هنا لمساعدتك والإجابة على كافة استفساراتك حول منتجات مسك اللولو.', 'We are here to help and answer all your inquiries about Musk Ellolo products.')}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 md:py-24 max-w-6xl">
        <div className="grid md:grid-cols-2 gap-16 lg:gap-24">
          
          {/* Contact Info */}
          <div className="space-y-12">
            <div className="space-y-8">
              <h2 className="text-2xl font-bold">{t('معلومات التواصل', 'Contact Information')}</h2>
              
              <div className="flex items-start gap-6">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent-foreground shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">{t('العنوان', 'Address')}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {t('المملكة العربية السعودية، الرياض', 'Kingdom of Saudi Arabia, Riyadh')}<br/>
                    {t('شارع التحلية، مجمع الفخامة', 'Tahlia Street, Luxury Complex')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-6">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent-foreground shrink-0">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">{t('رقم الهاتف', 'Phone')}</h3>
                  <p className="text-muted-foreground" dir="ltr">+966 50 123 4567</p>
                </div>
              </div>

              <div className="flex items-start gap-6">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent-foreground shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-1">{t('البريد الإلكتروني', 'Email')}</h3>
                  <p className="text-muted-foreground" dir="ltr">info@muskellolo.com</p>
                </div>
              </div>
            </div>

            <div className="p-8 bg-card rounded-2xl border space-y-4">
              <h3 className="font-bold text-lg">{t('ساعات العمل', 'Working Hours')}</h3>
              <div className="flex justify-between text-muted-foreground">
                <span>{t('الأحد - الخميس', 'Sunday - Thursday')}</span>
                <span>9:00 AM - 10:00 PM</span>
              </div>
              <div className="flex justify-between text-muted-foreground border-t pt-4">
                <span>{t('الجمعة - السبت', 'Friday - Saturday')}</span>
                <span>4:00 PM - 11:00 PM</span>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="bg-card p-8 md:p-10 rounded-3xl shadow-sm border">
            <h2 className="text-2xl font-bold mb-8">{t('أرسل رسالة', 'Send a Message')}</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold">{t('الاسم الكريم', 'Full Name')}</label>
                <Input required placeholder={t('أدخل اسمك', 'Enter your name')} className="h-14 bg-background" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold">{t('البريد الإلكتروني', 'Email Address')}</label>
                <Input required type="email" placeholder={t('أدخل بريدك الإلكتروني', 'Enter your email')} className="h-14 bg-background" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold">{t('رقم الهاتف', 'Phone Number')}</label>
                <Input required type="tel" placeholder={t('أدخل رقم هاتفك', 'Enter your phone number')} className="h-14 bg-background" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold">{t('الرسالة', 'Message')}</label>
                <textarea 
                  required
                  className="flex w-full rounded-md border border-input bg-background px-3 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[150px] resize-none"
                  placeholder={t('كيف يمكننا مساعدتك؟', 'How can we help you?')}
                ></textarea>
              </div>
              <Button type="submit" size="lg" className="w-full h-14 rounded-full text-lg" disabled={isSubmitting}>
                {isSubmitting ? t('جاري الإرسال...', 'Sending...') : t('إرسال الرسالة', 'Send Message')}
              </Button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
