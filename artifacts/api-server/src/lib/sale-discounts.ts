import { and, eq, sql } from "drizzle-orm";
import { db, couponsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class SaleDiscountValidationError extends Error {}
export type ManualDiscountInput = { percent: number; reason?: string };

export function validateManualDiscount(input?: ManualDiscountInput) {
  const percent = input?.percent ?? 0;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100 ||
      Math.round(percent * 100) / 100 !== percent) {
    throw new SaleDiscountValidationError("نسبة الخصم من 0 إلى 100 وبمنزلتين عشريتين كحد أقصى");
  }
  if (percent > 0 && (typeof input?.reason !== "string" || input.reason.trim().length < 10 || input.reason.trim().length > 500)) {
    throw new SaleDiscountValidationError("سبب الخصم اليدوي مطلوب، من 10 إلى 500 حرف");
  }
  return percent;
}

// Preview never reserves a coupon. Creation reserves it inside the sale transaction.
export async function calculateSaleDiscount(tx: Tx, subtotal: number, couponCode?: string | null, percent = 0, consume = false) {
  validateManualDiscount({ percent, reason: "معاينة حساب الخصم" });
  const base = Math.round(subtotal * 100);
  if (!Number.isSafeInteger(base) || base < 0 || base > 9_000_000_000_000_000) {
    throw new SaleDiscountValidationError("قيمة المنتجات خارج النطاق المسموح");
  }
  let coupon: typeof couponsTable.$inferSelect | undefined;
  let couponCents = 0;
  const code = couponCode?.trim().toUpperCase();
  if (code) {
    await tx.execute(sql`select id from ${couponsTable} where ${couponsTable.code} = ${code} for update`);
    [coupon] = await tx.select().from(couponsTable).where(and(
      eq(couponsTable.code, code), eq(couponsTable.isActive, true),
      sql`(${couponsTable.expiresAt} is null or ${couponsTable.expiresAt} > now())`,
      sql`(${couponsTable.usageLimit} is null or ${couponsTable.timesUsed} < ${couponsTable.usageLimit})`,
    )).limit(1);
    if (!coupon || !Number.isFinite(coupon.discountValue) || coupon.discountValue < 0 ||
        (coupon.discountType === "percentage" && coupon.discountValue > 100)) {
      throw new SaleDiscountValidationError("الكوبون غير صالح أو منتهي أو استُنفد حد استخدامه");
    }
    couponCents = Math.min(base, Math.round(coupon.discountType === "percentage"
      ? base * coupon.discountValue / 100 : coupon.discountValue * 100));
    if (consume) await tx.update(couponsTable).set({ timesUsed: sql`${couponsTable.timesUsed} + 1` }).where(eq(couponsTable.id, coupon.id));
  }
  const manualCents = Number((BigInt(base - couponCents) * BigInt(Math.round(percent * 100)) + 5_000n) / 10_000n);
  return {
    productSubtotal: base / 100,
    couponCode: coupon?.code ?? null,
    couponDiscountType: coupon?.discountType ?? null,
    couponDiscountValue: coupon?.discountValue ?? null,
    couponDiscountAmount: couponCents / 100,
    manualDiscountPercent: percent,
    manualDiscountAmount: manualCents / 100,
    discountAmount: (couponCents + manualCents) / 100,
    productsTotal: (base - couponCents - manualCents) / 100,
    couponId: coupon?.id ?? null,
  };
}

export function discountResponseFields(row: {
  couponDiscountAmount?: string | number | null;
  manualDiscountAmount?: string | number | null;
  manualDiscountPercent?: string | number | null;
  invoiceDiscountPercent?: string | number | null;
}) {
  return {
    couponDiscountAmount: row.couponDiscountAmount == null ? null : Number(row.couponDiscountAmount),
    manualDiscountAmount: row.manualDiscountAmount == null ? null : Number(row.manualDiscountAmount),
    manualDiscountPercent: row.manualDiscountPercent == null
      ? row.invoiceDiscountPercent == null || row.manualDiscountAmount == null ? null : Number(row.invoiceDiscountPercent)
      : Number(row.manualDiscountPercent),
  };
}

// Allocate integer cents proportionally; line totals must equal the discounted sale.
export function allocateDiscountedGross(gross: number[], target: number) {
  const total = gross.reduce((a, b) => a + b, 0);
  if (!total) return gross.map(() => 0);
  const shares = gross.map((value, index) => {
    const exact = BigInt(value) * BigInt(target);
    return { index, cents: Number(exact / BigInt(total)), remainder: exact % BigInt(total) };
  });
  let remaining = target - shares.reduce((sum, share) => sum + share.cents, 0);
  for (const share of [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (remaining-- <= 0) break;
    share.cents++;
  }
  return shares.map((share) => share.cents);
}