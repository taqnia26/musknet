import { useGetProduct, useGetRelatedProducts, useAddCartItem, getGetRelatedProductsQueryKey } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useParams, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useRef } from 'react';
import { Minus, Plus, ShoppingBag, Truck, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function ProductDetails() {
  const params = useParams();
  const slug = params.slug || '';
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  
  const { data: product, isLoading, isError } = useGetProduct(slug);
  const { data: relatedProducts, isLoading: isLoadingRelated } = useGetRelatedProducts(slug, {
    query: { enabled: !!slug, queryKey: getGetRelatedProductsQueryKey(slug) }
  });

  const [quantity, setQuantity] = useState(1);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  
  const addItemMutation = useAddCartItem();

  if (isLoading) {
    return <ProductSkeleton />;
  }

  if (isError || !product) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center space-y-6">
        <h1 className="text-3xl font-bold">{t('المنتج غير موجود', 'Product Not Found')}</h1>
        <p className="text-muted-foreground">
          {t('نعتذر، لم نتمكن من العثور على المنتج الذي تبحث عنه.', 'Sorry, we could not find the product you are looking for.')}
        </p>
        <Link href="/products" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
          {t('العودة للتسوق', 'Back to Shopping')}
        </Link>
      </div>
    );
  }

  const images = product.images?.length ? product.images : [
    product.imageUrl || "/api/media/Perfume-01_1787598876724.jpg",
    product.hoverImageUrl || "/api/media/Perfume-02_1787598876724.jpg"
  ].filter(Boolean);

  const handleAddToCart = () => {
    addItemMutation.mutate({ data: { productId: product.id, quantity } }, {
      onSuccess: () => {
        toast({
          title: t('تمت الإضافة بنجاح', 'Added to Cart'),
          description: `${quantity} × ${t(product.nameAr, product.nameEn)}`,
        });
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

  const topNotes = product.notes?.filter(n => n.type === 'top') || [];
  const heartNotes = product.notes?.filter(n => n.type === 'heart') || [];
  const baseNotes = product.notes?.filter(n => n.type === 'base') || [];

  return (
    <div className="w-full bg-background animate-in fade-in duration-500">
      <div className="container mx-auto px-4 py-8 md:py-16">
        
        {/* Breadcrumb */}
        <nav className="flex text-sm text-muted-foreground mb-8">
          <Link href="/"><span className="hover:text-foreground cursor-pointer">{t('الرئيسية', 'Home')}</span></Link>
          <span className="mx-2">/</span>
          <Link href="/products"><span className="hover:text-foreground cursor-pointer">{t('العطور', 'Perfumes')}</span></Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{t(product.nameAr, product.nameEn)}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20">
          
          {/* Product Images */}
          <div className="flex flex-col-reverse md:flex-row gap-4 h-[60vh] md:h-[80vh]">
            <div className="flex md:flex-col gap-4 overflow-auto scrollbar-hide shrink-0 md:w-24">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImageIndex(idx)}
                  className={cn(
                    "relative aspect-square w-20 md:w-full flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all bg-white",
                    activeImageIndex === idx ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"
                  )}
                >
                  <img src={img} alt="" className="w-full h-full object-contain p-2" />
                </button>
              ))}
            </div>
            
            <div className="flex-1 relative rounded-2xl overflow-hidden bg-white/50 border flex items-center justify-center">
              <img 
                src={images[activeImageIndex]} 
                alt={t(product.nameAr, product.nameEn)}
                className="w-full h-full object-contain p-12 max-h-full"
              />
              {product.compareAtPrice && (
                <div className="absolute top-6 right-6 rtl:left-6 rtl:right-auto bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-sm font-bold tracking-widest uppercase">
                  {t('تخفيض', 'Sale')}
                </div>
              )}
            </div>
          </div>

          {/* Product Info */}
          <div className="flex flex-col py-4">
            <h1 className="text-4xl md:text-5xl font-bold mb-2 text-foreground">
              {t(product.nameAr, product.nameEn)}
            </h1>
            
            <div className="flex items-center gap-4 mt-6 mb-8">
              <span className="text-3xl font-bold text-foreground">
                {product.price} {t('ر.س', 'SAR')}
              </span>
              {product.compareAtPrice && (
                <span className="text-xl text-muted-foreground line-through">
                  {product.compareAtPrice} {t('ر.س', 'SAR')}
                </span>
              )}
            </div>

            <p className="text-lg text-foreground/80 leading-relaxed mb-8">
              {t(
                product.descriptionAr || 'عطر فاخر يمزج بين الأصالة والحداثة، صمم خصيصاً لأصحاب الذوق الرفيع. يترك أثراً يدوم طويلاً ويعبر عن شخصيتك الفريدة.',
                product.descriptionEn || 'A luxurious fragrance blending heritage and modernity, specially designed for those with refined taste. Leaves a long-lasting trail that expresses your unique personality.'
              )}
            </p>

            {/* Fragrance Notes (if available or mock) */}
            <div className="bg-card p-6 rounded-2xl mb-8 space-y-6">
              <h3 className="font-bold text-lg border-b pb-4">{t('الهرم العطري', 'Fragrance Notes')}</h3>
              
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <span className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">{t('القمة', 'Top Notes')}</span>
                  <p className="font-medium text-sm">
                    {topNotes.length ? topNotes.map(n => t(n.nameAr, n.nameEn)).join(', ') : t('برغموت، يوسفي', 'Bergamot, Mandarin')}
                  </p>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">{t('القلب', 'Heart Notes')}</span>
                  <p className="font-medium text-sm">
                    {heartNotes.length ? heartNotes.map(n => t(n.nameAr, n.nameEn)).join(', ') : t('ياسمين، ورد', 'Jasmine, Rose')}
                  </p>
                </div>
                <div>
                  <span className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">{t('القاعدة', 'Base Notes')}</span>
                  <p className="font-medium text-sm">
                    {baseNotes.length ? baseNotes.map(n => t(n.nameAr, n.nameEn)).join(', ') : t('مسك، عود', 'Musk, Oud')}
                  </p>
                </div>
              </div>
            </div>

            {/* Add to Cart Actions */}
            <div className="flex items-center gap-4 mb-10">
              <div className="flex items-center border rounded-full bg-background h-14">
                <button 
                  className="px-5 h-full flex items-center justify-center text-foreground hover:bg-muted/50 rounded-l-full rtl:rounded-l-none rtl:rounded-r-full transition-colors"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-10 text-center font-bold text-lg">{quantity}</span>
                <button 
                  className="px-5 h-full flex items-center justify-center text-foreground hover:bg-muted/50 rounded-r-full rtl:rounded-r-none rtl:rounded-l-full transition-colors"
                  onClick={() => setQuantity(q => Math.min(product.stock, q + 1))}
                  disabled={quantity >= product.stock}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <Button 
                size="lg" 
                className="flex-1 h-14 rounded-full text-lg"
                onClick={handleAddToCart}
                disabled={addItemMutation.isPending || product.stock === 0}
              >
                {addItemMutation.isPending ? t('جاري الإضافة...', 'Adding...') : 
                 product.stock === 0 ? t('نفذت الكمية', 'Out of Stock') : 
                 t('إضافة للعربة', 'Add to Cart')}
              </Button>
            </div>

            {/* Guarantees */}
            <div className="grid grid-cols-2 gap-4 border-t pt-8 text-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="bg-muted p-2 rounded-full text-foreground"><Truck className="w-5 h-5" /></div>
                <span>{t('توصيل سريع مجاني', 'Free Fast Delivery')}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="bg-muted p-2 rounded-full text-foreground"><ShieldCheck className="w-5 h-5" /></div>
                <span>{t('ضمان أصالة ١٠0٪', '100% Authenticity')}</span>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Related Products */}
      {relatedProducts && relatedProducts.length > 0 && (
        <section className="py-24 bg-card mt-16">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold mb-12 text-center">{t('قد يعجبك أيضاً', 'You May Also Like')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {relatedProducts.slice(0, 4).map((p) => (
                <RelatedProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function RelatedProductCard({ product }: { product: any }) {
  const { t } = useLanguage();
  return (
    <Link href={`/products/${product.slug}`}>
      <div className="group cursor-pointer space-y-4">
        <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-white">
          <img 
            src={product.imageUrl || "/api/media/Perfume-04_1787598876726.jpg"} 
            alt={t(product.nameAr, product.nameEn)}
            className="absolute inset-0 w-full h-full object-contain p-6 transition-transform duration-700 group-hover:scale-105"
          />
        </div>
        <div className="space-y-1 text-center">
          <h3 className="font-bold text-lg text-foreground">{t(product.nameAr, product.nameEn)}</h3>
          <p className="text-foreground">{product.price} {t('ر.س', 'SAR')}</p>
        </div>
      </div>
    </Link>
  );
}

function ProductSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 md:py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20">
        <div className="flex gap-4 h-[60vh]">
          <Skeleton className="w-24 h-full rounded-lg shrink-0" />
          <Skeleton className="flex-1 h-full rounded-2xl" />
        </div>
        <div className="space-y-6 pt-4">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-8 w-1/4" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-14 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
