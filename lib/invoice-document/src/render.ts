import { type InvoiceDesign, createTemplate, designSchema } from "./design";
import { type InvoiceFacts, type InvoiceLanguage, businessDate, invoiceTotalRows } from "./model";
import { paginateDocument } from "./paginate";
/** `amiri` is retained for API compatibility; text renders in the formal Tajawal face (the pre-editor preview font). */
export type InvoiceAssets = { logo: string; mark: string; riyal: string; amiri: string; ping: string; formal: string; formalBold: string };
/** Saved designs may say "Amiri"; it is mapped to the formal face at render time without rewriting stored designs. */
export const fontStack=(font:"Amiri"|"Ping")=>font==="Ping"?"Ping,InvoiceFormal":"InvoiceFormal";
export function browserAssets(base = "/"): InvoiceAssets {
  const p=base.replace(/\/?$/,"/")+"site-assets/";
  return {logo:p+"invoice-logo-black.png",mark:p+"musk-ellolo-footer-logo.png",riyal:p+"saudi-riyal-symbol.svg",amiri:p+"amiri-regular.ttf",ping:p+"en-US-58c84d4f8c.woff2",formal:p+"tajawal-Regular.ttf",formalBold:p+"tajawal-Bold.ttf"};
}
const escape = (s: unknown) => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const safeAsset = (s:string) => {
  if (s.startsWith("//")) throw new Error("Untrusted document resource");
  if (!/^(?:data:(?:image\/(?:png|jpeg|svg\+xml)|font\/(?:ttf|woff2));base64,[A-Za-z0-9+/=]+|\/[a-zA-Z0-9/_\-.]+|blob:[a-zA-Z0-9:/_\-.]+)$/.test(s)) throw new Error("Untrusted document resource");
  return escape(s);
};
export function renderInvoiceHtml(input:{
  invoice:InvoiceFacts; design?:InvoiceDesign; language?:InvoiceLanguage;
  assets:InvoiceAssets; qrUrl?:string|null;
}):string {
  const i=input.invoice,d=designSchema.parse(input.design??createTemplate()),lang=input.language??"ar",a=input.assets;
  const t=(ar:string,en:string)=>lang==="ar"?ar:en;
  const money=(value:number)=>`<span class="money" dir="ltr">${lang==="ar"?`<img class="money-symbol" src="${safeAsset(a.riyal)}" alt="ريال سعودي">`:`<span class="money-symbol">SAR</span>`}<span class="money-amount" dir="ltr">${new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)}</span></span>`;
  const line=(label:string,value:unknown)=>`<p><strong>${escape(label)}</strong> <bdi>${escape(value)}</bdi></p>`;
  const useContract=Boolean(i.contractId||i.uploadedContractFileId||i.contractNumber);
  const collection=i.outstandingAmount<=0?t("تم التحصيل بالكامل","Collected in full"):i.paidAmount>0?t("تحصيل جزئي","Partially collected"):t("غير محصلة","Not collected");
  const paymentTerm=i.paymentTerm==="due_on_issue"?t("نقداً / يوم الإصدار","Due on issue"):i.paymentTerm==="end_of_month"?t("نهاية الشهر الميلادي","End of month"):i.paymentDays!=null?t(`${i.paymentDays} يوم`,`${i.paymentDays} days`):"";
  const contents:Record<string,string>={
    logo:`<img class="brand-logo" src="${safeAsset(a.logo)}" alt="Musk Ellolo">`,
    // Historical records carry no heading: never "Tax Invoice", and the old record heading was removed by request; the warning block keeps the semantics.
    title:i.historical==="yes"?"":`<strong>${t("فاتورة ضريبية","Tax Invoice")}</strong>`,
    seller:`<strong>${escape(i.sellerName)}</strong>${line(t("الرقم الضريبي:","VAT Number:"),i.sellerVatNumber)}<p>${t("السعودية، الرياض، حي السليمانية","Saudi Arabia, Riyadh, Al Sulimaniyah")}</p>`,
    buyer:`<strong>${escape(i.buyerName||i.distributorName||"-")}</strong>${i.buyerPhone?line(t("الجوال:","Phone:"),i.buyerPhone):""}${i.buyerAddress?`<p class="pre">${escape(i.buyerAddress)}</p>`:""}${i.buyerTaxNumber?line(t("الرقم الضريبي:","VAT:"),i.buyerTaxNumber):""}${i.buyerCommercialRegistrationNumber?line(t("السجل التجاري:","CR:"),i.buyerCommercialRegistrationNumber):""}`,
    info:line(i.historical==="yes"?t("المرجع الداخلي:","Internal reference:"):t("رقم الفاتورة:","Invoice No.:"),i.invoiceNumber)+
      (i.historical==="yes"&&i.originalInvoiceNumber?line(t("رقم الفاتورة الأصلية:","Original invoice number:"),i.originalInvoiceNumber):"")+
      line(t("تاريخ الإصدار:","Issue Date:"),businessDate(i.issueDatetime))+line(t("تاريخ الاستحقاق:","Due Date:"),i.dueDate?.slice(0,10)||"-")+
      (i.orderNumber?line(t("رقم الطلب:","Order No.:"),i.orderNumber):"")+
      (i.exhibitionName?line(t("المعرض:","Exhibition:"),i.exhibitionName):""),
    notes:(useContract?`<div>${line(i.historical==="yes"?t("مرجع العقد (لا يثبت سريانه حينها):","Contract reference (not proof of past validity):"):t("العقد:","Contract:"),i.contractNumber||(i.uploadedContractFileId?`#${i.uploadedContractFileId}`:"-"))}${i.contractType?line(t("نوع العقد:","Contract type:"),i.contractType):""}${paymentTerm?line(t("شروط السداد:","Payment terms:"),paymentTerm):""}</div>`:"")+
      (i.discountOverrideReason?`<div class="notice"><strong>${t("استثناء خصم لهذه الفاتورة فقط؛ العقد لم يتغير.","Discount override for this invoice only; contract unchanged.")}</strong>${line(t("السبب:","Reason:"),i.discountOverrideReason)}${line(t("سُجل بواسطة المستخدم:","Recorded by user:"),i.discountOverrideByAdminId!=null?`#${i.discountOverrideByAdminId}`:"-")}${line(t("وقت التسجيل:","Recorded at:"),i.discountOverrideAt?new Date(i.discountOverrideAt).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"}):"-")}</div>`:"")+
      (i.notes?`<p class="pre">${escape(i.notes)}</p>`:""),
    totals:invoiceTotalRows(i).map(r=>`<div class="total-row"><span>${escape(lang==="ar"?r.ar:r.en)}</span>${money(r.value)}</div>`).join("")+
      `<div class="total-row grand-total"><strong>${t("الإجمالي","TOTAL")}</strong>${money(i.totalAmount)}</div>`+
      `<div class="collection"><p>${t("حالة التحصيل:","Collection status:")} ${escape(collection)}</p><div class="total-row"><span>${t("المحصل","Collected")}</span>${money(i.paidAmount)}</div><div class="total-row"><span>${t("المتبقي للتحصيل","Remaining to collect")}</span>${money(i.outstandingAmount)}</div></div>`,
    qr:i.historical!=="yes"&&!i.cancelledAt&&input.qrUrl?`<img class="qr" src="${safeAsset(input.qrUrl)}" alt="ZATCA QR">`:"",
    footer:`<img class="footer-mark" src="${safeAsset(a.mark)}" alt="Musk Ellolo"><span class="footer-site" dir="ltr">muskellolo.com</span>`,
  };
  const heading:Record<string,string>={seller:t("بيانات البائع","Seller details"),buyer:t("بيانات العميل","Bill to"),notes:t("ملاحظات","Notes")};
  // Notes are intentionally never rendered (user request); underlying data stays untouched.
  const els=d.elements.filter(e=>e.kind!=="table"&&e.kind!=="notes").map(e=>{
    const css=`left:${e.x}mm;top:${e.y}mm;width:${e.width}mm;min-height:${e.height}mm;${["logo","qr"].includes(e.kind)?`height:${e.height}mm;`:""}font-family:${fontStack(e.font)};font-size:${e.fontSize}pt;font-weight:${e.fontWeight};color:${e.color};background:${e.background};text-align:${e.align};border:${e.borderWidth}mm solid ${e.borderColor};padding:${e.padding}mm;line-height:${e.lineHeight}`;
    const content=e.kind==="text"?`<p class="pre">${escape(e.text)}</p>`:e.kind==="divider"?`<div style="border-top:.25mm solid ${e.borderColor};width:100%"></div>`:contents[e.kind];
    const title=e.heading&&lang==="ar"?e.heading:heading[e.kind];
    return `<div class="invoice-block" data-kind="${e.kind}" data-element="${e.id}" style="${css}" dir="${lang==="ar"?"rtl":"ltr"}">${title?`<div class="section-heading">${escape(title)}</div>`:""}${content??""}</div>`;
  }).join("");
  const te=d.elements.find(e=>e.kind==="table")!;
  const tableHtml=`<table style="font-family:${fontStack(te.font)};font-size:${te.fontSize}pt;font-weight:${te.fontWeight};color:${te.color};line-height:${te.lineHeight};--cell-padding:${te.padding+1}mm;--table-border:${te.borderWidth}mm solid ${te.borderColor}" dir="${lang==="ar"?"rtl":"ltr"}"><colgroup>${Object.values(d.columns).map(w=>`<col style="width:${w}%">`).join("")}</colgroup><thead style="background:${te.background}"><tr>${[t("المنتج","Product"),t("الكمية","Qty"),t("سعر الوحدة","Unit Price"),t("الإجمالي","Line Total")].map(label=>`<th>${label}</th>`).join("")}</tr></thead><tbody>${i.items.length?i.items.map((r,n)=>`<tr data-row="${n}"><td data-product>${escape(lang==="en"?r.productNameEn??r.productName:r.productName)}</td><td dir="ltr">${escape(r.quantity)}</td><td>${money(r.unitPrice)}</td><td>${money(r.totalAmount??Math.round(r.unitPrice*r.quantity*100)/100)}</td></tr>`).join(""):`<tr><td colspan="4">${t("لا توجد منتجات","No items")}</td></tr>`}</tbody></table>`;
  const warning=(i.historical==="yes"?`<p>${t("سجل داخلي لفاتورة سابقة؛ ليس إصداراً ضريبياً جديداً أو اعتماد ZATCA","Internal prior record; not a new tax issuance or ZATCA certification")}</p>`:"")+
    (i.cancelledAt?`<p><strong>${t("فاتورة ملغاة","Cancelled invoice")}</strong> · ${escape(i.cancellationReason)}</p><p>${escape(i.cancelledByName??`#${i.cancelledByAdminId}`)} · ${escape(new Date(i.cancelledAt).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"}))}</p>`:"");
  const json=JSON.stringify({elements:d.elements,language:lang}).replace(/</g,"\\u003c");
  return `<!doctype html><html lang="${lang}" dir="ltr"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'unsafe-inline'; script-src 'nonce-invoice-document-v1'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><style>
@font-face{font-family:InvoiceFormal;src:url("${safeAsset(a.formal)}") format("truetype");font-weight:100 500}
@font-face{font-family:InvoiceFormal;src:url("${safeAsset(a.formalBold)}") format("truetype");font-weight:600 900}
@font-face{font-family:Ping;src:url("${safeAsset(a.ping)}") format("woff2");font-weight:100 900;unicode-range:U+0000-024F,U+2000-206F}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#e9e9e9;font-family:InvoiceFormal;color:#292728}
#invoice-source,.invoice-measure{position:absolute;left:-5000px;width:210mm;visibility:hidden}
.invoice-page{position:relative;width:210mm;height:297mm;background:#fff;margin:0 auto 6mm;break-after:page;overflow:visible}
.invoice-page:last-child{break-after:auto}.invoice-block{position:absolute;overflow-wrap:anywhere;box-sizing:border-box}
.invoice-block p{margin:0 0 1mm;line-height:inherit}.invoice-block strong{font-weight:inherit}.pre{white-space:pre-wrap}
.section-heading{font-weight:bold;margin-bottom:1.5mm;font-size:9pt}.brand-logo{width:100%;height:100%;object-fit:contain}
[data-kind=logo]{display:flex;align-items:center;justify-content:center}.qr{width:100%;height:100%;object-fit:contain}
[data-kind=qr]{display:flex;align-items:center;justify-content:center;padding:0!important}
[data-kind=footer]{border-top:.2mm solid #ddd!important;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1mm;padding:1mm 0 0!important;color:#444!important;font-size:9pt!important;line-height:1.1!important}
.footer-mark{display:block;width:auto;height:13mm;max-width:40mm;object-fit:contain;flex:none}.footer-site{display:block}.page-number{position:absolute;bottom:2.5mm;left:0;width:210mm;text-align:center;font-size:7pt;color:#777}
table{border-collapse:collapse;table-layout:fixed;width:100%;border:var(--table-border)}
th,td{padding:var(--cell-padding);border-bottom:.15mm solid #e2e2e2;overflow-wrap:anywhere;vertical-align:top;text-align:start}
th{font-weight:bold}thead{display:table-header-group}td:not(:first-child),th:not(:first-child){text-align:center}
.money{white-space:nowrap;display:inline-flex;flex-direction:row;direction:ltr;unicode-bidi:isolate;align-items:center;gap:.7mm;font-family:Ping,InvoiceFormal;font-size:inherit}
.money img{width:2.8mm;height:2.8mm;object-fit:contain}.total-row{display:flex;align-items:start;justify-content:space-between;gap:2mm;margin:0 0 1mm}
.total-row>span:first-child{flex:1}.grand-total{border-top:.2mm solid #ccc;background:#eee;padding:2mm 1mm;font-weight:bold;margin-top:1mm}
.collection{border-top:.2mm solid #ddd;padding-top:1mm}.notice{border:.2mm solid #b68737;padding:1.5mm;margin-bottom:2mm}
[data-warning]{font-size:10pt;font-weight:bold;border:.25mm solid #ac5626;padding:2mm;line-height:1.4}
@media print{html,body{background:#fff}.invoice-page{margin:0;box-shadow:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
@page{size:A4 portrait;margin:0}
</style></head><body data-invoice-number="${escape(i.invoiceNumber)}"><main id="invoice-pages"></main><div id="invoice-source">${els}${tableHtml}${warning?`<div class="invoice-block" data-warning dir="${lang==="ar"?"rtl":"ltr"}">${warning}</div>`:""}${i.shippingDetails?`<div data-shipping style="font-family:InvoiceFormal;font-size:11pt;line-height:1.4" dir="${lang==="ar"?"rtl":"ltr"}"><h2 style="font-size:14pt">${t("بيانات الشحنة الحالية (ملحق تشغيلي)","Current shipment (operational attachment)")}</h2><p>${escape(i.invoiceNumber)}</p><p class="pre">${escape(i.shippingDetails)}</p></div>`:""}</div><script id="invoice-layout" nonce="invoice-document-v1" type="application/json">${json}</script><script nonce="invoice-document-v1">const __name=(fn)=>fn;document.fonts.ready.then(()=>{(${paginateDocument.toString()})();});</script></body></html>`;
}