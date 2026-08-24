import { useLanguage } from '@/hooks/use-language';
import { useGetHomeContent } from '@workspace/api-client-react';

export default function About() {
  const { t } = useLanguage();
  const { data: content } = useGetHomeContent();
  
  return (
    <div className="w-full bg-background animate-in fade-in duration-700">
      
      {/* Hero Section */}
      <section className="relative h-[60dvh] w-full flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src={content?.aboutImageUrl || "/api/media/Perfume-04_1787598876726.jpg"} 
            alt="About Musk Ellolo" 
            className="w-full h-full object-cover object-center opacity-60 mix-blend-multiply"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent"></div>
        </div>

        <div className="relative z-10 text-center max-w-3xl px-4">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-foreground tracking-tight">
            {t('قصة مسك اللولو', 'The Story of Musk Ellolo')}
          </h1>
          <p className="text-xl md:text-2xl text-foreground/80 font-serif">
            {t('حيث تلتقي الأصالة بالفخامة', 'Where Heritage Meets Luxury')}
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-24">
        <div className="container mx-auto px-4 max-w-4xl space-y-24">
          
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl font-bold text-primary">{t('بدايتنا', 'Our Beginning')}</h2>
              <p className="text-lg text-muted-foreground leading-relaxed text-justify">
                {t(
                  'بدأت رحلة مسك اللولو بشغف عميق للروائح التي تروي قصصاً لا تُنسى. استلهمنا من سحر الشرق وعراقته لنبتكر عطوراً تجسد الفخامة والأناقة في كل قطرة.',
                  'The journey of Musk Ellolo began with a deep passion for scents that tell unforgettable stories. We were inspired by the magic and heritage of the East to create fragrances that embody luxury and elegance in every drop.'
                )}
              </p>
            </div>
            <div className="aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl">
              <img src="/api/media/Perfume-03_1787598876725.jpg" alt="Heritage" className="w-full h-full object-cover" />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center flex-col-reverse md:flex-row-reverse">
            <div className="aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl">
              <img src="/api/media/Perfume-05_1787598876727.jpg" alt="Craftsmanship" className="w-full h-full object-cover" />
            </div>
            <div className="space-y-6">
              <h2 className="text-3xl font-bold text-primary">{t('الإبداع الحرفي', 'Craftsmanship')}</h2>
              <p className="text-lg text-muted-foreground leading-relaxed text-justify">
                {t(
                  'كل زجاجة عطر من مسك اللولو هي تحفة فنية بحد ذاتها. نحن نختار أندر المكونات وأجود الزيوت العطرية من مختلف أنحاء العالم، وندمجها بحرفية عالية لنضمن لك تجربة عطرية استثنائية تدوم طويلاً.',
                  'Every bottle of Musk Ellolo perfume is a masterpiece in itself. We select the rarest ingredients and the finest essential oils from around the world, blending them with high craftsmanship to guarantee you an exceptional, long-lasting fragrance experience.'
                )}
              </p>
            </div>
          </div>

          <div className="text-center max-w-2xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold text-primary">{t('رؤيتنا', 'Our Vision')}</h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              {t(
                'نسعى لأن نكون الرمز الأول للعطور الفاخرة التي تعبر عن الشخصية العربية الأصيلة بلمسة عصرية، وأن نترك أثراً عطرياً يخلد في الذاكرة.',
                'We strive to be the premier symbol of luxury perfumes that express the authentic Arabic personality with a modern touch, and to leave a fragrant trace that is immortalized in memory.'
              )}
            </p>
          </div>

        </div>
      </section>

    </div>
  );
}
