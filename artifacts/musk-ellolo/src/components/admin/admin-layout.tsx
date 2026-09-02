import { type ReactNode, useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useGetAdminMe, useAdminLogout, getGetAdminMeQueryKey } from '@workspace/api-client-react';
import { getAdminToken, removeAdminToken } from '@/lib/auth-token';
import { useLanguage } from '@/hooks/use-language';
import { 
  LayoutDashboard, 
  Package, 
  Tags, 
  ShoppingCart, 
  Ticket, 
  Users, 
  Warehouse, 
  Truck, 
  Briefcase,
  Banknote,
  Factory,
  Store,
  UserCog, 
  LogOut, 
  Globe,
  Menu,
  Moon,
  Sun,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useTheme } from 'next-themes';
import { hasPermission } from '@/lib/permissions';

const navItems = [
  { href: '/admin', icon: LayoutDashboard, labelEn: 'Dashboard', labelAr: 'لوحة القيادة', module: 'dashboard' },
  { href: '/admin/products', icon: Package, labelEn: 'Products', labelAr: 'المنتجات', module: 'products' },
  { href: '/admin/categories', icon: Tags, labelEn: 'Categories', labelAr: 'الأقسام', module: 'categories' },
  { href: '/admin/orders', icon: ShoppingCart, labelEn: 'Orders', labelAr: 'الطلبات', module: 'orders' },
  { href: '/admin/invoices', icon: FileText, labelEn: 'Tax Invoices', labelAr: 'الفواتير الضريبية', module: 'invoices' },
  { href: '/admin/coupons', icon: Ticket, labelEn: 'Coupons', labelAr: 'الكوبونات', module: 'coupons' },
  { href: '/admin/customers', icon: Users, labelEn: 'Customers', labelAr: 'العملاء', module: 'customers' },
  { href: '/admin/inventory', icon: Warehouse, labelEn: 'Inventory', labelAr: 'المخزون', module: 'inventory' },
  { href: '/admin/distributors', icon: Truck, labelEn: 'Distributors', labelAr: 'الموزعين', module: 'distributors' },
  { href: '/admin/hr', icon: Briefcase, labelEn: 'HR', labelAr: 'الموارد البشرية', module: 'hr' },
  { href: '/admin/finance', icon: Banknote, labelEn: 'Finance', labelAr: 'المالية', module: 'finance' },
  { href: '/admin/manufacturing', icon: Factory, labelEn: 'Manufacturing', labelAr: 'التصنيع', module: 'manufacturing' },
  { href: '/admin/exhibitions', icon: Store, labelEn: 'Exhibitions', labelAr: 'المعارض', module: 'exhibitions' },
  { href: '/admin/staff', icon: UserCog, labelEn: 'Staff', labelAr: 'فريق العمل', superAdminOnly: true },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { lang, setLang, t } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const hasToken = !!getAdminToken();

  const { data: user, isLoading, error } = useGetAdminMe({
    query: {
      enabled: hasToken,
      queryKey: getGetAdminMeQueryKey(),
      retry: false
    }
  });

  useEffect(() => {
    if (!hasToken || (error && (error as any).status === 401)) {
      removeAdminToken();
      setLocation('/admin/login');
    }
  }, [hasToken, error, setLocation]);

  const logoutMutation = useAdminLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        removeAdminToken();
        setLocation('/admin/login');
      }
    });
  };

  const toggleLanguage = () => setLang(lang === 'ar' ? 'en' : 'ar');
  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  if (!user) return null;

  const NavLinks = () => (
    <nav className="space-y-1">
      {navItems.map((item) => {
        if (item.superAdminOnly && !user.isSuperAdmin) return null;
        if (item.module && item.module !== 'dashboard' && !hasPermission(user, item.module, 'view')) return null;
        const isActive = location === item.href || (item.href !== '/admin' && location.startsWith(item.href));
        return (
          <Link key={item.href} href={item.href}>
            <span
              data-active={isActive}
              className={`admin-nav-item flex items-center gap-3 px-3 py-2 rounded-md transition-all cursor-pointer ${
                isActive 
                  ? 'bg-[#FDC87F] text-[#313031] shadow-sm' 
                  : 'text-[#E9E6DF]/80 hover:bg-[#FDC87F]/15 hover:text-[#FDC87F]'
              }`}
              onClick={() => setIsOpen(false)}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {lang === 'ar' ? item.labelAr : item.labelEn}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="admin-theme bg-background text-foreground flex h-screen">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-e border-[#D1CABE]/25 bg-[#3D3D3D] text-[#E9E6DF] px-4 py-6 shadow-xl shadow-[#313031]/10">
        <div className="flex items-center justify-center mb-8 px-2">
          <img src="/site-assets/admin-logo.png" alt="Musk Ellolo" className="h-20 w-auto object-contain brightness-0 invert opacity-90" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <div className="pt-4 mt-auto border-t space-y-2">
          <div className="px-3 py-2 text-sm font-medium truncate text-[#E9E6DF]/70">{user.name}</div>
          <Button variant="ghost" className="w-full justify-start gap-2 text-[#E9E6DF] hover:bg-[#731323]/35 hover:text-white" onClick={handleLogout} data-testid="button-admin-logout">
            <LogOut className="h-4 w-4" />
            {t('تسجيل الخروج', 'Logout')}
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={lang === 'ar' ? 'right' : 'left'} className="w-64 p-4 flex flex-col admin-theme border-[#D1CABE]/25 bg-[#3D3D3D] text-[#E9E6DF]">
                <div className="flex items-center justify-center mb-6 mt-4 px-2">
                  <img src="/site-assets/admin-logo.png" alt="Musk Ellolo" className="h-20 w-auto object-contain brightness-0 invert opacity-90" />
                </div>
                <div className="flex-1 overflow-y-auto">
                  <NavLinks />
                </div>
                <div className="pt-4 border-t space-y-2">
                  <div className="px-3 py-2 text-sm font-medium truncate text-[#E9E6DF]/70">{user.name}</div>
                  <Button variant="ghost" className="w-full justify-start gap-2 text-[#E9E6DF] hover:bg-[#731323]/35 hover:text-white" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" />
                    {t('تسجيل الخروج', 'Logout')}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <span className="font-bold text-lg tracking-wider">MUSK ELLOLO</span>
          </div>

          <div className="flex items-center gap-2 ms-auto">
            <Button variant="ghost" size="icon" onClick={toggleLanguage} title={t('تغيير اللغة', 'Toggle Language')}>
              <Globe className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={t('تغيير المظهر', 'Toggle Theme')}
              aria-label={t('تغيير المظهر', 'Toggle Theme')}
              data-testid="button-toggle-theme"
            >
              <Sun className="h-5 w-5 hidden dark:block" />
              <Moon className="h-5 w-5 block dark:hidden" />
            </Button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
