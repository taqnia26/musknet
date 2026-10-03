import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InvoiceDocument, type DesignElement, type InvoiceAssets, type InvoiceDesign, type InvoiceFacts, type InvoiceLanguage,
} from '@workspace/invoice-document';
import { cn } from '@/lib/utils';
import { KIND_AR, PX_MM, computeGesture, type Box, type DocReport, type Dir, type Guide } from './helpers';

type Props = {
  design: InvoiceDesign; renderDesign: InvoiceDesign; invoice: InvoiceFacts; assets: InvoiceAssets;
  qrUrl: string | null; zoom: number; selId: string | null; canEdit: boolean;
  onSelect: (id: string | null) => void;
  onGesture: (id: string, patch: Partial<DesignElement>, first: boolean) => void;
  onReport: (r: DocReport) => void;
};
const HANDLES: Dir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const lang: InvoiceLanguage = 'ar';

const readErrors = (raw: string | null): string[] => {
  try {
    const v = JSON.parse(raw || '[]');
    const list = Array.isArray(v) ? v : [v];
    return list.filter(Boolean).map((x) => (typeof x === 'string' ? x : (x as { message?: string })?.message ?? JSON.stringify(x)));
  } catch { return raw ? [raw] : []; }
};

export function InvoiceCanvas(p: Props) {
  const { design, zoom, canEdit } = p;
  const s = zoom * PX_MM;
  const frame = useRef<HTMLIFrameElement>(null);
  const token = useRef(0);
  const live = useRef(p);
  live.current = p;
  const [measured, setMeasured] = useState<{ design: InvoiceDesign; boxes: Box[]; height: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const gesture = useRef<null | { id: string; dir: Dir; sx: number; sy: number; r: DesignElement; first: boolean }>(null);

  useEffect(() => () => { token.current++; }, []);

  const measure = useCallback(() => {
    const my = ++token.current;
    const forDesign = live.current.renderDesign;
    live.current.onReport({ design: forDesign, ready: false, errors: [] });
    let tries = 0;
    const tick = () => {
      if (my !== token.current) return;
      const doc = frame.current?.contentDocument;
      const win = frame.current?.contentWindow;
      const host = doc?.getElementById('invoice-pages');
      if (doc && win && host?.getAttribute('data-ready') === 'true') {
        const pages = Array.from(doc.querySelectorAll('.invoice-page'));
        const boxes: Box[] = [];
        doc.querySelectorAll('[data-element]').forEach((n) => {
          if (n.closest('#invoice-source')) return;
          const r = n.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          const pg = n.closest('.invoice-page');
          boxes.push({ id: n.getAttribute('data-element')!, page: pg ? Math.max(0, pages.indexOf(pg)) : 0,
            x: r.left + win.scrollX, y: r.top + win.scrollY, w: r.width, h: r.height });
        });
        const height = Math.max(doc.documentElement.scrollHeight, 297 * PX_MM);
        setMeasured({ design: forDesign, boxes, height });
        live.current.onReport({ design: forDesign, ready: true, errors: readErrors(host.getAttribute('data-errors')) });
        return;
      }
      if (++tries > 80) {
        live.current.onReport({ design: forDesign, ready: false, errors: ['تعذر إكمال قياس المستند. أعد تحميل الصفحة.'] });
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  }, []);

  const boxes: Box[] = useMemo(() => measured
    ? measured.boxes.map(b=>{
        const before=measured.design.elements.find(e=>e.id===b.id),current=design.elements.find(e=>e.id===b.id);
        if(!before||!current) return b;
        return {...b,x:b.x+(current.x-before.x)*PX_MM,y:b.y+(current.y-before.y)*PX_MM,
          w:b.w+(current.width-before.width)*PX_MM,h:b.h+(current.height-before.height)*PX_MM};
      }).concat(design.elements.filter(e=>!measured.design.elements.some(old=>old.id===e.id)).map(e=>({id:e.id,page:0,x:e.x*PX_MM,y:e.y*PX_MM,w:e.width*PX_MM,h:e.height*PX_MM})))
    : design.elements.map((e) => ({ id: e.id, page: 0, x: e.x * PX_MM, y: e.y * PX_MM, w: e.width * PX_MM, h: e.height * PX_MM })),
  [measured, design]);
  const docH = measured?.height ?? 297 * PX_MM;
  const pageW = 210 * s, pageH = docH * zoom;

  const down = (e: React.PointerEvent, el: DesignElement, dir: Dir) => {
    e.stopPropagation();
    p.onSelect(el.id);
    if (!canEdit) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { id: el.id, dir, sx: e.clientX, sy: e.clientY, r: el, first: true };
    setDragging(true);
  };
  const move = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = (e.clientX - g.sx) / s, dy = (e.clientY - g.sy) / s;
    if (g.first && Math.abs(dx) + Math.abs(dy) < 0.05) return;
    const { patch, guides: gs } = computeGesture(g.r, g.dir, dx, dy, s, live.current.design.elements.filter((o) => o.id !== g.id));
    const first = g.first; g.first = false;
    setGuides(gs);
    p.onGesture(g.id, patch, first);
  };
  const up = () => { gesture.current = null; setDragging(false); setGuides([]); };

  return (
    <div className="max-h-[78vh] overflow-auto bg-muted/40 p-6" dir="ltr">
      <div tabIndex={0} className="relative mx-auto select-none outline-none" style={{ width: pageW, height: pageH }}
        onPointerDown={() => p.onSelect(null)} onPointerMove={move} onPointerUp={up} data-testid="canvas-a4">
        <div className="absolute inset-0 overflow-hidden bg-white shadow-xl">
          <InvoiceDocument ref={frame} invoice={p.invoice} design={p.renderDesign} language={lang} assets={p.assets} qrUrl={p.qrUrl}
            onLoad={measure}
            style={{ position: 'absolute', top: 0, left: 0, height: docH, transform: `scale(${zoom})`, transformOrigin: 'top left', pointerEvents: 'none' }} />
        </div>
        {boxes.map((b, i) => {
          const el = design.elements.find((x) => x.id === b.id);
          if (!el) return null;
          const active = el.id === p.selId;
          // A summary group may first appear on page 2+. Its first actual box is editable.
          const primary = boxes.findIndex((o) => o.id === b.id) === i;
          return (
            <div key={`${b.id}-${b.page}-${i}`} data-testid={`overlay-${b.id}${b.page ? `-p${b.page + 1}` : ''}`}
              onPointerDown={(e) => primary ? down(e, el, 'move') : (e.stopPropagation(),p.onSelect(el.id))}
              className={cn('absolute touch-none', !canEdit || !primary ? 'cursor-pointer' : 'cursor-move',
                active ? 'z-10 border-2 border-accent bg-accent/10' : 'border border-dashed border-sky-500/40 hover:border-accent hover:bg-accent/5')}
              style={{ left: b.x * zoom, top: b.y * zoom, width: b.w * zoom, height: Math.max(b.h * zoom, 8) }}>
              {active && (
                <>
                  <span className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-accent px-1.5 text-[10px] text-accent-foreground" dir="rtl">
                    {KIND_AR[el.kind]}{b.page > 0 ? ` · صفحة ${b.page + 1}` : ''}
                  </span>
                  {canEdit && primary && HANDLES.map((h) => (
                    <span key={h} onPointerDown={(e) => down(e, el, h)} data-testid={`handle-${h}`}
                      className="absolute h-2.5 w-2.5 rounded-sm border border-accent bg-background"
                      style={{
                        left: h.includes('w') ? -6 : h.includes('e') ? undefined : 'calc(50% - 5px)', right: h.includes('e') ? -6 : undefined,
                        top: h.includes('n') ? -6 : h.includes('s') ? undefined : 'calc(50% - 5px)', bottom: h.includes('s') ? -6 : undefined,
                        cursor: `${h === 'n' || h === 's' ? 'ns' : h === 'e' || h === 'w' ? 'ew' : h === 'ne' || h === 'sw' ? 'nesw' : 'nwse'}-resize`,
                      }} />
                  ))}
                </>
              )}
            </div>
          );
        })}
        {guides.map((g, i) => (
          <div key={i} className="pointer-events-none absolute z-20 bg-fuchsia-500/80"
            style={g.axis === 'x' ? { left: g.at * s, top: 0, width: 1, height: pageH } : { top: g.at * s, left: 0, height: 1, width: pageW }} />
        ))}
      </div>
    </div>
  );
}
