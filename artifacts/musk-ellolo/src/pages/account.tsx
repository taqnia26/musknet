import { useLanguage } from '@/hooks/use-language';
import { AccountLayout } from './account-layout';
import { useGetCurrentUser, useListOrders } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Package, Clock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/money';

const orderStatusLabels: Record<string, { ar: string; en: string }> = {
  pending_review: { ar: 'بانتظار المراجعة', en: 'Pending review' },
  preparing: { ar: 'جاري تجهيز الطلب', en: 'Preparing order' },
  out_for_delivery: { ar: 'جاري التوصيل', en: 'Out for delivery' },
  delivered: { ar: 'تم التوصيل', en: 'Delivered' },
  cancelled: { ar: 'ملغي', en: 'Cancelled' },
  returned: { ar: 'مسترجع', en: 'Returned' },
  pending_payment: { ar: 'بانتظار الدفع', en: 'Pending payment' },
};

export default function Account() {
  const { t, lang } = useLanguage();
  const { data: user } = useGetCurrentUser();
  const { data: orders } = useListOrders();

  const recentOrders = orders?.slice(0, 3) || [];

  return (
    <AccountLayout title={t('مرحباً بك مجدداً', 'Welcome Back')}>
      <div className="space-y-10">
        
        {/* Welcome Message */}
        <p className="text-lg text-muted-foreground">
          {t('مرحباً', 'Hello')} <span className="font-bold text-foreground">{user?.name || ''}</span>، {t('من لوحة التحكم الخاصة بك يمكنك عرض أحدث طلباتك وإدارة عناوينك وتفاصيل حسابك.', 'From your dashboard you can view your recent orders and manage your addresses and account details.')}
        </p>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="p-6 bg-background rounded-2xl border flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-2xl">{orders?.length || 0}</p>
              <p className="text-muted-foreground text-sm">{t('إجمالي الطلبات', 'Total Orders')}</p>
            </div>
          </div>
          <div className="p-6 bg-background rounded-2xl border flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 bg-accent/20 text-accent-foreground rounded-full flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-2xl">{orders?.filter(o => !['delivered', 'cancelled', 'returned'].includes(o.status)).length || 0}</p>
              <p className="text-muted-foreground text-sm">{t('طلبات قيد التنفيذ', 'Active Orders')}</p>
            </div>
          </div>
          <div className="p-6 bg-background rounded-2xl border flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 bg-green-100 text-green-700 rounded-full flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-2xl">{user?.phoneVerified ? t('موثق', 'Verified') : t('غير موثق', 'Unverified')}</p>
              <p className="text-muted-foreground text-sm">{t('حالة الحساب', 'Account Status')}</p>
            </div>
          </div>
        </div>

        {/* Recent Orders Snippet */}
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">{t('أحدث الطلبات', 'Recent Orders')}</h2>
            <Link href="/account/orders" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 text-primary">
              {t('عرض الكل', 'View All')}
            </Link>
          </div>
          
          {recentOrders.length > 0 ? (
            <div className="space-y-4">
              {recentOrders.map(order => (
                <div key={order.id} className="flex justify-between items-center p-4 bg-background rounded-xl border">
                  <div>
                    <p className="font-bold">#{order.orderNumber}</p>
                    <p className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleDateString('en-GB')}</p>
                  </div>
                  <div className="text-right">
                    <Money value={order.total} lang={lang} className="font-bold" />
                    <p className="text-sm text-primary">
                      {orderStatusLabels[order.status]
                        ? t(orderStatusLabels[order.status].ar, orderStatusLabels[order.status].en)
                        : order.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center bg-background rounded-xl border border-dashed text-muted-foreground">
              {t('لا توجد طلبات سابقة', 'No previous orders')}
            </div>
          )}
        </div>

      </div>
    </AccountLayout>
  );
}
