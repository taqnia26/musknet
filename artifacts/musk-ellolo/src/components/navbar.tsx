import { useLanguage } from '@/hooks/use-language';
import { Link, useLocation } from 'wouter';
import { Button } from './ui/button';
import { ShoppingBag, User, Search, Menu, X, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useGetCart, useListCategories } from '@workspace/api-client-react';

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
    { href: '/', ar: 'وجهاتنا الحصرية', en: 'Exclusive Destinations' },
    { href: '/policy', ar: 'سياساتنا', en: 'Policies' },
  ];

  const topLinks = [
    { href: '/about', ar: 'من نحن', en: 'About Us' },
    { href: '/guarantee', ar: 'الضمان', en: 'Guarantee' },
    { href: '/', ar: 'وجهاتنا الحصرية', en: 'Exclusive Destinations' },
  ];

  return (
    <div className="w-full flex flex-col">
      {/* Top Bar */}
      <div className="w-full border-b border-gray-100 hidden md:flex items-center justify-between px-4 lg:px-8 py-2 text-xs text-gray-500 bg-white">
        <div className="flex items-center gap-4 divide-x divide-x-reverse divide-gray-300">
          {topLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-black transition-colors px-2 first:pr-0">
              {t(link.ar, link.en)}
            </Link>
          ))}
          <button onClick={toggleLang} className="hover:text-black transition-colors px-2">
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>
          <span className="px-2">
            {t('ريال سعودي', 'SAR')}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a href="mailto:info@muskellolo.com" className="hover:text-black transition-colors">
            info@muskellolo.com
          </a>
        </div>
      </div>

      {/* Main Header */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 transition-all">
        <div className="px-4 lg:px-8 h-20 md:h-24 flex items-center justify-between">
          
          {/* Mobile Menu Button */}
          <div className="flex-1 md:hidden flex justify-end order-3">
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)} className="text-black">
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>

          {/* Logo */}
          <div className="flex-1 flex justify-start order-2 md:order-1">
            <Link href="/">
              <img 
                src={siteAsset('Ca44RuZ7R2vL2wTsJKCO2bG6rWGMyqxB0CVdsvxb-63014f950a.png')} 
                alt="Musk Ellolo" 
                className="h-10 md:h-12 object-contain cursor-pointer"
              />
            </Link>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex flex-none items-center justify-center gap-8 text-sm font-medium order-2">
            {navLinks.map((link) => (
              <div key={link.href} className="relative group py-8">
                <Link href={link.href}>
                  <span className={`flex items-center gap-1 transition-colors hover:text-gray-500 cursor-pointer ${location === link.href ? 'text-gray-500' : 'text-black'}`}>
                    {t(link.ar, link.en)}
                    {link.children && <ChevronDown className="h-3.5 w-3.5" />}
                  </span>
                </Link>
                {link.children && (
                  <div className="invisible absolute right-0 top-full max-h-80 min-w-52 overflow-y-auto border border-gray-100 bg-white py-2 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
                    {link.children.map((child) => (
                      <Link key={child.href} href={child.href} className="block px-5 py-3 text-sm text-black hover:bg-gray-50">
                        {t(child.ar, child.en)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex-1 flex items-center justify-end md:justify-end gap-3 md:gap-5 order-1 md:order-3 text-black">
            <button className="p-2 hover:opacity-70 transition-opacity">
              <Search className="h-5 w-5" />
            </button>
            <Link href="/account" className="p-2 hover:opacity-70 transition-opacity">
              <User className="h-5 w-5" />
            </Link>
            <Link href="/cart" className="p-2 hover:opacity-70 transition-opacity relative">
              <ShoppingBag className="h-5 w-5" />
              {cartItemCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[0.6rem] font-bold text-white">
                  {cartItemCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden border-t bg-white absolute top-full left-0 w-full shadow-lg">
            <nav className="flex flex-col p-4 space-y-4">
              {navLinks.map((link) => (
                <div key={link.href}>
                  <Link href={link.href}>
                    <span onClick={() => setIsOpen(false)} className={`text-base font-medium transition-colors hover:text-gray-500 cursor-pointer block ${location === link.href ? 'text-gray-500' : 'text-black'}`}>
                      {t(link.ar, link.en)}
                    </span>
                  </Link>
                  {link.children && (
                    <div className="mt-3 space-y-3 border-r border-gray-200 pr-4 text-sm text-gray-600">
                      {link.children.map((child) => (
                        <Link key={child.href} href={child.href} onClick={() => setIsOpen(false)}>
                          {t(child.ar, child.en)}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="pt-4 border-t flex justify-between items-center text-sm text-gray-500">
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
