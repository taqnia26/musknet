import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { productsTable } from "@workspace/db";
import { prepareProductDescriptionUpdate, richDescriptionToPlainText } from "../lib/rich-description";
import { extractPerfumeDescriptions, matchPerfume, richFromSource } from "./apply-perfume-descriptions";
import { perfumeDescriptionSource } from "./perfume-description-manifest";

const source = resolve(import.meta.dirname, "../../../..", perfumeDescriptionSource.file);
type Product = typeof productsTable.$inferSelect;

describe("ten Word perfume descriptions", () => {
  it("extracts exact language sections, specs and prices without inventing text", () => {
    const xml = execFileSync("unzip", ["-p", source, "word/document.xml"], { encoding: "utf8" });
    expect(readFileSync(source).length).toBeGreaterThan(100);
    const descriptions = extractPerfumeDescriptions(xml);
    expect(descriptions).toHaveLength(10);
    for (const { ar, en } of descriptions) {
      expect(ar).toMatch(/السعر\s*:/);
      expect(en).toMatch(/SR/);
      expect(richDescriptionToPlainText(richFromSource(ar))).toBe(ar);
      expect(richDescriptionToPlainText(richFromSource(en))).toBe(en);
      expect(richFromSource(ar).blocks).toHaveLength(1);
    }
    const solenn = descriptions.find(({ entry }) => entry.headingEn === "SOLENN")!;
    expect(solenn.en).toContain("Extrait de Parfum 25%- 50 ML");
    expect(solenn.ar).toContain("إكستريت دو بارفام 20% -50 مل");
    expect(descriptions.find(({ entry }) => entry.headingEn.startsWith("PEACH MUSE"))?.ar).toContain("بيتش موس…");
  });

  it("rejects changed or duplicate identities and reports absent Royal Collection", () => {
    const oud = perfumeDescriptionSource.entries[0];
    const row = { id: oud.id, slug: oud.slug, nameAr: oud.nameAr, sku: oud.sku } as Product;
    expect(matchPerfume(oud, [row])?.id).toBe(6);
    expect(() => matchPerfume(oud, [row, { ...row, id: 20 }])).toThrow(/Ambiguous/);
    expect(() => matchPerfume(oud, [{ ...row, sku: "different" }])).toThrow(/Ambiguous/);
    expect(matchPerfume(perfumeDescriptionSource.entries[3], [])).toBeNull();
    expect(() => matchPerfume(perfumeDescriptionSource.entries[3], [{ ...row, nameAr: "المجموعة الملكية" }])).toThrow(/manual review/);
  });

  it("updates only rich/plain description pairs, preserving long lines and non-description data", () => {
    const sourceText = "أول سطر\n".repeat(600) + "السعر: 399 ريال";
    const rich = richFromSource(sourceText);
    expect(rich.blocks).toHaveLength(1);
    expect(rich.blocks[0].content.every((span) => span.text.length <= 2000)).toBe(true);
    const existing = {
      descriptionAr: "previous", descriptionEn: "old", descriptionRichAr: null, descriptionRichEn: null,
      price: 388, stockQuantity: 44, images: [{ url: "https://example.com/x.png" }],
    };
    const update = prepareProductDescriptionUpdate({ descriptionRichAr: rich, descriptionRichEn: rich }, existing);
    expect(Object.keys(update).sort()).toEqual(["descriptionAr", "descriptionEn", "descriptionRichAr", "descriptionRichEn"].sort());
    expect(update.descriptionAr).toBe(sourceText);
    expect(update).not.toHaveProperty("price");
    expect(update).not.toHaveProperty("stockQuantity");
    expect({ ...existing, ...update }).toMatchObject({ price: 388, stockQuantity: 44, images: existing.images });
    expect(prepareProductDescriptionUpdate({ descriptionRichAr: rich, descriptionRichEn: rich }, { ...existing, ...update })).toEqual(update);
  });
});