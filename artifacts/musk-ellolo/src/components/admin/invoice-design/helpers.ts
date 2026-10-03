import type { DesignElement, InvoiceDesign } from '@workspace/invoice-document';

export const PX_MM = 96 / 25.4;
export const MAX_X = 202;
export const MAX_Y = 289;
export const KIND_AR: Record<string, string> = {
  logo: 'الشعار', title: 'العنوان', seller: 'البائع', buyer: 'المشتري', info: 'بيانات الفاتورة',
  table: 'جدول البنود', totals: 'الإجماليات', notes: 'الملاحظات', qr: 'رمز QR', footer: 'التذييل',
  text: 'نص ثابت', divider: 'فاصل',
};
export const TEMPLATES = [
  { id: 'reference', label: 'المرجعي' },
  { id: 'formal', label: 'رسمي' },
  { id: 'modern', label: 'ذهبي حديث' },
] as const;

export type Dir = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type Guide = { axis: 'x' | 'y'; at: number };
export type DocReport = { design: InvoiceDesign | null; ready: boolean; errors: string[] };
export type Box = { id: string; page: number; x: number; y: number; w: number; h: number };

export const key = (d: unknown) => JSON.stringify(d);
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const num = (v: string, d: number) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
export const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/** Server message first (e.data.error), then the response message, then a generic fallback. */
export function apiErrorMessage(err: unknown): string {
  const e = err as { data?: unknown; message?: string } | null;
  const d = e?.data as { error?: unknown; message?: unknown } | string | null | undefined;
  if (d && typeof d === 'object') {
    if (typeof d.error === 'string' && d.error) return d.error;
    if (typeof d.message === 'string' && d.message) return d.message;
  }
  if (typeof d === 'string' && d.trim()) return d.trim();
  return e?.message || 'حاول مرة أخرى.';
}

export function computeGesture(
  start: DesignElement, dir: Dir, dx: number, dy: number, s: number, others: DesignElement[],
): { patch: { x: number; y: number; width: number; height: number }; guides: Guide[] } {
  const thr = 6 / s;
  const xs = [8, 105, 202, ...others.flatMap((o) => [o.x, o.x + o.width / 2, o.x + o.width])];
  const ys = [8, 148.5, 289, ...others.flatMap((o) => [o.y, o.y + o.height / 2, o.y + o.height])];
  const guides: Guide[] = [];
  const snap = (val: number, lines: number[], axis: 'x' | 'y') => {
    let best = val, bd = thr;
    for (const l of lines) if (Math.abs(l - val) < bd) { bd = Math.abs(l - val); best = l; }
    if (best !== val) guides.push({ axis, at: best });
    return best;
  };
  let { x, y, width: w, height: h } = start;
  if (dir === 'move') {
    let nx = start.x + dx, ny = start.y + dy;
    nx += [nx, nx + w / 2, nx + w].map((v) => snap(v, xs, 'x') - v).find((c) => c !== 0) ?? 0;
    ny += [ny, ny + h / 2, ny + h].map((v) => snap(v, ys, 'y') - v).find((c) => c !== 0) ?? 0;
    x = clamp(nx, 8, MAX_X - w); y = clamp(ny, 8, MAX_Y - h);
  } else {
    let l = start.x, t = start.y, rr = start.x + start.width, b = start.y + start.height;
    if (dir.includes('w')) l = snap(l + dx, xs, 'x');
    if (dir.includes('e')) rr = snap(rr + dx, xs, 'x');
    if (dir.includes('n')) t = snap(t + dy, ys, 'y');
    if (dir.includes('s')) b = snap(b + dy, ys, 'y');
    l = clamp(l, 8, rr - 2); rr = clamp(rr, l + 2, MAX_X); t = clamp(t, 8, b - 0.3); b = clamp(b, t + 0.3, MAX_Y);
    x = l; y = t; w = Math.min(194, rr - l); h = Math.min(180, b - t);
  }
  return { patch: { x: r1(x), y: r1(y), width: r1(w), height: r1(h) }, guides };
}
