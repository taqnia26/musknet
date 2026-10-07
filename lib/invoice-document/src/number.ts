/** Presentation only. Never truncate significant digits or rewrite persisted identifiers. */
export function formatInvoiceNumber(value?: string | null): string {
  if (!value) return "";
  const match = /^(M|ML|INV|LC)-(\d+)$/.exec(value);
  if (!match) return value;
  return `${match[1]}-${(match[2].replace(/^0+/, "") || "0").padStart(4, "0")}`;
}

/** Existing issued numbers use six-digit padding; accept the shorter display in search. */
export function invoiceNumberSearchAlias(value: string): string {
  const match = /^(M|ML|INV|LC)-(\d+)$/i.exec(value.trim());
  if (!match) return value;
  return `${match[1]}-${(match[2].replace(/^0+/, "") || "0").padStart(6, "0")}`;
}
