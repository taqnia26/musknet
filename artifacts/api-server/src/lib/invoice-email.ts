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
  discountAmount?: number;
  shippingAmount?: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  qrCodeData: string;
  items: Array<{ productName: string; quantity: number; unitPrice: number; totalAmount: number }>;
};

const money = (value: number) => value.toFixed(2);
const invoiceLogo = [
  resolve(dirname(fileURLToPath(import.meta.url)), "../../musk-ellolo/public/site-assets/invoice-logo-black.png"),
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../musk-ellolo/public/site-assets/invoice-logo-black.png"),
].find(existsSync);
const invoiceFooter = [
  resolve(dirname(fileURLToPath(import.meta.url)), "../../musk-ellolo/public/site-assets/invoice-footer.jpg"),
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../musk-ellolo/public/site-assets/invoice-footer.jpg"),
].find(existsSync);

export async function createInvoicePdf(invoice: InvoiceForEmail) {
  if (!invoiceLogo) throw new Error("Invoice brand logo is missing from the application assets");
  if (!invoiceFooter) throw new Error("Invoice footer is missing from the application assets");
  const qr = await QRCode.toBuffer(invoice.qrCodeData, { type: "png", errorCorrectionLevel: "M", margin: 2 });
  const document = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: invoice.invoiceNumber } });
  const chunks: Buffer[] = [];
  document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  const right = 553;
  document.image(invoiceLogo, 185, 28, { fit: [225, 58], align: "center", valign: "center" });
  document.fillColor("#292728").font("Helvetica-Bold").fontSize(17).text("TAX INVOICE", 185, 99, { width: 225, align: "center" });
  document.fillColor("#57534e").fontSize(9).text("FROM", 42, 152);
  document.fillColor("#292728").fontSize(12).text(invoice.sellerName, 42, 173, { width: 244, height: 35 });
  document.fillColor("#78716c").font("Helvetica").fontSize(9).text(`VAT Number: ${invoice.sellerVatNumber}`, 42, 213, { width: 244 });

  document.roundedRect(42, 239, 244, 127, 5).fill("#f5f5f4");
  document.fillColor("#57534e").font("Helvetica-Bold").fontSize(9);
  document.text("Invoice No.", 56, 251);
  document.text("Issue Date", 56, 278);
  document.text("Due Date", 56, 305);
  document.fillColor("#292728").text(invoice.invoiceNumber, 152, 251, { width: 120, align: "right" });
  const issueDate = invoice.issueDatetime.toISOString().slice(0, 10);
  document.text(issueDate, 152, 278, { width: 120, align: "right" });
  document.text(invoice.dueDate || "-", 152, 305, { width: 120, align: "right" });
  document.roundedRect(52, 328, 224, 30, 3).fillOpacity(0.2).fill("#a8a29e").fillOpacity(1);
  document.fillColor("#292728").font("Helvetica-Bold").fontSize(9).text("Amount Due", 62, 338);
  document.text(money(invoice.outstandingAmount) + " SAR", 155, 338, { width: 111, align: "right" });

  document.fillColor("#57534e").font("Helvetica-Bold").fontSize(9).text("BILL TO", 310, 152);
  document.fillColor("#292728").fontSize(14).text(invoice.buyerName || "-", 310, 173, { width: 243, height: 36 });
  document.fillColor("#57534e").font("Helvetica").fontSize(8);
  if (invoice.buyerAddress) document.text(invoice.buyerAddress, 310, 216, { width: 243, height: 35 });
  const buyerMeta = [invoice.buyerTaxNumber && `VAT: ${invoice.buyerTaxNumber}`, invoice.buyerCommercialRegistrationNumber && `CR: ${invoice.buyerCommercialRegistrationNumber}`].filter(Boolean).join("  |  ");
  if (buyerMeta) document.text(buyerMeta, 310, 265, { width: 243, height: 30 });
  if (invoice.orderNumber) document.text(`Order No.: ${invoice.orderNumber}`, 310, 310, { width: 243 });
  document.moveTo(42, 378).lineTo(right, 378).strokeColor("#e7e5e4").stroke();

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
  const totalRows: Array<[string, number]> = [["Subtotal", invoice.subtotal], ["VAT (15%)", invoice.vatAmount]];
  if ((invoice.shippingAmount ?? 0) > 0) totalRows.push(["Shipping", invoice.shippingAmount!]);
  totalRows.push(["Discount", -(invoice.discountAmount ?? 0)], ["Amount Paid", invoice.paidAmount], ["Amount Due", invoice.outstandingAmount]);
  if (Math.max(y, 535) + totalRows.length * 23 + 42 > 738) {
    document.addPage();
    y = 52;
  } else {
    y = Math.max(y, 535);
  }
  document.image(qr, 48, y, { width: 105, height: 105 });
  const totalsX = 325;
  totalRows.forEach(([label, value], index) => {
    document.fillColor("#4b5563").font("Helvetica").fontSize(9).text(String(label), totalsX, y + index * 23, { width: 110 });
    document.text(money(Number(value)), 450, y + index * 23, { width: 90, align: "right" });
  });
  const totalY = y + totalRows.length * 23 + 2;
  document.roundedRect(totalsX - 8, totalY, 223, 35, 4).fill("#f5f5f4");
  document.fillColor("#111827").font("Helvetica-Bold").fontSize(13).text("TOTAL", totalsX, totalY + 11);
  document.fillColor("#292728").text(money(invoice.totalAmount), 450, totalY + 11, { width: 90, align: "right" });
  const pages = document.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index++) {
    document.switchToPage(index);
    document.image(invoiceFooter, 42, 751, { fit: [511, 70], align: "center", valign: "center" });
  }
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