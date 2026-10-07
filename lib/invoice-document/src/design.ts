import { z } from "zod";

export const elementKinds = ["logo", "title", "seller", "buyer", "info", "table", "totals", "notes", "qr", "footer", "text", "divider"] as const;
export type ElementKind = typeof elementKinds[number];
/** Only the financial table and totals are mandatory; every other built-in element may be deleted and restored. */
export const requiredKinds = ["table", "totals"] as const;
export const optionalKinds = ["logo", "title", "seller", "buyer", "info", "notes", "qr", "footer"] as const;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const elementSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  kind: z.enum(elementKinds),
  x: z.number().min(8).max(202),
  y: z.number().min(8).max(289),
  width: z.number().min(2).max(194),
  height: z.number().min(0.3).max(180),
  font: z.enum(["Amiri", "Ping"]),
  fontSize: z.number().min(9).max(24),
  fontWeight: z.enum(["normal", "bold"]),
  color,
  background: color,
  align: z.enum(["start", "center", "end"]),
  borderWidth: z.number().min(0).max(1),
  borderColor: color,
  padding: z.number().min(0).max(4),
  lineHeight: z.number().min(1.2).max(1.8),
  text: z.string().max(400).optional(),
  heading: z.string().min(1).max(60).optional(),
}).strict();
export const designSchema = z.object({
  version: z.literal(1),
  template: z.enum(["reference", "formal", "modern"]),
  elements: z.array(elementSchema).min(2).max(24),
  columns: z.object({
    product: z.number().min(35).max(65),
    quantity: z.number().min(10).max(20),
    unitPrice: z.number().min(12).max(30),
    total: z.number().min(12).max(30),
  }).strict(),
}).strict();
export type InvoiceDesign = z.infer<typeof designSchema>;
export type DesignElement = z.infer<typeof elementSchema>;

/** Invalid intermediate editor inputs must not reach the strict document renderer.
 * Keep working state untouched so the user can correct it or undo the edit. */
export function retainRenderableDesign(next: InvoiceDesign, previous: InvoiceDesign | null): InvoiceDesign | null {
  return designSchema.safeParse(next).success ? next : previous;
}

const box = (kind: ElementKind, x: number, y: number, width: number, height: number, extra: Partial<DesignElement> = {}): DesignElement => ({
  id: kind, kind, x, y, width, height, font: "Amiri", fontSize: 11, fontWeight: "normal",
  color: "#292728", background: "#ffffff", align: "start", borderWidth: 0,
  borderColor: "#d5d5d5", padding: 1, lineHeight: 1.4, ...extra,
});
export function createTemplate(template: InvoiceDesign["template"] = "reference"): InvoiceDesign {
  // Physical positions deliberately do NOT mirror in RTL.
  const elements = [
    box("seller", 14, 14, 85, 27),
    box("logo", 132, 14, 64, 19),
    box("title", 116, 35, 80, 10, { fontSize: 17, fontWeight: "bold", align: "end" }),
    box("divider", 14, 48, 182, 0.4),
    box("buyer", 14, 54, 85, 43),
    box("info", 112, 54, 84, 43),
    box("table", 14, 105, 182, 65, { background: "#d9dddd", fontSize: 10 }),
    box("notes", 14, 178, 84, 66, { fontSize: 10 }),
    box("totals", 112, 178, 84, 66, { fontSize: 10 }),
    box("qr", 14, 249, 25, 25),
    box("footer", 14, 280, 182, 8, { align: "center", fontSize: 9 }),
  ];
  if (template === "formal") {
    for (const el of elements) if (["seller", "buyer", "info", "notes", "totals"].includes(el.kind)) {
      el.borderWidth = 0.25; el.padding = 2;
    }
    elements.find(e => e.kind === "table")!.background = "#eeeeee";
    elements.find(e => e.kind === "title")!.align = "center";
  }
  if (template === "modern") {
    for (const el of elements) if (["title", "seller", "footer"].includes(el.kind)) el.color = "#514220";
    elements.find(e => e.kind === "table")!.background = "#eee6d6";
    elements.find(e => e.kind === "title")!.background = "#eee6d6";
    elements.find(e => e.kind === "title")!.align = "center";
    elements.find(e => e.kind === "seller")!.borderColor = "#b8a16a";
    elements.find(e => e.kind === "seller")!.borderWidth = 0.3;
    elements.find(e => e.kind === "totals")!.borderColor = "#b8a16a";
    elements.find(e => e.kind === "totals")!.borderWidth = 0.3;
    elements.find(e => e.kind === "divider")!.borderColor = "#b8a16a";
  }
  return { version: 1, template, elements, columns: { product: 48, quantity: 12, unitPrice: 20, total: 20 } };
}

