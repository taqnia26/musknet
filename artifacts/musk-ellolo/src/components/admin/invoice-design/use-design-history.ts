import { useCallback, useRef, useState } from 'react';
import type { InvoiceDesign } from '@workspace/invoice-document';
import { key } from './helpers';

type Hist = { past: InvoiceDesign[]; present: InvoiceDesign | null; future: InvoiceDesign[] };

export function useDesignHistory() {
  const [hist, setHist] = useState<Hist>({ past: [], present: null, future: [] });
  const lastEdit = useRef({ k: '', t: 0 });

  const reset = useCallback((d: InvoiceDesign) => setHist({ past: [], present: d, future: [] }), []);
  const edit = useCallback((fn: (d: InvoiceDesign) => InvoiceDesign, coalesce?: string) => {
    setHist((h) => {
      if (!h.present) return h;
      const next = fn(h.present);
      if (key(next) === key(h.present)) return h;
      const now = Date.now();
      const merge = coalesce && lastEdit.current.k === coalesce && now - lastEdit.current.t < 900;
      lastEdit.current = { k: coalesce ?? '', t: now };
      return { past: merge ? h.past : [...h.past, h.present].slice(-100), present: next, future: [] };
    });
  }, []);
  const gestureEdit = useCallback((fn: (d: InvoiceDesign) => InvoiceDesign, first: boolean) => {
    setHist((h) => h.present
      ? { past: first ? [...h.past, h.present].slice(-100) : h.past, present: fn(h.present), future: first ? [] : h.future }
      : h);
  }, []);
  const undo = useCallback(() => setHist((h) => (h.past.length && h.present
    ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h)), []);
  const redo = useCallback(() => setHist((h) => (h.future.length && h.present
    ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)), []);

  return { design: hist.present, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0, reset, edit, gestureEdit, undo, redo };
}
