import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Italic, Link2, List, ListOrdered, Minus, Plus, Underline } from 'lucide-react';
import type { RichBlock, RichBlockAlign, RichBlockEffect, RichBlockType, RichDescription, RichSpan, RichSpanColor } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type { RichBlock, RichBlockType, RichDescription, RichSpan };
type RichAlign = RichBlockAlign;
type RichEffect = RichBlockEffect;
type RichColor = RichSpanColor;

const emptyBlock = (): RichBlock => ({ type: 'paragraph', align: 'start', effect: 'none', content: [{ text: '' }] });
const allowedTypes: RichBlockType[] = ['paragraph', 'heading2', 'heading3', 'bullet', 'ordered'];
const allowedAlignments: RichAlign[] = ['start', 'center', 'end'];
const allowedEffects: RichEffect[] = ['none', 'fade', 'zoom', 'rise', 'drop', 'slide-left', 'slide-right', 'blur', 'rotate', 'flip', 'bounce'];
const allowedColors: RichColor[] = ['default', 'red', 'blue', 'gold'];
const validEffectSpeed = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 2 && value * 4 % 1 === 0;

export function normalizeRichDescription(value: unknown): RichDescription | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { blocks?: unknown }).blocks)) return null;
  const blocks = (value as { blocks: unknown[] }).blocks.flatMap((raw): RichBlock[] => {
    if (!raw || typeof raw !== 'object') return [];
    const block = raw as Record<string, unknown>;
    const content = Array.isArray(block.content) ? block.content.flatMap((rawSpan): RichSpan[] => {
      if (!rawSpan || typeof rawSpan !== 'object' || typeof (rawSpan as Record<string, unknown>).text !== 'string') return [];
      const span = rawSpan as Record<string, unknown>;
      const href = safeHref(span.href);
      const color = allowedColors.includes(span.color as RichColor) ? span.color as RichColor : 'default';
      return [{
        text: span.text as string,
        ...(span.bold === true ? { bold: true } : {}),
        ...(span.italic === true ? { italic: true } : {}),
        ...(span.underline === true ? { underline: true } : {}),
        ...(color !== 'default' ? { color } : {}),
        ...(href ? { href } : {}),
      }];
    }) : [];
    return [{
      type: allowedTypes.includes(block.type as RichBlockType) ? block.type as RichBlockType : 'paragraph',
      align: allowedAlignments.includes(block.align as RichAlign) ? block.align as RichAlign : 'start',
      effect: allowedEffects.includes(block.effect as RichEffect) ? block.effect as RichEffect : 'none',
      ...(validEffectSpeed(block.effectSpeed) ? { effectSpeed: block.effectSpeed } : {}),
      content: content.length ? content : [{ text: '' }],
    }];
  });
  return { blocks: blocks.length ? blocks : [emptyBlock()] };
}

function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const href = value.trim();
  return href.length <= 2048 && isValidRichDescriptionHref(href) ? href : undefined;
}

