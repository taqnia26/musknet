import { db, invoiceDesignSettingsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { createTemplate, validateDesign, type InvoiceDesign } from "@workspace/invoice-document/core";
export class InvoiceDesignConflict extends Error {}
export async function invoiceDesignState() {
  const [row]=await db.select().from(invoiceDesignSettingsTable).where(eq(invoiceDesignSettingsTable.id,1));
  // A database without the explicitly approved additive migration fails loudly.
  if(!row) throw new Error("Invoice design settings have not been provisioned");
  return {
    revision:row.revision,draft:row.draft ? validateDesign(row.draft) : createTemplate(),
    published:row.published ? validateDesign(row.published) : createTemplate(),
    updatedBy:row.updatedBy,updatedAt:row.updatedAt.toISOString(),
    publishedBy:row.publishedBy,publishedAt:row.publishedAt?.toISOString()??null,
  };
}
export async function publishedInvoiceDesign() {
  const state=await invoiceDesignState();
  return { revision:state.revision,design:state.published };
}
export async function writeInvoiceDesign(input: {revision:number; design:InvoiceDesign},adminId:number,publish=false) {
  const design=validateDesign(input.design);
  const [saved]=await db.update(invoiceDesignSettingsTable).set({
    draft:design,revision:sql`${invoiceDesignSettingsTable.revision}+1`,
    updatedBy:adminId,updatedAt:new Date(),
    ...(publish ? {published:design,publishedBy:adminId,publishedAt:new Date()} : {}),
  }).where(and(eq(invoiceDesignSettingsTable.id,1),eq(invoiceDesignSettingsTable.revision,input.revision))).returning();
  if(!saved) throw new InvoiceDesignConflict("تم تعديل التصميم من جلسة أخرى. أعد التحميل قبل الحفظ، مع الاحتفاظ بتعديلاتك.");
  // Return the row actually committed, not a second read which could reflect another writer.
  return {
    revision:saved.revision,draft:validateDesign(saved.draft),published:saved.published?validateDesign(saved.published):createTemplate(),
    updatedBy:saved.updatedBy,updatedAt:saved.updatedAt.toISOString(),publishedBy:saved.publishedBy,publishedAt:saved.publishedAt?.toISOString()??null,
  };
}