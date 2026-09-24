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
  it('preserves each effect and speed in the rendered description and defaults old speeds', () => {
    const effects = ['fade', 'zoom', 'rise', 'drop', 'slide-left', 'slide-right', 'blur', 'rotate', 'flip', 'bounce'];
    const rich = normalizeRichDescription({
      blocks: effects.map((effect) => ({
        type: 'paragraph', align: 'start', effect, effectSpeed: 0.5, content: [{ text: effect }],
      })),
    });
    expect(rich?.blocks).toHaveLength(10);
    const markup = renderToStaticMarkup(<RichDescriptionRenderer description={rich!} />);
    for (const effect of effects) {
      expect(markup).toContain(`rich-description-effect--${effect}`);
    }
    expect(markup).toContain('3600ms');
    const old = normalizeRichDescription({ blocks: [{ type: 'paragraph', align: 'start', effect: 'fade', content: [{ text: 'old' }] }] });
    expect(renderToStaticMarkup(<RichDescriptionRenderer description={old!} />)).toContain('1800ms');
  });

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

  it('keeps all legacy paragraphs, blank lines and trailing newlines in one rendered block', () => {
    const legacy = 'first\r\n\r\nsecond\rthird\n';
    const rich = legacyTextToRichDescription(legacy);
    expect(rich.blocks).toEqual([{
      type: 'paragraph', align: 'start', effect: 'none', content: [{ text: 'first\n\nsecond\nthird\n' }],
    }]);
    const markup = renderToStaticMarkup(<RichDescriptionRenderer description={rich} />);
    expect(markup.match(/<p\b/g)).toHaveLength(1);
    expect(markup).toContain('whitespace-pre-wrap');
    expect(richDescriptionToPlainText(rich)).toBe('first\n\nsecond\nthird\n');
    expect(legacyTextToRichDescription(null).blocks).toEqual([{ type: 'paragraph', align: 'start', effect: 'none', content: [{ text: '' }] }]);
  });

  it('keeps long legacy text within the span limit without introducing extra boxes', () => {
    const legacy = [...Array.from({ length: 105 }, (_, index) => `line ${index}`), '', 'x'.repeat(4500), ''].join('\n');
    const rich = legacyTextToRichDescription(legacy);
    expect(rich.blocks).toHaveLength(1);
    expect(rich.blocks[0].content.length).toBe(Math.ceil(legacy.length / 2000));
    expect(rich.blocks[0].content.every((span) => span.text.length <= 2000)).toBe(true);
    expect(richDescriptionToPlainText(rich)).toBe(legacy);
    expect(renderToStaticMarkup(<RichDescriptionRenderer description={rich} />).match(/<p\b/g)).toHaveLength(1);
  });

  it('preserves deliberately authored rich blocks instead of flattening them as legacy text', () => {
    const saved = {
      blocks: [
        { type: 'heading2', align: 'center', effect: 'fade', effectSpeed: 1.25, content: [{ text: 'Title', bold: true }] },
        { type: 'bullet', align: 'end', effect: 'none', content: [{ text: 'Visit', href: 'https://example.com' }, { text: ' us', color: 'gold' }] },
        { type: 'paragraph', align: 'start', effect: 'none', content: [{ text: 'Line one\n\nLine two', italic: true }] },
      ],
    };
    const rich = normalizeRichDescription(saved);
    expect(rich).toEqual(saved);
    const markup = renderToStaticMarkup(<RichDescriptionRenderer description={rich!} />);
    expect(markup).toContain('<h2');
    expect(markup).toContain('<ul');
    expect(markup).toContain('href="https://example.com"');
    expect(markup).toContain('rich-description-effect--fade');
    expect(markup).toContain('1440ms');
    expect(markup.match(/<p\b/g)).toHaveLength(1);
  });
});