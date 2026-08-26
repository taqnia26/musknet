import { useLanguage } from '@/hooks/use-language';
import { Link } from 'wouter';

const siteAsset = (filename: string) => `${import.meta.env.BASE_URL}site-assets/${filename}`;

export default function Home() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col w-full min-h-screen bg-white">
      
      {/* Hero Video */}
      <section className="relative w-full aspect-[427/240] overflow-hidden bg-black">
        <video 
          className="absolute inset-0 block w-full h-full object-cover" 
          width="854"
          height="480"
          autoPlay 
          muted 
          loop 
          playsInline 
          preload="metadata"
          poster={siteAsset('hero-poster.jpg')}
        >
          <source src={siteAsset('22-56c1742b4d.mp4')} type="video/mp4" />
        </video>
      </section>

      {/* Dual Banners */}
      <section className="container mx-auto px-4 py-8 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
          <Link href="/categories/hair" className="group relative block overflow-hidden rounded">
            <img 
              src={siteAsset('3170661a-daf7-45ff-9c66-58e2b589626b-d4d4f9e225.webp')} 
              alt="عطور الشعر" 
              className="w-full object-cover aspect-[16/9] md:aspect-auto transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <h2 className="text-3xl md:text-5xl font-bold text-white relative after:content-[''] after:absolute after:-bottom-4 after:left-1/2 after:-translate-x-1/2 after:w-12 after:h-0.5 after:bg-white transition-all group-hover:after:w-full">
                {t('عطور الشعر', 'Hair Perfumes')}
              </h2>
            </div>
          </Link>
          <Link href="/categories/perfumes" className="group relative block overflow-hidden rounded">
            <img 
              src={siteAsset('c48192b3-27ca-410a-b791-7cb460a3103b-6f95597991.webp')} 
              alt="عطور" 
              className="w-full object-cover aspect-[16/9] md:aspect-auto transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <h2 className="text-3xl md:text-5xl font-bold text-white relative after:content-[''] after:absolute after:-bottom-4 after:left-1/2 after:-translate-x-1/2 after:w-12 after:h-0.5 after:bg-white transition-all group-hover:after:w-full">
                {t('عطور', 'Perfumes')}
              </h2>
            </div>
          </Link>
        </div>
      </section>

      {/* Editorial Section */}
      <section className="container mx-auto px-4 py-8 md:py-16">
        <div className="flex flex-col-reverse md:flex-row gap-8 items-center bg-gray-50">
          <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col items-center text-center">
            <h1 className="text-2xl md:text-4xl font-bold mb-6 text-black leading-tight">
              {t('العقل المبدع خلف مجموعة عطور مسك اللولو 2026', 'The creative mind behind the 2026 Musk Ellolo perfume collection')}
            </h1>
            <p className="text-gray-600 mb-8 max-w-lg leading-relaxed text-sm md:text-base">
              {t(
                'نفخر بتعاوننا مع Master Perfumer كريس موريس كاربونيل، العقل الإبداعي وراء مجموعتنا العطرية الجديدة.',
                'Proud to collaborate with Master Perfumer Chris Maurice Carbonnel, the creative force behind our new fragrance collection.'
              )}
            </p>
            <a 
              href="https://youtube.com/shorts/nM31QkW3It0" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="bg-[#050f2c] text-white px-8 py-3 rounded text-sm hover:bg-black transition-colors"
            >
              {t('شاهد الفيديو', 'Watch Video')}
            </a>
          </div>
          <div className="w-full md:w-1/2">
            <img 
              src={siteAsset('a049986c-c342-4363-bd46-d04e1188a820-c4fcb4f830.webp')} 
              alt="Chris Maurice Carbonnel" 
              className="w-full h-full object-cover hidden md:block"
            />
            <img 
              src={siteAsset('1e945aea-f6c1-4e25-b1e6-c137f87ecfd9-327c2ab926.webp')} 
              alt="Chris Maurice Carbonnel" 
              className="w-full h-full object-cover block md:hidden"
            />
          </div>
        </div>
      </section>

      {/* Second Video Section */}
      <section className="relative w-full aspect-video mb-16 overflow-hidden bg-black">
        <video 
          className="absolute inset-0 block w-full h-full object-cover" 
          width="1280"
          height="720"
          autoPlay 
          muted 
          loop 
          playsInline 
          controls
          preload="metadata"
          poster={siteAsset('second-video-poster.jpg')}
        >
          <source src={siteAsset('1-mobile.webm')} type="video/webm" />
          <source src={siteAsset('1-mobile.mp4')} type="video/mp4" />
          {t('متصفحك لا يدعم تشغيل الفيديو.', 'Your browser does not support video playback.')}
        </video>
      </section>

      {/* Destinations Banner */}
      <section className="container mx-auto px-4 py-8 mb-16 flex flex-col items-center">
        <div className="w-full max-w-4xl mx-auto">
          <img 
            src={siteAsset('a3e884dd-7169-41b1-811a-a4d64ddd15e7-original-d7f7e86104.webp')} 
            alt="Destinations" 
            className="w-full h-auto object-contain mix-blend-multiply"
          />
        </div>
      </section>

    </div>
  );
}
