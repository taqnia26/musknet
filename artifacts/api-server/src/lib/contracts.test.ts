import { describe, expect, it } from "vitest";
import { assertTransition, createContractPdf, hashContractToken, newContractToken } from "./contracts";

describe("contracts", () => {
  it("enforces the contract state machine", () => {
    expect(() => assertTransition("draft", "seller_signed")).not.toThrow();
    expect(() => assertTransition("seller_signed", "sent")).not.toThrow();
    expect(() => assertTransition("sent", "final")).not.toThrow();
    expect(() => assertTransition("draft", "final")).toThrow(/Invalid contract transition/);
    expect(() => assertTransition("final", "cancelled")).toThrow(/Invalid contract transition/);
  });

  it("creates non-reversible random token hashes", () => {
    const token = newContractToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(hashContractToken(token)).not.toBe(token);
    expect(hashContractToken(token)).toHaveLength(64);
  });

  it("renders a downloadable PDF with a verification QR", async () => {
    const pdf = await createContractPdf({
      id: 1, contractNumber: "DC-TEST-1", distributorId: null, contractType: "distribution",
      status: "final", contractDate: new Date(), hijriDateStr: null, gregorianDateStr: null,
      contractDayName: null, sellerName: "Seller", sellerCrNumber: "CR", sellerCrDate: "2024",
      sellerCrIssuer: "Issuer", sellerAddress: "Address", sellerRepName: "Rep", sellerRepTitle: "Title",
      buyerCompanyName: "Buyer", buyerCrNumber: null, buyerCrDate: null, buyerCrIssuer: null,
      buyerNeighborhood: null, buyerCity: null, buyerPoBox: null, buyerPostalCode: null,
      buyerRepName: null, buyerRepTitle: null, buyerEmail: null, buyerPhone: null,
      showroomName: null, showroomLocation: null, showroomCity: null, marginPercent: "0",
      minOrderValue: "3000", startDate: null, endDate: null, vatRate: "15",
      latePaymentWeeklyRate: "2", latePaymentCapRate: "10", inspectionDays: 7, warrantyMonths: 6,
      deliveryDays: 15, paymentDays: 30, products: [], notes: null, signingTokenHash: null,
      signingTokenExpiresAt: null, sentForSignatureAt: null, sellerSignaturePath: null,
      sellerSignedAt: null, sellerSignedBy: null, sellerSignedByUserId: null, sellerSignedIp: null,
      buyerSignaturePath: null, buyerSignedAt: null, buyerSignedName: null, buyerSignedIp: null,
      buyerSignedUserAgent: null, downloadTokenHash: null, downloadTokenExpiresAt: null,
      finalPdfPath: null, createdBy: 1, createdAt: new Date(), updatedAt: new Date(),
    }, "https://example.test/contracts/verify");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });
});