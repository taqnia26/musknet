import { useLanguage } from '@/hooks/use-language';
import { Link, useLocation } from 'wouter';
import { Button } from './ui/button';
import { ShoppingBag, User, Search, Menu, X, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useGetCart, useListCategories } from '@workspace/api-client-react';
import { RiyalSymbol } from '@/components/money';
import { cn } from '@/lib/utils';

const siteAsset = (filename: string) => `${import.meta.env.BASE_URL}site-assets/${filename}`;

export function Navbar() {
  const { lang, setLang, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const { data: cart } = useGetCart();
  const { data: categories } = useListCategories();

  const isProductRoute = location.startsWith('/products/');

  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);

  const currencies = [
    { code: 'BHD', ar: 'دينار بحريني', en: 'BHD' },
    { code: 'EUR', ar: 'يورو', en: 'EUR' },
    { code: 'GBP', ar: 'جنيه استرليني', en: 'GBP' },
    { code: 'KWD', ar: 'دينار كويتي', en: 'KWD' },
    { code: 'OMR', ar: 'ريال عماني', en: 'OMR' },
    { code: 'QAR', ar: 'ريال قطري', en: 'QAR' },
    { code: 'SAR', ar: 'ريال سعودي', en: 'SAR' },
    { code: 'USD', ar: 'دولار أمريكي', en: 'USD' },
  ];

  const cartItemCount = cart?.itemCount || 0;

  const toggleLang = () => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  };

  const categoryLinks = (categories ?? []).map((category) => ({
    href: `/categories/${category.slug}`,
    ar: category.nameAr,
    en: category.nameEn,
  }));

  const navLinks = [
    { href: '/about', ar: 'من نحن', en: 'About Us' },
    {
      href: '/products',
      ar: 'المنتجات',
      en: 'Products',
      children: categoryLinks,
    },
    { href: '/guarantee', ar: 'الضمان', en: 'Guarantee' },
    { href: '/products-locator/page-13726912', ar: 'وجهاتنا الحصرية', en: 'Exclusive Destinations' },
    { href: '/policy', ar: 'سياساتنا', en: 'Policies' },
  ];

  const topLinks = [
    { href: '/about', ar: 'من نحن', en: 'About Us' },
    { href: '/guarantee', ar: 'الضمان', en: 'Guarantee' },
    { href: '/products-locator/page-13726912', ar: 'وجهاتنا الحصرية', en: 'Exclusive Destinations' },
  ];

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className={cn("w-full flex flex-col", isProductRoute && "product-navbar")}>
      {/* Top Bar */}
      <div className={cn("w-full border-b border-gray-100 bg-white px-4 py-2 text-xs text-gray-500 md:flex md:items-center md:justify-between lg:px-8", isProductRoute ? "flex items-center justify-start" : "hidden")}>
        <div className="flex min-w-0 items-center">
          {topLinks.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              className={`hidden md:inline-flex min-h-8 items-center justify-center px-3 text-center transition-colors hover:text-black ${
                index > 0 ? 'border-s border-gray-300' : ''
              }`}
            >
              {t(link.ar, link.en)}
            </Link>
          ))}
          <button
            onClick={toggleLang}
            className="inline-flex min-h-8 items-center justify-center border-s border-gray-300 px-3 text-center transition-colors hover:text-black"
          >
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>
          {isProductRoute ? (
            <button 
              onClick={() => setIsCurrencyOpen(true)}
              className="inline-flex min-h-8 items-center justify-center border-s border-gray-300 px-3 text-center hover:text-black cursor-pointer"
            >
              <RiyalSymbol className="mx-1" /> {t('ريال سعودي', 'Saudi riyals')}
            </button>
          ) : (
            <span className="inline-flex min-h-8 items-center justify-center border-s border-gray-300 px-3 text-center">
              <RiyalSymbol className="mx-1" /> {t('ريال سعودي', 'Saudi riyals')}
            </span>
          )}
        </div>
        <div className="ms-4 hidden md:flex min-w-0 items-center gap-4">
          <a href="mailto:info@muskellolo.com" className="hover:text-black transition-colors">
            info@muskellolo.com
          </a>
        </div>
      </div>

      {/* Main Header */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 transition-all">
        <div className="grid h-20 min-w-0 grid-cols-[88px_minmax(0,1fr)_88px] items-center px-4 md:h-24 lg:flex lg:justify-between lg:px-8">
          
          {/* Mobile Menu Button */}
          <div className="flex min-w-0 items-center justify-start lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
              data-testid="button-mobile-menu"
              onClick={() => setIsOpen(!isOpen)}
              className="h-11 w-11 shrink-0 text-black"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
            <Link href="/products" aria-label={t('البحث عن المنتجات', 'Search products')} data-testid="link-mobile-search" className="inline-flex h-11 w-11 shrink-0 items-center justify-center"><Search className="h-5 w-5" /></Link>
          </div>

          {/* Logo */}
          <div className="flex min-w-0 items-center justify-center lg:order-1 lg:flex-1 lg:justify-start">
            <Link href="/" className="min-w-0 max-w-full" data-testid="link-storefront-home">
              <img 
                src={siteAsset('Ca44RuZ7R2vL2wTsJKCO2bG6rWGMyqxB0CVdsvxb-63014f950a.png')} 
                alt="Musk Ellolo" 
                className="h-10 max-w-full cursor-pointer object-contain md:h-12"
              />
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="order-2 hidden flex-none items-center justify-center gap-4 text-sm font-medium lg:flex xl:gap-8">
            {navLinks.map((link) => (
              <div key={link.href} className="group relative shrink-0 py-8">
                <Link href={link.href}>
                  <span className={`flex items-center gap-1 whitespace-nowrap transition-colors hover:text-gray-500 cursor-pointer ${location === link.href ? 'text-gray-500' : 'text-black'}`}>
                    {t(link.ar, link.en)}
                    {link.children && <ChevronDown className="h-3.5 w-3.5" />}
                  </span>
                </Link>
                {link.children && (
                  <div className="invisible absolute top-full max-h-80 min-w-52 max-w-[calc(100vw-2rem)] overflow-y-auto border border-gray-100 bg-white py-2 opacity-0 shadow-lg transition-all ltr:left-0 rtl:right-0 group-hover:visible group-hover:opacity-100">
                    {link.children.map((child) => (
                      <Link key={child.href} href={child.href} className="block whitespace-normal break-words px-5 py-3 text-sm text-black hover:bg-gray-50">
                        {t(child.ar, child.en)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex min-w-0 items-center justify-end gap-0 text-black lg:order-3 lg:flex-1 lg:gap-3 xl:gap-5">
            <Link href="/products" aria-label="Search" data-testid="link-desktop-search" className="hidden min-h-11 min-w-11 items-center justify-center p-2 transition-opacity hover:opacity-70 lg:inline-flex">
              <Search className="h-5 w-5" />
            </Link>
            <Link href="/account" aria-label="Account" data-testid="link-storefront-account" className="inline-flex h-11 w-11 shrink-0 items-center justify-center p-2 transition-opacity hover:opacity-70">
              <User className="h-5 w-5" />
            </Link>
            <Link href="/cart" aria-label="Cart" data-testid="link-storefront-cart" className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center p-2 transition-opacity hover:opacity-70">
              <ShoppingBag className="h-5 w-5" />
              {cartItemCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-0.5 text-[0.6rem] font-bold text-white rtl:left-0.5 rtl:right-auto">
                  {cartItemCount > 99 ? '99+' : cartItemCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-5rem)] overflow-y-auto border-t bg-white shadow-lg lg:hidden">
            <nav className="flex flex-col gap-2 p-4">
              {navLinks.map((link) => (
                <div key={link.href}>
                  <Link href={link.href}>
                    <span onClick={() => setIsOpen(false)} className={`flex min-h-11 items-center text-base font-medium transition-colors hover:text-gray-500 cursor-pointer ${location === link.href ? 'text-gray-500' : 'text-black'}`}>
                      {t(link.ar, link.en)}
                    </span>
                  </Link>
                  {link.children && (
                    <div className="mt-1 space-y-1 border-r border-gray-200 pr-4 text-sm text-gray-600">
                      {link.children.map((child) => (
                        <Link key={child.href} href={child.href} onClick={() => setIsOpen(false)} className="flex min-h-10 items-center break-words">
                          {t(child.ar, child.en)}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="mt-2 flex min-w-0 items-center justify-between gap-4 border-t pt-4 text-sm text-gray-500">
                <a href="mailto:info@muskellolo.com">info@muskellolo.com</a>
                <button onClick={() => { toggleLang(); setIsOpen(false); }}>
                  {lang === 'ar' ? 'English' : 'العربية'}
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Currency Bottom Sheet (Mobile) */}
      {isCurrencyOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end items-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsCurrencyOpen(false); }} onKeyDown={(e) => { if (e.key === 'Escape') setIsCurrencyOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="currency-title" className="bg-white rounded-t-3xl md:rounded-3xl w-full md:max-w-md flex flex-col max-h-[85dvh] md:mb-8 animate-in slide-in-from-bottom-full duration-300">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="w-8"></div>
              <h2 id="currency-title" className="font-bold text-lg text-black">{t('العملة', 'Currency')}</h2>
              <button 
                autoFocus
                onClick={() => setIsCurrencyOpen(false)}
                aria-label={t('إغلاق', 'Close')}
                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-black transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="px-5 pt-3 text-sm text-gray-500">{t('الريال السعودي هو العملة الوحيدة المدعومة حالياً', 'SAR is the only currently supported currency')}</p>
            <div className="overflow-y-auto p-2">
              {currencies.map(c => (
                <label 
                  key={c.code} 
                  className={cn(
                    "flex items-center justify-between px-4 py-4 rounded-xl transition-colors",
                    c.code === 'SAR' ? "bg-gray-50 cursor-pointer" : "opacity-50 cursor-not-allowed"
                  )}
                >
                  <span className={cn("text-base", c.code === 'SAR' ? "text-black font-bold" : "text-gray-600")}>
                    {t(c.ar, c.en)} {c.code !== 'SAR' && <span className="text-xs">{t('(غير متاح)', '(Unavailable)')}</span>}
                  </span>
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                    c.code === 'SAR' ? "border-[#050f2c] bg-[#050f2c]" : "border-gray-300"
                  )}>
                    {c.code === 'SAR' && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <input 
                    type="radio" 
                    name="currency" 
                    value={c.code} 
                    checked={c.code === 'SAR'}
                    disabled={c.code !== 'SAR'}
                    onChange={() => {}}
                    className="sr-only"
                  />
                </label>
              ))}
            </div>
            
            <div className="p-5 border-t border-gray-100">
              <Button 
                className="w-full bg-[#050f2c] text-white hover:bg-black font-bold h-14 rounded-xl text-lg" 
                onClick={() => setIsCurrencyOpen(false)}
              >
                {t('تأكيد', 'Confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
