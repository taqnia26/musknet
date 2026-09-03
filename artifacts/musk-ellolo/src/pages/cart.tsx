import { useGetCart, useUpdateCartItem, useRemoveCartItem, getGetCartQueryKey } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Minus, Plus, Trash2, ShoppingBag, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function Cart() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { data: cart, isLoading } = useGetCart();
  
  const updateItemMutation = useUpdateCartItem();
  const removeItemMutation = useRemoveCartItem();

  const handleUpdateQuantity = (itemId: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    updateItemMutation.mutate({ itemId, data: { quantity: newQuantity } }, {
      onSuccess: (updatedCart) => {
        queryClient.setQueryData(getGetCartQueryKey(), updatedCart);
      }
    });
  };

  const handleRemove = (itemId: number) => {
    removeItemMutation.mutate({ itemId }, {
      onSuccess: (updatedCart) => {
        queryClient.setQueryData(getGetCartQueryKey(), updatedCart);
      }
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <Skeleton className="h-10 w-48 mb-8" />
        <div className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  const items = cart?.items || [];
  const isEmpty = items.length === 0;

  if (isEmpty) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-6">
        <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center text-muted-foreground mb-4">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold">{t('عربة التسوق فارغة', 'Your Cart is Empty')}</h1>
        <p className="text-muted-foreground max-w-md">
          {t('لم تقم بإضافة أي منتجات لعربة التسوق حتى الآن. استكشف مجموعتنا الفاخرة.', 'You have not added any products to your cart yet. Explore our luxury collection.')}
        </p>
        <Link href="/products" className="inline-flex items-center justify-center whitespace-nowrap font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 rounded-full text-base mt-4">
          {t('تسوق الآن', 'Shop Now')}
        </Link>
      </div>
    );
  }

  const activeCart = cart!;

  return (
    <div className="container mx-auto min-w-0 max-w-5xl px-4 py-12 animate-in fade-in duration-500 md:py-20">
      <h1 className="text-3xl md:text-4xl font-bold mb-10 text-foreground">
        {t('عربة التسوق', 'Shopping Cart')} <span className="text-muted-foreground font-normal text-xl">({activeCart.itemCount})</span>
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-6">
          {items.map((item) => (
            <div key={item.id} className="flex min-w-0 gap-3 rounded-2xl border bg-card p-3 md:gap-6 md:p-6">
              <Link href={`/products/${item.product.slug}`} className="shrink-0 block">
                <div className="w-24 h-24 md:w-32 md:h-32 bg-white rounded-xl flex items-center justify-center p-2 border">
                  <img 
                    src={item.product.imageUrl || "/api/media/Perfume-01_1787598876724.jpg"} 
                    alt={t(item.product.nameAr, item.product.nameEn)}
                    className="w-full h-full object-contain"
                  />
                </div>
              </Link>
              
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-lg leading-tight hover:underline cursor-pointer">
                      <Link href={`/products/${item.product.slug}`}>
                        {t(item.product.nameAr, item.product.nameEn)}
                      </Link>
                    </h3>
                    <p className="text-muted-foreground text-sm mt-1">{item.product.price} {t('ر.س', 'SAR')}</p>
                  </div>
                  <button 
                    onClick={() => handleRemove(item.id)}
                    aria-label={t('حذف المنتج', 'Remove product')}
                    className="min-h-11 min-w-11 shrink-0 p-2 text-muted-foreground transition-colors hover:text-destructive"
                    disabled={removeItemMutation.isPending}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center border rounded-full bg-background h-10 w-32">
                    <button 
                      className="px-3 h-full flex items-center justify-center hover:bg-muted/50 rounded-l-full rtl:rounded-l-none rtl:rounded-r-full"
                      onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 1 || updateItemMutation.isPending}
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="flex-1 text-center font-bold text-sm">{item.quantity}</span>
                    <button 
                      className="px-3 h-full flex items-center justify-center hover:bg-muted/50 rounded-r-full rtl:rounded-r-none rtl:rounded-l-full"
                      onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                      disabled={updateItemMutation.isPending || item.quantity >= item.product.stock}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="font-bold text-lg">
                    {item.lineTotal} {t('ر.س', 'SAR')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-1">
          <div className="space-y-6 rounded-2xl border bg-card p-6 md:p-8 lg:sticky lg:top-28">
            <h2 className="text-xl font-bold border-b pb-4">{t('ملخص الطلب', 'Order Summary')}</h2>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('المجموع الفرعي', 'Subtotal')}</span>
                <span className="font-bold">{activeCart.subtotal} {t('ر.س', 'SAR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('الشحن', 'Shipping')}</span>
                <span>{t('يحسب في الدفع', 'Calculated at checkout')}</span>
              </div>
            </div>
            
            <div className="border-t pt-4 flex justify-between items-center text-lg">
              <span className="font-bold">{t('الإجمالي', 'Total')}</span>
                <span className="font-bold">{activeCart.subtotal} {t('ر.س', 'SAR')}</span>
            </div>

            <Link href="/checkout" className="inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 h-14 px-8 rounded-full text-base w-full mt-4">
              {t('متابعة الدفع', 'Proceed to Checkout')}
            </Link>
            
            <div className="text-xs text-center text-muted-foreground mt-4 flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4" /> 
              {t('تسوق آمن ومشفر', 'Secure & Encrypted Checkout')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
