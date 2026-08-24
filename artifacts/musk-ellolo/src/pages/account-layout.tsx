import { useLanguage } from '@/hooks/use-language';
import { Link, useLocation } from 'wouter';
import { useGetCurrentUser, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import { User, MapPin, Package, LogOut } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect } from 'react';

export function AccountLayout({ children, title }: { children: React.ReactNode, title: string }) {
  const { t } = useLanguage();
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, isError } = useGetCurrentUser({
    query: { retry: false, queryKey: getGetCurrentUserQueryKey() }
  });

  useEffect(() => {
    if (isError) {
      setLocation('/auth/register');
    }
  }, [isError, setLocation]);

  if (isLoading) {
    return <div className="container mx-auto px-4 py-16"><Skeleton className="h-64 w-full rounded-3xl" /></div>;
  }

  if (!user) return null;

  const links = [
    { href: '/account', icon: User, labelAr: 'لوحة التحكم', labelEn: 'Dashboard' },
    { href: '/account/profile', icon: User, labelAr: 'الملف الشخصي', labelEn: 'Profile' },
    { href: '/account/orders', icon: Package, labelAr: 'طلباتي', labelEn: 'My Orders' },
    { href: '/account/addresses', icon: MapPin, labelAr: 'عناويني', labelEn: 'My Addresses' },
  ];

  const handleLogout = () => {
    // In a real app, hit logout endpoint. Since there isn't one, we can just clear cookies or pretend.
    setLocation('/auth/register');
  };

  return (
    <div className="bg-background min-h-[calc(100vh-200px)] py-12 md:py-16">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* Sidebar */}
          <div className="md:col-span-3 space-y-6">
            <div className="bg-card p-6 rounded-2xl border shadow-sm text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-full mx-auto flex items-center justify-center mb-4 text-primary text-2xl font-bold">
                {user.name ? user.name.charAt(0).toUpperCase() : 'M'}
              </div>
              <h2 className="font-bold text-lg">{user.name || t('عميل مسك اللولو', 'Musk Ellolo Customer')}</h2>
              <p className="text-sm text-muted-foreground mt-1" dir="ltr">{user.phone}</p>
            </div>

            <nav className="bg-card rounded-2xl border shadow-sm overflow-hidden flex flex-col">
              {links.map((link) => {
                const isActive = location === link.href;
                const Icon = link.icon;
                return (
                  <Link key={link.href} href={link.href}>
                    <div className={`flex items-center gap-3 px-6 py-4 cursor-pointer transition-colors border-b last:border-0 ${isActive ? 'bg-primary/5 text-primary border-l-4 rtl:border-l-0 rtl:border-r-4 border-primary font-bold' : 'hover:bg-muted/50 text-muted-foreground'}`}>
                      <Icon className="w-5 h-5" />
                      <span>{t(link.labelAr, link.labelEn)}</span>
                    </div>
                  </Link>
                );
              })}
              <button onClick={handleLogout} className="flex items-center gap-3 px-6 py-4 cursor-pointer transition-colors hover:bg-destructive/5 text-destructive border-t">
                <LogOut className="w-5 h-5" />
                <span>{t('تسجيل الخروج', 'Log Out')}</span>
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="md:col-span-9">
            <div className="bg-card p-6 md:p-8 rounded-3xl border shadow-sm min-h-full animate-in fade-in">
              <h1 className="text-2xl font-bold mb-8">{title}</h1>
              {children}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
