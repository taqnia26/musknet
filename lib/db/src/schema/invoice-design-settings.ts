import { check, integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { adminUsersTable } from "./admin-users";
export const invoiceDesignSettingsTable = pgTable("invoice_design_settings", {
  id: integer("id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  draft: jsonb("draft").$type<unknown>(),
  published: jsonb("published").$type<unknown>(),
  updatedBy: integer("updated_by").references(()=>adminUsersTable.id),
  updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
  publishedBy: integer("published_by").references(()=>adminUsersTable.id),
  publishedAt: timestamp("published_at",{withTimezone:true}),
},t=>[check("invoice_design_settings_id_check",sql`${t.id}=1`),check("invoice_design_settings_revision_check",sql`${t.revision}>=0`)]);
export const insertInvoiceDesignSettingsSchema=createInsertSchema(invoiceDesignSettingsTable).omit({updatedAt:true});
export type InvoiceDesignSettings=typeof invoiceDesignSettingsTable.$inferSelect;