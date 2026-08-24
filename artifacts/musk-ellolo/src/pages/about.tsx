import { useLanguage } from '@/hooks/use-language';
import { Link } from 'wouter';

export default function About() {
  const { t } = useLanguage();

  return (
    <div className="w-full bg-white min-h-screen">
      <div className="container mx-auto px-4 py-16 md:py-24 max-w-4xl text-center flex flex-col items-center">
        
        <h1 className="text-2xl md:text-3xl font-bold mb-16 text-black">
          {t('من نحن', 'About Us')}
        </h1>

        <div className="space-y-12 w-full">
          {/* Story */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-black">{t('قصة مسك اللولو', 'Musk Ellolo Story')}</h2>
            <p className="text-gray-700 leading-relaxed max-w-2xl mx-auto">
              {t(
                'تأسست دار عطور مسك اللولو عام 2011م بالتعاون مع أهم العطارين المحترفين في العالم. حيث تخصصنا بصناعة منتجات عطرية متنوعة ترتكز في تكوينها على المسك، لننتج من خلالها مجموعة من الروائح الشرقية والفرنسية الفريدة بتصميمنا الحصري المتناغم بحبات اللولو، لنصنع منها اسم مسك اللولو.',
                'Musk Ellolo Perfume House was established in 2011 in collaboration with the world\'s most prominent professional perfumers. We specialized in creating diverse aromatic products based on musk, producing a collection of unique Oriental and French scents with our exclusive design harmonizing with pearls, creating the name Musk Ellolo.'
              )}
            </p>
          </div>

          {/* Vision */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-black">{t('رؤيتنا', 'Our Vision')}</h2>
            <p className="text-gray-700 leading-relaxed max-w-2xl mx-auto">
              {t(
                'نطمح بأن نحتل مكانة متميزة محلياً وعالمياً في صناعة العطور.',
                'We aspire to occupy a distinguished position locally and globally in the perfume industry.'
              )}
            </p>
          </div>

          {/* Values */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-black">{t('قيمنا', 'Our Values')}</h2>
            <p className="text-gray-700 leading-relaxed max-w-2xl mx-auto">
              {t(
                'في مسك اللولو نعمل لإنتاج أجود وأفخر أنواع الزيوت العطرية والعطور، لنصنع وجهة سعودية مبتكرة ورائدة في صناعة العطور. فنحن حريصون على تقديم أفضل الخدمات والمنتجات المصنعة بأيدي خبراء مختصين بأعلى المستويات.',
                'At Musk Ellolo, we work to produce the finest and most luxurious essential oils and perfumes, creating an innovative and leading Saudi destination in the perfume industry. We are keen on providing the best services and products manufactured by specialized experts at the highest levels.'
              )}
            </p>
          </div>
          
          <div className="pt-8 text-gray-500 font-medium">
            {t('رقم السجل التجاري: 1010311811', 'Commercial Register Number: 1010311811')}
          </div>
        </div>

      </div>
    </div>
  );
}
