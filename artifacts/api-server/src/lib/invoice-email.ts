import { ReplitConnectors } from "@replit/connectors-sdk";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

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

export async function createInvoicePdf(invoice: InvoiceForEmail) {
  const qr = await QRCode.toBuffer(invoice.qrCodeData, { type: "png", errorCorrectionLevel: "M", margin: 2 });
  const document = new PDFDocument({ size: "A4", margin: 42, info: { Title: invoice.invoiceNumber } });
  const chunks: Buffer[] = [];
  document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  const right = 553;
  document.rect(0, 0, 595, 7).fill("#6b4f3a");
  document.fillColor("#6b4f3a").font("Helvetica-Bold").fontSize(22).text("TAX INVOICE", 42, 35);
  document.fillColor("#111827").fontSize(17).text(invoice.sellerName, 300, 37, { width: 253, align: "right" });
  document.fillColor("#6b7280").font("Helvetica").fontSize(9).text(`VAT Number: ${invoice.sellerVatNumber}`, 300, 62, { width: 253, align: "right" });

  document.roundedRect(42, 94, 244, 104, 8).fill("#f9fafb");
  document.fillColor("#6b4f3a").font("Helvetica-Bold").fontSize(9).text("BILL TO", 56, 108);
  document.fillColor("#111827").fontSize(14).text(invoice.buyerName || "-", 56, 128, { width: 216 });
  document.fillColor("#4b5563").font("Helvetica").fontSize(8);
  if (invoice.buyerAddress) document.text(invoice.buyerAddress, 56, 150, { width: 216, height: 28 });
  const buyerMeta = [invoice.buyerTaxNumber && `VAT: ${invoice.buyerTaxNumber}`, invoice.buyerCommercialRegistrationNumber && `CR: ${invoice.buyerCommercialRegistrationNumber}`].filter(Boolean).join("  |  ");
  if (buyerMeta) document.text(buyerMeta, 56, 181, { width: 216 });

  const issueDate = invoice.issueDatetime.toISOString().slice(0, 10);
  const details = [
    ["Invoice No.", invoice.invoiceNumber],
    ["Order No.", invoice.orderNumber || "-"],
    ["Issue Date", issueDate],
    ["Due Date", invoice.dueDate || "-"],
  ];
  details.forEach(([label, value], index) => {
    const x = 315 + (index % 2) * 124;
    const y = 105 + Math.floor(index / 2) * 50;
    document.fillColor("#9ca3af").font("Helvetica-Bold").fontSize(8).text(label, x, y);
    document.fillColor("#111827").fontSize(10).text(value, x, y + 15, { width: 112 });
  });

  let y = 225;
  document.roundedRect(42, y, 511, 26, 6).fill("#f3f4f6");
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

  y = Math.max(y + 18, 440);
  document.image(qr, 48, y, { width: 105, height: 105 });
  const totalsX = 325;
  const totalRows = [["Subtotal", invoice.subtotal], ["VAT (15%)", invoice.vatAmount], ["Amount Paid", invoice.paidAmount], ["Amount Due", invoice.outstandingAmount]];
  totalRows.forEach(([label, value], index) => {
    document.fillColor("#4b5563").font("Helvetica").fontSize(9).text(String(label), totalsX, y + index * 23, { width: 110 });
    document.text(money(Number(value)), 450, y + index * 23, { width: 90, align: "right" });
  });
  document.roundedRect(totalsX - 8, y + 94, 223, 35, 7).fill("#f3f4f6");
  document.fillColor("#111827").font("Helvetica-Bold").fontSize(13).text("TOTAL", totalsX, y + 105);
  document.fillColor("#6b4f3a").text(money(invoice.totalAmount), 450, y + 105, { width: 90, align: "right" });
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