import { useLanguage } from '@/hooks/use-language';
import { Link, useLocation } from 'wouter';
import { Button } from './ui/button';
import { ShoppingBag, User, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useGetCart } from '@workspace/api-client-react';

export function Navbar() {
  const { lang, setLang, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const { data: cart } = useGetCart();

  const cartItemCount = cart?.itemCount || 0;

  const toggleLang = () => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  };

  const navLinks = [
    { href: '/', ar: 'الرئيسية', en: 'Home' },
    { href: '/products', ar: 'العطور', en: 'Perfumes' },
    { href: '/about', ar: 'قصتنا', en: 'Our Story' },
    { href: '/contact', ar: 'تواصل معنا', en: 'Contact' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        
        {/* Mobile Menu Button */}
        <div className="flex-1 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden md:flex flex-1 items-center gap-8 text-sm font-medium">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <span className={`transition-colors hover:text-accent cursor-pointer ${location === link.href ? 'text-accent' : 'text-foreground'}`}>
                {t(link.ar, link.en)}
              </span>
            </Link>
          ))}
        </nav>

        {/* Logo */}
        <div className="flex-1 flex justify-center md:flex-none">
          <Link href="/">
            <span className="text-2xl tracking-widest font-serif uppercase cursor-pointer flex flex-col items-center leading-none">
              <span>Musk<span className="font-sans ml-1 text-sm tracking-normal">ELLOLO</span></span>
              <span className="text-[0.5rem] tracking-[0.2em] font-sans text-muted-foreground mt-1">Luxury Perfumes</span>
            </span>
          </Link>
        </div>

        {/* Actions */}
        <div className="flex-1 flex items-center justify-end gap-4">
          <Button variant="ghost" size="sm" onClick={toggleLang} className="hidden md:inline-flex font-sans">
            {lang === 'ar' ? 'EN' : 'عربي'}
          </Button>
          
          <Link href="/account" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-10 w-10">
            <User className="h-5 w-5" />
          </Link>
          
          <Link href="/cart" className="relative inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-10 w-10">
            <ShoppingBag className="h-5 w-5" />
            {cartItemCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[0.6rem] font-bold text-accent-foreground">
                {cartItemCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden border-t bg-background">
          <nav className="flex flex-col p-4 space-y-4">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <span onClick={() => setIsOpen(false)} className={`text-lg transition-colors hover:text-accent cursor-pointer block ${location === link.href ? 'text-accent' : 'text-foreground'}`}>
                  {t(link.ar, link.en)}
                </span>
              </Link>
            ))}
            <div className="pt-4 border-t flex justify-between items-center">
              <span>{t('تغيير اللغة', 'Change Language')}</span>
              <Button variant="outline" size="sm" onClick={() => { toggleLang(); setIsOpen(false); }}>
                {lang === 'ar' ? 'English' : 'العربية'}
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
