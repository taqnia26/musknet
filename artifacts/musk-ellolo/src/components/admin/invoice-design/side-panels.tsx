import { FileCheck2 } from 'lucide-react';
import { InvoiceDocument, type InvoiceAssets, type InvoiceDesign, type InvoiceFacts } from '@workspace/invoice-document';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PX_MM, TEMPLATES, num, r1 } from './helpers';
import { Field } from './properties-panel';

type TplProps = {
  design: InvoiceDesign; ro: boolean; miniDesigns: InvoiceDesign[]; invoice: InvoiceFacts;
  assets: InvoiceAssets; qrUrl: string | null; onApply: (t: InvoiceDesign['template']) => void;
};
export function TemplatesPanel({ design, ro, miniDesigns, invoice, assets, qrUrl, onApply }: TplProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-semibold">القوالب</h2>
      <div className="grid grid-cols-3 gap-2">
        {TEMPLATES.map((t, i) => (
          <button key={t.id} type="button" disabled={ro} onClick={() => onApply(t.id)}
            className={cn('rounded-lg border p-1.5 text-center transition hover:border-accent disabled:opacity-60', design.template === t.id ? 'border-accent bg-accent/10' : 'border-border')}
            data-testid={`button-template-${t.id}`}>
            <div className="relative mx-auto overflow-hidden bg-white" style={{ width: 210 * PX_MM * 0.12, height: 297 * PX_MM * 0.12 }}>
              <InvoiceDocument invoice={invoice} design={miniDesigns[i]} language="ar" assets={assets} qrUrl={qrUrl}
                style={{ position: 'absolute', top: 0, left: 0, transform: 'scale(0.12)', transformOrigin: 'top left', pointerEvents: 'none' }} />
            </div>
            <span className="mt-1 block text-[11px]">{t.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">اختيار قالب يعيد ضبط التصميم المحلي فقط ويمكن التراجع عنه.</p>
    </section>
  );
}

type ColProps = { design: InvoiceDesign; ro: boolean; setCol: (k: keyof InvoiceDesign['columns'], v: number) => void; balance: () => void };
export function ColumnsPanel({ design, ro, setCol, balance }: ColProps) {
  const sum = Object.values(design.columns).reduce((a, b) => a + b, 0);
  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-3" data-testid="panel-columns">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">أعمدة الجدول</h2>
          <span className={cn('text-xs tabular-nums', Math.abs(sum - 100) > 0.01 ? 'text-destructive' : 'text-emerald-500')} data-testid="text-col-sum">{r1(sum)}%</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([['product', 'المنتج'], ['quantity', 'الكمية'], ['unitPrice', 'سعر الوحدة'], ['total', 'الإجمالي']] as const).map(([k, l]) => (
            <Field key={k} label={`${l} %`}>
              <Input dir="ltr" type="number" step={1} disabled={ro} className="h-8 text-xs" value={design.columns[k]} data-testid={`input-col-${k}`}
                onChange={(e) => setCol(k, num(e.target.value, design.columns[k]))} />
            </Field>
          ))}
        </div>
        {!ro && <Button size="sm" variant="outline" className="mt-2 w-full" onClick={balance} data-testid="button-balance-columns">ضبط عمود المنتج ليكتمل 100%</Button>}
      </section>
      <section className="flex gap-2 rounded-2xl border border-border bg-card p-3 text-[11px] leading-5 text-muted-foreground">
        <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        التصميم يغيّر الشكل فقط. أرقام الفواتير والمبالغ والضرائب والحسابات لا تتأثر، وملفات PDF المرسلة سابقاً تبقى كما هي.
      </section>
    </>
  );
}
