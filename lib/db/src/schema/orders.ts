import { check, doublePrecision, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { couponDiscountTypeEnum } from "./coupons";

export const orderStatuses = ["cancelled", "returned", "pending_review", "preparing", "out_for_delivery", "delivered", "pending_payment"] as const;

export const ordersTable = pgTable("storefront_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => customersTable.id, { onDelete: "restrict" }),
  orderNumber: text("order_number").notNull(),
  // NULL means an historical source was not recorded; do not infer it.
  orderSource: text("order_source").default("storefront"),
  subtotal: doublePrecision("subtotal").notNull(),
  shippingCost: doublePrecision("shipping_cost").notNull(),
  discount: doublePrecision("discount").notNull(),
  couponCode: text("coupon_code"),
  couponDiscountType: couponDiscountTypeEnum("coupon_discount_type"),
  couponDiscountValue: doublePrecision("coupon_discount_value"),
  tax: doublePrecision("tax").notNull(),
  total: doublePrecision("total").notNull(),
  status: text("status").notNull().default("pending_review"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  trackingNumber: text("tracking_number"),
  address: text("address_json").notNull(),
  shippingMethod: text("shipping_method").notNull(),
  paymentMethod: text("payment_method").notNull(),
  adminNotes: text("admin_notes"),
  statusManuallyUpdatedAt: timestamp("status_manually_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("storefront_orders_order_number_unique").on(table.orderNumber),
  check("storefront_orders_source_check", sql`${table.orderSource} is null or ${table.orderSource} in ('storefront', 'admin', 'phone')`),
  check("storefront_orders_status_check", sql`${table.status} in ('cancelled', 'returned', 'pending_review', 'preparing', 'out_for_delivery', 'delivered', 'pending_payment')`),
]);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;