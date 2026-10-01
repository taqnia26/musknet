export const INVOICE_SEQUENCE_SCOPE = "public.tax_invoices.sequence_number";

/**
 * Invoice sequence numbers are global across prefixes. The retained high-water
 * mark survives business-data restores that can lower the live table maximum.
 */
export function nextInvoiceSequenceNumber(liveMaximum: number, retainedHighWater: number) {
  const live = Number(liveMaximum);
  const retained = Number(retainedHighWater);
  if (!Number.isSafeInteger(live) || live < 0 || !Number.isSafeInteger(retained) || retained < 0) {
    throw new Error("Invoice sequence values must be non-negative safe integers");
  }
  return Math.max(live, retained) + 1;
}