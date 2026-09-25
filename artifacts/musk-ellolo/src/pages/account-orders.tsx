import { useLanguage } from '@/hooks/use-language';
import { AccountLayout } from './account-layout';
import { useListOrders } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PackageX } from 'lucide-react';
import { Link } from 'wouter';
import { Money } from '@/components/money';

export default function Orders() {
  const { t, lang } = useLanguage();
  const { data: orders, isLoading } = useListOrders();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending_review': return 'bg-blue-100 text-blue-800';
      case 'preparing': return 'bg-accent text-accent-foreground';
      case 'out_for_delivery': return 'bg-primary text-primary-foreground';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-destructive/10 text-destructive';
      case 'returned': return 'bg-orange-100 text-orange-800';
      case 'pending_payment': return 'bg-amber-100 text-amber-800';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const statusTranslations: Record<string, { ar: string, en: string }> = {
    pending_review: { ar: 'بانتظار المراجعة', en: 'Pending review' },
    preparing: { ar: 'جاري تجهيز الطلب', en: 'Preparing order' },
    out_for_delivery: { ar: 'جاري التوصيل', en: 'Out for delivery' },
    delivered: { ar: 'تم التوصيل', en: 'Delivered' },
    cancelled: { ar: 'ملغي', en: 'Cancelled' },
    returned: { ar: 'مسترجع', en: 'Returned' },
    pending_payment: { ar: 'بانتظار الدفع', en: 'Pending payment' },
  };

  return (
    <AccountLayout title={t('سجل الطلبات', 'Order History')}>
      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border rounded-2xl border-dashed bg-background">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-muted-foreground mb-4">
            <PackageX className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold mb-2">{t('لا توجد طلبات', 'No Orders Found')}</h3>
          <p className="text-muted-foreground mb-6">
            {t('لم تقم بأي طلبات حتى الآن.', 'You haven\'t placed any orders yet.')}
          </p>
          <Link href="/products" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
            {t('ابدأ التسوق', 'Start Shopping')}
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map(order => {
            const statusText = statusTranslations[order.status] ? t(statusTranslations[order.status].ar, statusTranslations[order.status].en) : order.status;
            return (
              <div key={order.id} className="bg-background border rounded-2xl p-6 space-y-6">
                <div className="flex flex-wrap justify-between items-start gap-4 pb-4 border-b">
                  <div>
                    <h3 className="font-bold text-lg">#{order.orderNumber}</h3>
                    <p className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleDateString('en-GB')}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${getStatusColor(order.status)}`}>
                      {statusText}
                    </span>
                    <Money value={order.total} lang={lang} className="mt-2 font-bold text-lg" />
                  </div>
                </div>
                
                <div className="space-y-4">
                  {order.items?.map((item, idx) => (
                      <div key={idx} className="flex min-w-0 items-center gap-4">
                      <div className="w-16 h-16 bg-white border rounded-lg p-1 shrink-0">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full bg-muted rounded"></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-bold">{item.productName}</p>
                        <p className="text-sm text-muted-foreground">{t('الكمية', 'Qty')}: {item.quantity} × <Money value={item.unitPrice} lang={lang} /></p>
                      </div>
                      <div className="shrink-0 font-bold">
                        <Money value={item.totalPrice} lang={lang} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AccountLayout>
  );
}
