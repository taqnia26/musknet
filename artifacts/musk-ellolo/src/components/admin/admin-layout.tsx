import { type ReactNode, useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useGetAdminMe, useAdminLogout, getGetAdminMeQueryKey } from '@workspace/api-client-react';
import { getAdminToken, removeAdminToken } from '@/lib/auth-token';
import { useLanguage } from '@/hooks/use-language';
import { useTheme } from 'next-themes';
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
  FileText,
  ChevronDown,
  MessageCircle,
  Network,
  Moon,
  Sun
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { hasPermission } from '@/lib/permissions';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

// Hierarchical Navigation matching requirements
const navStructure = [
  { href: '/admin', icon: LayoutDashboard, labelEn: 'Dashboard', labelAr: 'لوحة المتابعة', module: 'dashboard', direct: true },
  { href: '/admin/orders', icon: ShoppingCart, labelEn: 'Orders', labelAr: 'الطلبات', module: 'orders', direct: true },
  {
    labelEn: 'Products', labelAr: 'المنتجات', icon: Package, module: 'products',
    children: [
      { href: '/admin/products', labelEn: 'Manage Products', labelAr: 'إدارة المنتجات' },
      { href: '/admin/categories', labelEn: 'Categories', labelAr: 'الفئات', module: 'categories' },
      { href: '/admin/inventory', labelEn: 'Inventory', labelAr: 'المخزون', module: 'inventory' },
    ]
  },
  {
    labelEn: 'Customers', labelAr: 'العملاء', icon: Users, module: 'customers',
    children: [
      { href: '/admin/customers', labelEn: 'Manage Customers', labelAr: 'إدارة العملاء' },
    ]
  },
  {
    labelEn: 'HR', labelAr: 'شؤون الموظفين', icon: Briefcase, module: 'hr',
    children: [
      { href: '/admin/staff', labelEn: 'Manage Staff', labelAr: 'إدارة الموظفين', superAdminOnly: true },
      { href: '/admin/hr', labelEn: 'Attendance & Leaves', labelAr: 'الحضور والإجازات' },
    ]
  },
  {
    labelEn: 'Sales', labelAr: 'المبيعات', icon: Banknote, module: 'orders',
    children: [
      { href: '/admin/coupons', labelEn: 'Coupons', labelAr: 'الكوبونات', module: 'coupons' },
      { href: '/admin/invoices', labelEn: 'Invoices', labelAr: 'الفواتير', module: 'invoices' },
      { href: '/admin/exhibitions', labelEn: 'Exhibitions', labelAr: 'المعارض', module: 'exhibitions' },
    ]
  },
  {
    labelEn: 'Marketing', labelAr: 'التسويق', icon: Tags, module: 'dashboard',
    children: [
      { href: '/admin/marketing', labelEn: 'Campaigns', labelAr: 'الحملات' },
    ]
  },
  {
    labelEn: 'WhatsApp', labelAr: 'الواتساب', icon: MessageCircle, module: 'dashboard',
    children: [
      { href: '/admin/whatsapp/inbox', labelEn: 'Inbox', labelAr: 'صندوق الوارد' },
      { href: '/admin/whatsapp/templates', labelEn: 'Templates', labelAr: 'القوالب' },
      { href: '/admin/whatsapp/settings', labelEn: 'Connection settings', labelAr: 'إعدادات الربط' },
    ]
  },
  { href: '/admin/chatbot', icon: MessageCircle, labelEn: 'Chatbot', labelAr: 'الشات بوت', module: 'dashboard', direct: true },
  {
    labelEn: 'Procurement', labelAr: 'المشتريات', icon: Truck, module: 'inventory',
    children: [
      { href: '/admin/manufacturing', labelEn: 'Manufacturing', labelAr: 'التصنيع', module: 'manufacturing' },
    ]
  },
  {
    labelEn: 'Finance', labelAr: 'المالية', icon: FileText,
    children: [
      { href: '/admin/finance/expenses', labelEn: 'Expenses', labelAr: 'المصروفات', module: 'finance' },
      { href: '/admin/finance/purchases', labelEn: 'Purchases', labelAr: 'المشتريات', module: 'finance' },
      { href: '/admin/finance/reports', labelEn: 'Reports', labelAr: 'التقارير', module: 'finance' },
      { href: '/admin/accounting/accounts', labelEn: 'Accounting', labelAr: 'المحاسبة', module: 'accounting' },
      { href: '/admin/accounting/journal-entries', labelEn: 'Journal entries', labelAr: 'القيود اليومية', module: 'accounting' },
      { href: '/admin/accounting/trial-balance', labelEn: 'Trial balance', labelAr: 'ميزان المراجعة', module: 'accounting' },
    ]
  },
  {
    labelEn: 'B2B', labelAr: 'الجملة B2B', icon: Warehouse, module: 'distributors',
    children: [
      { href: '/admin/distributors', labelEn: 'Distributors', labelAr: 'الموزعين' },
      { href: '/admin/contracts', labelEn: 'Contracts', labelAr: 'العقود', module: 'contracts' },
      { href: '/admin/distributor-catalog', labelEn: 'B2B Catalog', labelAr: 'كتالوج الجملة', module: 'distributors' },
    ]
  },
  {
    labelEn: 'Storefront', labelAr: 'واجهة المتجر', icon: Globe, module: 'site-content',
    children: [
      { href: '/admin/site-content', labelEn: 'Site Content', labelAr: 'محتوى الموقع' },
    ]
  },
  {
    labelEn: 'Integrations', labelAr: 'التكاملات', icon: Network, module: 'dashboard',
    children: [
      { href: '/admin/integrations', labelEn: 'Integrations Shell', labelAr: 'واجهة التكاملات' },
    ]
  },
];

