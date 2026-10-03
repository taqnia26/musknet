import { useEffect, useMemo, useRef, useState } from "react";
import { InvoiceDocument, browserAssets, designSchema, type InvoiceDesign } from "@workspace/invoice-document";
import { useAdminGetPublishedInvoiceDesign, getAdminGetPublishedInvoiceDesignQueryKey, type AdminInvoice } from "@workspace/api-client-react";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
export function SharedInvoicePreview({invoice,qrUrl,onReady,documentRef}:{
  invoice:AdminInvoice;qrUrl:string|null;onReady:(ready:boolean)=>void;documentRef:React.RefObject<HTMLIFrameElement|null>;
}) {
  const {lang,t}=useLanguage();
  const active=useAdminGetPublishedInvoiceDesign({query:{queryKey:getAdminGetPublishedInvoiceDesignQueryKey(),refetchInterval:15000,staleTime:0}});
  const assets=useMemo(()=>browserAssets(import.meta.env.BASE_URL),[]);
  const [height,setHeight]=useState(1123),[errors,setErrors]=useState<string[]>([]);
  const design=useMemo(()=>active.data?designSchema.parse(active.data.design):null,[active.data]);
  const readyRef=useRef(onReady);readyRef.current=onReady;
  useEffect(()=>{
    if(!design) return;
    readyRef.current(false);
    let attempts=0;
    const timer=window.setInterval(()=>{
      const doc=documentRef.current?.contentDocument,root=doc?.getElementById("invoice-pages");
      if(root?.dataset.ready!=="true") {
        if(++attempts>100){setErrors([t("تعذر تجهيز المستند؛ أعد فتح المعاينة.","Document could not be prepared; reopen the preview.")]);clearInterval(timer);}
        return;
      }
      const problems=JSON.parse(root.dataset.errors??"[]") as string[];
      setErrors(problems);setHeight(doc?.documentElement.scrollHeight??1123);
      readyRef.current(!problems.length);
      clearInterval(timer);
    },80);
    return()=>clearInterval(timer);
  },[design,invoice,qrUrl,documentRef,lang]);
  if(active.isError) return <div role="alert">{t("تعذر تحميل التصميم المعتمد","Could not load published design")} <Button onClick={()=>void active.refetch()}>{t("إعادة المحاولة","Retry")}</Button></div>;
  if(!design) return <p role="status">{t("جارٍ تحميل المستند","Loading document")}</p>;
  return <div className="overflow-x-auto" data-testid="invoice-template">
    {errors.length>0&&<p role="alert" className="mb-3 text-destructive">{t("تحقق من تنسيق هذه الفاتورة قبل الطباعة:","Check this invoice layout before printing:")} {errors.join(" · ")}</p>}
    <InvoiceDocument ref={documentRef} invoice={invoice} design={design as InvoiceDesign} language={lang} assets={assets} qrUrl={qrUrl}
      style={{display:"block",margin:"auto",height}}/>
  </div>;
}