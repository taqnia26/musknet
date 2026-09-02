export interface ZatcaPhaseOneFields {
  sellerName: string;
  vatRegistrationNumber: string;
  timestamp: string;
  invoiceTotal: string;
  vatTotal: string;
}

const encoder = new TextEncoder();

/**
 * Encodes the five mandatory Phase-1 fields as ZATCA tag-length-value bytes.
 * Length is the UTF-8 byte length (not the JavaScript character count).
 */
export function encodeZatcaPhaseOne(fields: ZatcaPhaseOneFields): Uint8Array {
  const values = [
    fields.sellerName,
    fields.vatRegistrationNumber,
    fields.timestamp,
    fields.invoiceTotal,
    fields.vatTotal,
  ];
  const encoded = values.map((value, index) => {
    const bytes = encoder.encode(value);
    if (bytes.length > 255) throw new Error(`ZATCA TLV field ${index + 1} exceeds 255 UTF-8 bytes`);
    return { tag: index + 1, bytes };
  });
  const output = new Uint8Array(encoded.reduce((total, item) => total + 2 + item.bytes.length, 0));
  let offset = 0;
  for (const item of encoded) {
    output[offset++] = item.tag;
    output[offset++] = item.bytes.length;
    output.set(item.bytes, offset);
    offset += item.bytes.length;
  }
  return output;
}

export function zatcaPhaseOneBase64(fields: ZatcaPhaseOneFields): string {
  return Buffer.from(encodeZatcaPhaseOne(fields)).toString("base64");
}

export function zatcaSellerConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const sellerName = "مسك اللولو / Musk Ellolo";
  const vatRegistrationNumber = env.VAT_REGISTRATION_NUMBER?.trim();
  if (!vatRegistrationNumber) throw new Error("VAT_REGISTRATION_NUMBER is required to issue a ZATCA invoice");
  if (!/^\d{15}$/.test(vatRegistrationNumber)) {
    throw new Error("VAT_REGISTRATION_NUMBER must contain exactly 15 digits");
  }
  return { sellerName, vatRegistrationNumber };
}