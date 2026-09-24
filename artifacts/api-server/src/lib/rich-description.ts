export type RichSpanValue = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: "default" | "red" | "blue" | "gold";
  href?: string;
};

export type RichDescriptionValue = {
  blocks: Array<{
    type: "paragraph" | "heading2" | "heading3" | "bullet" | "ordered";
    align: "start" | "center" | "end";
    effect: "none" | "fade" | "zoom" | "rise" | "drop" | "slide-left" | "slide-right" | "blur" | "rotate" | "flip" | "bounce";
    effectSpeed?: number;
    content: RichSpanValue[];
  }>;
};

type ValidationIssue = { message: string };
type ValidationResult =
  | { success: true; data: RichDescriptionValue }
  | { success: false; error: { issues: ValidationIssue[] } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRichDescription(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const fail = (message: string) => issues.push({ message });
  const exactKeys = (record: Record<string, unknown>, required: string[], allowed: string[]) => {
    for (const key of required) if (!Object.hasOwn(record, key)) fail(`Missing required key: ${key}`);
    for (const key of Object.keys(record)) if (!allowed.includes(key)) fail(`Unrecognized key: ${key}`);
  };

  if (!isRecord(value)) return { success: false, error: { issues: [{ message: "Expected an object" }] } };
  exactKeys(value, ["blocks"], ["blocks"]);
  if (!Array.isArray(value.blocks) || value.blocks.length > 100) {
    fail("Blocks must be an array with at most 100 items");
  } else {
    const types = ["paragraph", "heading2", "heading3", "bullet", "ordered"];
    const aligns = ["start", "center", "end"];
    const effects = ["none", "fade", "zoom", "rise", "drop", "slide-left", "slide-right", "blur", "rotate", "flip", "bounce"];
    const colors = ["default", "red", "blue", "gold"];
    value.blocks.forEach((block) => {
      if (!isRecord(block)) {
        fail("Each block must be an object");
        return;
      }
      exactKeys(block, ["type", "align", "effect", "content"], ["type", "align", "effect", "effectSpeed", "content"]);
      if (!types.includes(String(block.type))) fail("Unsupported block type");
      if (!aligns.includes(String(block.align))) fail("Unsupported text alignment");
      if (!effects.includes(String(block.effect))) fail("Unsupported text effect");
      if (block.effectSpeed !== undefined && (typeof block.effectSpeed !== "number" || !Number.isFinite(block.effectSpeed)
        || block.effectSpeed < 0.5 || block.effectSpeed > 2 || block.effectSpeed * 4 % 1 !== 0)) fail("Effect speed must be between 0.5 and 2 in 0.25 increments");
      if (!Array.isArray(block.content) || block.content.length > 100) {
        fail("Block content must be an array with at most 100 items");
        return;
      }
      block.content.forEach((span) => {
        if (!isRecord(span)) {
          fail("Each span must be an object");
          return;
        }
        exactKeys(span, ["text"], ["text", "bold", "italic", "underline", "color", "href"]);
        if (typeof span.text !== "string" || span.text.length > 2000) fail("Span text must be a string of at most 2000 characters");
        for (const flag of ["bold", "italic", "underline"]) {
          if (span[flag] !== undefined && typeof span[flag] !== "boolean") fail(`${flag} must be boolean`);
        }
        if (span.color !== undefined && !colors.includes(String(span.color))) fail("Unsupported text color");
        if (span.href !== undefined) {
          if (typeof span.href !== "string" || span.href.length > 2048 || /[\s<>]/.test(span.href)) {
            fail("Link must be a valid http, https, or mailto URL");
          } else {
            try {
              const protocol = new URL(span.href).protocol;
              if (!["http:", "https:", "mailto:"].includes(protocol)) fail("Link must use http, https, or mailto");
            } catch {
              fail("Link must be a valid http, https, or mailto URL");
            }
          }
        }
      });
    });
  }

  if (issues.length) return { success: false, error: { issues } };
  return { success: true, data: value as unknown as RichDescriptionValue };
}

export const richDescriptionSchema = {
  parse(value: unknown): RichDescriptionValue {
    const parsed = validateRichDescription(value);
    if (!parsed.success) throw new Error(parsed.error.issues.map(({ message }) => message).join("; "));
    return parsed.data;
  },
  safeParse: validateRichDescription,
};

const richFields = ["descriptionRichAr", "descriptionRichEn"] as const;

export function validateRawRichDescriptionFields(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  for (const field of richFields) {
    if (!Object.hasOwn(body, field) || body[field] === null) continue;
    const parsed = richDescriptionSchema.safeParse(body[field]);
    if (!parsed.success) return `${field}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`;
  }
  return null;
}

export function richDescriptionToPlainText(description: RichDescriptionValue): string {
  return description.blocks
    .map((block) => block.content.map((span) => span.text).join(""))
    .join("\n");
}

export function prepareProductDescriptionCreate(body: Record<string, unknown>) {
  const result: Record<string, unknown> = { ...body };
  for (const [richField, plainField] of [
    ["descriptionRichAr", "descriptionAr"],
    ["descriptionRichEn", "descriptionEn"],
  ] as const) {
    const rich = result[richField];
    if (rich !== undefined && rich !== null) {
      result[plainField] = richDescriptionToPlainText(rich as RichDescriptionValue);
    } else if (rich === undefined) {
      result[richField] = null;
    }
  }
  return result;
}

export function prepareProductDescriptionUpdate(
  body: Record<string, unknown>,
  existing: {
    descriptionAr: string;
    descriptionEn: string;
    descriptionRichAr: RichDescriptionValue | null;
    descriptionRichEn: RichDescriptionValue | null;
  },
) {
  const result: Record<string, unknown> = { ...body };
  for (const [richField, plainField] of [
    ["descriptionRichAr", "descriptionAr"],
    ["descriptionRichEn", "descriptionEn"],
  ] as const) {
    const rich = result[richField];
    if (rich !== undefined) {
      if (rich !== null) result[plainField] = richDescriptionToPlainText(rich as RichDescriptionValue);
      continue;
    }
    if (result[plainField] !== undefined && result[plainField] !== existing[plainField]) {
      result[richField] = null;
    }
  }
  return result;
}