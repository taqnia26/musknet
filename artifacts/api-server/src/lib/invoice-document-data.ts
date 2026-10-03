import { and, eq, isNull, sql } from "drizzle-orm";
import { db, invoicesTable, invoiceItemsTable, ordersTable, exhibitionsTable, receivablePaymentsTable } from "@workspace/db";
import type { InvoiceFacts } from "@workspace/invoice-document/core";
import { invoiceShippingDetails } from "./invoice-shipping-details";
/** All local customer channels use their immutable invoice snapshot. */
export async function localInvoiceDocument(id:number,includeCancelled=false):Promise<InvoiceFacts|null> {
  const [result]=await db.select({
    invoice:invoicesTable,orderNumber:ordersTable.orderNumber,exhibitionName:exhibitionsTable.name,
    discountAmount:sql<number>`coalesce(${ordersTable.discount},${invoicesTable.discountAmount},0)`,
    shippingAmount:sql<number>`coalesce(${ordersTable.shippingCost},0)`,
    cancelledByName:sql<string|null>`(select name from admin_users where id=${invoicesTable.cancelledByAdminId})`,
  }).from(invoicesTable).leftJoin(ordersTable,eq(invoicesTable.orderId,ordersTable.id))
    .leftJoin(exhibitionsTable,eq(invoicesTable.exhibitionId,exhibitionsTable.id))
    .where(and(eq(invoicesTable.id,id),includeCancelled?undefined:isNull(invoicesTable.cancelledAt),
      includeCancelled?undefined:isNull(invoicesTable.archivedAt)));
  if(!result) return null;
  const i=result.invoice;
  const items=await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId,id)).orderBy(invoiceItemsTable.id);
  const payments=await db.select().from(receivablePaymentsTable).where(eq(receivablePaymentsTable.invoiceId,id));
  const paidAmount=Math.round(payments.reduce((s,p)=>s+p.amount,0)*100)/100;
  return {
    ...i,orderNumber:result.orderNumber,exhibitionName:result.exhibitionName,
    discountAmount:result.discountAmount,shippingAmount:result.shippingAmount,
    cancelledByName:result.cancelledByName,
    contractDiscountPercent:i.contractDiscountPercent==null?null:Number(i.contractDiscountPercent),
    invoiceDiscountPercent:i.invoiceDiscountPercent==null?null:Number(i.invoiceDiscountPercent),
    vatRate:i.vatRate==null?null:Number(i.vatRate),
    couponDiscountAmount:i.couponDiscountAmount==null?null:Number(i.couponDiscountAmount),
    manualDiscountAmount:i.manualDiscountAmount==null?null:Number(i.manualDiscountAmount),
    manualDiscountPercent:i.manualDiscountAmount==null?null:Number(i.invoiceDiscountPercent),
    shippingDetails:(await invoiceShippingDetails([id])).get(id)??null,
    items,paidAmount,outstandingAmount:i.cancelledAt?0:Math.max(0,Math.round((i.totalAmount-paidAmount)*100)/100),
  };
}