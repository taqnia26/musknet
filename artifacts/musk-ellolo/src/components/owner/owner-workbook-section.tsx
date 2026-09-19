import { useEffect, useMemo, useState } from 'react';
import workbookUrl from '../../../../../attached_assets/التزامات_مسك_1789830735422.xlsx?url';
import { Button } from '@/components/ui/button';

type WorkbookSectionProps = {
  title: string;
  sheetNames: string[];
};

type SheetRows = Record<string, string[][]>;

function trimSheet(rows: unknown[][]) {
  const normalized = rows.map((row) => row.map((value) => value == null ? '' : String(value)));
  let lastRow = normalized.length - 1;
  while (lastRow >= 0 && normalized[lastRow].every((value) => value === '')) lastRow -= 1;
  const keptRows = normalized.slice(0, lastRow + 1);
  const lastColumn = keptRows.reduce((maximum, row) => {
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if (row[index] !== '') return Math.max(maximum, index);
    }
    return maximum;
  }, -1);
  return keptRows.map((row) => Array.from({ length: lastColumn + 1 }, (_, index) => row[index] ?? ''));
}

export function OwnerWorkbookSection({ title, sheetNames }: WorkbookSectionProps) {
  const [sheets, setSheets] = useState<SheetRows>({});
  const [selectedSheet, setSelectedSheet] = useState(sheetNames[0]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);

    Promise.all([fetch(workbookUrl), import('xlsx')])
      .then(async ([response, XLSX]) => {
        if (!response.ok) throw new Error('Workbook request failed');
        return { buffer: await response.arrayBuffer(), XLSX };
      })
      .then(({ buffer, XLSX }) => {
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const parsed = Object.fromEntries(sheetNames.map((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) throw new Error(`Missing workbook sheet: ${sheetName}`);
          const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
            header: 1,
            raw: false,
            defval: '',
            blankrows: true,
          });
          return [sheetName, trimSheet(rows)];
        }));
        if (active) setSheets(parsed);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, [sheetNames]);

  const rows = useMemo(() => sheets[selectedSheet] ?? [], [selectedSheet, sheets]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-[#85817a] dark:text-[#8f9196]">مرجع مصدر خام: البيانات معروضة من أوراق ملف Excel كما وردت، دون إنشاء بنود إضافية. · Raw source reference: no additional entries are inferred.</p>
      </div>

      {sheetNames.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {sheetNames.map((sheetName) => (
            <Button
              key={sheetName}
              type="button"
              variant={selectedSheet === sheetName ? 'default' : 'outline'}
              onClick={() => setSelectedSheet(sheetName)}
            >
              {sheetName}
            </Button>
          ))}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-[#e5e2dc] bg-white shadow-sm dark:border-[#24262a] dark:bg-[#111214]">
        <div className="border-b border-[#ebe7de] px-5 py-4 dark:border-[#292b2f]">
          <h2 className="text-lg font-bold">{selectedSheet}</h2>
        </div>

        {error ? (
          <p className="p-8 text-center text-red-700 dark:text-red-300">تعذر قراءة ملف البيانات.</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-[#85817a]">جاري تحميل البيانات...</p>
        ) : (
          <div className="max-h-[68vh] overflow-auto">
            <table className="min-w-max border-collapse text-sm">
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="odd:bg-white even:bg-[#fcfbf8] dark:odd:bg-[#111214] dark:even:bg-[#171819]">
                    {row.map((value, columnIndex) => (
                      <td
                        key={columnIndex}
                        className={`min-w-[120px] whitespace-pre-wrap border border-[#ebe7de] px-3 py-2.5 align-top dark:border-[#2b2d31] ${
                          value !== '' && rowIndex < 5 ? 'font-medium' : ''
                        }`}
                      >
                        {value || <span className="text-transparent">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}