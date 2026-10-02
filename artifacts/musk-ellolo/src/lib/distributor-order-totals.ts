/** B2B catalog prices include VAT; match the issuer's per-line cent rounding. */
export function distributorOrderTotals(
  items: Array<{ unitPrice: number; quantity: number }>,
  discountPercent: number,
  vatRate: number,
) {
  if (![discountPercent, vatRate].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
    throw new Error('Invalid distributor pricing terms');
  }
  let listCents = 0;
  let totalCents = 0;
  let netCents = 0;
  for (const item of items) {
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0 || !Number.isSafeInteger(item.quantity) || item.quantity < 0) {
      throw new Error('Invalid distributor order line');
    }
    const list = Math.round((item.unitPrice + Number.EPSILON) * 100) * item.quantity;
    const gross = Math.round(list * (100 - discountPercent) / 100);
    listCents += list;
    totalCents += gross;
    netCents += vatRate === 0 ? gross : Math.round(gross * 100 / (100 + vatRate));
  }
  return {
    listSubtotal: listCents / 100,
    discountAmount: (listCents - totalCents) / 100,
    subtotal: netCents / 100,
    vatAmount: (totalCents - netCents) / 100,
    totalAmount: totalCents / 100,
  };
}