import { afterAll, describe, expect, it } from "vitest";
import { createTemplate, validateDesign, designErrors, retainRenderableDesign, sampleInvoice, renderInvoiceHtml } from "@workspace/invoice-document/core";
import { inspectInvoiceDocument, invoicePdfAssets, closeInvoiceBrowser } from "./invoice-browser-pdf";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
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
      (d:ReturnType<typeof createTemplate>)=>d.elements.splice(d.elements.findIndex(e=>e.kind==="seller"),1),
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
    expect(historic.metrics.text).toContain("ليس إصداراً ضريبياً جديداً");
    expect(historic.metrics.text).toContain("OLD-123");
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
    expect(html).toContain("ليس إصداراً ضريبياً جديداً");
    expect(renderInvoiceHtml({invoice:sampleInvoice(),assets:invoicePdfAssets()})).toContain("فاتورة ضريبية");
    const saved=createTemplate();expect(saved.elements.every(e=>e.font==="Amiri")).toBe(true);
    const out=await inspectInvoiceDocument({...sampleInvoice(true),historical:"yes"},"ar",saved);
    expect(out.metrics.errors).toEqual([]);
    expect(out.html).not.toMatch(/font-family:Amiri/);
    expect(out.html).toContain(invoicePdfAssets().mark);
    expect(out.html).toContain(".footer-mark{display:block;width:auto;height:13mm");
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
});
