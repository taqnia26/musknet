import { useGetCart, useGetCheckoutQuote, useCreateOrder, useValidateCoupon } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ChevronRight, ShieldCheck, Tag } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const addressSchema = z.object({
  label: z.string().min(1, 'مطلوب / Required'),
  city: z.string().min(2, 'مطلوب / Required'),
  district: z.string().min(2, 'مطلوب / Required'),
  street: z.string().min(2, 'مطلوب / Required'),
  buildingNo: z.string().min(1, 'مطلوب / Required'),
  additionalInfo: z.string().optional(),
});

type AddressFormValues = z.infer<typeof addressSchema>;

export default function Checkout() {
  const { t, lang } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: cart, isLoading: isLoadingCart } = useGetCart();
  
  const [couponCode, setCouponCode] = useState('');
  const [activeCoupon, setActiveCoupon] = useState<string | null>(null);
  const [shippingMethod, setShippingMethod] = useState('storage-station-standard');
  const [paymentMethod, setPaymentMethod] = useState<'moyasar' | 'tabby' | 'tamara'>('moyasar');

  const validateCoupon = useValidateCoupon();
  const createOrder = useCreateOrder();

  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: 'المنزل',
      city: 'الرياض',
      district: '',
      street: '',
      buildingNo: '',
      additionalInfo: ''
    }
  });

  const {
    data: quote,
    isPending: isLoadingQuote,
    mutate: requestCheckoutQuote,
  } = useGetCheckoutQuote();
  const city = form.watch('city');

  useEffect(() => {
    if (cart && cart.items.length > 0 && city.trim().length >= 2) {
      requestCheckoutQuote({ data: { city, couponCode: activeCoupon } });
    }
  }, [activeCoupon, cart?.id, city, requestCheckoutQuote]);

  // Redirect if cart empty
  useEffect(() => {
    if (!isLoadingCart && (!cart || cart.items.length === 0)) {
      setLocation('/cart');
    }
  }, [cart, isLoadingCart, setLocation]);

  const handleApplyCoupon = () => {
    if (!couponCode) return;
    validateCoupon.mutate({ data: { code: couponCode, subtotal: cart?.subtotal || 0 } }, {
      onSuccess: (res) => {
        if (res.valid) {
          setActiveCoupon(res.code || couponCode);
          toast({ title: t('تم تفعيل الكوبون', 'Coupon Applied'), description: res.message });
        } else {
          toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: res.message });
        }
      }
    });
  };

  const onSubmit = (data: AddressFormValues) => {
    if (!quote) return;
    
    createOrder.mutate({
      data: {
        address: data,
        shippingMethod,
        paymentMethod,
        couponCode: activeCoupon
      }
    }, {
      onSuccess: (order) => {
        toast({ title: t('تم تأكيد الطلب بنجاح!', 'Order Confirmed!'), description: `${t('رقم الطلب', 'Order No')}: ${order.orderNumber}` });
        setLocation(`/account/orders`);
      },
      onError: () => {
        toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: t('حدث خطأ أثناء إتمام الطلب', 'An error occurred during checkout') });
      }
    });
  };

  if (isLoadingCart || isLoadingQuote || !cart || cart.items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-6xl grid md:grid-cols-2 gap-12">
        <div className="space-y-8"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>
        <div className="space-y-8"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-96 w-full" /></div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto px-4 py-8 md:py-12 max-w-6xl">
        
        <h1 className="text-3xl font-bold mb-8 text-foreground">{t('إتمام الطلب', 'Checkout')}</h1>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 flex-col-reverse lg:flex-row">
          
          {/* Left Column - Form */}
          <div className="lg:col-span-7 space-y-10 order-2 lg:order-1">
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
                
                {/* Shipping Address */}
                <section className="bg-card p-6 md:p-8 rounded-2xl border shadow-sm">
                  <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                    {t('عنوان التوصيل', 'Shipping Address')}
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="city" render={({ field }) => (
                      <FormItem><FormLabel>{t('المدينة', 'City')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="district" render={({ field }) => (
                      <FormItem><FormLabel>{t('الحي', 'District')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="street" render={({ field }) => (
                      <FormItem><FormLabel>{t('الشارع', 'Street')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="buildingNo" render={({ field }) => (
                      <FormItem><FormLabel>{t('رقم المبنى', 'Building No')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="label" render={({ field }) => (
                      <FormItem className="md:col-span-2"><FormLabel>{t('اسم العنوان (المنزل، العمل)', 'Address Label')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="additionalInfo" render={({ field }) => (
                      <FormItem className="md:col-span-2"><FormLabel>{t('معلومات إضافية (اختياري)', 'Additional Info (Optional)')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </section>

                {/* Shipping Method */}
                <section className="bg-card p-6 md:p-8 rounded-2xl border shadow-sm">
                  <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                    {t('طريقة التوصيل', 'Shipping Method')}
                  </h2>
                  <div className="space-y-3">
                    {quote?.shippingMethods?.map(method => (
                      <label key={method.id} className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-colors ${shippingMethod === method.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/50'}`}>
                        <div className="flex items-center gap-3">
                          <input type="radio" name="shippingMethod" value={method.id} checked={shippingMethod === method.id} onChange={(e) => setShippingMethod(e.target.value)} className="w-4 h-4 text-primary" />
                          <div>
                            <p className="font-bold text-sm">{method.name}</p>
                            <p className="text-xs text-muted-foreground">{method.estimatedDays}</p>
                          </div>
                        </div>
                        <span className="font-bold text-sm">{method.price === 0 ? t('مجاناً', 'Free') : `${method.price} ${t('ر.س', 'SAR')}`}</span>
                      </label>
                    ))}
                  </div>
                </section>

                {/* Payment Method */}
                <section className="bg-card p-6 md:p-8 rounded-2xl border shadow-sm">
                  <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-sm">3</span>
                    {t('طريقة الدفع', 'Payment Method')}
                  </h2>
                  <div className="space-y-3">
                    {quote?.paymentMethods?.map(method => (
                      <label key={method.id} className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-colors ${!method.available ? 'opacity-50 cursor-not-allowed' : ''} ${paymentMethod === method.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/50'}`}>
                        <div className="flex items-center gap-3">
                          <input type="radio" name="paymentMethod" value={method.id} checked={paymentMethod === method.id} onChange={(e) => setPaymentMethod(e.target.value as any)} disabled={!method.available} className="w-4 h-4 text-primary" />
                          <div>
                            <p className="font-bold text-sm">{method.name}</p>
                            {method.description && <p className="text-xs text-muted-foreground">{method.description}</p>}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </section>

                <Button type="submit" size="lg" className="w-full h-14 text-lg rounded-full" disabled={createOrder.isPending}>
                  {createOrder.isPending ? t('جاري التنفيذ...', 'Processing...') : t('تأكيد الطلب والدفع', 'Confirm Order & Pay')}
                </Button>
              </form>
            </Form>
          </div>

          {/* Right Column - Summary */}
          <div className="lg:col-span-5 order-1 lg:order-2">
            <div className="bg-card border rounded-2xl p-6 md:p-8 sticky top-28 shadow-sm">
              <h2 className="text-xl font-bold border-b pb-4 mb-6">{t('ملخص الطلب', 'Order Summary')}</h2>
              
              <div className="space-y-4 mb-6 max-h-[40vh] overflow-auto scrollbar-hide pr-2 rtl:pr-0 rtl:pl-2">
                {cart.items.map(item => (
                  <div key={item.id} className="flex gap-4 items-center">
                    <div className="relative w-16 h-16 bg-white rounded-md border p-1 shrink-0">
                      <img src={item.product.imageUrl} className="w-full h-full object-contain" alt="" />
                      <span className="absolute -top-2 -right-2 rtl:-left-2 rtl:-right-auto bg-primary text-primary-foreground text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">{item.quantity}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm line-clamp-1">{t(item.product.nameAr, item.product.nameEn)}</p>
                      <p className="text-muted-foreground text-xs">{item.lineTotal} {t('ر.س', 'SAR')}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon */}
              <div className="flex gap-2 mb-6 border-b pb-6">
                <Input 
                  placeholder={t('كود الخصم', 'Discount Code')} 
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  disabled={!!activeCoupon}
                  className="bg-background"
                />
                <Button 
                  type="button" 
                  variant={activeCoupon ? "destructive" : "secondary"} 
                  onClick={activeCoupon ? () => { setActiveCoupon(null); setCouponCode(''); } : handleApplyCoupon}
                  disabled={validateCoupon.isPending || (!couponCode && !activeCoupon)}
                >
                  {validateCoupon.isPending ? '...' : activeCoupon ? t('إلغاء', 'Remove') : t('تطبيق', 'Apply')}
                </Button>
              </div>

              {/* Totals */}
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('المجموع الفرعي', 'Subtotal')}</span>
                  <span className="font-bold">{quote?.subtotal || cart.subtotal} {t('ر.س', 'SAR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('الشحن', 'Shipping')}</span>
                  <span className="font-bold">{quote?.shippingCost === 0 ? t('مجاناً', 'Free') : `${quote?.shippingCost || 0} ${t('ر.س', 'SAR')}`}</span>
                </div>
                {quote?.discount ? (
                  <div className="flex justify-between text-accent">
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> {t('الخصم', 'Discount')}</span>
                    <span className="font-bold">-{quote.discount} {t('ر.س', 'SAR')}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('الضريبة (15%)', 'Tax (15%)')}</span>
                  <span className="font-bold">{quote?.tax || 0} {t('ر.س', 'SAR')}</span>
                </div>
              </div>
              
              <div className="border-t mt-4 pt-4 flex justify-between items-center text-lg">
                <span className="font-bold">{t('الإجمالي', 'Total')}</span>
                <span className="font-bold text-xl text-primary">{quote?.total || cart.subtotal} {t('ر.س', 'SAR')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
