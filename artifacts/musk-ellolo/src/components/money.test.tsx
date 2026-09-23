import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Money, RiyalSymbol } from './money';

describe('Saudi riyal amount presentation', () => {
  it('keeps the amount readable and announces the currency in Arabic and English', () => {
    for (const lang of ['ar', 'en'] as const) {
      const html = renderToStaticMarkup(<Money value={1234.5} lang={lang} fractionDigits={2} />);
      expect(html).toContain('1,234.50');
      expect(html).toContain(lang === 'ar' ? 'ريال سعودي' : 'Saudi riyals');
      expect(html).toContain('dir="ltr"');
      expect(html).toContain('saudi-riyal-symbol.svg');
      expect(html).not.toContain('ر.س');
      expect(html).not.toContain('SAR');
    }
  });

  it('lets the SVG artwork inherit contrast colors instead of relying on a font glyph', () => {
    const html = renderToStaticMarkup(<RiyalSymbol />);
    expect(html).toContain('background-color:currentColor');
    expect(html).toContain('aria-hidden="true"');
  });
});