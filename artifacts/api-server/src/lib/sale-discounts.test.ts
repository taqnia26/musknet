import { describe, expect, it } from "vitest";
import { allocateDiscountedGross, validateManualDiscount } from "./sale-discounts";

describe("product-only manual-discount arithmetic", () => {
  it("allocates discounted integer cents exactly, including uneven cents and zero lines", () => {
    expect(allocateDiscountedGross([100, 100, 100], 100)).toEqual([34, 33, 33]);
    expect(allocateDiscountedGross([0, 100, 200], 81)).toEqual([0, 27, 54]);
    expect(allocateDiscountedGross([100, 200], 0)).toEqual([0, 0]);
  });
  it("requires an audited positive percentage with a supported precision", () => {
    expect(validateManualDiscount()).toBe(0);
    expect(validateManualDiscount({ percent: 100, reason: "سبب الخصم المعتمد" })).toBe(100);
    for (const percent of [-1, 101, NaN, Infinity, 1.001]) expect(() => validateManualDiscount({ percent, reason: "سبب الخصم المعتمد" })).toThrow();
    expect(() => validateManualDiscount({ percent: 5, reason: "قصير" })).toThrow();
  });
});