function NavItem({ item, user, location, lang, setOpen }: { item: any, user: any, location: string, lang: string, setOpen?: (open: boolean) => void }) {
  const [isOpen, setIsOpen] = useState(
    item.children?.some((child: any) => location === child.href || (child.href !== '/admin' && location.startsWith(child.href)))
  );

  if (item.superAdminOnly && !user.isSuperAdmin) return null;
  if (item.module && item.module !== 'dashboard' && !hasPermission(user, item.module, 'view')) return null;

  if (item.direct) {
    const isActive = location === item.href || (item.href !== '/admin' && location.startsWith(item.href));
    return (
      <Link href={item.href}>
        <span
          data-active={isActive}
          className={cn(
            "group flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer text-[13.5px]",
            isActive
              ? "bg-accent/10 text-accent font-semibold"
              : "text-sidebar-foreground/75 hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
          )}
          onClick={() => setOpen?.(false)}
        >
          <item.icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors", isActive ? "text-accent" : "text-sidebar-foreground/50 group-hover:text-foreground")} />
          {lang === 'ar' ? item.labelAr : item.labelEn}
        </span>
      </Link>
    );
  }

  // Filter children based on permissions
  const validChildren = item.children?.filter((child: any) => {
    if (child.superAdminOnly && !user.isSuperAdmin) return false;
    if (child.module && child.module !== 'dashboard' && !hasPermission(user, child.module, 'view')) return false;
    return true;
  });

  if (!validChildren || validChildren.length === 0) return null;

  const hasActiveChild = validChildren.some((child: any) => location === child.href || (child.href !== '/admin' && location.startsWith(child.href)));

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <CollapsibleTrigger asChild>
        <div className={cn(
          "group flex items-center justify-between px-3 py-2 rounded-lg transition-all cursor-pointer text-[13.5px]",
          hasActiveChild ? "text-foreground font-semibold" : "text-sidebar-foreground/75 hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
        )}>
          <div className="flex items-center gap-3">
            <item.icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors", hasActiveChild ? "text-accent" : "text-sidebar-foreground/50 group-hover:text-foreground")} />
            {lang === 'ar' ? item.labelAr : item.labelEn}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-sidebar-foreground/40 transition-transform duration-200", isOpen && "rotate-180")} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-9 rtl:pl-0 rtl:pr-9 space-y-0.5 mt-0.5 overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {validChildren.map((child: any) => {
          const isChildActive = location === child.href || (child.href !== '/admin' && location.startsWith(child.href));
          return (
            <Link key={child.href} href={child.href}>
              <span
                className={cn(
                  "block px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer",
                  isChildActive
                    ? "text-accent font-semibold"
                    : "text-sidebar-foreground/60 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                )}
                onClick={() => setOpen?.(false)}
              >
                {lang === 'ar' ? child.labelAr : child.labelEn}
              </span>
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { lang, setLang, t } = useLanguage();
  const { theme, setTheme } = useTheme();
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
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-background"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  if (!user) return null;

  const date = new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="admin-theme flex h-screen min-w-0 flex-col overflow-hidden bg-background font-sans text-foreground transition-colors duration-300"
    >
      {/* Top Header */}
      <header className="z-20 flex h-[60px] min-w-0 shrink-0 items-center justify-between border-b border-sidebar-border bg-card px-3 lg:px-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)] relative">
        {/* Right side (RTL start): System name & Mobile menu trigger */}
        <div className="flex items-center gap-2">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden hover:bg-muted text-muted-foreground shrink-0 h-9 w-9"
                aria-label={t('فتح قائمة الإدارة', 'Open admin navigation')}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={lang === 'ar' ? 'right' : 'left'} className="w-[260px] p-0 flex flex-col admin-theme bg-sidebar border-sidebar-border">
              <div className="flex-1 overflow-y-auto px-3 py-6 scrollbar-thin">
                <div className="mb-6 px-3">
                  <div className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider mb-2">{t('لوحة المتابعة', 'Dashboard')}</div>
                </div>
                <nav className="space-y-1">
                  {navStructure.map((item, i) => (
                    <NavItem key={i} item={item} user={user} location={location} lang={lang} setOpen={setIsOpen} />
                  ))}
                </nav>
              </div>
              <div className="p-4 border-t border-sidebar-border">
                <Link href="/">
                  <Button variant="ghost" className="w-full justify-start gap-2 text-[13px] text-foreground/70 hover:bg-black/5 hover:text-foreground mb-1" onClick={() => setIsOpen(false)}>
                    <Store className="h-4 w-4" />
                    {t('العودة للمتجر', 'Back to Store')}
                  </Button>
                </Link>
                <Link href="/owner/login">
                  <Button variant="ghost" className="w-full justify-start gap-2 text-[13px] text-accent/90 hover:bg-accent/10 hover:text-accent mb-1" onClick={() => setIsOpen(false)}>
                    <UserCog className="h-4 w-4" />
                    {t('بوابة المالك', 'Owner portal')}
                  </Button>
                </Link>
                <Button variant="ghost" className="w-full justify-start gap-2 text-[13px] text-foreground/70 hover:bg-destructive/10 hover:text-destructive" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                  {t('تسجيل الخروج', 'Logout')}
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <div className="hidden lg:flex items-center gap-2">
            <img src="/site-assets/admin-brandmark.png" alt="" className="h-5 w-5 object-contain dark:invert opacity-80 shrink-0" />
            <span className="text-[13px] font-medium text-foreground/80 tracking-wide truncate">{t('نظام إدارة مسك اللولو', 'Musk Ellolo System')}</span>
          </div>
        </div>

        {/* Center: Logo */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none hidden sm:block">
          <img
            src="/site-assets/admin-wordmark-brandguide.png"
            alt="Musk Ellolo"
            className="h-[18px] object-contain dark:invert opacity-90"
          />
        </div>
        <div className="flex-1 flex justify-center sm:hidden pointer-events-none mx-2">
          <img
            src="/site-assets/admin-wordmark-brandguide.png"
            alt="Musk Ellolo"
            className="h-[15px] object-contain dark:invert opacity-90"
          />
        </div>

        {/* Left side (RTL end): Date & User Actions */}
        <div className="flex items-center justify-end gap-1">
          <div className="hidden xl:flex items-center gap-4 text-[11px] font-medium text-muted-foreground mr-4 rtl:mr-0 rtl:ml-4">
            <span className="truncate">{date}</span>
            <div className="h-3 w-px bg-border/60"></div>
          </div>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted"
              onClick={toggleTheme}
              title={t('تغيير المظهر', 'Toggle theme')}
              aria-label={t('تغيير المظهر', 'Toggle theme')}
            >
              <Sun className="h-[15px] w-[15px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-[15px] w-[15px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted"
              onClick={toggleLanguage}
              title={t('تغيير اللغة', 'Toggle language')}
              aria-label={t('تغيير اللغة', 'Toggle language')}
            >
              <Globe className="h-[15px] w-[15px]" />
            </Button>
          </div>

          <div className="h-5 w-px bg-border/60 mx-2"></div>

          <Avatar className="h-7 w-7 ring-2 ring-background cursor-pointer">
            <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* Desktop Sidebar (Right side in RTL naturally due to layout flex order) */}
        <aside className="z-10 hidden w-[240px] shrink-0 flex-col border-e border-sidebar-border bg-sidebar lg:flex shadow-sm">
          <div className="flex-1 overflow-y-auto px-3 py-6 scrollbar-thin">
            <div className="mb-4 px-3 flex items-center justify-between">
              <div className="text-[11px] font-bold text-sidebar-foreground/40 uppercase tracking-wider">{t('لوحة المتابعة', 'Dashboard')}</div>
              <LayoutDashboard className="h-3.5 w-3.5 text-sidebar-foreground/30" />
            </div>
            <nav className="space-y-0.5">
              {navStructure.map((item, i) => (
                <NavItem key={i} item={item} user={user} location={location} lang={lang} />
              ))}
            </nav>
          </div>

          <div className="p-3 border-t border-sidebar-border mt-auto">
            <Link href="/">
              <Button variant="ghost" className="w-full justify-start gap-2 text-[12.5px] font-medium text-sidebar-foreground/70 hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground mb-1">
                <Store className="h-[15px] w-[15px]" />
                {t('العودة للمتجر', 'Back to Store')}
              </Button>
            </Link>
            <Link href="/owner/login">
              <Button variant="ghost" className="w-full justify-start gap-2 text-[12.5px] font-medium text-accent/80 hover:bg-accent/10 hover:text-accent mb-1">
                <UserCog className="h-[15px] w-[15px]" />
                {t('بوابة المالك', 'Owner portal')}
              </Button>
            </Link>
            <Button variant="ghost" className="w-full justify-start gap-2 text-[12.5px] font-medium text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive" onClick={handleLogout}>
              <LogOut className="h-[15px] w-[15px]" />
              {t('تسجيل الخروج', 'Logout')}
            </Button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background">
          <div className="mx-auto w-full min-w-0 max-w-[1600px] p-4 md:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
