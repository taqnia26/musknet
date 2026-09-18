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
            "admin-nav-item flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all cursor-pointer",
            isActive
              ? "bg-primary text-primary-foreground shadow-sm font-semibold"
              : "text-sidebar-foreground hover:bg-white/10"
          )}
          onClick={() => setOpen?.(false)}
        >
          <item.icon className="h-5 w-5 shrink-0" />
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
          "flex items-center justify-between px-4 py-2.5 rounded-xl transition-all cursor-pointer text-sidebar-foreground hover:bg-black/5 dark:hover:bg-white/10",
          hasActiveChild && "text-primary font-medium"
        )}>
          <div className="flex items-center gap-3">
            <item.icon className={cn("h-5 w-5 shrink-0", hasActiveChild && "text-primary")} />
            {lang === 'ar' ? item.labelAr : item.labelEn}
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6 rtl:pl-0 rtl:pr-6 space-y-1 mt-1 overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {validChildren.map((child: any) => {
          const isChildActive = location === child.href || (child.href !== '/admin' && location.startsWith(child.href));
          return (
            <Link key={child.href} href={child.href}>
              <span
                className={cn(
                  "block px-4 py-2 text-sm rounded-lg transition-colors cursor-pointer",
                  isChildActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-sidebar-foreground/80 hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground dark:hover:text-white"
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

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  if (!user) return null;

  return (
    <div className="admin-theme flex h-screen min-w-0 overflow-hidden bg-background font-sans text-foreground">
      {/* Desktop Sidebar */}
      <aside className="z-10 hidden w-72 shrink-0 flex-col border-e border-border dark:border-white/10 bg-sidebar shadow-xl lg:flex">
        <div className="flex items-center gap-3 px-6 py-8">
          <div className="flex min-w-0 flex-col items-start gap-2">
            <img
              src="/site-assets/admin-wordmark-brandguide.png"
              alt="Musk Ellolo"
              className="h-auto max-h-12 w-full max-w-[205px] object-contain object-left dark:invert"
            />
            <span className="text-xs text-sidebar-foreground/55">{t('لوحة الإدارة', 'Admin Panel')}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 scrollbar-thin">
          <nav className="space-y-1.5">
            {navStructure.map((item, i) => (
              <NavItem key={i} item={item} user={user} location={location} lang={lang} />
            ))}
          </nav>
        </div>

        <div className="p-4 mt-auto border-t border-border dark:border-white/10">
          <div className="bg-black/5 dark:bg-white/5 rounded-xl p-3 mb-3">
            <div className="text-sm font-medium text-foreground dark:text-white truncate">{user.name}</div>
            <div className="text-xs text-muted-foreground dark:text-white/50 truncate">{user.email}</div>
          </div>
          <Link href="/">
            <Button variant="ghost" className="w-full justify-start gap-2 text-foreground/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground dark:hover:text-white mb-1">
              <Store className="h-4 w-4" />
              {t('العودة للمتجر', 'Back to Store')}
            </Button>
          </Link>
          <Link href="/owner/login">
            <Button variant="ghost" className="w-full justify-start gap-2 text-primary/80 hover:bg-primary/10 hover:text-primary mb-1">
              <UserCog className="h-4 w-4" />
              {t('بوابة المالك', 'Owner portal')}
            </Button>
          </Link>
          <div className="h-px bg-border dark:bg-white/10 my-1 mx-2"></div>
          <Button variant="ghost" className="w-full justify-start gap-2 text-foreground/70 dark:text-white/70 hover:bg-destructive/20 hover:text-destructive" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            {t('تسجيل الخروج', 'Logout')}
          </Button>
        </div>
      </aside>

      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="z-20 flex h-16 min-w-0 shrink-0 items-center justify-between border-b bg-card px-4 lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="hover:bg-muted">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={lang === 'ar' ? 'right' : 'left'} className="w-72 p-0 flex flex-col admin-theme bg-sidebar border-border dark:border-white/10">
                <div className="flex items-center gap-3 px-6 py-8 border-b border-border dark:border-white/10">
                  <div className="flex min-w-0 flex-col items-start gap-2">
                    <img
                      src="/site-assets/admin-wordmark-brandguide.png"
                      alt="Musk Ellolo"
                      className="h-auto max-h-10 w-full max-w-[190px] object-contain object-left dark:invert"
                    />
                    <span className="text-xs text-sidebar-foreground/55">{t('لوحة الإدارة', 'Admin Panel')}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
                  <nav className="space-y-1.5">
                    {navStructure.map((item, i) => (
                      <NavItem key={i} item={item} user={user} location={location} lang={lang} setOpen={setIsOpen} />
                    ))}
                  </nav>
                </div>

                <div className="p-4 border-t border-border dark:border-white/10">
                  <Link href="/">
                    <Button variant="ghost" className="w-full justify-start gap-2 text-foreground/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground dark:hover:text-white mb-1" onClick={() => setIsOpen(false)}>
                      <Store className="h-4 w-4" />
                      {t('العودة للمتجر', 'Back to Store')}
                    </Button>
                  </Link>
                  <Link href="/owner/login">
                    <Button variant="ghost" className="w-full justify-start gap-2 text-primary/80 hover:bg-primary/10 hover:text-primary mb-1" onClick={() => setIsOpen(false)}>
                      <UserCog className="h-4 w-4" />
                      {t('بوابة المالك', 'Owner portal')}
                    </Button>
                  </Link>
                  <Button variant="ghost" className="w-full justify-start gap-2 text-foreground/70 dark:text-white/70 hover:bg-destructive/20 hover:text-destructive" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" />
                    {t('تسجيل الخروج', 'Logout')}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <img
              src="/site-assets/admin-wordmark-brandguide.png"
              alt="Musk Ellolo"
              className="ms-2 h-7 w-36 object-contain object-left dark:invert"
            />
          </div>

          <div className="hidden lg:flex items-center text-sm font-medium text-muted-foreground">
            {new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>

          <div className="ms-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={t('تغيير المظهر', 'Toggle Theme')}
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
            <Button variant="ghost" size="icon" className="min-h-11 min-w-11 rounded-full text-muted-foreground hover:text-foreground" onClick={toggleLanguage} title={t('تغيير اللغة', 'Toggle Language')}>
              <Globe className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Content */}
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background/50">
          <div className="mx-auto w-full min-w-0 max-w-7xl p-4 md:p-6 lg:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
