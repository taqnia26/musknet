import { describe, expect, it } from "vitest";
import { assertTransition, createContractPdf, hashContractToken, newContractToken } from "./contracts";
import { renderContract } from "./contract-template";

describe("contracts", () => {
  it("uses live legal and commercial terms in the complete Word-based text and flags incomplete drafts", () => {
    const input = {
      contractType: "عقد توريد أجل المملكة العربية السعودية",
      contractDate: new Date("2027-03-02T09:00:00Z"),
      sellerName: "بائع تجريبي", sellerCrNumber: "777777", sellerCrDate: "01/01/2027",
      sellerCrIssuer: "جهة الاختبار", sellerAddress: "العنوان الجديد",
      sellerRepName: "ممثلة جديدة", sellerRepTitle: "مديرة",
      buyerCompanyName: "شركة مختلفة", buyerCrNumber: "888888", buyerCrIssuer: "الرياض",
      buyerNeighborhood: "الورود", buyerCity: "الرياض", buyerRepName: "ممثل جديد",
      buyerRepTitle: "مدير", buyerEmail: "buyer@example.test", buyerPhone: "0501234567",
      marginPercent: "18", paymentDays: 45, deliveryDays: 12, inspectionDays: 4,
      warrantyMonths: 9, vatRate: "15", notes: "شرط إضافي خاص",
    };
    const result = renderContract(input);
    const text = result.sections.flatMap(section => section.paragraphs).join("\n");
    for (const phrase of ["بائع تجريبي", "777777", "01/01/2027", "جهة الاختبار", "العنوان الجديد",
      "ممثلة جديدة", "شركة مختلفة", "888888", "ممثل جديد", "buyer@example.test", "0501234567",
      "18%", "45 يوماً", "12 يوم عمل", "4 أيام عمل", "9 أشهر", "شرط إضافي خاص",
      "02/03/2027", "01/03/2028"]) expect(text).toContain(phrase);
    expect(result.missing).toEqual([]);
    expect(result.products).toHaveLength(9);
    expect(result.sections.map(section => section.heading)).toContain("ملحق (ب): شروط إضافية");
    expect(text).not.toMatch(/2026|هياء فهد اليوسف|1010311811|\[\s*●\s*\]/);
    expect(renderContract({ ...input, buyerCrIssuer: null, endDate: new Date("2026-01-01") }).missing)
      .toEqual(expect.arrayContaining(["مصدر سجل المشتري", "تاريخ النهاية يجب أن يلي البداية"]));
  });
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

  it.each(["draft", "final"] as const)("renders an Arabic %s PDF with a valid header", async (status) => {
    const pdf = await createContractPdf({
      id: 1, contractNumber: "DC-TEST-1", distributorId: null, contractType: "distribution", templateVersion: 1,
       status, contractDate: new Date(), hijriDateStr: null, gregorianDateStr: null,
       contractDayName: null, sellerName: "مؤسسة مسك اللولو للتجارة", sellerCrNumber: "7003185274", sellerCrDate: "02/07/2011",
       sellerCrIssuer: "وزارة التجارة", sellerAddress: "الرياض، حي السليمانية، شارع امرؤ القيس",
       sellerRepName: "ممثل اختباري", sellerRepTitle: "مدير اختباري",
       buyerCompanyName: "شركة اختبار", buyerCrNumber: null, buyerCrDate: null, buyerCrIssuer: null,
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
    expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});