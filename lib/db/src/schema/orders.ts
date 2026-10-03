import { check, doublePrecision, integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { couponDiscountTypeEnum } from "./coupons";
import { adminUsersTable } from "./admin-users";

export const orderStatuses = ["cancelled", "returned", "pending_review", "preparing", "out_for_delivery", "delivered", "pending_payment"] as const;

export const ordersTable = pgTable("storefront_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => customersTable.id, { onDelete: "restrict" }),
  orderNumber: text("order_number").notNull(),
  // NULL means an historical source was not recorded; do not infer it.
  orderSource: text("order_source").default("storefront"),
  // NULL preserves unknown historical fulfillment; only live creation assigns a known method.
  fulfillmentMethod: text("fulfillment_method"),
  subtotal: doublePrecision("subtotal").notNull(),
  shippingCost: doublePrecision("shipping_cost").notNull(),
  discount: doublePrecision("discount").notNull(),
  couponCode: text("coupon_code"),
  couponDiscountType: couponDiscountTypeEnum("coupon_discount_type"),
  couponDiscountValue: doublePrecision("coupon_discount_value"),
  couponDiscountAmount: numeric("coupon_discount_amount", { precision: 16, scale: 2 }),
  manualDiscountPercent: numeric("manual_discount_percent", { precision: 5, scale: 2 }),
  manualDiscountAmount: numeric("manual_discount_amount", { precision: 16, scale: 2 }),
  manualDiscountReason: text("manual_discount_reason"),
  manualDiscountByAdminId: integer("manual_discount_by_admin_id").references(() => adminUsersTable.id, { onDelete: "restrict" }),
  manualDiscountAt: timestamp("manual_discount_at", { withTimezone: true }),
  tax: doublePrecision("tax").notNull(),
  total: doublePrecision("total").notNull(),
  status: text("status").notNull().default("pending_review"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  trackingNumber: text("tracking_number"),
  address: text("address_json").notNull(),
  shippingMethod: text("shipping_method").notNull(),
  paymentMethod: text("payment_method").notNull(),
  adminNotes: text("admin_notes"),
  adminEditSnapshot: jsonb("admin_edit_snapshot").$type<Record<string, unknown>>(),
  statusManuallyUpdatedAt: timestamp("status_manually_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  check("storefront_orders_admin_edit_snapshot_check", sql`${table.adminEditSnapshot} is null or jsonb_typeof(${table.adminEditSnapshot}) = 'object'`),
  uniqueIndex("storefront_orders_order_number_unique").on(table.orderNumber),
  check("storefront_orders_source_check", sql`${table.orderSource} is null or ${table.orderSource} in ('storefront', 'admin', 'phone')`),
  check("storefront_orders_fulfillment_method_check", sql`${table.fulfillmentMethod} is null or ${table.fulfillmentMethod} in ('delivery', 'pickup')`),
  check("storefront_orders_coupon_discount_amount_check", sql`${table.couponDiscountAmount} is null or ${table.couponDiscountAmount} between 0 and round(${table.subtotal}::numeric, 2)`),
  check("storefront_orders_manual_discount_check", sql`(
    (${table.manualDiscountPercent} is null and ${table.manualDiscountAmount} is null and ${table.manualDiscountReason} is null and ${table.manualDiscountByAdminId} is null and ${table.manualDiscountAt} is null)
    or (${table.manualDiscountPercent} is not null and ${table.manualDiscountPercent} between 0 and 100 and ${table.couponDiscountAmount} is not null
      and ${table.manualDiscountAmount} is not null and ${table.manualDiscountAmount} between 0 and round(${table.subtotal}::numeric, 2) - ${table.couponDiscountAmount}
      and round(${table.discount}::numeric, 2) = ${table.couponDiscountAmount} + ${table.manualDiscountAmount}
      and ${table.manualDiscountReason} is not null and length(btrim(${table.manualDiscountReason})) between 10 and 500
      and ${table.manualDiscountByAdminId} is not null and ${table.manualDiscountAt} is not null))`),
  check("storefront_orders_status_check", sql`${table.status} in ('cancelled', 'returned', 'pending_review', 'preparing', 'out_for_delivery', 'delivered', 'pending_payment')`),
]);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;