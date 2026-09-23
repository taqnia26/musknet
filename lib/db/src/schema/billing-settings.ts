import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { adminUsersTable } from "./admin-users";

export const billingSettingsTable = pgTable("billing_settings", {
  id: integer("id").primaryKey(),
  invoiceEmail: text("invoice_email"),
  companyName: text("company_name"),
  streetAddress: text("street_address"),
  city: text("city"),
  country: text("country"),
  taxNumber: text("tax_number"),
  bankName: text("bank_name"),
  accountHolder: text("account_holder"),
  accountNumber: text("account_number"),
  iban: text("iban"),
  preferredPaymentMethod: text("preferred_payment_method").notNull().default("not_set"),
  updatedBy: integer("updated_by").references(() => adminUsersTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBillingSettingsSchema = createInsertSchema(billingSettingsTable).omit({ updatedAt: true });
export type BillingSettings = typeof billingSettingsTable.$inferSelect;