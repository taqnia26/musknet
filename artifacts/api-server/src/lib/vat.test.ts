import { describe, expect, it } from "vitest";
import { discountedGrossCents, extractVatFromGross, taxTreatmentForContractType } from "./vat";

describe("VAT-inclusive gross calculations", () => {
  it("extracts 15 percent VAT from the final catalog price without changing gross", () => {
    const amounts = extractVatFromGross(39_800, 15);
    expect(amounts).toEqual({ netCents: 34_609, vatCents: 5_191, grossCents: 39_800 });
    expect(amounts.netCents + amounts.vatCents).toBe(amounts.grossCents);
  });

  it("applies contract discount to gross before extracting contract-rate VAT", () => {
    const grossAfterDiscount = discountedGrossCents(39_800, 10);
    const amounts = extractVatFromGross(grossAfterDiscount, 5);
    expect(grossAfterDiscount).toBe(35_820);
    expect(amounts).toEqual({ netCents: 34_114, vatCents: 1_706, grossCents: 35_820 });
  });

  it("keeps international discounted gross with zero VAT and recognizes contract region only by type", () => {
    const gross = discountedGrossCents(39_800, 10);
    expect(extractVatFromGross(gross, 0)).toEqual({ netCents: 35_820, vatCents: 0, grossCents: 35_820 });
    expect(taxTreatmentForContractType("عقد توريد أجل المملكة العربية السعودية")).toBe("domestic");
    expect(taxTreatmentForContractType("عقد توريد أجل دول الخليج")).toBe("international");
    expect(taxTreatmentForContractType("distribution")).toBeNull();
  });
});