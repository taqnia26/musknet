import { describe, expect, it } from "vitest";
import { encodeZatcaPhaseOne, zatcaPhaseOneBase64, zatcaSellerConfiguration } from "./zatca";

describe("ZATCA Phase-1 TLV", () => {
  it("encodes Arabic field lengths as UTF-8 bytes and emits all five tags", () => {
    const fields = {
      sellerName: "مسك اللولو",
      vatRegistrationNumber: "300000000000003",
      timestamp: "2025-01-02T03:04:05.000Z",
      invoiceTotal: "115.00",
      vatTotal: "15.00",
    };
    const bytes = encodeZatcaPhaseOne(fields);
    expect(bytes[0]).toBe(1);
    expect(bytes[1]).toBe(Buffer.byteLength(fields.sellerName, "utf8"));
    expect(bytes[1]).toBeGreaterThan(fields.sellerName.length);

    const tags: number[] = [];
    for (let offset = 0; offset < bytes.length;) {
      tags.push(bytes[offset]);
      offset += 2 + bytes[offset + 1];
    }
    expect(tags).toEqual([1, 2, 3, 4, 5]);
    expect(Buffer.from(zatcaPhaseOneBase64(fields), "base64")).toEqual(Buffer.from(bytes));
  });

  it("requires the legal seller name and VAT registration number from the environment", () => {
    expect(() => zatcaSellerConfiguration({
      VAT_REGISTRATION_NUMBER: "300000000000003",
    })).toThrow(/VAT_SELLER_LEGAL_NAME/);

    expect(zatcaSellerConfiguration({
      VAT_SELLER_LEGAL_NAME: "مؤسسة مسك اللولو للتجارة",
      VAT_REGISTRATION_NUMBER: "300000000000003",
    })).toEqual({
      sellerName: "مؤسسة مسك اللولو للتجارة",
      vatRegistrationNumber: "300000000000003",
    });
  });
});