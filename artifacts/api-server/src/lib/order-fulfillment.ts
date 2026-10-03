/** Owner-approved admin-only pickup fee, inclusive of any applicable VAT. */
export const ADMIN_PICKUP_FEE_SAR = 25;
export const adminFulfillmentOptions = {
  pickupFee: ADMIN_PICKUP_FEE_SAR,
  currency: "SAR" as const,
};