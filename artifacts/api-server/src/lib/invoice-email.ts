import { ReplitConnectors } from "@replit/connectors-sdk";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { saudiCalendarDate } from "./invoice-dates";

type InvoiceForEmail = {
  historical?: string;
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
  taxTreatment?: string | null;
  vatRate?: number | null;
  contractDiscountPercent?: number | null;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  qrCodeData: string;
  items: Array<{ productName: string; productNameEn?: string | null; quantity: number; unitPrice: number; totalAmount: number }>;
};

export type InvoiceLanguage = "ar" | "en";
export const invoiceItemName = (item: InvoiceForEmail["items"][number], language: InvoiceLanguage) =>
  language === "en" ? item.productNameEn ?? item.productName : item.productName;

const money = (value: number) => value.toFixed(2);
export const invoiceMoneyLabel = (value: number, language: InvoiceLanguage) =>
  language === "en" ? `${money(value)} SAR` : money(value);
export const invoiceBusinessIssueDate = (issueDatetime: Date) => saudiCalendarDate(issueDatetime);
const invoiceLogo = [
  resolve(dirname(fileURLToPath(import.meta.url)), "../../musk-ellolo/public/site-assets/invoice-logo-black.png"),
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../musk-ellolo/public/site-assets/invoice-logo-black.png"),
].find(existsSync);
const invoiceFooter = [
  resolve(dirname(fileURLToPath(import.meta.url)), "../../musk-ellolo/public/site-assets/invoice-footer.jpg"),
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../musk-ellolo/public/site-assets/invoice-footer.jpg"),
].find(existsSync);
const riyalSymbolSvg = [
  resolve(dirname(fileURLToPath(import.meta.url)), "../../musk-ellolo/public/site-assets/saudi-riyal-symbol.svg"),
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../musk-ellolo/public/site-assets/saudi-riyal-symbol.svg"),
].find(existsSync);
const riyalSymbolPaths = riyalSymbolSvg
  ? [...readFileSync(riyalSymbolSvg, "utf8").matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((match) => match[1])
  : [];

function drawRiyalSymbol(document: PDFKit.PDFDocument, x: number, y: number, size: number) {
  if (!riyalSymbolPaths.length) throw new Error("Saudi Riyal symbol is missing from the application assets");
  // PDFKit does not consume SVG files directly. Its path renderer supports the
  // SVG path grammar used by the official artwork, so retain the artwork as a
  // vector in the PDF rather than substituting a text glyph.
  const drawing = document.save().translate(x, y).scale(size / 1124.14, size / 1124.14);
  for (const path of riyalSymbolPaths) drawing.path(path).fill("#231f20");
  drawing.restore();
}

function drawInvoiceMoney(
  document: PDFKit.PDFDocument,
  value: number,
  language: InvoiceLanguage,
  x: number,
  y: number,
  width: number,
  fontSize: number,
) {
  if (language === "ar") {
    const amount = money(value);
    const amountWidth = document.widthOfString(amount);
    const amountX = x + width - amountWidth;
    drawRiyalSymbol(document, amountX - fontSize - 3, y, fontSize);
    document.text(amount, amountX, y, { width: amountWidth + 1, lineBreak: false });
    return;
  }
  document.text(invoiceMoneyLabel(value, language), x, y, { width, align: "right" });
}

export function getInvoiceTotalRows(invoice: InvoiceForEmail): Array<[string, number]> {
  const vatRate = invoice.vatRate ?? (invoice.taxTreatment === "international" ? 0 : 15);
  const vatLabel = invoice.vatAmount > 0
    ? vatRate > 0 ? `VAT (${vatRate}%)` : "VAT (historical amount)"
    : vatRate === 0 ? "VAT (0%)" : `VAT (${vatRate}%)`;
  const companyContractInvoice = !invoice.orderNumber &&
    invoice.contractDiscountPercent !== null && invoice.contractDiscountPercent !== undefined;
  const inclusiveOrderSnapshot = Boolean(invoice.orderNumber) &&
    Math.round(invoice.subtotal * 100) + Math.round(invoice.vatAmount * 100) === Math.round(invoice.totalAmount * 100);
  const totalRows: Array<[string, number]> = [];
  if (invoice.historical === "yes") {
    totalRows.push(["Original net (after discount)", invoice.subtotal],
      ["Original discount (already included)", invoice.discountAmount ?? 0],
      ["Original VAT", invoice.vatAmount]);
  } else if (companyContractInvoice) {
    const grossBeforeDiscount = invoice.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    totalRows.push(
      ["Gross before discount (VAT included)", grossBeforeDiscount],
      [`Contract discount (${invoice.contractDiscountPercent}%)`, -(invoice.discountAmount ?? 0)],
      ["Net subtotal after discount", invoice.subtotal],
      [vatLabel, invoice.vatAmount],
    );
  } else {
    totalRows.push(["Subtotal", invoice.subtotal], [vatLabel, invoice.vatAmount]);
  }
  if ((invoice.shippingAmount ?? 0) > 0 && !inclusiveOrderSnapshot) totalRows.push(["Shipping", invoice.shippingAmount!]);
  if (invoice.historical !== "yes" && !inclusiveOrderSnapshot && !companyContractInvoice) {
    totalRows.push(["Discount", -(invoice.discountAmount ?? 0)]);
  }
  if (invoice.paidAmount > 0 && invoice.paidAmount < invoice.totalAmount) {
    totalRows.push(["Amount Paid", invoice.paidAmount]);
    if (invoice.outstandingAmount > 0 && invoice.outstandingAmount < invoice.totalAmount) {
      totalRows.push(["Amount Due", invoice.outstandingAmount]);
    }
  }
  return totalRows;
}

export async function createInvoicePdf(invoice: InvoiceForEmail, language: InvoiceLanguage = "ar") {
  if (!invoiceLogo) throw new Error("Invoice brand logo is missing from the application assets");
  if (!invoiceFooter) throw new Error("Invoice footer is missing from the application assets");
  const qr = invoice.historical === "yes" ? null : await QRCode.toBuffer(invoice.qrCodeData, { type: "png", errorCorrectionLevel: "M", margin: 2 });
  const document = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: invoice.invoiceNumber } });
  const chunks: Buffer[] = [];
  document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  const right = 553;
  document.image(invoiceLogo, 185, 28, { fit: [225, 58], align: "center", valign: "center" });
  document.fillColor("#292728").font("Helvetica-Bold").fontSize(17).text(invoice.historical === "yes" ? "PRIOR INVOICE COPY" : "TAX INVOICE", 160, 99, { width: 275, align: "center" });
  if (invoice.historical === "yes") document.fontSize(8).text("External original - not newly issued or ZATCA certified", 130, 126, { width: 335, align: "center" });
  document.fillColor("#57534e").fontSize(9).text("FROM", 42, 152);
  document.fillColor("#292728").fontSize(12).text(invoice.sellerName, 42, 173, { width: 244, height: 35 });
  document.fillColor("#78716c").font("Helvetica").fontSize(9).text(`VAT Number: ${invoice.sellerVatNumber}`, 42, 213, { width: 244 });

  document.roundedRect(42, 239, 244, 100, 5).fill("#f5f5f4");
  document.fillColor("#57534e").font("Helvetica-Bold").fontSize(9);
  document.text("Invoice No.", 56, 251);
  document.text("Issue Date", 56, 278);
  document.text("Due Date", 56, 305);
  document.fillColor("#292728").text(invoice.invoiceNumber, 152, 251, { width: 120, align: "right" });
  const issueDate = invoiceBusinessIssueDate(invoice.issueDatetime);
  document.text(issueDate, 152, 278, { width: 120, align: "right" });
  document.text(invoice.dueDate || "-", 152, 305, { width: 120, align: "right" });

  document.fillColor("#57534e").font("Helvetica-Bold").fontSize(9).text("BILL TO", 310, 152);
  document.fillColor("#292728").fontSize(14).text(invoice.buyerName || "-", 310, 173, { width: 243, height: 36 });
  document.fillColor("#57534e").font("Helvetica").fontSize(8);
  if (invoice.buyerAddress) document.text(invoice.buyerAddress, 310, 216, { width: 243, height: 35 });
  const buyerMeta = [invoice.buyerTaxNumber && `VAT: ${invoice.buyerTaxNumber}`, invoice.buyerCommercialRegistrationNumber && `CR: ${invoice.buyerCommercialRegistrationNumber}`].filter(Boolean).join("  |  ");
  if (buyerMeta) document.text(buyerMeta, 310, 265, { width: 243, height: 30 });
  if (invoice.orderNumber) document.text(`Order No.: ${invoice.orderNumber}`, 310, 310, { width: 243 });
  document.moveTo(42, 353).lineTo(right, 353).strokeColor("#e7e5e4").stroke();

  let y = 365;
  document.roundedRect(42, y, 511, 26, 4).fill("#f5f5f4");
  document.fillColor("#111827").font("Helvetica-Bold").fontSize(9);
  document.text("Product", 54, y + 9, { width: 230 });
  document.text("Qty", 300, y + 9, { width: 45, align: "center" });
  document.text("Unit Price", 450, y + 9, { width: 90, align: "right" });
  y += 31;
  for (const item of invoice.items) {
    if (y > 665) { document.addPage(); y = 50; }
    document.fillColor("#111827").font("Helvetica").fontSize(9).text(invoiceItemName(item, language), 54, y + 7, { width: 230 });
    document.fillColor("#4b5563").text(String(item.quantity), 300, y + 7, { width: 45, align: "center" });
    drawInvoiceMoney(document, item.unitPrice, language, 347, y + 7, 193, 10);
    document.moveTo(42, y + 25).lineTo(right, y + 25).strokeColor("#e5e7eb").stroke();
    y += 29;
  }

  y += 18;
  const totalRows = getInvoiceTotalRows(invoice);
  if (Math.max(y, 535) + totalRows.length * 23 + 42 > 738) {
    document.addPage();
    y = 52;
  } else {
    y = Math.max(y, 535);
  }
  if (qr) document.image(qr, 48, y, { width: 105, height: 105 });
  const totalsX = 325;
  totalRows.forEach(([label, value], index) => {
    document.fillColor("#4b5563").font("Helvetica").fontSize(9).text(String(label), totalsX, y + index * 23, { width: 110 });
    drawInvoiceMoney(document, Number(value), language, 437, y + index * 23, 103, 10);
  });
  const totalY = y + totalRows.length * 23 + 2;
  document.roundedRect(totalsX - 8, totalY, 223, 35, 4).fill("#f5f5f4");
  document.fillColor("#111827").font("Helvetica-Bold").fontSize(13).text("TOTAL", totalsX, totalY + 11);
  document.fillColor("#292728");
  drawInvoiceMoney(document, invoice.totalAmount, language, 432, totalY + 11, 108, 13);
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
  const emailVatRate = input.invoice.vatRate ?? (input.invoice.taxTreatment === "international" ? 0 : 15);
  const hasHistoricalVatAmount = input.invoice.vatAmount > 0;
  const vatDescription = hasHistoricalVatAmount
    ? emailVatRate > 0
      ? `ضريبة القيمة المضافة (${emailVatRate}%${input.invoice.taxTreatment === "international" ? " - وفق الحساب التاريخي" : ""})`
      : "ضريبة القيمة المضافة (مبلغ تاريخي)"
    : input.invoice.taxTreatment === "international" && emailVatRate === 0
      ? "ضريبة القيمة المضافة (0% - معاملة دولية)"
      : `ضريبة القيمة المضافة (${emailVatRate}%${input.invoice.taxTreatment === "international" ? " - وفق الحساب التاريخي" : ""})`;
  const body = {
      from,
      to: [input.recipient],
      subject: `${input.invoice.historical === "yes" ? "Prior invoice copy" : "Tax Invoice"} ${input.invoice.invoiceNumber} - Musk Ellolo`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif"><h2>${input.invoice.historical === "yes" ? "نسخة فاتورة سابقة (ليست إصداراً ضريبياً جديداً)" : "فاتورة ضريبية"} ${input.invoice.invoiceNumber}</h2><p>مرحباً، تجدون نسخة الفاتورة مرفقة بصيغة PDF.</p><p>${vatDescription}: <strong>${money(input.invoice.vatAmount)} ريال سعودي</strong></p><p>الإجمالي: <strong>${money(input.invoice.totalAmount)} ريال سعودي</strong></p><p>الرصيد المستحق: <strong>${money(input.invoice.outstandingAmount)} ريال سعودي</strong></p><p>مع التحية،<br>Musk Ellolo</p></div>`,
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
