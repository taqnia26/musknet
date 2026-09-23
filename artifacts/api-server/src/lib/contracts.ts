import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { and, eq, gt } from "drizzle-orm";
import { db, distributorContractsTable, type DistributorContract } from "@workspace/db";

export const hashContractToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newContractToken = () => randomBytes(32).toString("base64url");

export function assertTransition(status: string, target: "seller_signed" | "sent" | "final" | "cancelled") {
  const allowed: Record<string, string[]> = {
    draft: ["seller_signed", "cancelled"],
    seller_signed: ["sent", "cancelled"],
    sent: ["final", "cancelled"],
    final: [],
    cancelled: [],
  };
  if (!allowed[status]?.includes(target)) throw new Error(`Invalid contract transition: ${status} -> ${target}`);
}

export async function contractBySigningToken(rawToken: string) {
  const [contract] = await db.select().from(distributorContractsTable).where(and(
    eq(distributorContractsTable.signingTokenHash, hashContractToken(rawToken)),
    gt(distributorContractsTable.signingTokenExpiresAt, new Date()),
  )).limit(1);
  return contract;
}

export async function contractByDownloadToken(rawToken: string) {
  const [contract] = await db.select().from(distributorContractsTable).where(and(
    eq(distributorContractsTable.downloadTokenHash, hashContractToken(rawToken)),
    gt(distributorContractsTable.downloadTokenExpiresAt, new Date()),
  )).limit(1);
  return contract;
}

function pdfFontPath() {
  const candidates = [
    process.env.CONTRACT_PDF_FONT_PATH,
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf",
  ].filter((value): value is string => Boolean(value));
  const font = candidates.find((value) => fs.existsSync(value));
  if (!font) throw new Error("Arabic contract PDF font is unavailable; configure CONTRACT_PDF_FONT_PATH");
  return font;
}

export async function createContractPdf(contract: DistributorContract, verificationUrl: string) {
  const font = pdfFontPath();
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 180 });
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Contract ${contract.contractNumber}` } });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
     doc.font(font);
     doc.fontSize(18).text("عقد توزيع", { align: "center" });
    doc.moveDown().fontSize(10);
     const line = (label: string, value: unknown) => doc.text(`${label}: ${value ?? ""}`, { align: "right" });
     line("رقم العقد", contract.contractNumber);
     line("الحالة", contract.status === "draft" ? "مسودة" : contract.status);
     line("نوع العقد", contract.contractType);
    doc.moveDown();
     doc.fontSize(13).text("الطرف الأول", { align: "right" });
    doc.fontSize(10);
     line("الاسم", contract.sellerName);
     line(contract.sellerCrNumber === "7003185274" ? "الرقم الوطني الموحد" : "رقم السجل / الرقم الوطني الموحد حسب الوثيقة", contract.sellerCrNumber);
     line("تاريخ إصدار شهادة السجل", contract.sellerCrDate);
     line("الجهة المصدرة", contract.sellerCrIssuer);
     line("العنوان الوطني", contract.sellerAddress);
     line("الممثل", `${contract.sellerRepName} (${contract.sellerRepTitle})`);
     doc.moveDown().fontSize(13).text("الطرف الثاني", { align: "right" });
    doc.fontSize(10);
     line("المنشأة", contract.buyerCompanyName);
     line("الممثل", `${contract.buyerRepName ?? ""} (${contract.buyerRepTitle ?? ""})`);
     line("البريد الإلكتروني", contract.buyerEmail);
     line("الهاتف", contract.buyerPhone);
     doc.moveDown().fontSize(9).text("التوقيعات الإلكترونية دليل مسجل ولا تعني وحدها تحقق الصلاحية القانونية.", { align: "right" });
    doc.image(qrDataUrl, { fit: [120, 120], align: "center" });
    doc.fontSize(8).text(verificationUrl, { align: "center" });
    doc.end();
  });
}