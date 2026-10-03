import { describe, expect, it } from "vitest";
import { normalizeIntakeAddress } from "./intake-address";

describe("short-code-only Saudi intake", () => {
  it("requires only the short code without assigning a city or detailed address", () => {
    expect(normalizeIntakeAddress({ country: "SA", nationalAddressShortCode: "RYDH1234" }))
      .toMatchObject({ country: "SA", city: "", nationalAddressShortCode: "RYDH1234", district: null, street: null, buildingNo: null });
    expect(() => normalizeIntakeAddress({ country: "SA" })).toThrow(/short code/);
  });
  it("preserves historical hidden details and notes when provided", () => {
    const legacy = { country: "SA", city: "Riyadh", nationalAddressShortCode: "RYDH1234", district: "Olaya", street: "Main", buildingNo: "3", postalCode: "12345", additionalNumber: "6789", additionalInfo: "Existing note" };
    expect(normalizeIntakeAddress(legacy)).toEqual(legacy);
  });
  it("keeps international city and detailed address mandatory", () => {
    expect(() => normalizeIntakeAddress({ country: "AE", additionalInfo: "Office 7" })).toThrow(/City/);
    expect(() => normalizeIntakeAddress({ country: "AE", city: "Dubai" })).toThrow(/Detailed/);
    expect(normalizeIntakeAddress({ country: "AE", city: "Dubai", additionalInfo: "Office 7" })).toMatchObject({ city: "Dubai", additionalInfo: "Office 7" });
    expect(() => normalizeIntakeAddress({ country: "AE", city: "Dubai", additionalInfo: "Office 7", nationalAddressShortCode: "RYDH1234" })).toThrow(/Saudi/);
  });
});