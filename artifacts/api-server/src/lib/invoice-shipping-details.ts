import { and, eq, inArray, or } from "drizzle-orm";
import { db, invoicesTable, shipmentsTable } from "@workspace/db";

/** Read-only operational attachment; never a rewrite of the issued invoice. */
export async function invoiceShippingDetails(invoiceIds: number[]) {
  const result = new Map<number, string>();
  if (!invoiceIds.length) return result;
  const rows = await db.select({ id: invoicesTable.id, buyerName: invoicesTable.buyerName, buyerPhone: invoicesTable.buyerPhone, buyerAddress: invoicesTable.buyerAddress, shipment: shipmentsTable }).from(invoicesTable)
    .leftJoin(shipmentsTable, or(eq(shipmentsTable.invoiceId, invoicesTable.id), eq(shipmentsTable.orderId, invoicesTable.orderId)))
    .where(and(inArray(invoicesTable.id, invoiceIds), eq(invoicesTable.showShipping, true)));
  for (const { id, shipment: s, buyerName, buyerPhone, buyerAddress } of rows) {
    if (!s) {
      if (buyerAddress) result.set(id, [buyerName, buyerPhone, buyerAddress].filter(Boolean).join(" — "));
      continue;
    }
    result.set(id, [
      s.recipientName, s.recipientPhone, s.destinationCountry, s.destinationCity,
      s.nationalAddressShortCode, s.destinationAddress, s.serviceMethod,
      s.carrier, s.trackingNumber, s.status,
    ].filter(Boolean).join(" — "));
  }
  return result;
}