export function isValidRichDescriptionHref(href: string): boolean {
  if (!href || href.length > 2048 || /[\s<>]/.test(href)) return false;
  try {
    const parsed = new URL(href);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname) {
      return !parsed.username && !parsed.password;
    }
    return parsed.protocol === 'mailto:' && /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function legacyTextToRichDescription(text: string | null | undefined): RichDescription {
  const normalized = (text || '').replace(/\r\n?/g, '\n');
  return { blocks: [{
    ...emptyBlock(),
    content: normalized
      ? Array.from({ length: Math.ceil(normalized.length / 2000) }, (_, i) => ({ text: normalized.slice(i * 2000, (i + 1) * 2000) }))
      : [{ text: '' }],
  }] };
}

export function richDescriptionToPlainText(value: RichDescription): string {
  return value.blocks.map((block) => {
    const text = block.content.map((span) => span.text).join('');
    if (block.type === 'bullet') return `• ${text}`;
    if (block.type === 'ordered') return `1. ${text}`;
    return text;
  }).join('\n');
}

const colorStyles: Record<Exclude<RichColor, 'default'>, string> = {
  red: '#c0392b',
  blue: '#2463a6',
  gold: '#a87900',
};

function readInlineContent(root: HTMLElement): RichSpan[] {
  if (root.childNodes.length === 1 && root.firstChild instanceof HTMLElement && root.firstChild.tagName === 'BR') return [{ text: '' }];
  const output: RichSpan[] = [];
  const appendText = (text: string, format: Omit<RichSpan, 'text'>) => {
    let remaining = text.replace(/\r\n?/g, '\n');
    while (remaining) {
      const last = output[output.length - 1];
      const sameFormat = last && last.bold === format.bold && last.italic === format.italic
        && last.underline === format.underline && last.color === format.color && last.href === format.href;
      if (sameFormat && last.text.length < 2000) {
        const length = 2000 - last.text.length;
        last.text += remaining.slice(0, length);
        remaining = remaining.slice(length);
      } else {
        output.push({ ...format, text: remaining.slice(0, 2000) });
        remaining = remaining.slice(2000);
      }
    }
  };
  const isBlock = (node: Node) => node instanceof HTMLElement && (node.tagName === 'DIV' || node.tagName === 'P');
  const walk = (node: Node, inherited: Omit<RichSpan, 'text'> = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text) appendText(text, inherited);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const next = { ...inherited };
    if (node.tagName === 'B' || node.tagName === 'STRONG') next.bold = true;
    if (node.tagName === 'I' || node.tagName === 'EM') next.italic = true;
    if (node.tagName === 'U') next.underline = true;
    const color = node.dataset.richColor as RichColor | undefined;
    if (color && allowedColors.includes(color)) next.color = color;
    const href = safeHref(node.getAttribute('href'));
    if (href) next.href = href;
    if (node.tagName === 'BR') {
      appendText('\n', next);
      return;
    }
    // An empty editable paragraph contains a placeholder <br>; its line break
    // comes from the boundary between blocks, not from that placeholder.
    if (isBlock(node) && node.childNodes.length === 1 && node.firstChild instanceof HTMLElement && node.firstChild.tagName === 'BR') return;
    let previous: Node | null = null;
    node.childNodes.forEach((child) => {
      if (previous && (isBlock(previous) || isBlock(child))) appendText('\n', next);
      walk(child, next);
      previous = child;
    });
  };
  let previous: Node | null = null;
  root.childNodes.forEach((node) => {
    if (previous && (isBlock(previous) || isBlock(node))) appendText('\n', {});
    walk(node);
    previous = node;
  });
  return output.length ? output : [{ text: '' }];
}

function InlineContent({ spans }: { spans: RichSpan[] }) {
  return <>{spans.map((span, index) => {
    let content: React.ReactNode = span.text;
    if (span.bold) content = <strong>{content}</strong>;
    if (span.italic) content = <em>{content}</em>;
    if (span.underline) content = <u>{content}</u>;
    if (span.color && span.color !== 'default') {
      content = <span style={{ color: colorStyles[span.color] }} data-rich-color={span.color}>{content}</span>;
    }
    const href = safeHref(span.href);
    if (href) content = <a href={href} rel="noopener noreferrer" className="underline">{content}</a>;
    return <span key={`${index}-${span.text.slice(0, 16)}`}>{content}</span>;
  })}</>;
}

function mountEditableContent(root: HTMLElement, spans: RichSpan[]) {
  root.replaceChildren();
  for (const span of spans) {
    let node: Node = document.createTextNode(span.text);
    const wrap = (tag: string) => {
      const element = document.createElement(tag);
      element.appendChild(node);
      node = element;
      return element;
    };
    if (span.bold) wrap('strong');
    if (span.italic) wrap('em');
    if (span.underline) wrap('u');
    if (span.color && span.color !== 'default' && allowedColors.includes(span.color)) {
      const colorNode = wrap('span');
      colorNode.dataset.richColor = span.color;
      colorNode.style.color = colorStyles[span.color];
    }
    const href = safeHref(span.href);
    if (href) {
      const anchor = wrap('a');
      anchor.setAttribute('href', href);
    }
    root.appendChild(node);
  }
}

const alignmentClass: Record<RichAlign, string> = { start: 'text-start', center: 'text-center', end: 'text-end' };
const effectClass: Record<RichEffect, string> = Object.fromEntries(
  allowedEffects.map((effect) => [effect, effect === 'none' ? '' : `rich-description-effect rich-description-effect--${effect}`]),
) as Record<RichEffect, string>;

