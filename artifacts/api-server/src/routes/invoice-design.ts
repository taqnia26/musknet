import { Router, type RequestHandler } from "express";
import { z } from "zod";
import * as Api from "@workspace/api-zod";
import QRCode from "qrcode";
import { createTemplate, designSchema, validateDesign, sampleInvoice } from "@workspace/invoice-document/core";
import { invoiceDesignState, writeInvoiceDesign, publishedInvoiceDesign, InvoiceDesignConflict } from "../lib/invoice-design";
import { inspectInvoiceDocument } from "../lib/invoice-browser-pdf";

type Permit=(module:string,action:"view"|"edit"|"delete")=>RequestHandler;
const update=z.object({revision:z.number().int().nonnegative(),design:designSchema}).strict();
const reset=z.object({revision:z.number().int().nonnegative()}).strict();
const sampleQr=QRCode.toDataURL("Musk Ellolo — preview only, not an issued invoice",{margin:2});
export function createInvoiceDesignRouter(permit:Permit) {
  const router=Router();
  const work=(handler:RequestHandler):RequestHandler=>(req,res,next)=>{Promise.resolve(handler(req,res,next)).catch(next);};
  router.get("/admin/finance/invoice-design",permit("finance","view"),work(async(_req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    res.json(Api.AdminGetInvoiceDesignResponse.parse({...await invoiceDesignState(),sampleQr:await sampleQr}));
  }));
  router.get("/admin/invoices/design",permit("invoices","view"),work(async(_req,res)=>{
    res.setHeader("Cache-Control","private, no-store");
    res.json(Api.AdminGetPublishedInvoiceDesignResponse.parse(await publishedInvoiceDesign()));
  }));
  for(const [path,publish,restore] of [
    ["/admin/finance/invoice-design",false,false],
    ["/admin/finance/invoice-design/publish",true,false],
    ["/admin/finance/invoice-design/reset",true,true],
  ] as const) {
    const handler=work(async(req,res)=>{
      try {
        const body=restore?{...reset.parse(req.body),design:createTemplate()}:update.parse(req.body);
        validateDesign(body.design);
        if(publish) {
          // Publication is blocked if real font metrics expose overlap/overflow.
          await inspectInvoiceDocument(sampleInvoice(false),"ar",body.design,false);
          await inspectInvoiceDocument(sampleInvoice(true),"ar",body.design,false);
          await inspectInvoiceDocument(sampleInvoice(false),"en",body.design,false);
        }
        const state=await writeInvoiceDesign(body,res.locals.admin.id,publish);
        res.json(Api.AdminGetInvoiceDesignResponse.parse({...state,sampleQr:await sampleQr}));
      } catch(error) {
        res.status(error instanceof InvoiceDesignConflict?409:400).json({error:error instanceof Error?error.message:"Design save failed"});
      }
    });
    if(path==="/admin/finance/invoice-design") router.put(path,permit("finance","edit"),handler);
    else router.post(path,permit("finance","edit"),handler);
  }
  return router;
}