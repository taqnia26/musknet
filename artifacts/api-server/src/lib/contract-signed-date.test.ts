import { describe, expect, it } from "vitest";
import { signedDateFromText } from "./contract-signed-date";

describe("contract signing date extraction", () => {
  it("recognizes an explicitly labeled Gregorian date in Arabic and English", () => {
    expect(signedDateFromText("تاريخ إبرام العقد: ٢٠٢٦/٠٩/٢٤\nتاريخ بداية العقد: 2026-10-01")).toBe("2026-09-24");
    expect(signedDateFromText("Signed on 24/09/2026")).toBe("2026-09-24");
  });
  it("never guesses from validity dates, invalid dates, or conflicting dates", () => {
    expect(signedDateFromText("تاريخ بداية العقد: 2026-01-01")).toBeNull();
    expect(signedDateFromText("تاريخ توقيع العقد: 2026-02-30")).toBeNull();
    expect(signedDateFromText("Signed on 2026-01-01\nSigned on 2026-02-01")).toBeNull();
    expect(signedDateFromText("Signed on 2026-01-01 or 2026-02-01")).toBeNull();
  });
});