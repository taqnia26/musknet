export type IntakeAddress = {
  country: string;
  city: string;
  nationalAddressShortCode?: string | null;
  district?: string | null;
  street?: string | null;
  buildingNo?: string | null;
  postalCode?: string | null;
  additionalNumber?: string | null;
  additionalInfo?: string | null;
};

export function normalizeIntakeAddress(input: IntakeAddress) {
  const country = input.country.trim().toUpperCase();
  const region = /^[A-Z]{2}$/.test(country)
    ? new Intl.DisplayNames(["en"], { type: "region" }).of(country) : undefined;
  if (!region || region === country || region === "Unknown Region") throw new Error("Choose a valid country");
  const city = input.city.trim();
  if (!city) throw new Error("City is required");
  const fields = {
    nationalAddressShortCode: input.nationalAddressShortCode?.trim() || null,
    district: input.district?.trim() || null,
    street: input.street?.trim() || null,
    buildingNo: input.buildingNo?.trim() || null,
    postalCode: input.postalCode?.trim() || null,
    additionalNumber: input.additionalNumber?.trim() || null,
    additionalInfo: input.additionalInfo?.trim() || null,
  };
  if (country === "SA") {
    if (Object.entries(fields).some(([key, value]) => key !== "additionalInfo" && !value))
      throw new Error("Saudi address requires short code, district, street, building number, postal code and additional number");
    if (fields.additionalInfo) throw new Error("Detailed international address cannot be combined with Saudi address");
  } else {
    if (!fields.additionalInfo) throw new Error("Detailed address is required outside Saudi Arabia");
    if (Object.entries(fields).some(([key, value]) => key !== "additionalInfo" && value))
      throw new Error("Saudi address fields cannot be combined with international address");
  }
  return { country, city, ...fields };
}