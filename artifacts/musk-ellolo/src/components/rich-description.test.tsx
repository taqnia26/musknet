import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  isValidRichDescriptionHref,
  legacyTextToRichDescription,
  normalizeRichDescription,
  richDescriptionToPlainText,
  RichDescriptionRenderer,
} from './rich-description';

describe('rich product descriptions', () => {
  it('accepts only complete HTTP(S) and mailto links', () => {
    expect(isValidRichDescriptionHref('https://example.com/products/rose')).toBe(true);
    expect(isValidRichDescriptionHref('http://example.com')).toBe(true);
    expect(isValidRichDescriptionHref('mailto:help@example.com')).toBe(true);
    expect(isValidRichDescriptionHref('http://')).toBe(false);
    expect(isValidRichDescriptionHref('https://')).toBe(false);
    expect(isValidRichDescriptionHref('javascript:alert(1)')).toBe(false);
    expect(isValidRichDescriptionHref('https://example.com/a path')).toBe(false);
  });

  it('drops malformed persisted links instead of rendering them', () => {
    const rich = normalizeRichDescription({
      blocks: [{
        type: 'paragraph',
        align: 'start',
        effect: 'none',
        content: [{ text: 'not linked', href: 'http://' }],
      }],
    });
    expect(rich?.blocks[0].content[0]).toEqual({ text: 'not linked' });
  });

  it('preserves legacy literal angle brackets as text in editor and renderer', () => {
    const legacy = '<perfume> <b>not markup</b>';
    const rich = legacyTextToRichDescription(legacy);
    expect(richDescriptionToPlainText(rich)).toBe(legacy);
    const markup = renderToStaticMarkup(<RichDescriptionRenderer description={rich} />);
    expect(markup).toContain('&lt;perfume&gt; &lt;b&gt;not markup&lt;/b&gt;');
    expect(markup).not.toContain('<b>not markup</b>');
  });

  it('keeps long legacy lines and line breaks within the rich format limits', () => {
    const legacy = [...Array.from({ length: 105 }, (_, index) => `line ${index}`), 'x'.repeat(4500)].join('\n');
    const rich = legacyTextToRichDescription(legacy);
    expect(rich.blocks.length).toBeLessThanOrEqual(100);
    expect(rich.blocks.every((block) => block.content.every((span) => span.text.length <= 2000))).toBe(true);
    expect(richDescriptionToPlainText(rich)).toBe(legacy);
  });
});