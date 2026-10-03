import { forwardRef, useMemo } from "react";
import { renderInvoiceHtml, type InvoiceAssets } from "./render";
import type { InvoiceFacts, InvoiceLanguage } from "./model";
import type { InvoiceDesign } from "./design";
/** Isolated from admin dark mode, numeric masking, table and heading overrides. */
export const InvoiceDocument = forwardRef<HTMLIFrameElement, {
  invoice:InvoiceFacts;design?:InvoiceDesign;language?:InvoiceLanguage;assets:InvoiceAssets;
  qrUrl?:string|null;className?:string;style?:React.CSSProperties;onLoad?:()=>void;
}>(function InvoiceDocument({className,style,onLoad,...input},ref) {
  const html=useMemo(()=>renderInvoiceHtml(input),[input.invoice,input.design,input.language,input.assets,input.qrUrl]);
  return <iframe ref={ref} title="مستند الفاتورة" className={className}
    style={{width:"210mm",height:"297mm",border:0,background:"white",...style}}
    sandbox="allow-scripts allow-same-origin allow-modals" srcDoc={html} onLoad={onLoad}/>;
});