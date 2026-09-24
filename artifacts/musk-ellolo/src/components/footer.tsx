import { useLanguage } from '@/hooks/use-language';
import { Link, useLocation } from 'wouter';
import { Instagram, Twitter } from 'lucide-react';
import { FaSnapchatGhost, FaTiktok } from 'react-icons/fa';
import { cn } from '@/lib/utils';

const siteAsset = (filename: string) => `${import.meta.env.BASE_URL}site-assets/${filename}`;

export function Footer() {
  const { t, lang } = useLanguage();
  const [location] = useLocation();
  const isProductRoute = location.startsWith('/products/');

  return (
    <footer className={cn(
      "w-full min-w-0 overflow-hidden bg-black py-12 text-white md:py-16",
      isProductRoute && "pb-36 lg:pb-12" // Reserve space for mobile fixed bottom bar
    )}>
      <div className="container mx-auto grid min-w-0 grid-cols-1 gap-8 px-4 md:grid-cols-4 md:gap-12 lg:grid-cols-6 lg:gap-8">
        
        {/* Logo and Socials */}
        <div className={cn("lg:col-span-2 space-y-8", isProductRoute ? "text-start" : "text-center")}>
          <Link href="/">
            <img 
              src={siteAsset('Ca44RuZ7R2vL2wTsJKCO2bG6rWGMyqxB0CVdsvxb-63014f950a.png')} 
              alt="Musk Ellolo" 
              className={cn("h-16 object-contain invert brightness-0 filter cursor-pointer", isProductRoute ? "mx-0" : "mx-auto")}
            />
          </Link>
          
          <div className={cn("flex translate-y-4 gap-3", isProductRoute ? "justify-start" : "justify-center")}>
            <a href="https://www.instagram.com/muskellolo" target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20">
              <Instagram className="w-5 h-5" />
            </a>
            <a href="https://x.com/muskellolo" target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20">
              <Twitter className="w-5 h-5" />
            </a>
            <a href="https://www.snapchat.com/add/muskellolo" target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20">
              <FaSnapchatGhost className="w-5 h-5" />
            </a>
            <a href="https://www.tiktok.com/@muskellolo" target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/10 p-2 transition-colors hover:bg-white/20">
              <FaTiktok className="w-5 h-5" />
            </a>
          </div>
        </div>

        {/* Links 1 */}
        <div className={cn("space-y-4", isProductRoute ? "text-start" : "text-center")}>
          <h3 className="font-bold text-lg">{t('روابط مهمة', 'Important Links')}</h3>
          <ul className="space-y-3 text-sm text-gray-400">
            <li><Link href="/about"><span className="hover:text-white transition-colors cursor-pointer">{t('من نحن', 'About Us')}</span></Link></li>
            <li><Link href="/guarantee"><span className="hover:text-white transition-colors cursor-pointer">{t('الضمان', 'Guarantee')}</span></Link></li>
            <li><Link href="/products-locator/page-13726912"><span className="hover:text-white transition-colors cursor-pointer">{t('وجهاتنا الحصرية', 'Exclusive Destinations')}</span></Link></li>
            <li><Link href="/policy"><span className="hover:text-white transition-colors cursor-pointer">{t('سياساتنا', 'Our Policies')}</span></Link></li>
            <li><Link href="/privacy"><span className="hover:text-white transition-colors cursor-pointer">{t('المدونة', 'Blog')}</span></Link></li>
            <li><Link href="/privacy"><span className="hover:text-white transition-colors cursor-pointer">{t('سياسة الخصوصية', 'Privacy Policy')}</span></Link></li>
          </ul>
        </div>

        {/* Links 2 */}
        <div className={cn("space-y-4", isProductRoute ? "text-start" : "text-center")}>
          <h3 className="font-bold text-lg">{t('تواصل معنا', 'Contact Us')}</h3>
          <ul className="space-y-3 text-sm text-gray-400">
            <li className={cn("flex items-center gap-2", isProductRoute ? "justify-start flex-row-reverse" : "justify-center")} dir="ltr">
              <span>+966580008874</span>
            </li>
            <li className={cn("flex items-center gap-2", isProductRoute ? "justify-start" : "justify-center")}>
              <span>info@muskellolo.com</span>
            </li>
          </ul>
        </div>

        {/* Store Info */}
        <div className={cn("lg:col-span-2 space-y-4", isProductRoute ? "text-start" : "text-center")}>
          <div className={cn("flex min-w-0 flex-col items-center gap-3 rounded-lg bg-white/5 p-4 md:flex-row md:gap-4", isProductRoute ? "justify-start" : "justify-center")}>
            <img src={siteAsset('tax-6d0afa4ab2.png')} alt="Tax" className="w-10 h-10 object-contain bg-white rounded p-1" />
            <div className={cn("min-w-0", isProductRoute ? "text-start" : "text-center")}>
              <p className="text-sm font-bold text-gray-300">{t('الرقم الضريبي', 'Tax Number')}</p>
              <p className="text-sm">310076823100003</p>
            </div>
          </div>
          
          <div className={cn("flex min-w-0 flex-col items-center gap-3 rounded-lg bg-white/5 p-4 md:flex-row md:gap-4", isProductRoute ? "justify-start" : "justify-center")}>
            <img src={siteAsset('commercial-register-dd3f1b86d3.png')} alt="CR" className="w-10 h-10 object-contain bg-white rounded p-1" />
            <div className={cn("min-w-0", isProductRoute ? "text-start" : "text-center")}>
              <p className="text-sm font-bold text-gray-300">{t('السجل التجاري', 'Commercial Register')}</p>
              <p className="text-sm">1010311811</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Bar */}
      <div dir="ltr" className="container mx-auto mt-10 flex min-w-0 flex-col items-center justify-between gap-6 border-t border-white/10 px-4 pt-8 text-center text-sm text-gray-400 md:mt-12 md:flex-row">
        <div className="flex flex-wrap items-center justify-center gap-2.5" aria-label={t('وسائل الدفع المتاحة', 'Available payment methods')}>
          <span className="flex h-10 min-w-[58px] items-center justify-center rounded-lg bg-white px-2 shadow-sm">
            <img src={siteAsset('tamara_installment_mini-3e289e2b2d.png')} alt="Tamara" className="h-8 w-8 object-contain" />
          </span>
          <span className="flex h-10 min-w-[58px] items-center justify-center rounded-lg bg-white px-2 shadow-sm">
            <img src={siteAsset('apple_pay_mini-d0248050e5.png')} alt="Apple Pay" className="h-7 max-w-[50px] object-contain" />
          </span>
          <span className="flex h-10 min-w-[58px] items-center justify-center rounded-lg bg-white px-2 shadow-sm">
            <img src={siteAsset('bank_mini-22fc73a5e1.png')} alt={t('تحويل بنكي', 'Bank transfer')} className="h-7 max-w-[50px] object-contain" />
          </span>
          <span className="flex h-10 min-w-[58px] items-center justify-center rounded-lg bg-white px-2 shadow-sm">
            <img src={siteAsset('credit_card_mini-5100cae3e8.png')} alt="Visa and Mastercard" className="h-7 max-w-[50px] object-contain" />
          </span>
          <span className="flex h-10 min-w-[58px] items-center justify-center rounded-lg bg-white px-2 shadow-sm">
            <img src={siteAsset('mada_mini-5dea0b2d68.png')} alt="Mada" className="h-7 max-w-[50px] object-contain" />
          </span>
        </div>
        <p dir={lang}>MUSKELLOLO 2026 | {t('جميع الحقوق محفوظة', 'All rights reserved')}</p>
      </div>
    </footer>
  );
}
