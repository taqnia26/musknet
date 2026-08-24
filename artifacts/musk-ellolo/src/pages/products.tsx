import { useListProducts, useListCategories, useAddCartItem } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Link, useParams, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

export default function Products() {
  const params = useParams();
  const categorySlug = params.slug; 
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const sortParam = searchParams.get('sort') as any;

  const { t } = useLanguage();
  
  const [sort, setSort] = useState<any>(sortParam || 'featured');

  const { data: categories } = useListCategories();
  const { data: products, isLoading } = useListProducts({
    category: categorySlug,
    sort,
    limit: 48
  });

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
    <div className="w-full bg-white min-h-screen">
      <div className="container mx-auto px-4 py-8">
        
        {/* Toolbar */}
        <div className="flex flex-row justify-between items-center mb-12 border-b border-gray-100 pb-4 text-sm text-gray-500">
          <div className="font-medium text-black">
            {products?.length || 0} {t('منتجات', 'products')}
          </div>
          
          <div className="flex items-center gap-2">
            <span>{t('ترتيب حسب:', 'Sort by:')}</span>
            <div className="relative">
              <select 
                className="bg-transparent text-black font-medium outline-none cursor-pointer rtl:pl-6 ltr:pr-6 appearance-none"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {isLoading ? (
            Array(8).fill(0).map((_, i) => (
               <div key={i} className="border border-gray-100 rounded-sm p-4">
                <Skeleton className="aspect-square w-full mb-4 bg-gray-100" />
                <Skeleton className="h-10 w-full mb-4 bg-gray-100" />
                <Skeleton className="h-5 w-3/4 mx-auto mb-2 bg-gray-100" />
                <Skeleton className="h-4 w-1/2 mx-auto bg-gray-100" />
              </div>
            ))
          ) : products?.length ? (
            products.map((product) => (
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
  const { t } = useLanguage();
  const { toast } = useToast();
  const addItemMutation = useAddCartItem();
  
  const imageUrl = product.imageUrl || "/api/media/Hair_Mist-07_1787598876720.jpg";

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
    <Link href={`/products/${product.slug}`}>
      <div className="group cursor-pointer flex flex-col h-full bg-white border border-gray-100 rounded-sm hover:shadow-md transition-shadow relative p-4">
        
        {/* Badge */}
        {product.isBestseller && (
          <div className="absolute top-0 right-0 rtl:left-auto rtl:right-0 bg-[#ff3b3b] text-white text-[10px] font-bold px-2 py-1 z-10 rounded-bl-sm rounded-tr-sm">
            {t('الأكثر مبيعا', 'Bestseller')}
          </div>
        )}
        
        {/* Image */}
        <div className="relative aspect-square w-full bg-white mb-4">
          <img 
            src={imageUrl} 
            alt={t(product.nameAr, product.nameEn)}
            className="absolute inset-0 w-full h-full object-contain mix-blend-multiply"
          />
           <Button 
             variant="outline" 
             className="absolute inset-x-0 bottom-0 mx-2 translate-y-1 bg-white/95 text-black border-gray-200 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all hover:bg-white hover:text-black font-medium"
             onClick={handleAddToCart}
             disabled={addItemMutation.isPending}
           >
             {addItemMutation.isPending ? t('جاري الإضافة...', 'Adding...') : t('أضف إلى السلة', 'Add to Cart')}
           </Button>
        </div>
        
        {/* Details */}
        <div className="space-y-3 text-center flex-1 flex flex-col justify-end pt-4 border-t border-gray-100">
          <h3 className="font-medium text-sm text-black line-clamp-1">
            {t(product.nameAr, product.nameEn)}
          </h3>
          
          <div className="flex items-center justify-center gap-2">
            <span className="font-bold text-black text-sm">{product.price} {t('ر.س', 'SAR')}</span>
            {product.compareAtPrice && (
              <span className="text-gray-400 line-through text-xs">{product.compareAtPrice} {t('ر.س', 'SAR')}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
