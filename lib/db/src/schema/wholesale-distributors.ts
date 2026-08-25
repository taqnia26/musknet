import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wholesaleDistributorsTable = pgTable("wholesale_distributors", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email"),
  phone: text("phone").notNull(),
  city: text("city"),
  address: text("address"),
  taxNumber: text("tax_number"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWholesaleDistributorSchema = createInsertSchema(wholesaleDistributorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWholesaleDistributor = z.infer<typeof insertWholesaleDistributorSchema>;
export type WholesaleDistributor = typeof wholesaleDistributorsTable.$inferSelect;