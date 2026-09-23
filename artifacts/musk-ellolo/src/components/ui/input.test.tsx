import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Input } from './input';

describe('numeric input display', () => {
  it('shows number fields with an English locale and left-to-right direction', () => {
    const html = renderToStaticMarkup(<Input type="number" value="399" readOnly />);
    expect(html).toContain('lang="en-US"');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('value="399"');
  });

  it('shows Arabic keyboard digits as English digits only in numeric text fields', () => {
    const numeric = renderToStaticMarkup(<Input inputMode="decimal" value="٣٩٩٫٥" readOnly />);
    const phone = renderToStaticMarkup(<Input type="tel" value="۰۵۰" readOnly />);
    const regularText = renderToStaticMarkup(<Input value="اسم ٣" readOnly />);
    expect(numeric).toContain('value="399.5"');
    expect(phone).toContain('value="050"');
    expect(regularText).toContain('value="اسم ٣"');
  });
});