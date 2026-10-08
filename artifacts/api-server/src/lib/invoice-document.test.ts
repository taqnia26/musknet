import { afterAll, describe, expect, it } from "vitest";
import { createTemplate, validateDesign, designErrors, retainRenderableDesign, restoreElement, sampleInvoice, renderInvoiceHtml } from "@workspace/invoice-document/core";
import { inspectInvoiceDocument, invoicePdfAssets, closeInvoiceBrowser } from "./invoice-browser-pdf";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import QRCode from "qrcode";

afterAll(closeInvoiceBrowser);
describe("protected shared invoice document",()=>{
  it("retains the last preview without discarding invalid editable state and resumes after correction",()=>{
    const previous=createTemplate(),working=structuredClone(previous);
    working.elements.find(e=>e.kind==="notes")!.heading="تعديلات مسودة لم تحفظ";
    working.elements.find(e=>e.kind==="logo")!.x=1;
    expect(retainRenderableDesign(working,previous)).toBe(previous);
    expect(designErrors(working).length).toBeGreaterThan(0);
    expect(working.elements.find(e=>e.kind==="logo")!.x).toBe(1);
    expect(working.elements.find(e=>e.kind==="notes")!.heading).toBe("تعديلات مسودة لم تحفظ");
    expect(()=>renderInvoiceHtml({invoice:sampleInvoice(),assets:invoicePdfAssets(),design:retainRenderableDesign(working,previous)!})).not.toThrow();
    working.elements.find(e=>e.kind==="logo")!.x=132;
    working.columns.product=30;
    expect(retainRenderableDesign(working,previous)).toBe(previous);
    working.columns.product=48;
    expect(retainRenderableDesign(working,previous)).toBe(working);
    expect(designErrors(working)).toEqual([]);
    expect(renderInvoiceHtml({invoice:sampleInvoice(),assets:invoicePdfAssets(),design:working})).toContain("تعديلات مسودة لم تحفظ");
    // React does not reload srcDoc for a different state object producing identical HTML.
    // A retained measurement is current by configuration value after correction/undo.
    const measured=structuredClone(working),corrected=structuredClone(measured);
    corrected.columns.product=30;
    expect(retainRenderableDesign(corrected,measured)).toBe(measured);
    corrected.columns.product=48;
    expect(corrected).not.toBe(measured);
    expect(JSON.stringify(corrected)).toBe(JSON.stringify(measured));
    expect(renderInvoiceHtml({invoice:sampleInvoice(),assets:invoicePdfAssets(),design:corrected}))
      .toBe(renderInvoiceHtml({invoice:sampleInvoice(),assets:invoicePdfAssets(),design:measured}));
  });
  it("rejects hidden/missing facts, geometry overlap, injection and invalid columns",()=>{
    for(const mutate of [
      (d:ReturnType<typeof createTemplate>)=>d.elements.splice(d.elements.findIndex(e=>e.kind==="table"),1),
      (d:ReturnType<typeof createTemplate>)=>{d.elements[0].color="#ffffff";},
      (d:ReturnType<typeof createTemplate>)=>{d.elements[0].x=200;},
      (d:ReturnType<typeof createTemplate>)=>{d.elements[1].x=14;},
      (d:ReturnType<typeof createTemplate>)=>{d.elements[0].text="Changed seller";},
      (d:ReturnType<typeof createTemplate>)=>{d.columns.product=60;},
    ]) {const d=createTemplate();mutate(d);expect(()=>validateDesign(d)).toThrow();}
    expect(()=>validateDesign({...createTemplate(),html:"<script>"})).toThrow();
    const html=renderInvoiceHtml({invoice:{...sampleInvoice(),buyerName:'</script><img src="https://evil.test" onerror="alert(1)">'},
      assets:invoicePdfAssets(),design:createTemplate()});
    expect(html).toContain("&lt;/script&gt;");
    expect(html).not.toContain('<img src="https://evil.test"');
    expect(()=>renderInvoiceHtml({invoice:sampleInvoice(),assets:{...invoicePdfAssets(),logo:"https://evil.test/logo"}})).toThrow();
  });
  it("keeps reference groups in their physical positions without an RTL mirror",()=>{
    const d=createTemplate(),get=(kind:string)=>d.elements.find(e=>e.kind===kind)!;
    expect(get("seller").x).toBeLessThan(get("logo").x);
    expect(get("buyer").x).toBeLessThan(get("info").x);
    expect(get("notes").x).toBeLessThan(get("totals").x);
    for(const t of ["reference","formal","modern"] as const) expect(designErrors(createTemplate(t))).toEqual([]);
  });
  it("uses the same A4 document for all templates, both languages and long invoices",async()=>{
    for(const t of ["reference","formal","modern"] as const) for(const long of [false,true]) for(const lang of ["ar","en"] as const) {
      const invoice=sampleInvoice(long),out=await inspectInvoiceDocument(invoice,lang,createTemplate(t),false);
      expect(out.metrics.rows).toBe(invoice.items.length);
      expect(out.metrics.errors).toEqual([]);
      expect(out.metrics.fontStatus).toBe("loaded");
      if(long) expect(out.metrics.pages).toBeGreaterThan(2); else expect(out.metrics.pages).toBe(1);
      expect(out.metrics.text).toContain("300000000000003");
      expect(out.metrics.text).toContain("230.00");
    }
  },30_000);
  it("protects historical/cancellation warnings and splits oversized descriptions/notes without loss",async()=>{
    const base=sampleInvoice(),name="وصف طويل ".repeat(800);
    const historic=await inspectInvoiceDocument({...base,historical:"yes",originalInvoiceNumber:"OLD-123",cancelledAt:new Date(),
      cancellationReason:"سبب الإلغاء",cancelledByName:"مستخدم الاختبار"},"ar",createTemplate(),false);
    expect(historic.metrics.text).toContain("فاتورة ملغاة");
    expect(historic.metrics.text).not.toContain("سجل داخلي لفاتورة سابقة");
    expect(historic.metrics.text).not.toContain("OLD-123");
    expect(historic.metrics.text).not.toContain("المرجع الداخلي");
    expect(historic.metrics.text).toContain("رقم الفاتورة");
    expect(historic.html).not.toContain('alt="ZATCA QR"');
    const huge=await inspectInvoiceDocument({...base,notes:"ملاحظة طويلة ".repeat(500),
      items:[{productName:name,quantity:1,unitPrice:230,totalAmount:230}]},"ar",createTemplate(),false);
    expect(huge.metrics.pages).toBeGreaterThan(2);
    expect(huge.metrics.text.match(/وصف طويل/g)?.length).toBe(800);
    expect(huge.metrics.text).not.toContain("ملاحظة طويلة");
    expect(huge.html).not.toContain('data-kind="notes"');
    const qr=await QRCode.toDataURL("real immutable payload");
    const html=renderInvoiceHtml({invoice:base,assets:invoicePdfAssets(),qrUrl:qr});
    expect(html).toContain(qr);
  },30_000);
  it("creates a real PDF with embedded Arabic font, branded logo, QR and searchable Arabic",async()=>{
    const invoice={...sampleInvoice(),qrCodeData:"TEST-TLV-CONTENT"};
    const out=await inspectInvoiceDocument(invoice,"ar",createTemplate());
    const dir=mkdtempSync(`${tmpdir()}/shared-invoice-`);
    try {
      const file=`${dir}/invoice.pdf`;writeFileSync(file,out.buffer);
      const fonts=execFileSync("pdffonts",[file]).toString();
      expect(fonts).toContain("Tajawal");
      expect(fonts).not.toContain("Amiri");
      expect(fonts).toMatch(/yes\s+yes\s+yes/);
      const text=execFileSync("pdftotext",["-layout",file,"-"]).toString();
      expect(text).toContain("مسك");
      expect(text).toContain("300000000000003");
      expect(text).toContain("muskellolo.com");
      const images=execFileSync("pdfimages",["-list",file]).toString();
      expect(images.split("\n").length).toBeGreaterThan(5);
      const media=out.buffer.toString("latin1").match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)!;
      expect(Math.abs(Number(media[1])-595.28)).toBeLessThan(1);
      expect(Math.abs(Number(media[2])-841.89)).toBeLessThan(1);
    } finally {rmSync(dir,{recursive:true,force:true});}
  });
  it("historical records drop the heading, saved Amiri designs render formal Tajawal, footer logo sits above the site",async()=>{
    const html=renderInvoiceHtml({invoice:{...sampleInvoice(),historical:"yes"},assets:invoicePdfAssets()});
    expect(html).not.toContain("تسجيل فاتورة سابقة");
    expect(html).not.toContain("فاتورة ضريبية");
    expect(html).not.toContain("سجل داخلي لفاتورة سابقة");
    expect(renderInvoiceHtml({invoice:sampleInvoice(),assets:invoicePdfAssets()})).toContain("فاتورة ضريبية");
    const saved=createTemplate();expect(saved.elements.every(e=>e.font==="Amiri")).toBe(true);
    const out=await inspectInvoiceDocument({...sampleInvoice(true),historical:"yes"},"ar",saved);
    expect(out.metrics.errors).toEqual([]);
    expect(out.html).not.toMatch(/font-family:Amiri/);
    expect(out.html).toContain(invoicePdfAssets().mark);
    expect(out.html).toContain(".footer-mark{display:block;width:auto;height:18.2mm");
    expect(out.html).toContain(".footer-site{display:block;font-size:10pt}");
    // Short invoice with saved 8mm footer: 22mm band lifted, summary still fits on page 1 without overlap.
    const short=await inspectInvoiceDocument({...sampleInvoice(),notes:"NOTE-LEAK"},"ar",saved,false);
    expect(short.metrics.text).not.toContain("NOTE-LEAK");expect(short.html).not.toContain('data-kind="notes"');
    expect(short.metrics.errors).toEqual([]);expect(short.metrics.pages).toBe(1);
    const dir=mkdtempSync(`${tmpdir()}/shared-invoice-`);
    try {
      const file=`${dir}/i.pdf`;writeFileSync(file,out.buffer);
      expect(execFileSync("pdffonts",[file]).toString()).toContain("Tajawal");
      const text=execFileSync("pdftotext",["-layout",file,"-"]).toString();
      expect(text.match(/muskellolo\.com/g)?.length).toBe(out.metrics.pages);
      if(process.env.INVOICE_RENDER_OUT) writeFileSync(`${process.env.INVOICE_RENDER_OUT}/invoice.pdf`,out.buffer);
    } finally {rmSync(dir,{recursive:true,force:true});}
  },30_000);
  it("short historical invoice fits one page; long ones paginate; doubled footer logo measured",async()=>{
    const hist={...sampleInvoice(),historical:"yes" as const,originalInvoiceNumber:"OLD-9"};
    hist.items=Array.from({length:4},(_,index)=>({...hist.items[0],productName:`عطر تجريبي ${index+1}`,unitPrice:40,totalAmount:40}));
    hist.subtotal=139.13;hist.vatAmount=20.87;hist.totalAmount=160;hist.outstandingAmount=160;
    expect(hist.items).toHaveLength(4);
    hist.invoiceNumber="LC-000005";
    const short=await inspectInvoiceDocument(hist,"ar",createTemplate(),true);
    expect(short.metrics.errors).toEqual([]);expect(short.metrics.pages).toBe(1);
    expect(short.metrics.text).toContain("LC-0005");expect(short.metrics.text).not.toContain("OLD-9");
    const dir=mkdtempSync(`${tmpdir()}/hist-`);
    try{const f=`${dir}/h.pdf`;writeFileSync(f,short.buffer);
      expect(execFileSync("pdfinfo",[f]).toString()).toMatch(/Pages:\s+1\n/);
      const txt=execFileSync("pdftotext",["-layout",f,"-"]).toString();
      expect(txt).toContain("muskellolo.com");expect(txt).toContain("LC-0005");
      if(process.env.INVOICE_RENDER_OUT){writeFileSync(`${process.env.INVOICE_RENDER_OUT}/historical-short.pdf`,short.buffer);}
    }finally{rmSync(dir,{recursive:true,force:true});}
    expect(short.metrics.text).toContain("160.00");
    const long=await inspectInvoiceDocument({...sampleInvoice(true),historical:"yes"},"ar",createTemplate(),false);
    expect(long.metrics.errors).toEqual([]);expect(long.metrics.pages).toBeGreaterThan(1);
  },30_000);
  it("deleted optional elements validate, render and paginate; table/totals stay mandatory",async()=>{
    const d=createTemplate();d.elements=d.elements.filter(e=>["table","totals","divider"].includes(e.kind));
    expect(designErrors(d)).toEqual([]);
    const out=await inspectInvoiceDocument(sampleInvoice(),"ar",d,false);
    expect(out.metrics.errors).toEqual([]);expect(out.metrics.pages).toBe(1);
    expect(out.html).not.toContain('class="footer-mark"');
    expect(designErrors(restoreElement(d,"footer"))).toEqual([]);
    const noTotals=createTemplate();noTotals.elements=noTotals.elements.filter(e=>e.kind!=="totals");
    expect(()=>validateDesign(noTotals)).toThrow();
  },30_000);
  it("places the currency symbol physically left of every amount in Arabic and English, including zero and negative",async()=>{
    const base=sampleInvoice();
    const invoice={...base,paidAmount:0,outstandingAmount:-12.5,items:[...base.items,{productName:"خصم",productNameEn:"Discount",quantity:1,unitPrice:-40,totalAmount:-40}]};
    for(const lang of ["ar","en"] as const){
      const out=await inspectInvoiceDocument(invoice,lang,createTemplate(),false);
      expect(out.metrics.money.length).toBeGreaterThan(6);
      for(const m of out.metrics.money) expect(m.symbolRight).toBeLessThanOrEqual(m.amountLeft+0.5);
      const amounts=out.metrics.money.map(m=>m.amount);
      expect(amounts).toContain("0.00");expect(amounts).toContain("-12.50");expect(amounts).toContain("-40.00");
      expect(out.html).toMatch(lang==="ar"?/<img class="money-symbol"[^>]*><span class="money-amount" dir="ltr">/:/<span class="money-symbol">SAR<\/span><span class="money-amount" dir="ltr">/);
    }
  },30_000);
  it("five-row taxed company invoice with 50% discount, QR and shipping fits one page (ar/en)",async()=>{
    const base=sampleInvoice();
    const rows=[[6,389],[12,389],[12,399],[6,369],[6,339]] as const;
    const names=["عطر تجريبي ألف 50 مل","عطر تجريبي باء 50 مل","عطر تجريبي جيم 50 مل","عطر تجريبي دال 50 مل","عطر تجريبي هاء 50 مل"];
    const invoice={...base,invoiceNumber:"TS-000099",sellerName:"مؤسسة تجريبية للعطور",sellerVatNumber:"300000000000003",
      buyerName:"شركة اختبار وهمية للتجارة",buyerPhone:"0500000000",buyerAddress:"الرياض، حي تجريبي، شارع وهمي 12",
      buyerTaxNumber:"311111111100003",buyerCommercialRegistrationNumber:"1010000000",
      contractNumber:"CT-TEST-1",contractDiscountPercent:50,orderNumber:null,
      items:rows.map(([q,p],n)=>({productName:names[n],productNameEn:`Test perfume ${n+1} 50ml`,quantity:q,unitPrice:p,totalAmount:Math.round(q*p*50)/100})),
      discountAmount:8019,subtotal:6973.05,vatAmount:1045.95,vatRate:15,totalAmount:8019,paidAmount:0,outstandingAmount:8019,
      qrCodeData:"synthetic tlv payload",shippingDetails:"شركة الشحن: ناقل تجريبي\nرقم التتبع: TRK-0000-1234\nالعنوان: الرياض، حي تجريبي"};
    expect(invoice.items.map(r=>r.totalAmount)).toEqual([1167,2334,2394,1107,1017]);
    const qr=await QRCode.toDataURL("synthetic tlv payload");
    for(const lang of ["ar","en"] as const){
      const html=renderInvoiceHtml({invoice,assets:invoicePdfAssets(),language:lang,qrUrl:qr});
      expect(html).toContain("height:18.2mm");expect(html).toContain("font-size:10pt}");
      const out=await inspectInvoiceDocument(invoice,lang,createTemplate(),true);
      expect(out.metrics.errors).toEqual([]);
      if(lang==="ar"&&process.env.INVOICE_RENDER_OUT){
        mkdirSync(process.env.INVOICE_RENDER_OUT,{recursive:true});
        writeFileSync(resolve(process.env.INVOICE_RENDER_OUT,"invoice-compact-layout-preview.pdf"),out.buffer);
      }
      expect(out.metrics.pages).toBe(1);
      for(const v of ["16,038.00","8,019.00","6,973.05","1,045.95","TRK-0000-1234","2,394.00"]) expect(out.metrics.text).toContain(v);
      expect(out.html).toContain('alt="ZATCA QR"');
    }
  },60_000);
});
