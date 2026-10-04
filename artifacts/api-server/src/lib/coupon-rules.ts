import { sql } from "drizzle-orm";
import { db, couponsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class CouponRuleError extends Error {}
export type CouponContext = {
  items?: Array<{ productId: number; quantity: number; unitPrice: number }>;
  customerId?: number;
  buyerPhone?: string | null;
  country?: string | null;
  excludeOrderId?: number;
  alreadyRedeemed?: boolean;
};

// Identity only for coupon accounting; never rewrites login/customer phone records.
export function couponPhone(value?: string | null) {
  let phone = value?.replace(/\D/g, "") ?? "";
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (/^05\d{8}$/.test(phone)) phone = `966${phone.slice(1)}`;
  return phone;
}

export function couponEligibleCents(
  coupon: Pick<typeof couponsTable.$inferSelect, "excludedProductIds" | "allowedCountries" | "maxDiscount" | "discountType" | "discountValue">,
  subtotal: number, context: CouponContext,
) {
  const countries = coupon.allowedCountries ?? [];
  if (countries.length && (!context.country || !countries.includes(context.country.toUpperCase()))) {
    throw new CouponRuleError("الكوبون غير متاح لدولة هذا الطلب؛ حدّد دولة العميل");
  }
  const excluded = coupon.excludedProductIds ?? [];
  let eligible = Math.round(subtotal * 100);
  if (excluded.length) {
    if (!context.items?.length) throw new CouponRuleError("يجب تحديد المنتجات للتحقق من شروط الكوبون");
    eligible = context.items.filter(i => !excluded.includes(i.productId))
      .reduce((sum, i) => sum + Math.round(i.unitPrice * i.quantity * 100), 0);
    eligible = Math.min(eligible, Math.round(subtotal * 100));
    if (eligible <= 0) throw new CouponRuleError("جميع المنتجات مستثناة من هذا الكوبون");
  }
  const raw = Math.round(coupon.discountType === "percentage"
    ? eligible * coupon.discountValue / 100 : coupon.discountValue * 100);
  return Math.max(0, Math.min(eligible, raw,
    coupon.maxDiscount == null ? Infinity : Math.round(coupon.maxDiscount * 100)));
}

export async function checkCustomerCouponLimit(tx: Tx, coupon: typeof couponsTable.$inferSelect, context: CouponContext) {
  if (coupon.perCustomerLimit == null) return;
  let phone = couponPhone(context.buyerPhone);
  if (context.customerId) {
    const found = await tx.execute(sql`select phone from storefront_customers where id = ${context.customerId}`);
    phone = couponPhone((found.rows[0] as { phone?: string } | undefined)?.phone);
  }
  if (!phone) throw new CouponRuleError("هذا الكوبون يتطلب تحديد العميل ورقم جواله لحساب عدد الاستخدامات");
  // Coupon row is locked by the caller; all channels serialize this check and sale insertion.
  const records = await tx.execute(sql`
    select c.phone from storefront_orders o join storefront_customers c on c.id=o.user_id
      where lower(trim(o.coupon_code))=lower(trim(${coupon.code}))
      and (${context.excludeOrderId ?? null}::integer is null or o.id<>${context.excludeOrderId ?? null})
    union all
    select i.buyer_phone as phone from tax_invoices i
      where i.individual=true and lower(trim(i.coupon_code))=lower(trim(${coupon.code}))`);
  const used = records.rows.filter(r => couponPhone((r as {phone: string | null}).phone) === phone).length;
  if (used >= coupon.perCustomerLimit) throw new CouponRuleError("وصل هذا العميل إلى الحد المسموح لاستخدام الكوبون");
}