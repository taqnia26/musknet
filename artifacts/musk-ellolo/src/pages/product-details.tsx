import { useGetProduct, useGetRelatedProducts, useAddCartItem, getGetRelatedProductsQueryKey, useGetCart, getGetCartQueryKey } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useParams, Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useEffect } from 'react';
import { Minus, Plus, Heart, Share2, Check, ShoppingCart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Money } from '@/components/money';
import { sortProductsForSelection } from '@/lib/product-sort';
import {
  AnimatedRichDescriptionRenderer,
  legacyTextToRichDescription,
  normalizeRichDescription,
} from '@/components/rich-description';
import { useQueryClient } from '@tanstack/react-query';

const siteAsset = (filename: string) => `${import.meta.env.BASE_URL}site-assets/${filename}`;

export default function ProductDetails() {
  const params = useParams();
  const slug = params.slug || '';
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: product, isLoading, isError, refetch } = useGetProduct(slug);
  const { data: relatedProducts } = useGetRelatedProducts(slug, {
    query: { enabled: !!slug, queryKey: getGetRelatedProductsQueryKey(slug) }
  });
  
  const { data: cart, isLoading: isCartLoading, isError: isCartError } = useGetCart({ query: { queryKey: getGetCartQueryKey() } });

  const [quantity, setQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<Set<number>>(new Set());
  const [isAddingBundle, setIsAddingBundle] = useState(false);
  
  const addItemMutation = useAddCartItem();

  useEffect(() => {
    // Reset quantity and addons on slug navigation
    setQuantity(1);
    setSelectedAddons(new Set());
  }, [slug]);

  useEffect(() => {
    if (product) {
      try {
        const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        setIsFavorite(Array.isArray(favorites) && favorites.includes(product.id));
      } catch (e) {
        setIsFavorite(false);
      }
    }
  }, [product]);

  const remainingStock = product ? Math.max(0, product.stock - (cart?.items.find(item => item.product.id === product.id)?.quantity || 0)) : 0;
  useEffect(() => {
    setQuantity(q => Math.max(1, Math.min(q, remainingStock || 1)));
  }, [remainingStock]);

  if (isLoading) {
    return <ProductSkeleton />;
  }

  if (isError || !product) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center space-y-6">
        <h1 className="text-3xl font-bold">{isError ? t('تعذر تحميل المنتج', 'Unable to load product') : t('المنتج غير موجود', 'Product Not Found')}</h1>
        {isError && <><p>{t('تحقق من الاتصال ثم أعد المحاولة.', 'Check your connection and try again.')}</p><Button onClick={() => void refetch()}>{t('إعادة المحاولة', 'Try again')}</Button></>}
        <Link href="/products" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-black text-white hover:bg-black/90 h-10 px-4 py-2">
          {t('العودة للتسوق', 'Back to Shopping')}
        </Link>
      </div>
    );
  }

  // Calculate available stock based on what's already in the cart
  const availableStock = remainingStock;
  const cannotPurchase = isCartLoading || isCartError || !cart || availableStock < 1 || quantity > availableStock || isAddingBundle || addItemMutation.isPending;

  const imageUrl = product.imageUrl || siteAsset('0baf6eb1-352a-4922-b307-04b102ef837f-500x500-Z4GiN6OWeqiNXcuKcHQ85XOrA-3b8eeacb9c.jpg');
  const localizedRich = lang === 'ar' ? product.descriptionRichAr : product.descriptionRichEn;
  const localizedPlain = lang === 'ar' ? product.descriptionAr : product.descriptionEn;
  const productDescription = normalizeRichDescription(localizedRich) ?? legacyTextToRichDescription(localizedPlain || '');

  const toggleFavorite = () => {
    try {
      const stored = JSON.parse(localStorage.getItem('favorites') || '[]');
      const favorites: number[] = Array.isArray(stored) ? stored : [];
      let newFavorites: number[];
      if (favorites.includes(product.id)) {
        newFavorites = favorites.filter((id: number) => id !== product.id);
      } else {
        newFavorites = [...favorites, product.id];
      }
      localStorage.setItem('favorites', JSON.stringify(newFavorites));
      setIsFavorite(newFavorites.includes(product.id));
      toast({ title: newFavorites.includes(product.id) ? t('تم الإضافة للمفضلة', 'Added to favorites') : t('تمت الإزالة من المفضلة', 'Removed from favorites') });
    } catch (e) {
      toast({ variant: 'destructive', title: t('تعذر حفظ المفضلة على هذا الجهاز', 'Could not save favorites on this device') });
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t(product.nameAr, product.nameEn),
          url: window.location.href,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          toast({ variant: 'destructive', title: t('تعذرت المشاركة', 'Could not share') });
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast({ title: t('تم النسخ', 'Copied'), description: t('تم نسخ رابط المنتج', 'Product link copied') });
      } catch (err) {
        toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: t('فشل النسخ', 'Failed to copy') });
      }
    }
  };

  const handleAddToCart = () => {
    if (cannotPurchase) return;
    addItemMutation.mutate({ data: { productId: product.id, quantity } }, {
      onSuccess: (updatedCart) => {
        toast({
          title: t('تمت الإضافة بنجاح', 'Added to Cart'),
          description: `${quantity} × ${t(product.nameAr, product.nameEn)}`,
        });
        queryClient.setQueryData(getGetCartQueryKey(), updatedCart);
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: t('حدث خطأ', 'Error'),
          description: t('لم نتمكن من إضافة المنتج للعربة', 'Could not add product to cart'),
        });
      }
    });
  };

  const handleBuyNow = () => {
    if (cannotPurchase) return;
    addItemMutation.mutate({ data: { productId: product.id, quantity } }, {
      onSuccess: (updatedCart) => {
        queryClient.setQueryData(getGetCartQueryKey(), updatedCart);
        setLocation('/checkout');
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: t('حدث خطأ', 'Error'),
          description: t('لم نتمكن من إتمام العملية', 'Could not process request'),
        });
      }
    });
  };

  const addonProducts = sortProductsForSelection((relatedProducts || []).filter(p => p.id !== product.id), lang).slice(0, 3);
  const addonAvailable = (id: number, stock: number) => stock - (cart?.items.find(item => item.product.id === id)?.quantity || 0) > 0;
  const addonsTotal = addonProducts.filter(p => selectedAddons.has(p.id)).reduce((sum, p) => sum + p.price, 0);
  const bundleTotal = (product.price * quantity) + addonsTotal;
  const selectedUnavailable = addonProducts.some(p => selectedAddons.has(p.id) && !addonAvailable(p.id, p.stock));

  const toggleAddon = (id: number) => {
    setSelectedAddons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBuyTogether = async () => {
    if (cannotPurchase || selectedUnavailable || selectedAddons.size === 0) return;
    setIsAddingBundle(true);
    const failedAddons: number[] = [];
    let currentCart = cart;
    let addedAny = false;
    try {
      currentCart = await addItemMutation.mutateAsync({ data: { productId: product.id, quantity } });
      addedAny = true;
      queryClient.setQueryData(getGetCartQueryKey(), currentCart);
      for (const id of Array.from(selectedAddons)) {
        try {
          currentCart = await addItemMutation.mutateAsync({ data: { productId: id, quantity: 1 } });
          queryClient.setQueryData(getGetCartQueryKey(), currentCart);
          setSelectedAddons(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } catch (err) {
          failedAddons.push(id);
        }
      }
      
      if (failedAddons.length > 0) {
        toast({
          variant: 'destructive',
          title: t('تنبيه', 'Notice'),
          description: t('تمت الإضافة بنجاح جزئي، لم نتمكن من إضافة بعض المنتجات المرفقة', 'Partially added, could not add some attached products')
        });
        setLocation('/cart');
      } else {
        toast({
          title: t('تمت الإضافة بنجاح', 'Added successfully'),
          description: t('تمت إضافة جميع المنتجات للسلة', 'All products added to cart')
        });
        setLocation('/cart');
      }
    } catch (err) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: t('لم نتمكن من إضافة المنتجات', 'Could not add products') });
      if (addedAny) setLocation('/cart');
    } finally {
      setIsAddingBundle(false);
    }
  };

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip bg-white pb-8 lg:pb-24">
      <div className="container mx-auto px-4 py-6 md:py-12">
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
          
          {/* Text / Details (Right side natively via DOM order when flex-row and dir=rtl) */}
          <div className="order-2 flex min-w-0 flex-1 flex-col pt-2 lg:order-1">
            
            {/* Title */}
            <div className="mb-2">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-black leading-tight">
                {t(product.nameAr, product.nameEn)}
              </h1>
            </div>
            
            {/* Availability */}
            <div className="text-sm text-gray-500 mb-6">
              {product.stock === 0 ? t('نفدت الكمية', 'Sold out') : t('الكمية محدودة', 'Limited quantity')}
            </div>

            {/* Actions & Status */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>{t('السعر شامل الضريبه', 'Price includes tax')}</span>
                {product.stock === 0 || availableStock === 0 ? (
                  <div className="flex items-center gap-1.5 text-red-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    <span>{t('نفدت الكمية', 'Sold out')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-green-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span>{t('متوفر', 'In stock')}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <button onClick={handleShare} className="flex items-center gap-1.5 hover:text-black transition-colors">
                  <Share2 className="w-4 h-4" />
                  <span>{t('مشاركة المنتج', 'Share')}</span>
                </button>
                <button onClick={toggleFavorite} className="flex items-center gap-1.5 hover:text-black transition-colors">
                  <Heart className={cn("w-4 h-4", isFavorite && "fill-[#e8006f] text-[#e8006f]")} />
                  <span>{isFavorite ? t('إزالة من المفضلة', 'Remove favorite') : t('أضف للمفضلة', 'Favorite')}</span>
                </button>
              </div>
            </div>
            {isCartError && <p role="alert" className="mb-4 text-sm text-red-600">{t('تعذر تحميل السلة. حدّث الصفحة للمحاولة مجدداً.', 'Could not load your cart. Refresh to try again.')}</p>}

            {/* Description */}
            <AnimatedRichDescriptionRenderer
              description={productDescription}
              className="prose prose-sm mb-10 max-w-none leading-relaxed text-gray-700 font-medium"
            />

            {/* Installments Note */}
            <div className="mb-8 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 text-sm">
              <div className="flex min-w-0 items-center gap-3 text-gray-700">
                <img src={siteAsset('tamara_installment_mini-3e289e2b2d.png')} alt="Tamara" className="h-5 object-contain" />
                <span>{t('متاح التقسيط على 4 دفعات بدون رسوم عند الدفع', 'Installment on 4 payments with no fees available at checkout')}</span>
              </div>
            </div>
            <div className="mb-6 flex items-center justify-between border-t border-gray-100 pt-5 font-bold text-black lg:hidden">
              <span>{t('السعر', 'Price')}</span>
              <Money value={product.price} lang={lang} className="text-2xl" />
            </div>

            {/* Desktop Actions Area */}
            <div className="hidden lg:block bg-white pt-6 border-t border-gray-100">
              <div className="mb-5 flex items-center justify-between font-bold text-black">
                <span>{t('السعر', 'Price')}</span>
                <Money value={product.price} lang={lang} className="text-2xl" />
              </div>
              <div className="flex gap-4 h-14 mb-4">
                <div className="flex items-center border border-gray-300 w-32 bg-white">
                  <button 
                    aria-label={t('تقليل الكمية', 'Decrease quantity')}
                    className="w-10 h-full flex items-center justify-center text-gray-500 hover:text-black transition-colors disabled:opacity-50"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    disabled={quantity <= 1 || cannotPurchase}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input 
                    type="text" aria-label={t('الكمية', 'Quantity')}
                    value={quantity} 
                    readOnly 
                    className="flex-1 w-full h-full text-center font-bold text-black bg-transparent border-none focus:outline-none"
                  />
                  <button 
                    aria-label={t('زيادة الكمية', 'Increase quantity')}
                    className="w-10 h-full flex items-center justify-center text-gray-500 hover:text-black transition-colors disabled:opacity-50"
                    onClick={() => setQuantity(q => Math.min(availableStock, q + 1))}
                    disabled={quantity >= availableStock || isCartLoading || isCartError || isAddingBundle || addItemMutation.isPending}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                
                <Button 
                  className="flex-1 h-14 rounded-sm bg-[#050f2c] text-white hover:bg-black font-bold text-base transition-colors disabled:opacity-50"
                  onClick={handleAddToCart}
                  disabled={cannotPurchase}
                >
                  {addItemMutation.isPending ? t('جاري الإضافة...', 'Adding...') : 
                   availableStock === 0 ? t('نفدت الكمية', 'Out of Stock') : 
                   t('أضف إلى السلة', 'Add to Cart')}
                </Button>
              </div>

              <Button 
                className="w-full h-12 rounded-sm bg-black text-white hover:bg-gray-800 font-bold flex items-center justify-center gap-2 mb-8 transition-colors disabled:opacity-50"
                onClick={handleBuyNow}
                disabled={cannotPurchase}
              >
                <span>{t('اشتر الآن', 'Buy Now')}</span>
              </Button>

              <div className="flex items-center justify-center gap-3">
                <img src={siteAsset('mada_mini-5dea0b2d68.png')} alt="Mada" className="h-6 object-contain" />
                <img src={siteAsset('credit_card_mini-5100cae3e8.png')} alt="Credit Card" className="h-6 object-contain" />
                <img src={siteAsset('bank_mini-22fc73a5e1.png')} alt="Bank" className="h-6 object-contain" />
                <img src={siteAsset('apple_pay_mini-d0248050e5.png')} alt="Apple Pay" className="h-6 object-contain" />
                <img src={siteAsset('tamara_installment_mini-3e289e2b2d.png')} alt="Tamara" className="h-6 object-contain" />
              </div>
            </div>

            {/* Buy Together / Complete your order */}
            {addonProducts.length > 0 && (
              <div className="mt-8 mb-8 border-t border-gray-100 pt-8">
                <h3 className="font-bold text-lg mb-2 text-black flex items-center gap-2">
                  {t('كمل طلبك', 'Complete your order')}
                </h3>
                <p className="text-sm text-gray-500 mb-5">{t('اكتشف ما يشتريه العملاء مع هذا المنتج.', 'Discover what customers buy with this product.')}</p>
                <div className="space-y-3 mb-6">
                  {addonProducts.map(addon => {
                    const available = addonAvailable(addon.id, addon.stock);
                    return (
                    <label 
                      key={addon.id} 
                      className={cn(
                        "flex items-center justify-between gap-2 py-3 border-b border-gray-100 cursor-pointer transition-all",
                        !available && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <input type="checkbox" className="sr-only peer" checked={selectedAddons.has(addon.id)} disabled={!available || isCartLoading || isCartError || isAddingBundle || addItemMutation.isPending} onChange={() => toggleAddon(addon.id)} aria-label={t(addon.nameAr, addon.nameEn)} />
                        <div className={cn(
                          "w-5 h-5 shrink-0 rounded border flex items-center justify-center transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500",
                          selectedAddons.has(addon.id) ? "bg-black border-black text-white" : "border-gray-300 bg-white"
                        )}>
                          {selectedAddons.has(addon.id) && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-white rounded border border-gray-100 flex items-center justify-center p-1">
                            <img src={addon.imageUrl || siteAsset('Ca44RuZ7R2vL2wTsJKCO2bG6rWGMyqxB0CVdsvxb-63014f950a.png')} alt="" className="w-full h-full object-contain" />
                          </div>
                          <span className="text-sm font-bold text-black">{t(addon.nameAr, addon.nameEn)} {!available && t('(غير متوفر)', '(Unavailable)')}</span>
                        </div>
                      </div>
                      <Money value={addon.price} lang={lang} className="text-sm font-bold text-black" />
                    </label>
                  )})}
                </div>
                {selectedAddons.size > 0 && (
                  <Button 
                    className="w-full bg-[#050f2c] hover:bg-black text-white h-12 rounded-sm text-base font-bold transition-colors disabled:opacity-50"
                    onClick={handleBuyTogether}
                    disabled={cannotPurchase || selectedUnavailable}
                  >
                    {isAddingBundle ? t('جاري الإضافة...', 'Adding...') : (
                      <>
                        {t('اشتريها معاً بـ', 'Buy together for')} <Money value={bundleTotal} lang={lang} className="mx-1" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

          </div>

          {/* Image */}
          <div className="order-1 flex min-w-0 w-full lg:w-[50%] h-fit lg:sticky lg:top-32 lg:order-2">
            <div className="w-full aspect-square bg-white overflow-hidden border border-gray-200 flex items-center justify-center relative">
              {product.isBestseller && (
                <span className="absolute top-4 right-0 bg-[#da3876] text-white text-xs font-bold px-3 py-2 z-10">
                  {t('الأكثر مبيعا', 'Bestseller')}
                </span>
              )}
              <button 
                onClick={toggleFavorite}
                aria-label={isFavorite ? t('إزالة من المفضلة', 'Remove favorite') : t('أضف للمفضلة', 'Add to favorites')}
                className="absolute bottom-4 right-4 p-2.5 text-gray-600 hover:text-[#e8006f] transition-colors z-10 bg-white border border-gray-100 rounded-full"
              >
                <Heart className={cn("w-5 h-5 transition-colors", isFavorite && "fill-[#e8006f] text-[#e8006f]")} />
              </button>
              <img 
                src={imageUrl} 
                alt={t(product.nameAr, product.nameEn)}
                className="w-full h-full object-contain"
              />
            </div>
          </div>

        </div>
      </div>

      {/* Related Products */}
      {relatedProducts && relatedProducts.length > 0 && (
        <section className="container mx-auto px-4 mt-14">
          <div className="flex items-center justify-between mb-8 pb-4">
            <h2 className="text-xl font-bold text-black">{t('منتجات قد تعجبك', 'You May Also Like')}</h2>
          </div>
          <div className="flex overflow-x-auto gap-4 pb-8 snap-x snap-mandatory hide-scrollbar -mx-4 px-4">
            {sortProductsForSelection(relatedProducts.filter(p => p.id !== product.id), lang).map((p) => (
              <div key={p.id} className="snap-start w-[220px] md:w-[260px] shrink-0">
                <RelatedProductCard product={p} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mobile Fixed Bottom Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] z-40 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        <div dir="ltr" className="flex items-center border border-gray-300 rounded-sm h-10 w-full bg-white mb-2">
          <button 
            aria-label={t('تقليل الكمية', 'Decrease quantity')}
            className="w-11 h-full flex items-center justify-center text-gray-500 border-r border-gray-200 disabled:opacity-40"
            onClick={() => setQuantity(q => Math.max(1, q - 1))}
            disabled={quantity <= 1 || isCartLoading || isCartError || isAddingBundle || addItemMutation.isPending}
          >
            <Minus className="w-4 h-4" />
          </button>
          <input 
            type="text" aria-label={t('الكمية', 'Quantity')}
            value={quantity} 
            readOnly 
            className="flex-1 min-w-0 h-full text-center font-bold text-black bg-transparent border-none focus:outline-none p-0"
          />
          <button 
            aria-label={t('زيادة الكمية', 'Increase quantity')}
            className="w-11 h-full flex items-center justify-center text-gray-500 border-l border-gray-200 disabled:opacity-40"
            onClick={() => setQuantity(q => Math.min(availableStock, q + 1))}
            disabled={quantity >= availableStock || isCartLoading || isCartError || isAddingBundle || addItemMutation.isPending}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex flex-row-reverse gap-1.5">
          <Button
            variant="outline"
            className="flex-1 h-10 rounded-none border-black bg-white text-black font-bold text-sm"
            onClick={handleBuyNow}
            disabled={cannotPurchase}
          >
            {t('اشتر الآن', 'Buy Now')}
          </Button>
          <Button
            className="flex-1 h-10 rounded-none bg-[#101831] text-white font-bold text-sm"
            onClick={handleAddToCart}
            disabled={cannotPurchase}
          >
            <ShoppingCart className="w-4 h-4" />
            {availableStock === 0 ? t('نفدت الكمية', 'Out of Stock') : t('أضف إلى السلة', 'Add to Cart')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RelatedProductCard({ product }: { product: any }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const addItemMutation = useAddCartItem();
  const queryClient = useQueryClient();
  const { data: cart, isLoading, isError } = useGetCart({ query: { queryKey: getGetCartQueryKey() } });
  const available = product.stock - (cart?.items.find(item => item.product.id === product.id)?.quantity || 0) > 0;

  const handleAdd = (e: React.MouseEvent) => {
    if (!cart || !available || addItemMutation.isPending) return;
    addItemMutation.mutate({ data: { productId: product.id, quantity: 1 } }, {
      onSuccess: (updatedCart) => {
        toast({ title: t('تمت الإضافة', 'Added'), description: t(product.nameAr, product.nameEn) });
        queryClient.setQueryData(getGetCartQueryKey(), updatedCart);
      },
      onError: () => toast({ variant: 'destructive', title: t('تعذرت الإضافة إلى السلة', 'Could not add to cart') }),
    });
  };

  return (
    <div className="group flex flex-col h-full bg-white border border-gray-100 relative">
      {product.isBestseller && (
        <span className="absolute top-2 right-2 bg-[#da3876] text-white text-[10px] font-bold px-2 py-1 z-10">
          {t('الأكثر مبيعا', 'Bestseller')}
        </span>
      )}
      <Link href={`/products/${product.slug}`} className="relative aspect-square w-full bg-white block">
        <img 
          src={product.imageUrl || siteAsset('Ca44RuZ7R2vL2wTsJKCO2bG6rWGMyqxB0CVdsvxb-63014f950a.png')} 
          alt={t(product.nameAr, product.nameEn)}
          className="absolute inset-0 w-full h-full object-contain"
        />
      </Link>
      <div className="text-center flex-1 flex flex-col">
        <Button 
          className="w-full bg-[#101831] text-white rounded-none h-10 font-bold text-sm"
          onClick={handleAdd}
          disabled={isLoading || isError || !cart || !available || addItemMutation.isPending}
        >
          <ShoppingCart className="w-4 h-4" />
          {available ? t('أضف إلى السلة', 'Add to Cart') : t('نفدت الكمية', 'Out of Stock')}
        </Button>
        <Link href={`/products/${product.slug}`} className="text-sm text-black pt-3 hover:underline">{t(product.nameAr, product.nameEn)}</Link>
        <Money value={product.price} lang={lang} className="font-bold text-black text-sm block pb-4 pt-1" />
      </div>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 md:py-16">
      <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">
        <div className="order-2 lg:order-1 flex-1 space-y-6 pt-4">
          <Skeleton className="h-12 w-3/4 bg-gray-100 rounded-xl" />
          <Skeleton className="h-8 w-1/4 bg-gray-100 rounded-xl" />
          <Skeleton className="h-32 w-full bg-gray-100 rounded-xl" />
          <Skeleton className="h-24 w-full bg-gray-100 rounded-xl" />
          <Skeleton className="h-14 w-full bg-gray-100 rounded-xl" />
        </div>
        <div className="order-1 lg:order-2 flex-1">
          <Skeleton className="w-full aspect-square bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
