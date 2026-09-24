import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Money, RiyalSymbol } from './money';
import { RevenueMoneyAxisTick } from './revenue-money-axis-tick';

describe('Saudi riyal amount presentation', () => {
  it('locks the visual order independently of the surrounding RTL or LTR direction', () => {
    for (const lang of ['ar', 'en'] as const) {
      const html = renderToStaticMarkup(<div dir={lang === 'ar' ? 'rtl' : 'ltr'}><Money value={1234.5} lang={lang} fractionDigits={2} /></div>);
      expect(html).toContain('1,234.50');
      expect(html).toContain(lang === 'ar' ? 'ريال سعودي' : 'Saudi riyals');
      expect(html).toContain('dir="ltr"');
      expect(html).not.toContain('ر.س');
      const numberPosition = html.indexOf('>1,234.50</span>');
      if (lang === 'ar') {
        expect(html).toContain('saudi-riyal-symbol.svg');
        expect(html).not.toContain('>SAR</span>');
        expect(html.indexOf('saudi-riyal-symbol.svg')).toBeLessThan(numberPosition);
      } else {
        expect(html).not.toContain('saudi-riyal-symbol.svg');
        expect(html.indexOf('>SAR</span>')).toBeGreaterThan(numberPosition);
      }
    }
  });

  it('preserves financial precision and the minus sign in the number', () => {
    const html = renderToStaticMarkup(<Money value="-1234.5678" lang="ar" minimumFractionDigits={2} maximumFractionDigits={4} />);
    expect(html).toContain('-1,234.5678');
    expect(html.indexOf('saudi-riyal-symbol.svg')).toBeLessThan(html.indexOf('>-1,234.5678</span>'));
  });

  it('lets the SVG artwork inherit contrast colors instead of relying on a font glyph', () => {
    const html = renderToStaticMarkup(<RiyalSymbol />);
    expect(html).toContain('background-color:currentColor');
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders revenue chart monetary axis values through Money in both languages', () => {
    for (const lang of ['ar', 'en'] as const) {
      for (const orientation of ['horizontal', 'vertical'] as const) {
        const html = renderToStaticMarkup(
          <svg><RevenueMoneyAxisTick x={100} y={40} payload={{ value: 1200 }} lang={lang} orientation={orientation} /></svg>,
        );
        expect(html).toContain('1.2');
        expect(html).toContain(lang === 'ar' ? 'ريال سعودي' : 'Saudi riyals');
        expect(html).toContain(lang === 'ar' ? 'saudi-riyal-symbol.svg' : '>SAR</span>');
        expect(html).not.toContain('DollarSign');
      }
    }
  });
});