const intersects = (a: DesignElement, b: DesignElement) =>
  a.x < b.x + b.width - 0.1 && a.x + a.width > b.x + 0.1 &&
  a.y < b.y + b.height - 0.1 && a.y + a.height > b.y + 0.1;
export function designErrors(value: unknown): string[] {
  const parsed = designSchema.safeParse(value);
  if (!parsed.success) return ["إعدادات غير صالحة: استخدم العناصر والخطوط والألوان والأحجام المسموح بها."];
  const d = parsed.data, errors: string[] = [];
  if (new Set(d.elements.map(e => e.id)).size !== d.elements.length) errors.push("معرّفات العناصر مكررة.");
  for (const kind of requiredKinds) if (d.elements.filter(e => e.kind === kind).length !== 1) errors.push(`العنصر الإلزامي ${kind} يجب أن يظهر مرة واحدة.`);
  for (const kind of optionalKinds) if (d.elements.filter(e => e.kind === kind).length > 1) errors.push(`العنصر ${kind} لا يتكرر.`);
  if (Math.abs(Object.values(d.columns).reduce((a,b) => a+b,0) - 100) > 0.01) errors.push("يجب أن يكون مجموع عرض أعمدة الجدول 100%.");
  for (const e of d.elements) {
    if (e.x + e.width > 202 || e.y + e.height > 289) errors.push(`${e.id}: خارج حدود الصفحة.`);
    if (e.kind !== "text" && e.kind !== "divider" && e.text !== undefined) errors.push(`${e.id}: لا يمكن استبدال البيانات الديناميكية بنص ثابت.`);
    if (e.kind === "text" && !e.text?.trim()) errors.push(`${e.id}: النص الثابت فارغ.`);
    if (e.heading !== undefined && !e.heading.trim()) errors.push(`${e.id}: العنوان فارغ.`);
    if (["seller","buyer","info"].includes(e.kind) && (e.width < 65 || e.height < (e.kind === "seller" ? 25 : 40))) errors.push(`${e.id}: المساحة لا تكفي للبيانات الإلزامية.`);
    if (["notes","totals"].includes(e.kind) && (e.width < 65 || e.height < 60)) errors.push(`${e.id}: المساحة لا تكفي للمحتوى المالي.`);
    if (e.kind === "table" && (e.width < 170 || e.height < 40 || e.fontSize > 14)) errors.push("منطقة الجدول يجب أن تسع الأعمدة والبنود.");
    if (e.kind === "qr" && (e.width < 23 || e.height < 23)) errors.push("رمز QR يحتاج مساحة لا تقل عن 23 × 23 مم.");
    if (e.kind === "logo" && (e.width < 30 || e.height < 10)) errors.push("الشعار صغير جداً.");
    if (e.kind === "footer" && (e.height < 6 || e.y < 278)) errors.push("التذييل يجب أن يبقى أسفل الصفحة.");
    // Enforce dark-on-light contrast, not simply syntactically valid colors.
    const luminance = (c: string) => {
      const rgb = [1,3,5].map(i => parseInt(c.slice(i,i+2),16)/255).map(n => n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4);
      return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    };
    const fg = luminance(e.color), bg = luminance(e.kind === "table" ? "#ffffff" : e.background);
    if ((Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05) < 4.5 || fg > .25) errors.push(`${e.id}: لون النص لا يضمن وضوح البيانات.`);
    if(e.kind==="table") {
      const header=luminance(e.background);
      if((Math.max(fg,header)+.05)/(Math.min(fg,header)+.05)<4.5) errors.push("لون رأس الجدول يخفي العناوين الإلزامية.");
    }
  }
  // Totals render in the notes box, so their own stored geometry is inert when notes exist.
  const inert = (e: DesignElement) => e.kind === "totals" && d.elements.some(n => n.kind === "notes");
  for (let i=0; i<d.elements.length;i++) for (let j=i+1;j<d.elements.length;j++)
    if (!inert(d.elements[i]) && !inert(d.elements[j]) && intersects(d.elements[i],d.elements[j])) errors.push(`تداخل بين ${d.elements[i].id} و${d.elements[j].id}.`);
  const table = d.elements.find(e => e.kind === "table"), footer = d.elements.find(e => e.kind === "footer");
  if (table && footer) {
    for (const e of d.elements) {
      if (["seller","buyer","info","title","logo"].includes(e.kind) && e.y+e.height > table.y-3) errors.push(`${e.id}: يجب أن يبقى أعلى الجدول.`);
      if (["notes","totals","qr"].includes(e.kind) && (e.y < table.y+table.height+4 || e.y+e.height > footer.y-3)) errors.push(`${e.id}: يجب أن يبقى بين الجدول والتذييل.`);
      if (["text","divider"].includes(e.kind) && e.y >= table.y && e.y < footer.y) errors.push(`${e.id}: ضع النص أو الفاصل أعلى الجدول لتجنب تغطية البنود الممتدة.`);
    }
  }
  return [...new Set(errors)];
}
export function validateDesign(value: unknown): InvoiceDesign {
  const design = designSchema.parse(value), errors = designErrors(design);
  if (errors.length) throw new Error(errors.join("\n"));
  return design;
}
/** Notes are never rendered; totals print in the notes box geometry (stored designs untouched).
 * Editor view: one visible "totals" box carrying the notes geometry, no notes box. */
