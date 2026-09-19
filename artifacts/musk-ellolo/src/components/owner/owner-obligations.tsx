import {
  annualObligations,
  debts,
  immediateObligations,
  recurringObligations,
  thirdPartyRights,
  unnamedNameAmountRows,
  type ObligationDetailRow,
} from '@/data/owner-obligations';

const money = new Intl.NumberFormat('ar-SA-u-nu-latn', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function Value({ value }: { value?: number | string }) {
  if (value === undefined || value === '') return <span className="text-[#b2aea5]">—</span>;
  return <>{typeof value === 'number' ? money.format(value) : value}</>;
}

function NameAmountTable({
  rows,
  total,
}: {
  rows: Array<{ name: string; amount?: number }>;
  total?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="bg-[#f7f3e8] text-[#5d574c] dark:bg-[#27251e] dark:text-[#e4ddcb]">
            <th className="border border-[#e4dfd2] px-4 py-3 text-right dark:border-[#343128]">الاسم</th>
            <th className="border border-[#e4dfd2] px-4 py-3 text-right dark:border-[#343128]">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.name}-${index}`} className="odd:bg-white even:bg-[#fcfbf8] dark:odd:bg-[#111214] dark:even:bg-[#171819]">
              <td className="border border-[#ebe7de] px-4 py-3 dark:border-[#2b2d31]">{row.name}</td>
              <td className="border border-[#ebe7de] px-4 py-3 font-medium tabular-nums dark:border-[#2b2d31]"><Value value={row.amount} /></td>
            </tr>
          ))}
          {total !== undefined && (
            <tr className="bg-[#f5edcf] font-bold text-[#6e5605] dark:bg-[#2d291b] dark:text-[#ebc94f]">
              <td className="border border-[#dfd4ad] px-4 py-3 dark:border-[#484027]">الإجمالي</td>
              <td className="border border-[#dfd4ad] px-4 py-3 tabular-nums dark:border-[#484027]"><Value value={total} /></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DetailTable({ rows }: { rows: ObligationDetailRow[] }) {
  const headers = ['الاسم', 'المبلغ', 'تم سداد', 'المتبقي', 'السداد من حساب', 'الاستحقاق'];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="bg-[#f7f3e8] text-[#5d574c] dark:bg-[#27251e] dark:text-[#e4ddcb]">
            {headers.map((header) => <th key={header} className="border border-[#e4dfd2] px-4 py-3 text-right dark:border-[#343128]">{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.name}-${index}`} className="odd:bg-white even:bg-[#fcfbf8] dark:odd:bg-[#111214] dark:even:bg-[#171819]">
              <td className="border border-[#ebe7de] px-4 py-3 font-medium dark:border-[#2b2d31]">{row.name}</td>
              <td className="border border-[#ebe7de] px-4 py-3 tabular-nums dark:border-[#2b2d31]"><Value value={row.amount} /></td>
              <td className="border border-[#ebe7de] px-4 py-3 tabular-nums dark:border-[#2b2d31]"><Value value={row.paid} /></td>
              <td className="border border-[#ebe7de] px-4 py-3 tabular-nums dark:border-[#2b2d31]"><Value value={row.remaining} /></td>
              <td className="border border-[#ebe7de] px-4 py-3 dark:border-[#2b2d31]"><Value value={row.paymentAccount} /></td>
              <td className="border border-[#ebe7de] px-4 py-3 dark:border-[#2b2d31]"><Value value={row.due} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e5e2dc] bg-white shadow-sm dark:border-[#24262a] dark:bg-[#111214]">
      {title && <h2 className="border-b border-[#ebe7de] px-5 py-4 text-lg font-bold dark:border-[#292b2f]">{title}</h2>}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function OwnerObligations() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">الالتزامات</h1>
        <p className="mt-2 text-sm text-[#85817a] dark:text-[#8f9196]">البيانات مفرغة من ملف الالتزامات كما وردت، والخانات غير المدخلة في الملف ظاهرة بعلامة —.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title={recurringObligations.title}>
          <NameAmountTable rows={recurringObligations.rows} total={recurringObligations.total} />
        </Section>
        <Section title={immediateObligations.title}>
          <DetailTable rows={immediateObligations.rows} />
        </Section>
      </div>

      <Section title={annualObligations.title}>
        <DetailTable rows={annualObligations.rows} />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title={thirdPartyRights.title}>
          <NameAmountTable rows={thirdPartyRights.rows} total={thirdPartyRights.total} />
        </Section>
        <Section>
          <NameAmountTable rows={unnamedNameAmountRows} />
        </Section>
      </div>

      <Section title={debts.title}>
        <DetailTable rows={debts.rows} />
      </Section>
    </div>
  );
}