export function RichDescriptionRenderer({ description, className }: { description: RichDescription; className?: string }) {
  const blocks = normalizeRichDescription(description)?.blocks ?? [];
  let orderedNumber = 0;
  return <div className={cn('rich-description space-y-4', className)}>
    {blocks.map((block, index) => {
      orderedNumber = block.type === 'ordered' ? orderedNumber + 1 : 0;
      const content = <InlineContent spans={block.content} />;
      const attrs = {
        className: cn(alignmentClass[block.align], effectClass[block.effect], 'whitespace-pre-wrap break-words'),
        'data-description-effect': block.effect,
        style: { '--rich-effect-duration': `${1800 / (block.effectSpeed ?? 1)}ms` } as React.CSSProperties,
      };
      if (block.type === 'heading2') return <h2 key={index} {...attrs} className={cn(attrs.className, 'text-xl font-semibold')}>{content}</h2>;
      if (block.type === 'heading3') return <h3 key={index} {...attrs} className={cn(attrs.className, 'text-lg font-semibold')}>{content}</h3>;
      if (block.type === 'bullet') return <ul key={index} {...attrs} className={cn(attrs.className, 'list-disc ps-6')}><li>{content}</li></ul>;
      if (block.type === 'ordered') return <ol key={index} start={orderedNumber} {...attrs} className={cn(attrs.className, 'list-decimal ps-6')}><li>{content}</li></ol>;
      return <p key={index} {...attrs}>{content}</p>;
    })}
  </div>;
}

