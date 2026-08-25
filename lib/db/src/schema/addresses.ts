import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const addressesTable = pgTable("storefront_addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  city: text("city").notNull(),
  district: text("district").notNull(),
  street: text("street").notNull(),
  buildingNo: text("building_no").notNull(),
  additionalInfo: text("additional_info"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("storefront_addresses_one_default_per_user")
    .on(table.userId)
    .where(sql`${table.isDefault} = true`),
]);

export const insertAddressSchema = createInsertSchema(addressesTable).omit({ id: true, createdAt: true });
export type InsertAddress = z.infer<typeof insertAddressSchema>;
export type Address = typeof addressesTable.$inferSelect;