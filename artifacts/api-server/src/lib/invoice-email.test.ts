import { describe, expect, it } from "vitest";
import { createInvoicePdf } from "./invoice-email";

describe("invoice email PDF", () => {
  it("embeds the invoice logo and ZATCA QR on a readable light page", async () => {
    const pdf = await createInvoicePdf({
      invoiceNumber: "TEST-100",
      orderNumber: "ORDER-100",
      sellerName: "Musk Ellolo",
      sellerVatNumber: "300000000000003",
      buyerName: "Buyer",
      buyerAddress: "Riyadh",
      buyerTaxNumber: "310000000000003",
      buyerCommercialRegistrationNumber: "12345",
      issueDatetime: new Date("2026-09-22T10:00:00.000Z"),
      dueDate: "2026-10-15",
      subtotal: 100,
      discountAmount: 10,
      shippingAmount: 5,
      vatAmount: 15,
      totalAmount: 115,
      paidAmount: 0,
      outstandingAmount: 115,
      qrCodeData: "invoice=TEST-100&total=115&vat=15",
      items: [{ productName: "Product", quantity: 1, unitPrice: 100, totalAmount: 115 }],
    });
    const contents = pdf.toString("latin1");
    expect(contents.startsWith("%PDF-")).toBe(true);
    expect((contents.match(/\/Subtype \/Image/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(contents).toContain("/Width 700");
    expect(contents).toContain("/Height 145");
    expect(contents).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});