function useEffectReveal(containerRef: React.RefObject<HTMLElement | null>, description: RichDescription) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-description-effect]:not([data-description-effect="none"]):not(.rich-description-effect--visible)'));
    if (!nodes.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('rich-description-effect--visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [containerRef, description]);
}

export function AnimatedRichDescriptionRenderer({ description, className }: { description: RichDescription; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffectReveal(rootRef, description);
  return <div ref={rootRef}><RichDescriptionRenderer description={description} className={className} /></div>;
}

function EditorBlock({ block, index, lang, onChange, onRemove, canRemove }: {
  block: RichBlock; index: number; lang: 'ar' | 'en'; onChange: (index: number, block: RichBlock) => void; onRemove: (index: number) => void; canRemove: boolean;
}) {
  const editableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editableRef.current) mountEditableContent(editableRef.current, block.content);
    // Blocks remount on opening a different product; React never owns editable children.
  }, []);
  const selectionRef = useRef<{ editable: HTMLDivElement; range: Range } | null>(null);
  const latestBlockRef = useRef(block);
  if (latestBlockRef.current.type !== block.type || latestBlockRef.current.align !== block.align || latestBlockRef.current.effect !== block.effect || latestBlockRef.current.effectSpeed !== block.effectSpeed) {
    latestBlockRef.current = { ...block, content: latestBlockRef.current.content };
  }
  const [linkUrl, setLinkUrl] = useState('');
  const [feedback, setFeedback] = useState('');
  const label = (ar: string, en: string) => lang === 'ar' ? ar : en;

  const saveSelection = useCallback(() => {
    const editable = editableRef.current;
    const selection = window.getSelection();
    if (!editable || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editable.contains(range.startContainer) && editable.contains(range.endContainer)) {
      selectionRef.current = { editable, range: range.cloneRange() };
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const saved = selectionRef.current;
    const editable = editableRef.current;
    if (!saved || !editable || saved.editable !== editable || !editable.isConnected
      || !editable.contains(saved.range.startContainer) || !editable.contains(saved.range.endContainer)) return false;
    editable.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(saved.range);
    return !saved.range.collapsed;
  }, []);

  const updateText = useCallback(() => {
    const element = editableRef.current;
    if (element) {
      const updated = { ...latestBlockRef.current, content: readInlineContent(element) };
      latestBlockRef.current = updated;
      onChange(index, updated);
    }
  }, [index, onChange]);

  const applyCommand = (command: string, value?: string) => {
    if (!restoreSelection()) {
      setFeedback(label('حدد نصاً في هذه الفقرة أولاً لتطبيق التنسيق.', 'Select text in this block before applying formatting.'));
      return;
    }
    document.execCommand(command, false, value);
    setFeedback('');
    updateText();
  };
  const applyColor = (color: RichColor) => {
    if (!restoreSelection()) {
      setFeedback(label('حدد نصاً في هذه الفقرة أولاً لتطبيق اللون.', 'Select text in this block before applying a color.'));
      return;
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const span = document.createElement('span');
    span.dataset.richColor = color;
    if (color !== 'default') span.style.color = colorStyles[color];
    const range = selection.getRangeAt(0);
    span.appendChild(range.extractContents());
    range.insertNode(span);
    selection.removeAllRanges();
    selection.addRange(range);
    setFeedback('');
    updateText();
  };

  const applyLink = () => {
    saveSelection();
    if (!restoreSelection()) {
      setFeedback(label('حدد نصاً في هذه الفقرة أولاً لإضافة رابط.', 'Select text in this block before adding a link.'));
      return;
    }
    const url = window.prompt(label('أدخل رابطاً صالحاً يبدأ بـ https:// أو http:// أو mailto:', 'Enter a valid https://, http:// or mailto: link'), linkUrl);
    if (url === null) return;
    const href = url.trim();
    if (!isValidRichDescriptionHref(href)) {
      setFeedback(label('الرابط غير صالح. استخدم عنواناً كاملاً يبدأ بـ https:// أو http:// أو mailto:.', 'Invalid link. Use a complete https://, http:// or mailto: address.'));
      restoreSelection();
      return;
    }
    if (!restoreSelection()) {
      setFeedback(label('تعذر استعادة النص المحدد. حدده مجدداً ثم أضف الرابط.', 'Could not restore the selection. Select the text again and add the link.'));
      return;
    }
    document.execCommand('createLink', false, href);
    setLinkUrl(href);
    setFeedback('');
    updateText();
  };

  const editBlock = (key: 'type' | 'align' | 'effect', value: string) => {
    const updated = { ...latestBlockRef.current, [key]: value } as RichBlock;
    latestBlockRef.current = updated;
    onChange(index, updated);
  };
  const editSpeed = (speed: number) => {
    const updated = { ...latestBlockRef.current, effectSpeed: speed };
    latestBlockRef.current = updated;
    onChange(index, updated);
  };

  const buttons = [
    { label: label('غامق', 'Bold'), icon: <Bold className="h-4 w-4" />, action: () => applyCommand('bold') },
    { label: label('مائل', 'Italic'), icon: <Italic className="h-4 w-4" />, action: () => applyCommand('italic') },
    { label: label('تحته خط', 'Underline'), icon: <Underline className="h-4 w-4" />, action: () => applyCommand('underline') },
    { label: label('رابط', 'Link'), icon: <Link2 className="h-4 w-4" />, action: applyLink },
  ];

  return <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center gap-1 border-b bg-slate-50 p-2" aria-label={label(`أدوات تنسيق الفقرة ${index + 1}`, `Formatting tools for block ${index + 1}`)}>
      {buttons.map((button) => <Button key={button.label} type="button" variant="ghost" size="icon" className="h-9 w-9 touch-manipulation" aria-label={button.label} title={button.label} onMouseDown={(event) => { saveSelection(); event.preventDefault(); }} onClick={button.action}>{button.icon}</Button>)}
      <span className="mx-1 h-6 border-s border-slate-300" aria-hidden="true" />
      <label className="sr-only" htmlFor={`rich-type-${lang}-${index}`}>{label('نوع الفقرة', 'Block type')}</label>
      <select id={`rich-type-${lang}-${index}`} aria-label={label('نوع الفقرة', 'Block type')} value={block.type} onChange={(event) => editBlock('type', event.target.value)} className="h-9 max-w-[130px] rounded-md border bg-white px-2 text-xs">
        <option value="paragraph">{label('فقرة', 'Paragraph')}</option><option value="heading2">{label('عنوان 2', 'Heading 2')}</option><option value="heading3">{label('عنوان 3', 'Heading 3')}</option><option value="bullet">{label('تعداد نقطي', 'Bullet')}</option><option value="ordered">{label('تعداد رقمي', 'Numbered')}</option>
      </select>
      <label className="sr-only" htmlFor={`rich-align-${lang}-${index}`}>{label('محاذاة الفقرة', 'Block alignment')}</label>
      <select id={`rich-align-${lang}-${index}`} aria-label={label('محاذاة الفقرة', 'Block alignment')} value={block.align} onChange={(event) => editBlock('align', event.target.value)} className="h-9 max-w-[115px] rounded-md border bg-white px-2 text-xs">
        <option value="start">{label('بداية السطر', 'Start')}</option><option value="center">{label('توسيط', 'Center')}</option><option value="end">{label('نهاية السطر', 'End')}</option>
      </select>
      <label className="sr-only" htmlFor={`rich-effect-${lang}-${index}`}>{label('تأثير الحركة', 'Motion effect')}</label>
      <select id={`rich-effect-${lang}-${index}`} aria-label={label('تأثير الحركة', 'Motion effect')} value={block.effect} onChange={(event) => editBlock('effect', event.target.value)} className="h-9 max-w-[145px] rounded-md border bg-white px-2 text-xs">
        <option value="none">{label('بدون تأثير', 'No effect')}</option>
        <option value="fade">{label('تلاشي', 'Fade')}</option>
        <option value="zoom">{label('تكبير', 'Zoom')}</option>
        <option value="rise">{label('صعود', 'Rise')}</option>
        <option value="drop">{label('هبوط', 'Drop')}</option>
        <option value="slide-left">{label('انزلاق من اليسار', 'Slide from left')}</option>
        <option value="slide-right">{label('انزلاق من اليمين', 'Slide from right')}</option>
        <option value="blur">{label('إزالة الضبابية', 'Unblur')}</option>
        <option value="rotate">{label('دوران خفيف', 'Soft rotate')}</option>
        <option value="flip">{label('تقليب', 'Flip')}</option>
        <option value="bounce">{label('ارتداد', 'Bounce')}</option>
      </select>
      <label className="sr-only" htmlFor={`rich-color-${lang}-${index}`}>{label('لون النص المحدد', 'Selected text color')}</label>
      <select id={`rich-color-${lang}-${index}`} defaultValue="default" onMouseDown={saveSelection} onKeyDown={saveSelection} onChange={(event) => applyColor(event.target.value as RichColor)} aria-label={label('لون النص المحدد', 'Selected text color')} className="h-9 max-w-[105px] rounded-md border bg-white px-2 text-xs">
        <option value="default">{label('افتراضي', 'Default')}</option><option value="red">{label('أحمر', 'Red')}</option><option value="blue">{label('أزرق', 'Blue')}</option><option value="gold">{label('ذهبي', 'Gold')}</option>
      </select>
      <span className="ms-auto" />
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" aria-label={label('حذف الفقرة', 'Remove block')} title={label('حذف الفقرة', 'Remove block')} disabled={!canRemove} onClick={() => onRemove(index)}><Minus className="h-4 w-4" /></Button>
    </div>
    {block.effect !== 'none' && <div className="flex flex-wrap items-center gap-3 border-b bg-slate-50 px-4 py-2 text-xs">
      <label htmlFor={`rich-effect-speed-${lang}-${index}`} className="font-medium">{label('سرعة التأثير', 'Effect speed')}</label>
      <span className="text-slate-500">{label('أبطأ', 'Slower')}</span>
      <input id={`rich-effect-speed-${lang}-${index}`} type="range" min="0.5" max="2" step="0.25" value={block.effectSpeed ?? 1} onChange={(event) => editSpeed(Number(event.target.value))} className="min-w-[120px] flex-1 accent-[#35c3a4]" />
      <span className="text-slate-500">{label('أسرع', 'Faster')}</span>
      <output htmlFor={`rich-effect-speed-${lang}-${index}`} className="min-w-[3rem] text-center font-semibold tabular-nums" dir="ltr">{(block.effectSpeed ?? 1).toFixed(2)}×</output>
    </div>}
    <div
      ref={editableRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={label(`محتوى الفقرة ${index + 1}`, `Block ${index + 1} content`)}
      aria-multiline="true"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      onInput={updateText}
      onPaste={(event) => {
        event.preventDefault();
        document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
        updateText();
      }}
      onDrop={(event) => event.preventDefault()}
      onSelect={saveSelection}
      onMouseUp={saveSelection}
      onKeyUp={saveSelection}
      onTouchEnd={saveSelection}
      onBlur={saveSelection}
      className={cn('min-h-[124px] w-full whitespace-pre-wrap break-words px-5 py-4 text-base leading-8 text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#35c3a4]', alignmentClass[block.align], block.type === 'heading2' && 'text-xl font-semibold', block.type === 'heading3' && 'text-lg font-semibold')}
    />
    {feedback && <p role="status" aria-live="polite" className="border-t bg-amber-50 px-4 py-2 text-xs text-amber-800">{feedback}</p>}
  </article>;
}

const StableEditorBlock = memo(EditorBlock, (previous, next) =>
  previous.index === next.index
  && previous.lang === next.lang
  && previous.canRemove === next.canRemove
  && previous.block.type === next.block.type
  && previous.block.align === next.block.align
  && previous.block.effect === next.block.effect
  && previous.block.effectSpeed === next.block.effectSpeed
  && previous.onChange === next.onChange
  && previous.onRemove === next.onRemove
);

export function RichDescriptionEditor({ value, onChange, lang, label, sessionKey = 'default' }: {
  value: RichDescription; onChange: (value: RichDescription) => void; lang: 'ar' | 'en'; label: string;
  sessionKey?: string | number;
}) {
  const direction = lang === 'ar' ? 'rtl' : 'ltr';
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en;
  const [layoutVersion, setLayoutVersion] = useState(0);
  const latestValueRef = useRef(value);
  latestValueRef.current = value;
  const changeBlock = useCallback((index: number, block: RichBlock) => {
    const next = { blocks: latestValueRef.current.blocks.map((item, i) => i === index ? block : item) };
    latestValueRef.current = next;
    onChange(next);
  }, [onChange]);
  const addBlock = (type: RichBlockType) => {
    const next = { blocks: [...latestValueRef.current.blocks, { ...emptyBlock(), type }] };
    latestValueRef.current = next;
    onChange(next);
    setLayoutVersion((version) => version + 1);
  };
  const removeBlock = useCallback((index: number) => {
    const next = { blocks: latestValueRef.current.blocks.filter((_, i) => i !== index) };
    latestValueRef.current = next;
    onChange(next);
    setLayoutVersion((version) => version + 1);
  }, [onChange]);
  return <section className="space-y-3" dir={direction} aria-label={label}>
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 sm:p-3">
      <div className="flex flex-wrap items-center gap-2 px-2 pb-3">
        <div className="me-auto">
          <h4 className="text-sm font-semibold text-slate-900">{label}</h4>
          <p className="text-xs text-slate-500">{t('نسّق النص وأضف تأثيراً مستقلاً لكل فقرة. اختر النص لتطبيق التنسيق.', 'Format text and set an independent effect for each block. Select text to style it.')}</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 bg-white" onClick={() => addBlock('paragraph')}><Plus className="h-4 w-4" />{t('فقرة', 'Paragraph')}</Button>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 bg-white" onClick={() => addBlock('bullet')}><List className="h-4 w-4" />{t('تعداد', 'List')}</Button>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 bg-white" onClick={() => addBlock('ordered')}><ListOrdered className="h-4 w-4" />{t('مرقّم', 'Numbered')}</Button>
      </div>
      <div className="space-y-3">
        {value.blocks.map((block, index) => <StableEditorBlock key={`${lang}-${sessionKey}-${layoutVersion}-${index}`} block={block} index={index} lang={lang} onChange={changeBlock} onRemove={removeBlock} canRemove={value.blocks.length > 1} />)}
      </div>
    </div>
    <div className="rounded-lg border bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-[#35c3a4]" />{t('معاينة مباشرة', 'Live preview')}</div>
      <div className="prose prose-sm max-w-none text-slate-700">
        <AnimatedRichDescriptionRenderer key={value.blocks.map((block) => `${block.effect}:${block.effectSpeed ?? 1}`).join('|')} description={value} />
      </div>
    </div>
  </section>;
}