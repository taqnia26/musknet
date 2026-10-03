import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import type { DesignElement } from '@workspace/invoice-document';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KIND_AR, num, r1 } from './helpers';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">{label}{children}</label>;
}
export const selCls = 'h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:opacity-60';

type Props = { sel: DesignElement | null; ro: boolean; patch: (id: string, p: Partial<DesignElement>, k?: string) => void; onDelete: () => void };

export function PropertiesPanel({ sel, ro, patch, onDelete }: Props) {
  return (
    <section className="rounded-2xl border border-border bg-card p-3" data-testid="panel-properties">
      <h2 className="mb-2 text-sm font-semibold">{sel ? `خصائص: ${KIND_AR[sel.kind]}` : 'خصائص العنصر'}</h2>
      {!sel ? (
        <p className="text-xs text-muted-foreground">اختر عنصراً من الورقة لتعديل موضعه ومقاساته وتنسيقه.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2" dir="rtl">
          {(['x', 'y', 'width', 'height'] as const).map((k) => (
            <Field key={k} label={{ x: 'X من اليسار (مم)', y: 'Y من الأعلى (مم)', width: 'العرض (مم)', height: 'الارتفاع (مم)' }[k]}>
              <Input dir="ltr" type="number" step={0.5} disabled={ro} className="h-8 text-xs" value={sel[k]} data-testid={`input-${k}`}
                onChange={(e) => patch(sel.id, { [k]: r1(num(e.target.value, sel[k])) }, `n-${sel.id}-${k}`)} />
            </Field>
          ))}
          <Field label="الخط">
            <select className={selCls} disabled={ro} value={sel.font} onChange={(e) => patch(sel.id, { font: e.target.value as 'Amiri' | 'Ping' })} data-testid="select-font">
              <option value="Amiri">Amiri — عربي</option><option value="Ping">Sans / Amiri — مختلط</option>
            </select>
          </Field>
          <Field label="حجم الخط">
            <Input dir="ltr" type="number" min={9} max={24} disabled={ro} className="h-8 text-xs" value={sel.fontSize} data-testid="input-font-size"
              onChange={(e) => patch(sel.id, { fontSize: num(e.target.value, sel.fontSize) }, `fs-${sel.id}`)} />
          </Field>
          <Field label="الوزن">
            <select className={selCls} disabled={ro} value={sel.fontWeight} onChange={(e) => patch(sel.id, { fontWeight: e.target.value as 'normal' | 'bold' })} data-testid="select-weight">
              <option value="normal">عادي</option><option value="bold">عريض</option>
            </select>
          </Field>
          <Field label="المحاذاة">
            <select className={selCls} disabled={ro} value={sel.align} onChange={(e) => patch(sel.id, { align: e.target.value as 'start' | 'center' | 'end' })} data-testid="select-align">
              <option value="start">بداية</option><option value="center">وسط</option><option value="end">نهاية</option>
            </select>
          </Field>
          {([['color', 'لون النص'], ['background', 'الخلفية'], ['borderColor', 'لون الحد']] as const).map(([k, l]) => (
            <Field key={k} label={l}>
              <input type="color" disabled={ro} value={sel[k]} className="h-8 w-full cursor-pointer rounded-md border border-input bg-background" data-testid={`input-${k}`}
                onChange={(e) => patch(sel.id, { [k]: e.target.value }, `c-${sel.id}-${k}`)} />
            </Field>
          ))}
          <Field label="سماكة الحد (مم)">
            <Input dir="ltr" type="number" step={0.05} min={0} max={1} disabled={ro} className="h-8 text-xs" value={sel.borderWidth} data-testid="input-border-width"
              onChange={(e) => patch(sel.id, { borderWidth: num(e.target.value, sel.borderWidth) }, `bw-${sel.id}`)} />
          </Field>
          <Field label="الحشو (مم)">
            <Input dir="ltr" type="number" step={0.5} min={0} max={4} disabled={ro} className="h-8 text-xs" value={sel.padding} data-testid="input-padding"
              onChange={(e) => patch(sel.id, { padding: num(e.target.value, sel.padding) }, `p-${sel.id}`)} />
          </Field>
          <Field label="ارتفاع السطر">
            <Input dir="ltr" type="number" step={0.1} min={1.2} max={1.8} disabled={ro} className="h-8 text-xs" value={sel.lineHeight} data-testid="input-line-height"
              onChange={(e) => patch(sel.id, { lineHeight: num(e.target.value, sel.lineHeight) }, `lh-${sel.id}`)} />
          </Field>
          {sel.kind !== 'text' && sel.kind !== 'divider' && (
            <div className="col-span-2">
              <Field label="عنوان القسم (اختياري)">
                <Input disabled={ro} className="h-8 text-xs" maxLength={60} value={sel.heading ?? ''} data-testid="input-heading"
                  onChange={(e) => patch(sel.id, { heading: e.target.value === '' ? undefined : e.target.value }, `h-${sel.id}`)} />
              </Field>
              <p className="mt-1 text-[10px] text-muted-foreground">بيانات هذا القسم ديناميكية من الفاتورة ولا يمكن استبدالها بنص.</p>
            </div>
          )}
          {sel.kind === 'text' && (
            <div className="col-span-2">
              <Field label="النص الثابت">
                <textarea disabled={ro} rows={3} maxLength={400} className="rounded-md border border-input bg-background p-2 text-xs text-foreground" value={sel.text ?? ''} data-testid="input-text"
                  onChange={(e) => patch(sel.id, { text: e.target.value }, `t-${sel.id}`)} />
              </Field>
            </div>
          )}
          {(sel.kind === 'text' || sel.kind === 'divider') && !ro && (
            <Button variant="destructive" size="sm" className="col-span-2" onClick={onDelete} data-testid="button-delete-element"><Trash2 className="me-2 h-4 w-4" />حذف العنصر</Button>
          )}
        </div>
      )}
    </section>
  );
}
