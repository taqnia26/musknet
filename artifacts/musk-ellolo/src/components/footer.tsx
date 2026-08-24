import { useLanguage } from '@/hooks/use-language';
import { Link } from 'wouter';

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-primary text-primary-foreground py-16">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="space-y-4">
          <div className="text-2xl tracking-widest font-serif uppercase flex flex-col leading-none">
            <span>Musk<span className="font-sans ml-1 text-sm tracking-normal">ELLOLO</span></span>
            <span className="text-[0.5rem] tracking-[0.2em] font-sans text-muted mt-1">Luxury Perfumes</span>
          </div>
          <p className="text-sm text-primary-foreground/80 max-w-xs">
            {t(
              'نحن نصنع عطوراً استثنائية تجسد الفخامة والأناقة في كل قطرة.',
              'We craft exceptional fragrances that embody luxury and elegance in every drop.'
            )}
          </p>
        </div>

        <div>
          <h3 className="font-bold mb-4">{t('روابط سريعة', 'Quick Links')}</h3>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li><Link href="/products"><span className="hover:text-accent transition-colors cursor-pointer">{t('تسوق الآن', 'Shop Now')}</span></Link></li>
            <li><Link href="/about"><span className="hover:text-accent transition-colors cursor-pointer">{t('قصتنا', 'Our Story')}</span></Link></li>
            <li><Link href="/contact"><span className="hover:text-accent transition-colors cursor-pointer">{t('تواصل معنا', 'Contact Us')}</span></Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold mb-4">{t('خدمة العملاء', 'Customer Service')}</h3>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li><Link href="/account"><span className="hover:text-accent transition-colors cursor-pointer">{t('حسابي', 'My Account')}</span></Link></li>
            <li><Link href="/account/orders"><span className="hover:text-accent transition-colors cursor-pointer">{t('طلباتي', 'My Orders')}</span></Link></li>
            <li><span className="hover:text-accent transition-colors cursor-pointer">{t('سياسة الاسترجاع', 'Return Policy')}</span></li>
            <li><span className="hover:text-accent transition-colors cursor-pointer">{t('الشحن والتوصيل', 'Shipping & Delivery')}</span></li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold mb-4">{t('النشرة البريدية', 'Newsletter')}</h3>
          <p className="text-sm text-primary-foreground/80 mb-4">
            {t('اشترك لتصلك أحدث الإصدارات والعروض الحصرية.', 'Subscribe to receive the latest releases and exclusive offers.')}
          </p>
          <div className="flex">
            <input 
              type="email" 
              placeholder={t('البريد الإلكتروني', 'Email address')} 
              className="bg-primary-foreground/10 border-none px-4 py-2 text-sm flex-1 outline-none focus:ring-1 focus:ring-accent rounded-r-none rounded-l-md rtl:rounded-r-md rtl:rounded-l-none"
            />
            <button className="bg-accent text-accent-foreground px-4 py-2 text-sm font-bold rounded-l-none rounded-r-md rtl:rounded-l-md rtl:rounded-r-none hover:bg-accent/90 transition-colors">
              {t('اشترك', 'Subscribe')}
            </button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 mt-16 pt-8 border-t border-primary-foreground/10 flex flex-col md:flex-row items-center justify-between text-sm text-primary-foreground/60">
        <p>© {new Date().getFullYear()} Musk Ellolo. {t('جميع الحقوق محفوظة.', 'All rights reserved.')}</p>
      </div>
    </footer>
  );
}
