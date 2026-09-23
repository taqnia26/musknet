import { ReplitConnectors } from "@replit/connectors-sdk";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type InvoiceForEmail = {
  invoiceNumber: string;
  orderNumber: string | null;
  sellerName: string;
  sellerVatNumber: string;
  buyerName: string | null;
  buyerAddress: string | null;
  buyerTaxNumber: string | null;
  buyerCommercialRegistrationNumber: string | null;
  issueDatetime: Date;
  dueDate: string | null;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  qrCodeData: string;
  items: Array<{ productName: string; quantity: number; unitPrice: number; totalAmount: number }>;
};

const money = (value: number) => value.toFixed(2);
const invoiceLogo = [
  resolve(dirname(fileURLToPath(import.meta.url)), "../../musk-ellolo/public/site-assets/admin-logo.png"),
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../musk-ellolo/public/site-assets/admin-logo.png"),
].find(existsSync);

export async function createInvoicePdf(invoice: InvoiceForEmail) {
  if (!invoiceLogo) throw new Error("Invoice brand logo is missing from the application assets");
  const qr = await QRCode.toBuffer(invoice.qrCodeData, { type: "png", errorCorrectionLevel: "M", margin: 2 });
  const document = new PDFDocument({ size: "A4", margin: 42, info: { Title: invoice.invoiceNumber } });
  const chunks: Buffer[] = [];
  document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  const right = 553;
  document.image(invoiceLogo, 239, 26, { fit: [117, 86], align: "center", valign: "center" });
  document.fillColor("#292728").font("Helvetica-Bold").fontSize(17).text("TAX INVOICE", 42, 117, { width: 511, align: "center" });
  document.fontSize(12).text(invoice.sellerName, 42, 143, { width: 511, align: "center" });
  document.fillColor("#78716c").font("Helvetica").fontSize(9).text(`VAT Number: ${invoice.sellerVatNumber}`, 42, 164, { width: 511, align: "center" });
  document.moveTo(42, 190).lineTo(right, 190).strokeColor("#e7e5e4").stroke();

  document.roundedRect(42, 208, 244, 157, 5).fill("#f5f5f4");
  document.fillColor("#57534e").font("Helvetica-Bold").fontSize(9);
  document.text("Invoice No.", 56, 225);
  document.text("Issue Date", 56, 255);
  document.text("Due Date", 56, 285);
  document.fillColor("#292728").text(invoice.invoiceNumber, 152, 225, { width: 120, align: "right" });
  const issueDate = invoice.issueDatetime.toISOString().slice(0, 10);
  document.text(issueDate, 152, 255, { width: 120, align: "right" });
  document.text(invoice.dueDate || "-", 152, 285, { width: 120, align: "right" });
  document.roundedRect(52, 321, 224, 33, 3).fillOpacity(0.2).fill("#a8a29e").fillOpacity(1);
  document.fillColor("#292728").font("Helvetica-Bold").fontSize(9).text("Amount Due", 62, 332);
  document.text(money(invoice.outstandingAmount) + " SAR", 155, 332, { width: 111, align: "right" });

  document.fillColor("#57534e").font("Helvetica-Bold").fontSize(9).text("BILL TO", 310, 225);
  document.fillColor("#292728").fontSize(14).text(invoice.buyerName || "-", 310, 247, { width: 243 });
  document.fillColor("#57534e").font("Helvetica").fontSize(8);
  if (invoice.buyerAddress) document.text(invoice.buyerAddress, 310, 275, { width: 243, height: 35 });
  const buyerMeta = [invoice.buyerTaxNumber && `VAT: ${invoice.buyerTaxNumber}`, invoice.buyerCommercialRegistrationNumber && `CR: ${invoice.buyerCommercialRegistrationNumber}`].filter(Boolean).join("  |  ");
  if (buyerMeta) document.text(buyerMeta, 310, 318, { width: 243 });
  if (invoice.orderNumber) document.text(`Order No.: ${invoice.orderNumber}`, 310, 345, { width: 243 });

  let y = 390;
  document.roundedRect(42, y, 511, 26, 4).fill("#f5f5f4");
  document.fillColor("#111827").font("Helvetica-Bold").fontSize(9);
  document.text("Product", 54, y + 9, { width: 230 });
  document.text("Qty", 300, y + 9, { width: 45, align: "center" });
  document.text("Unit Price", 360, y + 9, { width: 75, align: "right" });
  document.text("Total", 450, y + 9, { width: 90, align: "right" });
  y += 31;
  for (const item of invoice.items) {
    if (y > 665) { document.addPage(); y = 50; }
    document.fillColor("#111827").font("Helvetica").fontSize(9).text(item.productName, 54, y + 7, { width: 230 });
    document.fillColor("#4b5563").text(String(item.quantity), 300, y + 7, { width: 45, align: "center" });
    document.text(money(item.unitPrice), 360, y + 7, { width: 75, align: "right" });
    document.fillColor("#111827").font("Helvetica-Bold").text(money(item.totalAmount), 450, y + 7, { width: 90, align: "right" });
    document.moveTo(42, y + 25).lineTo(right, y + 25).strokeColor("#e5e7eb").stroke();
    y += 29;
  }

  y += 18;
  if (y + 137 > document.page.height - 42) {
    document.addPage();
    y = 52;
  } else {
    y = Math.max(y, 535);
  }
  document.image(qr, 48, y, { width: 105, height: 105 });
  const totalsX = 325;
  const totalRows = [["Subtotal", invoice.subtotal], ["VAT (15%)", invoice.vatAmount], ["Amount Paid", invoice.paidAmount], ["Amount Due", invoice.outstandingAmount]];
  totalRows.forEach(([label, value], index) => {
    document.fillColor("#4b5563").font("Helvetica").fontSize(9).text(String(label), totalsX, y + index * 23, { width: 110 });
    document.text(money(Number(value)), 450, y + index * 23, { width: 90, align: "right" });
  });
  document.roundedRect(totalsX - 8, y + 94, 223, 35, 4).fill("#f5f5f4");
  document.fillColor("#111827").font("Helvetica-Bold").fontSize(13).text("TOTAL", totalsX, y + 105);
  document.fillColor("#292728").text(money(invoice.totalAmount), 450, y + 105, { width: 90, align: "right" });
  document.end();
  return completed;
}

export async function sendInvoiceEmail(input: { recipient: string; invoice: InvoiceForEmail; pdf: Buffer }) {
  const from = process.env.INVOICE_FROM_EMAIL?.trim() || "Musk Ellolo <onboarding@resend.dev>";
  const body = {
      from,
      to: [input.recipient],
      subject: `Tax Invoice ${input.invoice.invoiceNumber} - Musk Ellolo`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif"><h2>فاتورة ضريبية ${input.invoice.invoiceNumber}</h2><p>مرحباً، تجدون نسخة الفاتورة الضريبية مرفقة بصيغة PDF.</p><p>الإجمالي: <strong>${money(input.invoice.totalAmount)}</strong></p><p>الرصيد المستحق: <strong>${money(input.invoice.outstandingAmount)}</strong></p><p>مع التحية،<br>Musk Ellolo</p></div>`,
      attachments: [{ filename: `${input.invoice.invoiceNumber}.pdf`, content: input.pdf.toString("base64") }],
  };
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const response = apiKey
    ? await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    : await new ReplitConnectors().proxy("resend", "/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || payload.message || `Email provider returned ${response.status}`);
  return payload.id ?? null;
}