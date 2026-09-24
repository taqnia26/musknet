import { describe, expect, it } from "vitest";
import {
  prepareProductDescriptionCreate,
  prepareProductDescriptionUpdate,
  richDescriptionSchema,
  richDescriptionToPlainText,
  validateRawRichDescriptionFields,
} from "./rich-description";

const validDescription = {
  blocks: [
    {
      type: "heading2",
      align: "center",
      effect: "fade",
      content: [{ text: "A ", bold: true }, { text: "scent", italic: true }],
    },
    {
      type: "bullet",
      align: "start",
      effect: "none",
      content: [{ text: "Top notes", color: "gold", href: "https://example.com/notes" }],
    },
  ],
} as const;

describe("rich product descriptions", () => {
  it("accepts all ten motion effects and bounded per-block speeds without breaking older blocks", () => {
    const effects = ["fade", "zoom", "rise", "drop", "slide-left", "slide-right", "blur", "rotate", "flip", "bounce"];
    for (const effect of effects) {
      expect(richDescriptionSchema.safeParse({
        blocks: [{ ...validDescription.blocks[0], effect, effectSpeed: 0.5 }],
      }).success).toBe(true);
    }
    expect(richDescriptionSchema.safeParse(validDescription).success).toBe(true);
    for (const effectSpeed of [0, 0.6, 2.25, "1", null]) {
      expect(richDescriptionSchema.safeParse({
        blocks: [{ ...validDescription.blocks[0], effectSpeed }],
      }).success).toBe(false);
    }
  });

  it("accepts the strict supported rich-description format and derives plain text", () => {
    const parsed = richDescriptionSchema.parse(validDescription);
    expect(richDescriptionToPlainText(parsed)).toBe("A scent\nTop notes");
  });

  it("rejects extra keys and unsafe links while preserving literal markup-looking text", () => {
    expect(validateRawRichDescriptionFields({
      descriptionRichAr: { ...validDescription, html: "<b>bad</b>" },
    })).toMatch(/Unrecognized key/);
    expect(richDescriptionSchema.safeParse({
      blocks: [{
        ...validDescription.blocks[0],
        content: [{ text: "click", href: "javascript:alert(1)" }],
      }],
    }).success).toBe(false);
    const literalMarkup = {
      blocks: [{
        ...validDescription.blocks[0],
        content: [{ text: "<script>alert(1)</script>" }],
      }],
    };
    const parsedLiteral = richDescriptionSchema.parse(literalMarkup);
    expect(richDescriptionToPlainText(parsedLiteral)).toBe("<script>alert(1)</script>");
    expect(validateRawRichDescriptionFields({ descriptionRichAr: literalMarkup })).toBeNull();
  });

  it("uses rich text on creation and clears rich data only when legacy text changes alone", () => {
    const created = prepareProductDescriptionCreate({
      descriptionAr: "stale supplied text",
      descriptionRichAr: validDescription,
    });
    expect(created.descriptionAr).toBe("A scent\nTop notes");

    const existing = {
      descriptionAr: "Original",
      descriptionEn: "Original English",
      descriptionRichAr: richDescriptionSchema.parse(validDescription),
      descriptionRichEn: null,
    };
    expect(prepareProductDescriptionUpdate({}, existing)).toEqual({});
    expect(prepareProductDescriptionUpdate({ descriptionAr: "Original" }, existing)).toEqual({ descriptionAr: "Original" });
    expect(prepareProductDescriptionUpdate({ descriptionAr: "Updated" }, existing)).toEqual({
      descriptionAr: "Updated",
      descriptionRichAr: null,
    });
    expect(prepareProductDescriptionUpdate({ descriptionRichAr: validDescription }, existing)).toEqual({
      descriptionRichAr: validDescription,
      descriptionAr: "A scent\nTop notes",
    });
  });
});