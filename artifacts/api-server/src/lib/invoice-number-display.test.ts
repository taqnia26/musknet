import { describe, expect, it } from "vitest";
import { formatInvoiceNumber, invoiceNumberSearchAlias } from "@workspace/invoice-document/core";

describe("invoice number presentation, never stored numbering", () => {
  it.each(["M","ML","INV","LC"])("shortens redundant padding for %s", prefix => {
    expect(formatInvoiceNumber(`${prefix}-000005`)).toBe(`${prefix}-0005`);
    expect(invoiceNumberSearchAlias(`${prefix}-0005`)).toBe(`${prefix}-000005`);
    expect(formatInvoiceNumber(`${prefix}-012345`)).toBe(`${prefix}-12345`);
    expect(formatInvoiceNumber(`${prefix}-1234567`)).toBe(`${prefix}-1234567`);
  });
  it("does not confuse M and ML or alter external/order references", () => {
    expect(formatInvoiceNumber("ML-000005").startsWith("M-")).toBe(false);
    for (const value of ["EXT-000005","CO-000005","L-000005","OLD-INV-42"]) {
      expect(formatInvoiceNumber(value)).toBe(value);
      expect(invoiceNumberSearchAlias(value)).toBe(value);
    }
  });
});