const GEOM = ["x", "y", "width", "height"] as const;
export function editorView(d: InvoiceDesign): InvoiceDesign {
  const notes = d.elements.find(e => e.kind === "notes");
  if (!notes) return d;
  return { ...d, elements: d.elements.filter(e => e.kind !== "notes").map(e => e.kind === "totals" ? { ...e, x: notes.x, y: notes.y, width: notes.width, height: notes.height } : e) };
}
/** Route an editor patch: totals geometry edits go to the notes element (the effective placement). */
export function applyEditorPatch(d: InvoiceDesign, id: string, p: Partial<DesignElement>): InvoiceDesign {
  const target = d.elements.find(e => e.id === id), notes = d.elements.find(e => e.kind === "notes");
  if (target?.kind !== "totals" || !notes) return { ...d, elements: d.elements.map(e => e.id === id ? { ...e, ...p } : e) };
  const geom: Partial<DesignElement> = {}, rest: Partial<DesignElement> = { ...p };
  for (const k of GEOM) if (k in p) { (geom as Record<string, unknown>)[k] = p[k]; delete rest[k]; }
  return { ...d, elements: d.elements.map(e => e.id === notes.id ? { ...e, ...geom } : e.id === id ? { ...e, ...rest } : e) };
}

/** Built-in elements absent from the design, restorable from the template defaults. */
export function missingKinds(d: InvoiceDesign): ElementKind[] {
  return optionalKinds.filter(k => k !== "notes" && !d.elements.some(e => e.kind === k));
}
export function restoreElement(d: InvoiceDesign, kind: ElementKind): InvoiceDesign {
  const el = createTemplate(d.template).elements.find(e => e.kind === kind);
  if (!el || d.elements.some(e => e.kind === kind)) return d;
  const id = d.elements.some(e => e.id === el.id) ? `${kind}-restored` : el.id;
  return { ...d, elements: [...d.elements, { ...el, id }] };
}
