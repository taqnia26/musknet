import { chromium, type Browser } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { renderInvoiceHtml, type InvoiceFacts, type InvoiceDesign, type InvoiceLanguage, type InvoiceAssets } from "@workspace/invoice-document/core";
import { publishedInvoiceDesign } from "./invoice-design";

const directory=dirname(fileURLToPath(import.meta.url));
const assetDir=[
  resolve(directory,"invoice-assets"),
  resolve(directory,"../../../musk-ellolo/public/site-assets"),
].find(p=>existsSync(resolve(p,"amiri-regular.ttf")));
const data=(file:string,mime:string)=>{
  if(!assetDir) throw new Error("Local invoice assets are missing; rebuild the API server");
  return `data:${mime};base64,${readFileSync(resolve(assetDir,file)).toString("base64")}`;
};
let assetCache:InvoiceAssets|undefined;
export function invoicePdfAssets():InvoiceAssets {
  return assetCache??= {
    logo:data("invoice-logo-black.png","image/png"),mark:data("musk-ellolo-footer-logo.png","image/png"),
    riyal:data("saudi-riyal-symbol.svg","image/svg+xml"),amiri:data("amiri-regular.ttf","font/ttf"),
    ping:data("en-US-58c84d4f8c.woff2","font/woff2"),
    formal:data("tajawal-Regular.ttf","font/ttf"),formalBold:data("tajawal-Bold.ttf","font/ttf"),
  };
}
let launching:Promise<Browser>|undefined;
const browserPath=[
  resolve(directory,"invoice-browser"),
  resolve(directory,"../../.cache/invoice-browser"),
].find(existsSync);
async function browser() {
  if(!launching) {
    launching=(async()=>{
      if(!browserPath) throw new Error("Invoice Chromium runtime is missing; rebuild the API server");
      const {readdirSync}=await import("node:fs");
      const folder=readdirSync(browserPath).find(n=>n.startsWith("chromium_headless_shell-"));
      if(!folder) throw new Error("Invoice Chromium headless shell is unavailable");
      const executablePath=resolve(browserPath,folder,"chrome-linux","headless_shell");
      const fallback=resolve(browserPath,folder,"chrome-headless-shell-linux64","chrome-headless-shell");
      const instance=await chromium.launch({headless:true,executablePath:existsSync(executablePath)?executablePath:fallback,timeout:20_000});
      instance.on("disconnected",()=>{launching=undefined;});
      return instance;
    })().catch(error=>{launching=undefined;throw error;});
  }
  return launching;
}
// Bounded worker admission: reject overload instead of unbounded browser memory.
let active=0;
const waiters:Array<{resolve:()=>void;reject:(err:Error)=>void;timer:ReturnType<typeof setTimeout>}>= [];
async function acquire() {
  if(active<2) {active++;return;}
  if(waiters.length>=6) throw new Error("PDF service is busy; retry shortly");
  await new Promise<void>((resolve,reject)=>{
    const entry={resolve,reject,timer:setTimeout(()=>{const at=waiters.indexOf(entry);if(at>=0)waiters.splice(at,1);reject(new Error("PDF queue timed out"));},20_000)};
    waiters.push(entry);
  });
}
function release() {
  const next=waiters.shift();
  if(next) {clearTimeout(next.timer);next.resolve();} else active--;
}
export async function inspectInvoiceDocument(invoice:InvoiceFacts,language:InvoiceLanguage,design:InvoiceDesign,pdf=true) {
  if(invoice.items.length>2000) throw new Error("Invoice exceeds the safe PDF item limit");
  const qrUrl=invoice.historical==="yes"||invoice.cancelledAt?null:invoice.qrCodeData
    ?await QRCode.toDataURL(invoice.qrCodeData,{margin:2,errorCorrectionLevel:"M"}):null;
  const html=renderInvoiceHtml({invoice,design,language,assets:invoicePdfAssets(),qrUrl});
  if(html.length>12_000_000) throw new Error("Invoice exceeds the safe PDF document limit");
  await acquire();
  let context: Awaited<ReturnType<Browser["newContext"]>>|undefined;
  let deadline:ReturnType<typeof setTimeout>|undefined;
  try {
    context=await (await browser()).newContext({javaScriptEnabled:true,serviceWorkers:"block",locale:language==="ar"?"ar-SA":"en-GB"});
    // All resources are local embedded bytes; no HTTP/file requests are permitted.
    await context.route("**/*",route=>route.abort("blockedbyclient"));
    deadline=setTimeout(()=>{void context?.close();},30_000);
    const page=await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.emulateMedia({media:"print"});
    await page.setContent(html,{waitUntil:"load",timeout:20_000});
    await page.waitForSelector('#invoice-pages[data-ready="true"]');
    const metrics=await page.evaluate(()=>{
      const root=document.getElementById("invoice-pages")!;
      return {pages:root.children.length,errors:JSON.parse(root.dataset.errors??"[]") as string[],
        text:root.textContent??"",rows:root.querySelectorAll("[data-row]").length,
        fontStatus:document.fonts.status};
    });
    if(metrics.errors.length) throw new Error(`Invoice content cannot fit safely: ${metrics.errors.join("; ")}`);
    const buffer=pdf?await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true}):Buffer.alloc(0);
    return {buffer,metrics,html};
  } finally {
    if(deadline) clearTimeout(deadline);
    await context?.close();
    release();
  }
}
export async function createSharedInvoicePdf(invoice:InvoiceFacts,language:InvoiceLanguage="ar",design?:InvoiceDesign) {
  // A single publication snapshot is captured for the entire operation.
  const snapshot=design??(await publishedInvoiceDesign()).design;
  return (await inspectInvoiceDocument(invoice,language,snapshot)).buffer;
}
export async function closeInvoiceBrowser() {
  const running=launching; launching=undefined;
  if(running) await (await running).close();
}