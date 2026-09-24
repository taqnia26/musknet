import { useLanguage } from '@/hooks/use-language';
import { Link, useLocation } from 'wouter';
import { Button } from './ui/button';
import { ShoppingBag, User, Search, Menu, X, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useGetCart, useListCategories } from '@workspace/api-client-react';
import { RiyalSymbol } from '@/components/money';

const siteAsset = (filename: string) => `${import.meta.env.BASE_URL}site-assets/${filename}`;

export function Navbar() {
  const { lang, setLang, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const { data: cart } = useGetCart();
  const { data: categories } = useListCategories();

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
    <div className="w-full flex flex-col">
      {/* Top Bar */}
      <div className="hidden w-full border-b border-gray-100 bg-white px-4 py-2 text-xs text-gray-500 md:flex md:items-center md:justify-between lg:px-8">
        <div className="flex min-w-0 items-center">
          {topLinks.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              className={`inline-flex min-h-8 items-center justify-center px-3 text-center transition-colors hover:text-black ${
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
          <span className="inline-flex min-h-8 items-center justify-center border-s border-gray-300 px-3 text-center">
            <RiyalSymbol className="mx-1" /> {t('ريال سعودي', 'Saudi riyals')}
          </span>
        </div>
        <div className="ms-4 flex min-w-0 items-center gap-4">
          <a href="mailto:info@muskellolo.com" className="hover:text-black transition-colors">
            info@muskellolo.com
          </a>
        </div>
      </div>

      {/* Main Header */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 transition-all">
        <div className="flex h-20 min-w-0 items-center justify-between px-4 md:h-24 lg:px-8">
          
          {/* Mobile Menu Button */}
          <div className="order-3 flex min-w-0 flex-1 justify-end lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setIsOpen(!isOpen)}
              className="min-h-11 min-w-11 text-black"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>

          {/* Logo */}
          <div className="order-2 flex min-w-0 flex-1 justify-start lg:order-1">
            <Link href="/">
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
          <div className="order-1 flex min-w-0 flex-1 items-center justify-end gap-0 text-black md:gap-1 lg:order-3 lg:gap-3 xl:gap-5">
            <button aria-label="Search" className="min-h-11 min-w-11 p-2 transition-opacity hover:opacity-70">
              <Search className="h-5 w-5" />
            </button>
            <Link href="/account" aria-label="Account" className="inline-flex min-h-11 min-w-11 items-center justify-center p-2 transition-opacity hover:opacity-70">
              <User className="h-5 w-5" />
            </Link>
            <Link href="/cart" aria-label="Cart" className="relative inline-flex min-h-11 min-w-11 items-center justify-center p-2 transition-opacity hover:opacity-70">
              <ShoppingBag className="h-5 w-5" />
              {cartItemCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[0.6rem] font-bold text-white rtl:left-0.5 rtl:right-auto">
                  {cartItemCount}
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
    </div>
  );
}
