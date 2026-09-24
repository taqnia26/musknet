import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const MAX_BYTES = 25 * 1024 * 1024;
const digits = (value: string) => value.replace(/[٠-٩۰-۹]/g, (digit) =>
  String("٠١٢٣٤٥٦٧٨٩".indexOf(digit) >= 0 ? "٠١٢٣٤٥٦٧٨٩".indexOf(digit) : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

export function signedDateFromText(text: string): string | null {
  const normalized = digits(text);
  const dates = new Set<string>();
  // Only accept a Gregorian date explicitly associated with signing, never validity dates.
  const labels = /(?:تاريخ\s*(?:إبرام|توقيع|تحرير)\s*(?:العقد|الاتفاقية)?|(?:أبرم|حرر|تم\s*توقيع)\s*(?:هذا\s*)?(?:العقد|الاتفاقية)?\s*(?:في|بتاريخ)?|(?:date of signing|signed on|execution date|contract date))\s*[:：\-]?\s*(.{0,45})/gim;
  for (const match of normalized.matchAll(labels)) {
    const segment = match[1].split(/\n|تاريخ\s*(?:البداية|الانتهاء|السريان)/)[0];
    for (const found of segment.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g)) {
      const year = Number(found[1] ?? found[6]);
      const month = Number(found[2] ?? found[5]);
      const day = Number(found[3] ?? found[4]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (year < 1900 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue;
      dates.add(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }
  return dates.size === 1 ? [...dates][0] : null;
}

export async function suggestContractSignedDate(bytes: Buffer, mimeType: string) {
  if (!bytes.length || bytes.length > MAX_BYTES) return { date: null, source: "unavailable", message: "تعذر قراءة الملف ضمن حد الحجم المسموح." };
  const directory = await mkdtemp(path.join(tmpdir(), "contract-date-"));
  const input = path.join(directory, mimeType === "application/pdf" ? "contract.pdf" : mimeType === "application/msword" ? "contract.doc" : "contract.docx");
  const command = async (binary: string, args: string[]) => (await run(binary, args, { timeout: 12000, maxBuffer: 512 * 1024 })).stdout;
  try {
    await writeFile(input, bytes, { mode: 0o600 });
    let text = "";
    try {
      if (mimeType === "application/pdf") text = await command("pdftotext", ["-f", "1", "-l", "3", "-layout", input, "-"]);
      else if (mimeType === "application/msword") text = await command("antiword", [input]);
      else text = (await command("unzip", ["-p", input, "word/document.xml"]))
        .replace(/<\/w:p>/g, "\n").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<");
    } catch { /* Missing text layer or unsupported document: report inability to read below. */ }
    const extracted = signedDateFromText(text);
    if (extracted) return { date: extracted, source: "text", message: "اقتراح من نص العقد؛ راجع التاريخ قبل الحفظ." };
    if (mimeType !== "application/pdf") return { date: null, source: "unavailable", message: "لم يظهر تاريخ إبرام واضح في محتوى المستند. أدخله يدويًا بعد مراجعة العقد." };
    try {
      const prefix = path.join(directory, "page");
      await command("pdftoppm", ["-f", "1", "-l", "3", "-scale-to", "1800", "-gray", "-png", input, prefix]);
      const { readdir } = await import("node:fs/promises");
      const pages = (await readdir(directory)).filter((name) => /^page-\d+\.png$/.test(name)).sort().slice(0, 3);
      let scanned = "";
      for (const page of pages) {
        scanned += `\n${await command("tesseract", [path.join(directory, page), "stdout", "-l", "ara+eng"])}`;
      }
      const date = signedDateFromText(scanned);
      if (date) return { date, source: "ocr", message: "اقتراح من قراءة ضوئية للـ PDF؛ تحقق منه بعناية قبل الحفظ." };
    } catch { /* OCR is best effort; never fabricate a date. */ }
    return { date: null, source: "unavailable", message: "تعذّر قراءة تاريخ إبرام واضح من النسخة الممسوحة. راجع الملف وأدخل التاريخ يدويًا." };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}