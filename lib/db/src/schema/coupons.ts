import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

export const couponDiscountTypeEnum = pgEnum("storefront_coupon_discount_type", [
  "percentage",
  "fixed",
]);

export const couponsTable = pgTable("storefront_coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  discountType: couponDiscountTypeEnum("discount_type").notNull(),
  discountValue: doublePrecision("discount_value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  usageLimit: integer("usage_limit"),
  freeShipping: boolean("free_shipping").notNull().default(false),
  perCustomerLimit: integer("per_customer_limit"),
  maxDiscount: doublePrecision("max_discount"),
  excludedProductIds: jsonb("excluded_product_ids").$type<number[]>().notNull().default([]),
  allowedCountries: jsonb("allowed_countries").$type<string[]>().notNull().default([]),
  timesUsed: integer("times_used").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("storefront_coupons_code_unique").on(table.code),
  uniqueIndex("storefront_coupons_code_ci_unique").on(sql`lower(btrim(${table.code}))`),
]);

export const insertCouponSchema = createInsertSchema(couponsTable).omit({ id: true });
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof couponsTable.$inferSelect;