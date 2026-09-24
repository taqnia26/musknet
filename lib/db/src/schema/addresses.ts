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
  country: text("country"),
  nationalAddressShortCode: text("national_address_short_code"),
  district: text("district").notNull(),
  street: text("street").notNull(),
  buildingNo: text("building_no").notNull(),
  postalCode: text("postal_code"),
  additionalNumber: text("additional_number"),
  additionalInfo: text("additional_info"),
  isProfile: boolean("is_profile").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("storefront_addresses_one_default_per_user")
    .on(table.userId)
    .where(sql`${table.isDefault} = true`),
  uniqueIndex("storefront_addresses_one_profile_per_user")
    .on(table.userId)
    .where(sql`${table.isProfile} = true`),
]);

export const insertAddressSchema = createInsertSchema(addressesTable).omit({ id: true, createdAt: true });
export type InsertAddress = z.infer<typeof insertAddressSchema>;
export type Address = typeof addressesTable.$inferSelect;