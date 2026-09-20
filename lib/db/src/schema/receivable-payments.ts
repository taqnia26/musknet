import { check, date, doublePrecision, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";
import { invoicesTable } from "./invoices";

export const receivablePaymentsTable = pgTable("receivable_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "restrict" }),
  paymentKey: text("payment_key").notNull(),
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  amount: doublePrecision("amount").notNull(),
  paymentMethod: text("payment_method").notNull(),
  reference: text("reference"),
  createdBy: integer("created_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("receivable_payments_key_unique").on(table.paymentKey),
  index("receivable_payments_invoice_date_idx").on(table.invoiceId, table.paymentDate),
  check("receivable_payments_amount_positive", sql`${table.amount} > 0`),
]);

export const insertReceivablePaymentSchema = createInsertSchema(receivablePaymentsTable).omit({ id: true, createdAt: true });
export type InsertReceivablePayment = z.infer<typeof insertReceivablePaymentSchema>;
export type ReceivablePayment = typeof receivablePaymentsTable.$inferSelect;