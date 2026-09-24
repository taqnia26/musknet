import { useEffect } from 'react';
import { Link } from 'wouter';
import { useLanguage } from '@/hooks/use-language';
import './exclusive-destinations.css';

export default function ExclusiveDestinations() {
  const { t, lang } = useLanguage();
  const title = t('وجهاتنا الحصرية 2', 'Exclusive Destinations 2');
  const description = t(
    'وجهات مسك اللولو الحصرية: GLOW HOUSE في جدة، وBasenote وFour Seasons Riyadh وPAPILLON RIYADH في الرياض.',
    'Find Musk Ellolo at GLOW HOUSE in Jeddah, and Basenote, Four Seasons Riyadh and PAPILLON RIYADH in Riyadh.',
  );

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | MUSKELLOLO`;
    const restore = [
      ['name', 'description', description],
      ['property', 'og:title', document.title],
      ['property', 'og:description', description],
    ].map(([attribute, key, content]) => {
      const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      const meta = existing ?? document.createElement('meta');
      const previous = meta.getAttribute('content');
      meta.setAttribute(attribute, key);
      meta.content = content;
      if (!existing) document.head.append(meta);
      return () => {
        if (!existing) meta.remove();
        else if (previous === null) meta.removeAttribute('content');
        else meta.content = previous;
      };
    });
    return () => {
      document.title = previousTitle;
      restore.forEach(cleanup => cleanup());
    };
  }, [title, description]);

  return (
    <section className="exclusive-destinations" dir={lang === 'ar' ? 'rtl' : 'ltr'} aria-labelledby="destinations-title">
      <div className="exclusive-destinations__container">
        {/* The reference hides breadcrumb text but retains its 40px region. */}
        <nav className="exclusive-destinations__breadcrumbs" aria-label={t('مسار التنقل', 'Breadcrumb')}>
          <ol className="sr-only">
            <li><Link href="/">{t('الرئيسية', 'Home')}</Link></li>
            <li aria-current="page">{title}</li>
          </ol>
        </nav>
        <article className="exclusive-destinations__content">
          <h1 id="destinations-title">{title}</h1>
          <img
            src={`${import.meta.env.BASE_URL}site-assets/exclusive-destinations.png`}
            width={1846}
            height={852}
            alt={description}
            decoding="async"
          />
          {/* The reference's guest comments component is empty; preserve only its spacing. */}
        </article>
      </div>
    </section>
  );
}