/**
 * Development-only catalog correction. Usage:
 * pnpm --filter @workspace/api-server exec tsx src/scripts/apply-perfume-descriptions.ts --dry-run
 * pnpm --filter @workspace/api-server exec tsx src/scripts/apply-perfume-descriptions.ts --apply
 *
 * Writes backup and verification report to .local/task-154-output before/after
 * modifying any records. Does not attempt to update the published database.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db, pool, productsTable } from "@workspace/db";
import { prepareProductDescriptionUpdate, richDescriptionSchema, richDescriptionToPlainText, type RichDescriptionValue } from "../lib/rich-description";
import { perfumeDescriptionSource } from "./perfume-description-manifest";

type Entry = typeof perfumeDescriptionSource.entries[number];
type Product = typeof productsTable.$inferSelect;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const decodeXml = (value: string) => value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
  if (entity.startsWith("#x")) return String.fromCodePoint(parseInt(entity.slice(2), 16));
  if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10));
  return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[entity] ?? match;
});

export function extractPerfumeDescriptions(xml: string) {
  const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)]
    .map((match) => [...match[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/>/g)]
      .map((part) => part[1] === undefined ? "\n" : decodeXml(part[1])).join("").trim())
    .filter(Boolean);
  const headings = perfumeDescriptionSource.entries.map(({ headingEn, headingAr }) => {
    const en = paragraphs.indexOf(headingEn);
    const ar = paragraphs.indexOf(headingAr);
    if (en < 0 || ar <= en || paragraphs.indexOf(headingEn, en + 1) !== -1 || paragraphs.indexOf(headingAr, ar + 1) !== -1) {
      throw new Error(`Missing or ambiguous source headings: ${headingEn} / ${headingAr}`);
    }
    return { en, ar };
  });
  return perfumeDescriptionSource.entries.map((entry, i) => {
    const { en, ar } = headings[i];
    const end = headings[i + 1]?.en ?? paragraphs.length;
    if ((i > 0 && en <= headings[i - 1].ar) || end <= ar) throw new Error(`Out-of-order source: ${entry.headingEn}`);
    if (paragraphs[en + 1] !== "Perfume description" || paragraphs[ar + 1] !== "وصف العطر:") {
      throw new Error(`Unexpected source layout: ${entry.headingEn}`);
    }
    const enParagraphs = paragraphs.slice(en + 2, ar);
    const arParagraphs = paragraphs.slice(ar + 2, end);
    if (!enParagraphs.length || !arParagraphs.length) throw new Error(`Empty description: ${entry.headingEn}`);
    return { entry, en: enParagraphs.join("\n"), ar: arParagraphs.join("\n") };
  });
}

export function richFromSource(text: string): RichDescriptionValue {
  const content = Array.from({ length: Math.ceil(text.length / 2000) }, (_, i) => ({ text: text.slice(i * 2000, (i + 1) * 2000) }));
  return richDescriptionSchema.parse({ blocks: [{ type: "paragraph", align: "start", effect: "none", content }] });
}

export function matchPerfume(entry: Entry, rows: Product[]): Product | null {
  const byName = rows.filter((row) => row.nameAr === entry.nameAr);
  if (entry.id === null) {
    if (byName.length) throw new Error(`Source ${entry.headingEn} exists but lacks a confirmed stable identity; manual review required`);
    return null;
  }
  const matches = rows.filter((row) => row.id === entry.id || row.slug === entry.slug || row.sku === entry.sku || row.nameAr === entry.nameAr);
  if (matches.length !== 1 || matches[0].id !== entry.id || matches[0].slug !== entry.slug
    || matches[0].nameAr !== entry.nameAr || matches[0].sku !== entry.sku) {
    throw new Error(`Ambiguous or changed product identity: ${entry.headingEn}; no updates applied`);
  }
  return matches[0];
}

const descriptionFields = (row: Product) => ({
  descriptionAr: row.descriptionAr, descriptionEn: row.descriptionEn,
  descriptionRichAr: row.descriptionRichAr, descriptionRichEn: row.descriptionRichEn,
});
const otherFields = (row: Product) => {
  const { descriptionAr, descriptionEn, descriptionRichAr, descriptionRichEn, updatedAt, ...other } = row;
  void descriptionAr; void descriptionEn; void descriptionRichAr; void descriptionRichEn; void updatedAt;
  return JSON.stringify(other);
};

async function main() {
  const mode = process.argv[2];
  if (!["--dry-run", "--apply"].includes(mode) || process.argv.length !== 3) throw new Error("Specify --dry-run or --apply");
  if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
    throw new Error("This script is prohibited in deployments/production");
  }
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!process.env.PGHOST || !process.env.PGDATABASE
    || url.hostname !== process.env.PGHOST || url.pathname.slice(1) !== process.env.PGDATABASE) {
    throw new Error("DATABASE_URL does not match the provisioned development PGHOST/PGDATABASE; refusing to run");
  }
  // Explicit confirmation prevents accidental production writes when a local
  // DATABASE_URL is redirected; the development connection is checked below.
  if (mode === "--apply" && process.env.PERFUME_DESCRIPTIONS_DEV_APPLY !== "yes") {
    throw new Error("Set PERFUME_DESCRIPTIONS_DEV_APPLY=yes to confirm development-only application");
  }
  const workspace = resolve(import.meta.dirname, "../../../..");
  const sourceFile = resolve(workspace, perfumeDescriptionSource.file);
  const outputDir = resolve(workspace, ".local/task-154-output");
  const bytes = await readFile(sourceFile);
  const descriptions = extractPerfumeDescriptions(execFileSync("unzip", ["-p", sourceFile, "word/document.xml"], { encoding: "utf8" }));
  const sourceManifest = {
    sourceFile: perfumeDescriptionSource.file, sourceSha256: hash(bytes), extraction: "Word paragraphs joined with LF; only leading/trailing paragraph whitespace removed; headings excluded; prices retained as text",
    products: descriptions.map(({ entry, ar, en }) => ({ ...entry, ar, en, arSha256: hash(ar), enSha256: hash(en) })),
  };
  const rows = await db.select().from(productsTable);
  const prepared = descriptions.map(({ entry, ar, en }) => ({
    entry, row: matchPerfume(entry, rows), ar: richFromSource(ar), en: richFromSource(en),
  }));
  const changes = prepared.filter((item): item is typeof item & { row: Product } => item.row !== null)
    .filter(({ row, ar, en }) => JSON.stringify(row.descriptionRichAr) !== JSON.stringify(ar)
      || JSON.stringify(row.descriptionRichEn) !== JSON.stringify(en)
      || row.descriptionAr !== richDescriptionToPlainText(ar) || row.descriptionEn !== richDescriptionToPlainText(en));
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "source-manifest.json"), JSON.stringify(sourceManifest, null, 2) + "\n", { flag: "w" });
  const backup = {
    sourceSha256: sourceManifest.sourceSha256, createdAt: new Date().toISOString(),
    products: prepared.filter((item): item is typeof item & { row: Product } => item.row !== null)
      .map(({ row }) => ({ id: row.id, slug: row.slug, ...descriptionFields(row) })),
  };
  // Never overwrite a pre-change backup on a rerun.
  const backupPath = resolve(outputDir, "prior-descriptions.json");
  let originalBackup = backup;
  try {
    await writeFile(backupPath, JSON.stringify(backup, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const prior = JSON.parse(await readFile(backupPath, "utf8")) as typeof backup;
    if (prior.sourceSha256 !== backup.sourceSha256 || JSON.stringify(prior.products.map(({ id, slug }) => ({ id, slug })))
      !== JSON.stringify(backup.products.map(({ id, slug }) => ({ id, slug })))) throw new Error("Existing backup conflicts with source or product identities");
    originalBackup = prior;
  }
  if (mode === "--apply" && changes.length) {
    await db.transaction(async (tx) => {
      const locked = await tx.select().from(productsTable)
        .where(inArray(productsTable.id, changes.map(({ row }) => row.id))).for("update");
      for (const { row, ar, en } of changes) {
        const current = locked.find((item) => item.id === row.id);
        if (!current || JSON.stringify(current) !== JSON.stringify(row)) throw new Error(`Concurrent product modification: ${row.id}`);
        const values = prepareProductDescriptionUpdate({ descriptionRichAr: ar, descriptionRichEn: en }, current);
        await tx.update(productsTable).set(values).where(eq(productsTable.id, row.id));
      }
    });
  }
  const after = await db.select().from(productsTable).where(inArray(productsTable.id, prepared.flatMap(({ row }) => row ? [row.id] : [])));
  for (const { row, ar, en } of prepared) {
    if (!row) continue;
    const current = after.find((item) => item.id === row.id);
    if (!current || otherFields(row) !== otherFields(current)) throw new Error(`Non-description fields changed: ${row.id}`);
    if (mode === "--apply" && (JSON.stringify(current.descriptionRichAr) !== JSON.stringify(ar)
      || JSON.stringify(current.descriptionRichEn) !== JSON.stringify(en)
      || current.descriptionAr !== richDescriptionToPlainText(ar) || current.descriptionEn !== richDescriptionToPlainText(en))) {
      throw new Error(`Description verification failed: ${row.id}`);
    }
  }
  const report = {
    environment: "development only", mode, sourceSha256: sourceManifest.sourceSha256, verifiedAt: new Date().toISOString(),
    matched: prepared.filter(({ row }) => row).map(({ entry, row }) => ({ heading: entry.headingEn, id: row!.id, slug: row!.slug })),
    missing: prepared.filter(({ row }) => !row).map(({ entry }) => entry.headingEn),
    changed: changes.map(({ row }) => row.id), unchangedCount: prepared.filter(({ row }) => row).length - changes.length,
    appliedCount: mode === "--apply" ? changes.length : 0,
    changedSinceBackup: prepared.filter(({ row }) => row).filter(({ row }) => {
      const original = originalBackup.products.find((item) => item.id === row!.id);
      const current = after.find((item) => item.id === row!.id);
      return original && current && JSON.stringify(descriptionFields(current)) !== JSON.stringify({
        descriptionAr: original.descriptionAr, descriptionEn: original.descriptionEn,
        descriptionRichAr: original.descriptionRichAr, descriptionRichEn: original.descriptionRichEn,
      });
    }).map(({ row }) => row!.id),
    backupPath, sourceManifestPath: resolve(outputDir, "source-manifest.json"),
  };
  await writeFile(resolve(outputDir, "verification-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  await pool.end();
}

if (process.argv[1]?.endsWith("apply-perfume-descriptions.ts")) main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
  void pool.end();
});