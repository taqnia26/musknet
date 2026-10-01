import { describe, expect, it } from "vitest";
import { canArchiveSiteContent } from "./site-content-policy";

describe("site-content archive policy", () => {
  it("rejects sensitive fields inside nested serialized JSON without modifying the original value", () => {
    const data = '{"content":[{"settings":"{\\"password\\":\\"hidden\\"}"}]}';

    expect(canArchiveSiteContent("custom.editor-content", data)).toBe(false);
    expect(data).toBe('{"content":[{"settings":"{\\"password\\":\\"hidden\\"}"}]}');
  });

  it.each([
    { "كلمة المرور": "hidden" },
    { "رمز الوصول": "hidden" },
    { "مفتاح API": "hidden" },
    { "الحساب البنكي": "hidden" },
    { "آيبان": "hidden" },
    { "ايبان": "hidden" },
    { "الفاتورة": "hidden" },
    { "الرصيد": 25 },
    { "المبلغ": 25 },
  ])("rejects Arabic sensitive property names: $", (data) => {
    expect(canArchiveSiteContent("custom.localized-content", data)).toBe(false);
  });

  it("rejects long card and account-like numbers in strings and JSON numbers", () => {
    expect(canArchiveSiteContent("custom.content", "Card: 4111 1111-1111 1111")).toBe(false);
    expect(canArchiveSiteContent("custom.content", { reference: "١٢٣٤٥٦٧٨٩٠١٢" })).toBe(false);
    expect(canArchiveSiteContent("custom.content", { number: 1234567890123 })).toBe(false);
  });

  it("allows ordinary text and harmless stringified JSON", () => {
    expect(canArchiveSiteContent("custom.editor-content", "Welcome to our shop for 2026.")).toBe(true);
    expect(canArchiveSiteContent("custom.editor-content", '{"title":"Welcome","body":"Visit us soon"}')).toBe(true);
  });

  it("fails closed on excessive nesting and oversized collections without throwing", () => {
    let deeplyNested: unknown = "safe";
    for (let depth = 0; depth < 40; depth += 1) deeplyNested = { child: deeplyNested };

    expect(canArchiveSiteContent("custom.content", deeplyNested)).toBe(false);
    expect(() => canArchiveSiteContent("custom.content", Array.from({ length: 10_001 }, () => "safe")))
      .not.toThrow();
    expect(canArchiveSiteContent("custom.content", Array.from({ length: 10_001 }, () => "safe"))).toBe(false);
  });
});