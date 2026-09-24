import { useListProducts, useListCategories, useAddCartItem } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Link, useParams, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Money } from '@/components/money';
import { sortProductsForSelection } from '@/lib/product-sort';

export default function Products() {
  const params = useParams();
  const categorySlug = params.slug; 
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const sortParam = searchParams.get('sort') as any;

  const { t, lang } = useLanguage();
  
  const [sort, setSort] = useState<any>(sortParam || 'featured');

  const { data: categories } = useListCategories();
  const { data: products, isLoading } = useListProducts({
    category: categorySlug,
    sort,
    limit: 48
  });
  const displayedProducts = useMemo(
    () => sort === 'featured' ? sortProductsForSelection(products ?? [], lang) : products ?? [],
    [products, sort, lang],
  );

  const categoryName = useMemo(() => {
    if (!categorySlug || !categories) return t('المنتجات', 'Products');
    const cat = categories.find(c => c.slug === categorySlug);
    return cat ? t(cat.nameAr, cat.nameEn) : t('المنتجات', 'Products');
  }, [categorySlug, categories, t]);

  const sortOptions = [
    { value: 'featured', labelAr: 'مقترحاتنا', labelEn: 'Featured' },
    { value: 'newest', labelAr: 'الأحدث', labelEn: 'Newest' },
    { value: 'price_asc', labelAr: 'السعر: من الأقل للأعلى', labelEn: 'Price: Low to High' },
    { value: 'price_desc', labelAr: 'السعر: من الأعلى للأقل', labelEn: 'Price: High to Low' },
    { value: 'bestseller', labelAr: 'الأكثر مبيعاً', labelEn: 'Bestselling' },
  ];

  return (
    <div className="min-h-screen w-full min-w-0 bg-white">
      <div className="container mx-auto px-4 py-8">
        
        {/* Toolbar */}
        <div className="mb-10 flex flex-col items-stretch gap-4 border-b border-gray-100 pb-4 text-sm text-gray-500 sm:mb-12 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-medium text-black">
            {products?.length || 0} {t('منتجات', 'products')}
          </div>
          
          <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
            <span>{t('ترتيب حسب:', 'Sort by:')}</span>
            <div className="relative min-w-0">
              <select 
                className="max-w-full appearance-none bg-transparent font-medium text-black outline-none cursor-pointer rtl:pl-6 ltr:pr-6"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                {sortOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelAr, opt.labelEn)}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute top-1/2 -translate-y-1/2 rtl:left-0 ltr:right-0 pointer-events-none text-black" />
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:gap-8">
          {isLoading ? (
            Array(8).fill(0).map((_, i) => (
               <div key={i} className="border border-gray-100 rounded-sm p-4">
                <Skeleton className="aspect-square w-full mb-4 bg-gray-100" />
                <Skeleton className="h-10 w-full mb-4 bg-gray-100" />
                <Skeleton className="h-5 w-3/4 mx-auto mb-2 bg-gray-100" />
                <Skeleton className="h-4 w-1/2 mx-auto bg-gray-100" />
              </div>
            ))
          ) : displayedProducts.length ? (
            displayedProducts.map((product) => (
              <ProductGridCard key={product.id} product={product} />
            ))
          ) : (
            <div className="col-span-full py-24 text-center">
              <h3 className="text-xl font-medium text-gray-500">{t('لا يوجد المزيد لعرضه', 'No more products to show')}</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductGridCard({ product }: { product: any }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const addItemMutation = useAddCartItem();
  
  const imageUrl = product.imageUrl || "/api/media/Hair_Mist-07_1787598876720.jpg";

  const handleAddToCart = () => {
    addItemMutation.mutate({ data: { productId: product.id, quantity: 1 } }, {
      onSuccess: () => {
        toast({
          title: t('تمت الإضافة بنجاح', 'Added to Cart'),
          description: t(product.nameAr, product.nameEn),
        });
      }
    });
  };

  return (
    <div className="group relative flex h-full min-w-0 flex-col rounded-sm border border-gray-100 bg-white p-4 transition-shadow hover:shadow-md">
        
      {/* Badge */}
      {product.isBestseller && (
        <div className="absolute top-0 right-0 rtl:left-auto rtl:right-0 bg-[#ff3b3b] text-white text-[10px] font-bold px-2 py-1 z-10 rounded-bl-sm rounded-tr-sm">
          {t('الأكثر مبيعا', 'Bestseller')}
        </div>
      )}
        
      {/* Image */}
      <Link href={`/products/${product.slug}`} className="block cursor-pointer">
        <div className="relative aspect-square w-full bg-white">
          <img 
            src={imageUrl} 
            alt={t(product.nameAr, product.nameEn)}
            className="absolute inset-0 w-full h-full object-contain mix-blend-multiply"
          />
        </div>
      </Link>

      {/* Cart action stays outside the image area so it never covers the product */}
      <Button
        variant="outline"
        className="mt-4 h-10 w-full shrink-0 border-gray-200 bg-white text-black font-medium transition-colors hover:border-black hover:bg-black hover:text-white"
        onClick={handleAddToCart}
        disabled={addItemMutation.isPending}
      >
        {addItemMutation.isPending ? t('جاري الإضافة...', 'Adding...') : t('أضف إلى السلة', 'Add to Cart')}
      </Button>
        
      {/* Details */}
      <Link href={`/products/${product.slug}`} className="flex flex-1 cursor-pointer flex-col">
        <div className="space-y-3 text-center flex-1 flex flex-col justify-end pt-4">
          <h3 className="font-medium text-sm text-black line-clamp-1">
            {t(product.nameAr, product.nameEn)}
          </h3>
          
          <div className="flex items-center justify-center gap-2">
            <Money value={product.price} lang={lang} className="font-bold text-black text-sm" />
            {product.compareAtPrice && (
              <Money value={product.compareAtPrice} lang={lang} className="text-gray-400 line-through text-xs" />
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
