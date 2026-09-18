import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { and, eq, inArray } from "drizzle-orm";
import { adminUsersTable, db, giftingIssuesTable, pool, productsTable } from "@workspace/db";

const DEFAULT_FILE = "attached_assets/Gifit_and_Testers_(1)_(1)_1789752020531.xlsx";
const EXPECTED = { rows: 124, units: 164, total: 23798.260869565253 };
type Category = "VIP" | "Sample" | "Damage" | "Marketing" | "Tester";
const categories = new Set<Category>(["VIP", "Sample", "Damage", "Marketing", "Tester"]);
type Parsed = {
  recipientName: string; category: Category; comment: string; barcode: string; description: string;
  quantity: number; totalCost: number; sourceRow: number; rowFingerprint: string; dedupeKey: string;
};

const text = (v: ExcelJS.CellValue): string => {
  const raw = typeof v === "object" && v !== null && "result" in v ? v.result : v;
  return typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
};
function cellNumber(v: ExcelJS.CellValue): number | undefined {
  const raw = typeof v === "object" && v !== null && "result" in v ? v.result : v;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return raw;
}
function sha(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function parseGiftingWorkbook(filePath: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet("Master Gifting");
  if (!sheet) throw new Error("Workbook must contain Master Gifting");
  const sourceFingerprint = sha((await readFile(filePath)).toString("base64"));
  const rows: Parsed[] = [];
  const excluded: Array<{ row: number; reasons: string[] }> = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = [text(row.getCell(1).value), text(row.getCell(2).value), text(row.getCell(3).value),
      text(row.getCell(4).value), text(row.getCell(5).value), row.getCell(6).value, row.getCell(7).value];
    if (values.every((value) => value === "" || value === null || value === undefined)) continue;
    const [recipientName, categoryText, comment, barcode, description] = values as string[];
    const quantity = cellNumber(values[5] as ExcelJS.CellValue);
    const totalCost = cellNumber(values[6] as ExcelJS.CellValue);
    const reasons: string[] = [];
    if (!recipientName || recipientName === "#N/A") reasons.push("blank recipient");
    if (!categories.has(categoryText as Category)) reasons.push("invalid category");
    if (!barcode || barcode === "#N/A") reasons.push("blank barcode");
    if (!description || description === "#N/A") reasons.push("blank description");
    if (quantity === undefined || !Number.isInteger(quantity) || quantity <= 0) reasons.push("quantity must be positive integer");
    if (totalCost === undefined || !Number.isFinite(totalCost) || totalCost < 0) reasons.push("invalid cost/formula artifact");
    const canonical = values.map((v) => typeof v === "object" ? JSON.stringify(v) : String(v ?? "")).join("|");
    if (reasons.length) excluded.push({ row: rowNumber, reasons });
    else {
      const rowFingerprint = sha(`${sourceFingerprint}|Master Gifting|${rowNumber}|${canonical}`);
      rows.push({ recipientName, category: categoryText as Category, comment, barcode, description, quantity: quantity!, totalCost: totalCost!,
        sourceRow: rowNumber, rowFingerprint, dedupeKey: `${sourceFingerprint}:${rowNumber}` });
    }
  }
  return { sourceFingerprint, rows, excluded, scanned: sheet.rowCount - 1 };
}
async function main() {
  const args = process.argv.slice(2);
  const file = path.resolve(args[args.indexOf("--file") + 1] || DEFAULT_FILE);
  const apply = args.includes("--apply");
  if (apply && (!args.includes("--confirm-development") || process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT)) {
    throw new Error("Apply requires --confirm-development and is blocked outside development");
  }
  const parsed = await parseGiftingWorkbook(file);
  const products = await db.select({ id: productsTable.id, sku: productsTable.sku }).from(productsTable);
  const byBarcode = new Map(products.filter((p) => p.sku).map((p) => [p.sku!.trim(), p]));
  const missing = parsed.rows.filter((r) => !byBarcode.has(r.barcode));
  const eligible = parsed.rows.filter((r) => byBarcode.has(r.barcode));
  const totals = eligible.reduce((a, r) => ({ units: a.units + r.quantity, cost: a.cost + r.totalCost }), { units: 0, cost: 0 });
  const categories = Object.fromEntries((["VIP", "Sample", "Damage", "Marketing", "Tester"] as Category[]).map((c) => {
    const rs = eligible.filter((r) => r.category === c); return [c, { rows: rs.length, units: rs.reduce((n, r) => n + r.quantity, 0) }];
  }));
  if (eligible.length !== EXPECTED.rows || totals.units !== EXPECTED.units || Math.abs(totals.cost - EXPECTED.total) > 1e-7) {
    throw new Error(`Reconciliation failed: rows=${eligible.length}, units=${totals.units}, total=${totals.cost}`);
  }
  let inserted = 0;
  if (apply) {
    const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (!email) throw new Error("ADMIN_EMAIL is required for apply");
    const [actor] = await db.select({ id: adminUsersTable.id }).from(adminUsersTable)
      .where(and(eq(adminUsersTable.email, email), eq(adminUsersTable.isActive, true))).limit(1);
    if (!actor) throw new Error("Active ADMIN_EMAIL administrator was not found");
    const existing = new Set((await db.select({ key: giftingIssuesTable.dedupeKey }).from(giftingIssuesTable)
      .where(inArray(giftingIssuesTable.dedupeKey, eligible.map((r) => r.dedupeKey)))).map((r) => r.key));
    const values = eligible.filter((r) => !existing.has(r.dedupeKey)).map((r) => ({
      recipientName: r.recipientName, category: r.category, comment: r.comment, productId: byBarcode.get(r.barcode)!.id,
      barcode: r.barcode, descriptionSnapshot: r.description, quantity: r.quantity, totalCost: r.totalCost.toFixed(8),
      sourceFilename: path.basename(file), sourceSheet: "Master Gifting", sourceRow: r.sourceRow, rowFingerprint: r.rowFingerprint,
      importBatch: parsed.sourceFingerprint, importFingerprint: parsed.sourceFingerprint, dedupeKey: r.dedupeKey, createdBy: actor.id,
    }));
    if (values.length) { await db.insert(giftingIssuesTable).values(values); inserted = values.length; }
  }
  console.log(JSON.stringify({ mode: apply ? "applied" : "preview", scanned: parsed.scanned, eligible: eligible.length, excluded: parsed.excluded.length + missing.length,
    missingBarcodes: missing.map((r) => r.barcode), inserted, totals, categories, sourceFingerprint: parsed.sourceFingerprint }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => pool.end());