import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";

export const orderAddressesTable = pgTable("storefront_order_addresses", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  city: text("city").notNull(),
  country: text("country"),
  nationalAddressShortCode: text("national_address_short_code"),
  district: text("district").notNull(),
  street: text("street").notNull(),
  buildingNo: text("building_no").notNull(),
  additionalInfo: text("additional_info"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("storefront_order_addresses_order_unique").on(table.orderId),
]);

export const insertOrderAddressSchema = createInsertSchema(orderAddressesTable).omit({ id: true, createdAt: true });
export type InsertOrderAddress = z.infer<typeof insertOrderAddressSchema>;
export type OrderAddress = typeof orderAddressesTable.$inferSelect;