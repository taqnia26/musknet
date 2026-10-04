import { db, couponsTable, productsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

export async function validateCouponSettings(value: Partial<typeof couponsTable.$inferInsert>) {
  if (value.code !== undefined && !/^[A-Za-z0-9_-]{1,80}$/.test(value.code.trim())) return "كود الكوبون يقبل الحروف والأرقام و - و _ فقط، حتى 80 حرفًا";
  if (value.discountValue != null && (!Number.isFinite(value.discountValue) || value.discountValue < 0 ||
    (value.discountType === "percentage" && value.discountValue > 100))) return "نسبة الخصم من 0 إلى 100، والمبلغ لا يقل عن صفر";
  for (const number of [value.usageLimit, value.perCustomerLimit]) {
    if (number != null && (!Number.isSafeInteger(number) || number < 1)) return "عدد مرات الاستخدام يجب أن يكون عددًا صحيحًا موجبًا";
  }
  if (value.maxDiscount != null && (!Number.isFinite(value.maxDiscount) || value.maxDiscount <= 0)) return "الحد الأعلى للخصم يجب أن يكون موجبًا";
  if (value.expiresAt != null && !Number.isFinite(new Date(value.expiresAt).getTime())) return "تاريخ انتهاء الخصم غير صالح";
  const regions = new Intl.DisplayNames(["en"], {type:"region"});
  for (const country of value.allowedCountries ?? []) {
    if (!/^[A-Z]{2}$/.test(country) || !regions.of(country) || regions.of(country) === country || country === "ZZ") return "اختر دولًا صالحة";
  }
  if (value.excludedProductIds?.length) {
    if (value.excludedProductIds.some(id => !Number.isSafeInteger(id) || id < 1)) return "المنتجات المستثناة غير صالحة";
    const ids = [...new Set(value.excludedProductIds)];
    const rows = await db.select({id:productsTable.id}).from(productsTable).where(inArray(productsTable.id,ids));
    if (rows.length !== ids.length) return "أحد المنتجات المستثناة غير موجود";
  }
  return null;
}