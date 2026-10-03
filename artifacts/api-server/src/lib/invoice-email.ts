import { ReplitConnectors } from "@replit/connectors-sdk";
import { invoiceTotalRows, businessDate, type InvoiceFacts, type InvoiceLanguage } from "@workspace/invoice-document/core";
import { createSharedInvoicePdf } from "./invoice-browser-pdf";
export type { InvoiceLanguage } from "@workspace/invoice-document/core";
export type InvoiceForEmail=InvoiceFacts;
export const invoiceItemName=(item:InvoiceFacts["items"][number],language:InvoiceLanguage)=>
  language==="en"?item.productNameEn??item.productName:item.productName;
const money=(value:number)=>value.toFixed(2);
export const invoiceMoneyLabel=(value:number,language:InvoiceLanguage)=>language==="en"?`${money(value)} SAR`:money(value);
export const invoiceBusinessIssueDate=businessDate;
export const getInvoiceTotalRows=(invoice:InvoiceFacts):Array<[string,number]>=>invoiceTotalRows(invoice).map(r=>[r.en,r.value]);
/** Same trusted HTML/CSS document used by the preview and print component. */
export const createInvoicePdf=createSharedInvoicePdf;

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