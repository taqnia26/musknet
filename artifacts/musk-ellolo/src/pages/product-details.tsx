import { useGetProduct, useGetRelatedProducts, useAddCartItem, getGetRelatedProductsQueryKey } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { useParams, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import { Minus, Plus, Heart, Share2, Truck, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { FaApplePay } from 'react-icons/fa';
import { Money } from '@/components/money';
import { sortProductsForSelection } from '@/lib/product-sort';
import {
  AnimatedRichDescriptionRenderer,
  legacyTextToRichDescription,
  normalizeRichDescription,
} from '@/components/rich-description';

const siteAsset = (filename: string) => `${import.meta.env.BASE_URL}site-assets/${filename}`;

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
  const addItemMutation = useAddCartItem();

  if (isLoading) {
    return <ProductSkeleton />;
  }

  if (isError || !product) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center space-y-6">
        <h1 className="text-3xl font-bold">{t('المنتج غير موجود', 'Product Not Found')}</h1>
        <Link href="/products" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-black text-white hover:bg-black/90 h-10 px-4 py-2">
          {t('العودة للتسوق', 'Back to Shopping')}
        </Link>
      </div>
    );
  }

  const imageUrl = product.imageUrl || siteAsset('0baf6eb1-352a-4922-b307-04b102ef837f-500x500-Z4GiN6OWeqiNXcuKcHQ85XOrA-3b8eeacb9c.jpg');
  const localizedRich = lang === 'ar'
    ? product.descriptionRichAr
    : product.descriptionRichEn;
  const localizedPlain = lang === 'ar'
    ? product.descriptionAr || '.ليس عطرًا… بل أسطورة تُهمس، لا تُقال .\n\nيلامسك دون أن يطلب الإذن، ويتسلل كقصيدة خالدة تُروى في اللحظة .\n\nالهرم العطري\nالقمة: قرفة، برتقال، شوكولاتة\nالقلب: مُرّ، جلد، فانيليا\nالقاعدة: تونكا، خشب الصندل، عنبر'
    : product.descriptionEn || 'Not just a perfume... but a whispered legend.\n\nTouches you without asking permission, sneaking in like a timeless poem.\n\nFragrance Pyramid\nTop: Cinnamon, Orange, Chocolate\nHeart: Myrrh, Leather, Vanilla\nBase: Tonka, Sandalwood, Amber';
  const productDescription = normalizeRichDescription(localizedRich) ?? legacyTextToRichDescription(localizedPlain);

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

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-clip bg-white pb-24">
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="flex min-w-0 flex-col gap-10 lg:flex-row lg:gap-16">
          
          {/* Right Column (Text / Details) */}
          <div className="order-2 flex min-w-0 max-w-xl flex-1 flex-col pt-4 lg:order-1">
            
            {/* Title & Badge */}
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <h1 className="min-w-0 flex-1 text-2xl font-bold text-black md:text-4xl">
                {t(product.nameAr, product.nameEn)}
              </h1>
              {product.isBestseller && (
                <span className="bg-[#ff3b3b] text-white text-xs font-bold px-3 py-1 rounded-sm shrink-0">
                  {t('الأكثر مبيعا', 'Bestseller')}
                </span>
              )}
            </div>
            
            <p className="text-sm text-gray-500 mb-6">{t('الكمية محدودة', 'Limited quantity')}</p>

            {/* Actions */}
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors">
                <Heart className="w-4 h-4" />
                <span>{t('أضف إلى المفضلة', 'Add to Wishlist')}</span>
              </button>
              <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors">
                <Share2 className="w-4 h-4" />
                <span>{t('مشاركة المنتج', 'Share Product')}</span>
              </button>
            </div>

            {/* Price */}
            <div className="mb-6">
              <Money value={product.price} lang={lang} className="text-2xl font-bold text-black" />
            </div>

            {/* Installments (Tamara/Tabby placeholder) */}
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded border border-gray-100 bg-[#f9fafb] p-4 text-sm">
              <div className="flex min-w-0 items-center gap-2 text-gray-700">
                <img src={siteAsset('tamara_installment_mini-3e289e2b2d.png')} alt="Tamara" className="h-5 object-contain" />
                <span>قسم فاتورتك على 4 دفعات</span>
              </div>
              <span className="font-bold underline cursor-pointer">{t('اعرف أكثر', 'Learn more')}</span>
            </div>

            {/* Description */}
            <AnimatedRichDescriptionRenderer
              description={productDescription}
              className="prose prose-sm mb-10 max-w-none leading-loose text-gray-700"
            />

            <div className="border-t border-gray-100 my-8"></div>

            {/* Sticky-like Bottom Actions Area */}
            <div className="bg-white">
              <div className="mb-4 flex items-center justify-between gap-4">
                <span className="font-bold text-black">{t('السعر', 'Price')}</span>
                <Money value={product.price} lang={lang} className="text-2xl font-bold text-black" />
              </div>
              
              <div className="mb-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center border border-gray-300 rounded h-12 w-32 bg-white">
                  <button 
                    className="w-10 h-full flex items-center justify-center text-gray-500 hover:text-black transition-colors"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input 
                    type="text" 
                    value={quantity} 
                    readOnly 
                    className="flex-1 w-full h-full text-center font-bold text-black bg-transparent border-none focus:outline-none"
                  />
                  <button 
                    className="w-10 h-full flex items-center justify-center text-gray-500 hover:text-black transition-colors"
                    onClick={() => setQuantity(q => Math.min(product.stock, q + 1))}
                    disabled={quantity >= product.stock}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                
                <Button 
                  className="flex-1 h-12 rounded bg-[#050f2c] text-white hover:bg-black font-bold text-base"
                  onClick={handleAddToCart}
                  disabled={addItemMutation.isPending || product.stock === 0}
                >
                  {addItemMutation.isPending ? t('جاري الإضافة...', 'Adding...') : 
                   product.stock === 0 ? t('نفدت الكمية', 'Out of Stock') : 
                   t('أضف إلى السلة', 'Add to Cart')}
                </Button>
              </div>

              <Button className="w-full h-12 rounded bg-black text-white hover:bg-gray-800 font-bold flex items-center justify-center gap-2 mb-6">
                <span>{t('شراء باستخدام', 'Buy with')}</span>
                <FaApplePay className="w-10 h-10" />
              </Button>

              <div className="flex items-center justify-center gap-2">
                <img src={siteAsset('mada_mini-5dea0b2d68.png')} alt="Mada" className="h-6 object-contain grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer" />
                <img src={siteAsset('credit_card_mini-5100cae3e8.png')} alt="Credit Card" className="h-6 object-contain grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer" />
                <img src={siteAsset('bank_mini-22fc73a5e1.png')} alt="Bank" className="h-6 object-contain grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer" />
                <img src={siteAsset('apple_pay_mini-d0248050e5.png')} alt="Apple Pay" className="h-6 object-contain grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer" />
                <img src={siteAsset('tamara_installment_mini-3e289e2b2d.png')} alt="Tamara" className="h-6 object-contain grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer" />
              </div>
            </div>

          </div>

          {/* Left Column (Image) */}
          <div className="order-1 flex min-w-0 flex-1 h-fit lg:sticky lg:top-32 lg:order-2">
            <div className="w-full aspect-square bg-[#fafafa] rounded-lg overflow-hidden border border-gray-100 p-8 flex items-center justify-center">
              <img 
                src={imageUrl} 
                alt={t(product.nameAr, product.nameEn)}
                className="w-full h-full object-contain mix-blend-multiply"
              />
            </div>
          </div>

        </div>
      </div>

      {/* Related Products */}
      {relatedProducts && relatedProducts.length > 0 && (
        <section className="container mx-auto px-4 mt-24">
          <div className="flex items-center justify-between mb-8 border-b border-gray-100 pb-4">
            <h2 className="text-xl font-bold text-black">{t('منتجات قد تعجبك', 'You May Also Like')}</h2>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4 md:gap-8">
            {sortProductsForSelection(relatedProducts, lang).slice(0, 4).map((p) => (
              <RelatedProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RelatedProductCard({ product }: { product: any }) {
  const { t, lang } = useLanguage();
  return (
    <Link href={`/products/${product.slug}`}>
      <div className="group cursor-pointer flex flex-col h-full bg-white border border-gray-100 rounded-sm p-4 hover:shadow-md transition-shadow">
        <div className="relative aspect-square w-full bg-white mb-4">
          <img 
            src={product.imageUrl || siteAsset('Ca44RuZ7R2vL2wTsJKCO2bG6rWGMyqxB0CVdsvxb-63014f950a.png')} 
            alt={t(product.nameAr, product.nameEn)}
            className="absolute inset-0 w-full h-full object-contain mix-blend-multiply transition-transform duration-700 group-hover:scale-105"
          />
        </div>
        <div className="space-y-2 text-center flex-1 flex flex-col justify-end pt-4 border-t border-gray-100">
          <h3 className="font-medium text-sm text-black line-clamp-1">{t(product.nameAr, product.nameEn)}</h3>
          <Money value={product.price} lang={lang} className="font-bold text-black text-sm" />
        </div>
      </div>
    </Link>
  );
}

function ProductSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 md:py-16">
      <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">
        <div className="flex-1 lg:order-1 order-2 space-y-6 pt-4">
          <Skeleton className="h-12 w-3/4 bg-gray-100" />
          <Skeleton className="h-8 w-1/4 bg-gray-100" />
          <Skeleton className="h-32 w-full bg-gray-100" />
          <Skeleton className="h-24 w-full bg-gray-100" />
          <Skeleton className="h-14 w-full bg-gray-100" />
        </div>
        <div className="flex-1 lg:order-2 order-1">
          <Skeleton className="w-full aspect-square rounded-lg bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
