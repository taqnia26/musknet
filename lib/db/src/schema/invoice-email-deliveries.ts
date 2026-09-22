import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";
import { taxInvoicesTable } from "./invoices";

export const invoiceEmailDeliveriesTable = pgTable("invoice_email_deliveries", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => taxInvoicesTable.id, { onDelete: "restrict" }),
  recipient: text("recipient").notNull(),
  status: text("status").notNull(),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  sentByAdminId: integer("sent_by_admin_id").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("invoice_email_deliveries_invoice_attempted_idx").on(table.invoiceId, table.attemptedAt),
]);

export const insertInvoiceEmailDeliverySchema = createInsertSchema(invoiceEmailDeliveriesTable).omit({ id: true, attemptedAt: true });
export type InsertInvoiceEmailDelivery = z.infer<typeof insertInvoiceEmailDeliverySchema>;
export type InvoiceEmailDelivery = typeof invoiceEmailDeliveriesTable.$inferSelect;