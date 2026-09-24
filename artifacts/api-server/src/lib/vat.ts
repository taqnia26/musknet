export type TaxTreatment = "domestic" | "international";

export function extractVatFromGross(grossCents: number, ratePercent: number) {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) throw new Error("Gross amount must be non-negative whole cents");
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) throw new Error("VAT rate must be between 0 and 100 percent");
  const netCents = ratePercent === 0
    ? grossCents
    : Math.round(grossCents * 100 / (100 + ratePercent));
  return { netCents, vatCents: grossCents - netCents, grossCents };
}

export function discountedGrossCents(grossCents: number, discountPercent: number) {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) throw new Error("Gross amount must be non-negative whole cents");
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) throw new Error("Discount must be between 0 and 100 percent");
  return Math.round(grossCents * (100 - discountPercent) / 100);
}

export function taxTreatmentForContractType(contractType: string): TaxTreatment | null {
  const normalized = contractType.trim().toLowerCase();
  if (/السعودية|saudi/.test(normalized)) return "domestic";
  if (/الخليج|gulf/.test(normalized)) return "international";
  return null;
}