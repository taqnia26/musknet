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
  return candidates.find((value) => fs.existsSync(value));
}

export async function createContractPdf(contract: DistributorContract, verificationUrl: string) {
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: "M", margin: 1, width: 180 });
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Contract ${contract.contractNumber}` } });
    const font = pdfFontPath();
    if (font) doc.font(font);
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).text("Distributor Contract", { align: "center" });
    doc.moveDown().fontSize(10);
    const line = (label: string, value: unknown) => doc.text(`${label}: ${value ?? ""}`);
    line("Contract number", contract.contractNumber);
    line("Status", contract.status);
    line("Contract type", contract.contractType);
    doc.moveDown();
    doc.fontSize(13).text("Seller");
    doc.fontSize(10);
    line("Legal name", contract.sellerName);
    line("Commercial registration", contract.sellerCrNumber);
    line("Registration date", contract.sellerCrDate);
    line("Issuer", contract.sellerCrIssuer);
    line("Address", contract.sellerAddress);
    line("Authorized representative", `${contract.sellerRepName} (${contract.sellerRepTitle})`);
    doc.moveDown().fontSize(13).text("Buyer");
    doc.fontSize(10);
    line("Company", contract.buyerCompanyName);
    line("Representative", `${contract.buyerRepName ?? ""} (${contract.buyerRepTitle ?? ""})`);
    line("Email", contract.buyerEmail);
    line("Phone", contract.buyerPhone);
    doc.moveDown().fontSize(9).text("Electronic signatures are recorded evidence and do not by themselves claim legal validity.");
    doc.image(qrDataUrl, { fit: [120, 120], align: "center" });
    doc.fontSize(8).text(verificationUrl, { align: "center" });
    doc.end();
  });
}