import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { GuidedTourStep } from './tour-definitions';
import { completeTour, isTourComplete } from './tour-state';

type Rect = Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom' | 'width' | 'height'>;

function findVisibleTarget(selector: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }) ?? null;
}

export function GuidedTour({
  steps,
  lang,
  storageKey,
  restartSignal = 0,
  onActiveChange,
  onStepChange,
}: {
  steps: GuidedTourStep[];
  lang: 'ar' | 'en';
  storageKey: string;
  restartSignal?: number;
  onActiveChange?: (active: boolean) => void;
  onStepChange?: (step: GuidedTourStep) => void;
}) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const close = useCallback((persist = true) => {
    if (persist) completeTour(window.localStorage, storageKey);
    setActive(false);
    setRect(null);
    onActiveChange?.(false);
  }, [onActiveChange, storageKey]);

  const start = useCallback(() => {
    if (!steps.length) return;
    setIndex(0);
    setActive(true);
    onActiveChange?.(true);
  }, [onActiveChange, steps.length]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (!isTourComplete(window.localStorage, storageKey)) start();
  }, [start, storageKey]);

  useEffect(() => {
    if (restartSignal > 0) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  const step = steps[index];
  useEffect(() => {
    if (!active || !step) return;
    onStepChange?.(step);
  }, [active, onStepChange, step]);

  useLayoutEffect(() => {
    if (!active || !step) return;
    let frame = 0;
    const timers: number[] = [];
    let observer: MutationObserver | null = null;
    let updateTimeout: number | undefined;

    const attemptUpdate = () => {
      const target = findVisibleTarget(step.target);
      if (!target) {
        setRect(null);
        return false;
      }
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      window.setTimeout(() => setRect(target.getBoundingClientRect()), 80);
      return true;
    };

    const update = () => attemptUpdate();

    setRect(null);
    frame = window.requestAnimationFrame(update);
    timers.push(
      window.setTimeout(update, 150),
      window.setTimeout(update, 350),
      window.setTimeout(update, 800),
      window.setTimeout(update, 1500)
    );
    window.addEventListener('resize', update);

    observer = new MutationObserver(() => {
      window.clearTimeout(updateTimeout);
      updateTimeout = window.setTimeout(() => {
        const target = findVisibleTarget(step.target);
        if (target) {
          setRect(target.getBoundingClientRect());
        }
      }, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('resize', update);
      window.clearTimeout(updateTimeout);
      observer?.disconnect();
    };
  }, [active, step]);

  useEffect(() => {
    if (!active) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(steps.length - 1, value + (lang === 'ar' ? -1 : 1)));
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value + (lang === 'ar' ? 1 : -1)));
    };
    document.addEventListener('keydown', keydown);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', keydown);
  }, [active, close, lang, steps.length]);

  if (!active || !step) return null;
  const compact = window.innerWidth < 640;
  const top = rect && !compact
    ? Math.min(window.innerHeight - 260, Math.max(16, rect.bottom + 14))
    : undefined;
  const left = rect && !compact
    ? Math.min(window.innerWidth - 376, Math.max(16, rect.left))
    : undefined;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-black/55" aria-hidden="true" />
      {rect && (
        <div
          className="guided-tour-highlight absolute rounded-xl border-2 border-[#e4ba2a] shadow-[0_0_0_5px_rgba(228,186,42,0.25)] transition-all duration-300 ease-out"
          style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }}
        />
      )}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="guided-tour-title"
        tabIndex={-1}
        className="pointer-events-auto absolute bottom-3 left-3 right-3 rounded-2xl border border-[#e2b92f]/50 bg-white p-5 text-[#1c1c1c] shadow-2xl outline-none dark:bg-[#151619] dark:text-[#f4f4f2] sm:bottom-auto sm:right-auto sm:w-[360px] transition-all duration-300 ease-out"
        style={compact ? undefined : { top, left }}
      >
        <button type="button" onClick={() => close()} className="absolute end-3 top-3 rounded-full p-1.5 text-current/60 hover:bg-black/5 dark:hover:bg-white/10" aria-label={lang === 'ar' ? 'إغلاق الجولة' : 'Close tour'}>
          <X className="h-4 w-4" />
        </button>
        <p className="mb-2 text-xs font-semibold text-[#a77d00]">{lang === 'ar' ? `الخطوة ${index + 1} من ${steps.length}` : `Step ${index + 1} of ${steps.length}`}</p>
        <h2 id="guided-tour-title" className="pe-7 text-lg font-bold">{step.title[lang]}</h2>
        <p className="mt-2 text-sm leading-6 text-current/70">{step.description[lang]}</p>
        {!rect && <p className="mt-2 text-xs text-amber-700">{lang === 'ar' ? 'جاري تحميل العنصر؛ أو قد يكون غير ظاهر حالياً.' : 'Loading item; or it may not be currently visible.'}</p>}
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div className="h-full bg-[#d9ad19] transition-[width]" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={() => close()} className="rounded-lg px-3 py-2 text-sm text-current/60 hover:bg-black/5 dark:hover:bg-white/10">
            {lang === 'ar' ? 'تخطي' : 'Skip'}
          </button>
          <div className="flex gap-2">
            {index > 0 && <button type="button" onClick={() => setIndex((value) => value - 1)} className="rounded-lg border border-current/15 px-3 py-2 text-sm">{lang === 'ar' ? 'السابق' : 'Back'}</button>}
            <button type="button" onClick={() => index === steps.length - 1 ? close() : setIndex((value) => value + 1)} className="rounded-lg bg-[#d9ad19] px-4 py-2 text-sm font-semibold text-[#171717]">
              {index === steps.length - 1 ? (lang === 'ar' ? 'إنهاء' : 'Finish') : (lang === 'ar' ? 'التالي' : 'Next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
