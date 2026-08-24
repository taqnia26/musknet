import { useListProducts, useListCategories } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Link, useParams, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Filter, SlidersHorizontal } from 'lucide-react';

export default function Products() {
  const params = useParams();
  const categorySlug = params.slug; // Could be from /categories/:slug
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const sortParam = searchParams.get('sort') as any;

  const { t } = useLanguage();
  
  const [sort, setSort] = useState<any>(sortParam || 'featured');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const { data: categories } = useListCategories();
  const { data: products, isLoading } = useListProducts({
    category: categorySlug,
    sort,
    limit: 48
  });

  const categoryName = useMemo(() => {
    if (!categorySlug || !categories) return t('جميع العطور', 'All Perfumes');
    const cat = categories.find(c => c.slug === categorySlug);
    return cat ? t(cat.nameAr, cat.nameEn) : t('جميع العطور', 'All Perfumes');
  }, [categorySlug, categories, t]);

  const sortOptions = [
    { value: 'featured', labelAr: 'المميزة', labelEn: 'Featured' },
    { value: 'newest', labelAr: 'الأحدث', labelEn: 'Newest' },
    { value: 'price_asc', labelAr: 'السعر: من الأقل للأعلى', labelEn: 'Price: Low to High' },
    { value: 'price_desc', labelAr: 'السعر: من الأعلى للأقل', labelEn: 'Price: High to Low' },
    { value: 'bestseller', labelAr: 'الأكثر مبيعاً', labelEn: 'Bestselling' },
  ];

  return (
    <div className="w-full bg-background min-h-screen">
      {/* Header */}
      <div className="bg-card py-16 text-center border-b">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">{categoryName}</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto px-4">
          {t('اكتشف مجموعتنا المختارة من العطور الفاخرة التي تعبر عن هويتك', 'Discover our selected collection of luxury perfumes that express your identity')}
        </p>
      </div>

      <div className="container mx-auto px-4 py-8">
        
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
          
          {/* Categories Horizontal Scroll */}
          <div className="flex gap-2 overflow-x-auto w-full sm:w-auto scrollbar-hide pb-2 sm:pb-0">
            <Link href="/products" className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 py-2 rounded-full shrink-0", !categorySlug ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground")}>
              {t('الكل', 'All')}
            </Link>
            {categories?.map(cat => (
              <Link key={cat.id} href={`/categories/${cat.slug}`} className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 py-2 rounded-full shrink-0", categorySlug === cat.slug ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground")}>
                {t(cat.nameAr, cat.nameEn)}
              </Link>
            ))}
          </div>

          <div className="flex gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 pt-4 sm:pt-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              <select 
                className="bg-transparent text-sm font-medium outline-none cursor-pointer rtl:pr-2"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                {sortOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelAr, opt.labelEn)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10 md:gap-x-8 md:gap-y-12">
          {isLoading ? (
            Array(8).fill(0).map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="aspect-square w-full rounded-xl" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))
          ) : products?.length ? (
            products.map((product) => (
              <ProductGridCard key={product.id} product={product} />
            ))
          ) : (
            <div className="col-span-full py-24 text-center">
              <h3 className="text-2xl font-bold text-muted-foreground">{t('لا توجد منتجات', 'No products found')}</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductGridCard({ product }: { product: any }) {
  const { t } = useLanguage();
  const [isHovered, setIsHovered] = useState(false);
  
  // Real images fallback for demo
  const imageUrl = product.imageUrl || "/api/media/Hair_Mist-07_1787598876720.jpg";
  const hoverImageUrl = product.hoverImageUrl || "/api/media/Hair_Mist-08_1787598876721.jpg";

  return (
    <Link href={`/products/${product.slug}`}>
      <div 
        className="group cursor-pointer flex flex-col h-full"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative aspect-[4/5] w-full rounded-2xl overflow-hidden bg-white mb-4 border border-transparent group-hover:border-border transition-colors">
          <img 
            src={imageUrl} 
            alt={t(product.nameAr, product.nameEn)}
            className={cn(
              "absolute inset-0 w-full h-full object-contain p-4 md:p-8 transition-opacity duration-500",
              isHovered && hoverImageUrl ? "opacity-0" : "opacity-100"
            )}
          />
          {hoverImageUrl && (
            <img 
              src={hoverImageUrl} 
              alt={`${t(product.nameAr, product.nameEn)} alternate`}
              className={cn(
                "absolute inset-0 w-full h-full object-contain p-4 md:p-8 transition-transform duration-700 scale-105",
                isHovered ? "opacity-100 transform scale-100" : "opacity-0"
              )}
            />
          )}
          
          {/* Quick Add Button (visible on hover on desktop) */}
          <div className="absolute bottom-4 left-4 right-4 opacity-0 transform translate-y-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 hidden md:block">
            <Button className="w-full shadow-lg rounded-full bg-background/90 text-foreground hover:bg-primary hover:text-primary-foreground backdrop-blur">
              {t('تفاصيل المنتج', 'View Details')}
            </Button>
          </div>
        </div>
        
        <div className="space-y-1 text-center flex-1 flex flex-col justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-widest">
              {product.categoryNameAr ? t(product.categoryNameAr, product.categoryNameAr) : 'Musk Ellolo'}
            </p>
            <h3 className="font-bold text-base md:text-lg text-foreground line-clamp-2 leading-tight">
              {t(product.nameAr, product.nameEn)}
            </h3>
          </div>
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="font-bold text-foreground">{product.price} {t('ر.س', 'SAR')}</span>
            {product.compareAtPrice && (
              <span className="text-muted-foreground line-through text-sm">{product.compareAtPrice} {t('ر.س', 'SAR')}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
