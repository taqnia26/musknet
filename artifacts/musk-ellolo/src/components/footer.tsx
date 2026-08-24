import { useLanguage } from '@/hooks/use-language';
import { Link } from 'wouter';
import { Instagram, Twitter } from 'lucide-react';
import { FaSnapchatGhost, FaTiktok } from 'react-icons/fa';

const siteAsset = (filename: string) => `${import.meta.env.BASE_URL}site-assets/${filename}`;

export function Footer() {
  const { t, lang } = useLanguage();

  return (
    <footer className="w-full bg-black text-white py-16">
      <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-12 lg:gap-8">
        
        {/* Logo and Socials */}
        <div className="lg:col-span-2 space-y-6">
          <Link href="/">
            <img 
              src={siteAsset('Ca44RuZ7R2vL2wTsJKCO2bG6rWGMyqxB0CVdsvxb-63014f950a.png')} 
              alt="Musk Ellolo" 
              className="h-16 object-contain invert brightness-0 filter cursor-pointer"
            />
          </Link>
          
          <div className="flex gap-4">
            <a href="https://www.instagram.com/muskellolo" target="_blank" rel="noopener noreferrer" className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
              <Instagram className="w-5 h-5" />
            </a>
            <a href="https://x.com/muskellolo" target="_blank" rel="noopener noreferrer" className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
              <Twitter className="w-5 h-5" />
            </a>
            <a href="https://www.snapchat.com/add/muskellolo" target="_blank" rel="noopener noreferrer" className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
              <FaSnapchatGhost className="w-5 h-5" />
            </a>
            <a href="https://www.tiktok.com/@muskellolo" target="_blank" rel="noopener noreferrer" className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
              <FaTiktok className="w-5 h-5" />
            </a>
          </div>
        </div>

        {/* Links 1 */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg">{t('روابط مهمة', 'Important Links')}</h3>
          <ul className="space-y-3 text-sm text-gray-400">
            <li><Link href="/about"><span className="hover:text-white transition-colors cursor-pointer">{t('من نحن', 'About Us')}</span></Link></li>
            <li><Link href="/guarantee"><span className="hover:text-white transition-colors cursor-pointer">{t('الضمان', 'Guarantee')}</span></Link></li>
            <li><Link href="/"><span className="hover:text-white transition-colors cursor-pointer">{t('وجهاتنا الحصرية', 'Exclusive Destinations')}</span></Link></li>
            <li><Link href="/policy"><span className="hover:text-white transition-colors cursor-pointer">{t('سياساتنا', 'Our Policies')}</span></Link></li>
            <li><Link href="/privacy"><span className="hover:text-white transition-colors cursor-pointer">{t('المدونة', 'Blog')}</span></Link></li>
            <li><Link href="/privacy"><span className="hover:text-white transition-colors cursor-pointer">{t('سياسة الخصوصية', 'Privacy Policy')}</span></Link></li>
          </ul>
        </div>

        {/* Links 2 */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg">{t('تواصل معنا', 'Contact Us')}</h3>
          <ul className="space-y-3 text-sm text-gray-400">
            <li className="flex items-center gap-2" dir="ltr">
              <span>+966580008874</span>
            </li>
            <li className="flex items-center gap-2">
              <span>info@muskellolo.com</span>
            </li>
          </ul>
        </div>

        {/* Store Info */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-4 bg-white/5 p-4 rounded-lg">
            <img src={siteAsset('tax-6d0afa4ab2.png')} alt="Tax" className="w-10 h-10 object-contain bg-white rounded p-1" />
            <div>
              <p className="text-sm font-bold text-gray-300">{t('الرقم الضريبي', 'Tax Number')}</p>
              <p className="text-sm">310076823100003</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-white/5 p-4 rounded-lg">
            <img src={siteAsset('commercial-register-dd3f1b86d3.png')} alt="CR" className="w-10 h-10 object-contain bg-white rounded p-1" />
            <div>
              <p className="text-sm font-bold text-gray-300">{t('السجل التجاري', 'Commercial Register')}</p>
              <p className="text-sm">1010311811</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Bar */}
      <div dir="ltr" className="container mx-auto px-4 mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-gray-400">
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
