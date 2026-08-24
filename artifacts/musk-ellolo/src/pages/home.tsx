import { useGetHomeContent, useListCategories, useListProducts } from '@workspace/api-client-react';
import { useLanguage } from '@/hooks/use-language';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export default function Home() {
  const { t, lang } = useLanguage();
  const { data: homeContent, isLoading: isLoadingHome } = useGetHomeContent();
  const { data: categories, isLoading: isLoadingCategories } = useListCategories();
  const { data: bestsellers, isLoading: isLoadingBestsellers } = useListProducts({ limit: 4, sort: 'bestseller' });

  // Use fallback values if API is missing content to ensure page looks good
  const heroTitleAr = homeContent?.heroTitleAr || "عطر يعكس هويتك";
  const heroTitleEn = homeContent?.heroTitleEn || "A Fragrance That Reflects Your Identity";
  const heroSubtitleAr = homeContent?.heroSubtitleAr || "اكتشف مجموعة عطور مسك اللولو الفاخرة، المصممة خصيصاً لتمنحك الثقة والأناقة في كل لحظة.";
  const heroSubtitleEn = homeContent?.heroSubtitleEn || "Discover the luxurious Musk Ellolo perfume collection, specially designed to give you confidence and elegance in every moment.";
  
  const heroImage = homeContent?.heroImageUrl || "/api/media/Perfume-01_1787598876724.jpg"; 
  const aboutImage = homeContent?.aboutImageUrl || "/api/media/Perfume-04_1787598876726.jpg";

  const ArrowIcon = lang === 'ar' ? ArrowLeft : ArrowRight;

  return (
    <div className="flex flex-col w-full animate-in fade-in duration-700">
      {/* Hero Section */}
      <section className="relative h-[80dvh] md:h-[90dvh] w-full flex items-center bg-card overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src={heroImage} 
            alt="Hero Background" 
            className="w-full h-full object-cover object-center opacity-40 mix-blend-multiply"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent rtl:bg-gradient-to-l"></div>
        </div>

        <div className="container relative z-10 px-4 h-full flex items-center">
          <div className="max-w-2xl space-y-6">
            {isLoadingHome ? (
              <>
                <Skeleton className="h-16 w-3/4 bg-foreground/10" />
                <Skeleton className="h-20 w-full bg-foreground/10" />
                <Skeleton className="h-12 w-40 bg-foreground/10" />
              </>
            ) : (
              <>
                <h1 className="text-5xl md:text-7xl font-bold leading-tight tracking-tight text-foreground">
                  {t(heroTitleAr, heroTitleEn)}
                </h1>
                <p className="text-lg md:text-xl text-foreground/80 leading-relaxed">
                  {t(heroSubtitleAr, heroSubtitleEn)}
                </p>
                <div className="pt-4">
                  <Link href="/products" className="inline-flex items-center justify-center whitespace-nowrap font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 rounded-full text-base">
                    {t('اكتشف المجموعة', 'Discover Collection')}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-24 bg-background">
        <div className="container px-4">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl font-bold mb-2">{t('تسوق حسب الفئة', 'Shop by Category')}</h2>
              <p className="text-muted-foreground">{t('اختر ما يناسب ذوقك الرفيع', 'Choose what suits your refined taste')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {isLoadingCategories ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="aspect-[4/5] w-full rounded-2xl" />)
            ) : categories?.length ? (
              categories.map((category) => (
                <Link key={category.id} href={`/categories/${category.slug}`}>
                  <div className="group relative aspect-[4/5] w-full rounded-2xl overflow-hidden cursor-pointer bg-card">
                    <img 
                      src={category.imageUrl} 
                      alt={t(category.nameAr, category.nameEn)} 
                      className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
                      onError={(e) => {
                         // Fallback logic for demo
                          e.currentTarget.src = category.slug.includes('hair') 
                            ? "/api/media/Hair_Mist-08_1787598876721.jpg"
                            : "/api/media/Perfume-02_1787598876724.jpg";
                      }}
                    />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors"></div>
                    <div className="absolute inset-0 p-8 flex flex-col justify-end">
                      <h3 className="text-2xl font-bold text-white mb-2">{t(category.nameAr, category.nameEn)}</h3>
                      <div className="flex items-center text-white/90 text-sm font-medium opacity-0 transform translate-y-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
                        {t('عرض المنتجات', 'View Products')} <ArrowIcon className="w-4 h-4 ml-2 rtl:mr-2 rtl:ml-0" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                {t('لا توجد فئات حالياً', 'No categories available')}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Bestsellers Section */}
      <section className="py-24 bg-card">
        <div className="container px-4">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl font-bold mb-2">{t('الأكثر مبيعاً', 'Bestsellers')}</h2>
              <p className="text-muted-foreground">{t('العطور المفضلة لدى عملائنا', 'Our customers favorite fragrances')}</p>
            </div>
            <Link href="/products?sort=bestseller" className="hidden md:flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
              {t('عرض الكل', 'View All')} <ArrowIcon className="w-4 h-4 ml-2 rtl:mr-2 rtl:ml-0" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {isLoadingBestsellers ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className="space-y-4">
                  <Skeleton className="aspect-square w-full rounded-xl" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
              ))
            ) : bestsellers?.length ? (
              bestsellers.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))
            ) : null}
          </div>
          
          <div className="mt-8 flex justify-center md:hidden">
            <Link href="/products?sort=bestseller" className="w-full inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium border border-input bg-transparent hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
              {t('عرض الكل', 'View All')}
            </Link>
          </div>
        </div>
      </section>

      {/* About Vignette */}
      <section className="py-24 md:py-32 bg-background">
        <div className="container px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="relative aspect-square md:aspect-[4/5] w-full rounded-2xl overflow-hidden">
              <img 
                src={aboutImage} 
                alt="Musk Ellolo Heritage" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="max-w-lg space-y-6">
              <h2 className="text-3xl md:text-5xl font-bold text-primary">
                {t(
                  homeContent?.aboutTitleAr || 'تراث الفخامة',
                  'Heritage of Luxury'
                )}
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                {t(
                  homeContent?.aboutBodyAr || 'في مسك اللولو، نؤمن بأن العطر هو البصمة الخفية التي تتركها وراءك. منذ تأسيسنا، ونحن نبحث عن أندر المكونات وأجود الزيوت العطرية لنبتكر روائح تحاكي الروح وتعبر عن الشخصية الفريدة.',
                  'At Musk Ellolo, we believe that fragrance is the invisible footprint you leave behind. Since our founding, we have been searching for the rarest ingredients and the finest essential oils to create scents that speak to the soul and express unique personality.'
                )}
              </p>
              <div className="pt-6">
                <Link href="/about" className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors border border-input bg-transparent hover:bg-accent hover:text-accent-foreground h-11 px-8 rounded-full">
                  {t('اقرأ قصتنا', 'Read Our Story')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Reusable Product Card Component
function ProductCard({ product }: { product: any }) {
  const { t } = useLanguage();
  const [isHovered, setIsHovered] = useState(false);
  
  // Real images fallback for demo
  const imageUrl = product.imageUrl || "/api/media/Perfume-05_1787598876727.jpg";
  const hoverImageUrl = product.hoverImageUrl || "/api/media/Perfume-06_1787598876727.jpg";

  return (
    <Link href={`/products/${product.slug}`}>
      <div 
        className="group cursor-pointer space-y-4"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-white">
          <img 
            src={imageUrl} 
            alt={t(product.nameAr, product.nameEn)}
            className={cn(
              "absolute inset-0 w-full h-full object-contain p-6 transition-opacity duration-500",
              isHovered && hoverImageUrl ? "opacity-0" : "opacity-100"
            )}
          />
          {hoverImageUrl && (
            <img 
              src={hoverImageUrl} 
              alt={`${t(product.nameAr, product.nameEn)} alternate`}
              className={cn(
                "absolute inset-0 w-full h-full object-contain p-6 transition-transform duration-700 scale-105",
                isHovered ? "opacity-100 transform scale-100" : "opacity-0"
              )}
            />
          )}
          
          {/* Badges */}
          <div className="absolute top-4 right-4 rtl:left-4 rtl:right-auto flex flex-col gap-2">
            {product.isFeatured && (
              <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest">
                {t('جديد', 'New')}
              </span>
            )}
            {product.compareAtPrice && (
              <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest">
                {t('تخفيض', 'Sale')}
              </span>
            )}
          </div>
        </div>
        
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground font-medium">{product.categoryNameAr ? t(product.categoryNameAr, product.categoryNameAr) : ''}</p>
          <h3 className="font-bold text-lg text-foreground truncate">{t(product.nameAr, product.nameEn)}</h3>
          <div className="flex items-center gap-3">
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
