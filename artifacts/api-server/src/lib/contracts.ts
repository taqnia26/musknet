import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import sharp from "sharp";
import { ObjectStorageService } from "./object-storage";
import { and, eq, gt } from "drizzle-orm";
import { db, distributorContractsTable, type DistributorContract } from "@workspace/db";
import { renderContract } from "./contract-template";

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
  const storage = new ObjectStorageService();
  const signature = async (path: string | null) => {
    if (!path) return null;
    const file = await storage.getObjectFile(path);
    const [bytes] = await file.download();
    return sharp(bytes).png().toBuffer();
  };
  const [sellerSignature, buyerSignature] = contract.templateVersion === 1
    ? await Promise.all([signature(contract.sellerSignaturePath), signature(contract.buyerSignaturePath)])
    : [null, null];
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 180 });
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Contract ${contract.contractNumber}` } });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
      doc.font(font);
      if (contract.templateVersion === 1) {
        const template = renderContract(contract);
        doc.fontSize(17).text(template.title, { align: "center" });
        doc.fontSize(9).text(`رقم العقد: ${contract.contractNumber}`, { align: "center" });
        if (template.missing.length) {
          doc.moveDown().fontSize(9).text(`مسودة غير مكتملة: ${template.missing.join("، ")}`, { align: "right" });
        }
        for (const section of template.sections) {
          if (section.heading.startsWith("الملحق (أ)")) doc.addPage();
          if (doc.y > 735) doc.addPage();
          doc.moveDown(0.65).fontSize(12).text(section.heading, { align: "right", continued: false });
          doc.fontSize(9.5);
          for (const paragraph of section.paragraphs) doc.text(paragraph, { align: "right", lineGap: 3, paragraphGap: 7 });
          if (section.heading.startsWith("الملحق (أ)")) {
            const columns = [
              { width: 105, key: "barcode", label: "الباركود" },
              { width: 220, key: "description", label: "المنتج" },
              { width: 85, key: "price", label: "السعر دون ضريبة" },
              { width: 85, key: "priceWithVat", label: "السعر شامل الضريبة" },
            ] as const;
            for (const item of [null, ...template.products]) {
              if (doc.y > doc.page.height - 88) doc.addPage();
              const y = doc.y + 4;
              let x = 48;
              for (const column of columns) {
                doc.rect(x, y, column.width, 30).strokeColor("#dddddd").stroke();
                const value = item ? item[column.key] : column.label;
                doc.fontSize(item ? 7 : 7.5).text(value, x + 3, y + 8, { width: column.width - 6, height: 22, align: item ? "left" : "center", lineBreak: false });
                x += column.width;
              }
              doc.y = y + 30;
            }
          }
          if (section.heading === "نسخ العقد والتوقيعات") {
            for (const [label, image] of [["توقيع الطرف الأول:", sellerSignature], ["توقيع الطرف الثاني:", buyerSignature]] as const) {
              if (!image) continue;
              if (doc.y > doc.page.height - 150) doc.addPage();
              doc.fontSize(9).text(label, { align: "right" });
              const y = doc.y + 4;
              doc.image(image, doc.page.width - 48 - 140, y, { fit: [140, 65] });
              doc.y = y + 75;
            }
          }
        }
        doc.moveDown().fontSize(8).text(`التحقق من العقد: ${verificationUrl}`, { align: "right" });
        if (doc.y > doc.page.height - 145) doc.addPage();
        doc.image(qrDataUrl, (doc.page.width - 90) / 2, doc.y + 8, { fit: [90, 90] });
        doc.end();
        return;
      }
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
     line("رقم الجوال", contract.buyerPhone);
     doc.moveDown().fontSize(9).text("التوقيعات الإلكترونية دليل مسجل ولا تعني وحدها تحقق الصلاحية القانونية.", { align: "right" });
    doc.image(qrDataUrl, { fit: [120, 120], align: "center" });
    doc.fontSize(8).text(verificationUrl, { align: "center" });
    doc.end();
  });
}