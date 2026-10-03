import { and, eq, inArray, or } from "drizzle-orm";
import { db, invoicesTable, shipmentsTable } from "@workspace/db";

/** Read-only operational attachment; never a rewrite of the issued invoice. */
export async function invoiceShippingDetails(invoiceIds: number[]) {
  const result = new Map<number, string>();
  if (!invoiceIds.length) return result;
  const rows = await db.select({ id: invoicesTable.id, shipment: shipmentsTable }).from(invoicesTable)
    .innerJoin(shipmentsTable, or(eq(shipmentsTable.invoiceId, invoicesTable.id), eq(shipmentsTable.orderId, invoicesTable.orderId)))
    .where(and(inArray(invoicesTable.id, invoiceIds), eq(invoicesTable.individual, false)));
  for (const { id, shipment: s } of rows) {
    result.set(id, [
      s.recipientName, s.recipientPhone, s.destinationCountry, s.destinationCity,
      s.nationalAddressShortCode, s.destinationAddress, s.serviceMethod,
      s.carrier, s.trackingNumber, s.status,
    ].filter(Boolean).join(" — "));
  }
  return result;
}