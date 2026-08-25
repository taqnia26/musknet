import { doublePrecision, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const ordersTable = pgTable("storefront_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => customersTable.id, { onDelete: "restrict" }),
  orderNumber: text("order_number").notNull(),
  subtotal: doublePrecision("subtotal").notNull(),
  shippingCost: doublePrecision("shipping_cost").notNull(),
  discount: doublePrecision("discount").notNull(),
  tax: doublePrecision("tax").notNull(),
  total: doublePrecision("total").notNull(),
  status: text("status").notNull().default("new"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  trackingNumber: text("tracking_number"),
  address: text("address_json").notNull(),
  shippingMethod: text("shipping_method").notNull(),
  paymentMethod: text("payment_method").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("storefront_orders_order_number_unique").on(table.orderNumber)]);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;