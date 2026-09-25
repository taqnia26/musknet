import { describe, expect, it } from "vitest";
import { createInvoicePdf, getInvoiceTotalRows, invoiceBusinessIssueDate, invoiceItemName, invoiceMoneyLabel } from "./invoice-email";

const baseInvoice = {
  invoiceNumber: "TEST-100",
  orderNumber: null,
  sellerName: "Musk Ellolo",
  sellerVatNumber: "300000000000003",
  buyerName: "Buyer",
  buyerAddress: "Riyadh",
  buyerTaxNumber: "310000000000003",
  buyerCommercialRegistrationNumber: "12345",
  issueDatetime: new Date("2026-09-22T10:00:00.000Z"),
  dueDate: "2026-10-15",
  subtotal: 100,
  discountAmount: 0,
  shippingAmount: 0,
  vatAmount: 15,
  taxTreatment: "domestic",
  vatRate: 15,
  contractDiscountPercent: null,
  totalAmount: 115,
  paidAmount: 0,
  outstandingAmount: 115,
  qrCodeData: "invoice=TEST-100&total=115&vat=15",
  items: [{ productName: "Product", quantity: 1, unitPrice: 100, totalAmount: 115 }],
};

describe("invoice PDF formatting", () => {
  it("keeps contract discounts and VAT in the totals", () => {
    const rows = getInvoiceTotalRows({
      ...baseInvoice,
      contractDiscountPercent: 10,
      items: [{ productName: "Product", quantity: 1, unitPrice: 130, totalAmount: 115 }],
      subtotal: 100,
      discountAmount: 15,
    });

    expect(rows).toEqual([
      ["Gross before discount (VAT included)", 130],
      ["Contract discount (10%)", -15],
      ["Net subtotal after discount", 100],
      ["VAT (15%)", 15],
    ]);
    expect(rows[0][1] + rows[1][1]).toBe(rows[2][1] + rows[3][1]);
  });

  it("preserves shipping and discount rows for legacy order invoices", () => {
    const rows = getInvoiceTotalRows({
      ...baseInvoice,
      orderNumber: "ORDER-100",
      subtotal: 100,
      discountAmount: 10,
      shippingAmount: 5,
      totalAmount: 110,
    });

    expect(rows).toEqual([
      ["Subtotal", 100],
      ["VAT (15%)", 15],
      ["Shipping", 5],
      ["Discount", -10],
    ]);
  });

  it("uses the official riyal symbol for Arabic and a trailing SAR label for English", async () => {
    expect(invoiceMoneyLabel(123.45, "ar")).toBe("123.45");
    expect(invoiceMoneyLabel(123.45, "en")).toBe("123.45 SAR");

    const arabicPdf = await createInvoicePdf(baseInvoice, "ar");
    const englishPdf = await createInvoicePdf(baseInvoice, "en");
    expect(arabicPdf.toString("latin1")).not.toContain(" SAR");
    expect(englishPdf.equals(arabicPdf)).toBe(false);
  });

  it("renders each invoice language from its own immutable line snapshot", async () => {
    const item = { productName: "اسم الفاتورة", productNameEn: "English invoice label", quantity: 1, unitPrice: 100, totalAmount: 115 };
    expect(invoiceItemName(item, "ar")).toBe("اسم الفاتورة");
    expect(invoiceItemName(item, "en")).toBe("English invoice label");
    expect(invoiceItemName({ ...item, productNameEn: null }, "en")).toBe("اسم الفاتورة");
    const arabicPdf = await createInvoicePdf({ ...baseInvoice, items: [item] }, "ar");
    const englishPdf = await createInvoicePdf({ ...baseInvoice, items: [item] }, "en");
    expect(arabicPdf.equals(englishPdf)).toBe(false);
    expect(arabicPdf.length).toBeGreaterThan(2000);
    expect(englishPdf.length).toBeGreaterThan(2000);
  });

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
