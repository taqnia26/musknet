import { doublePrecision, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";

export const taxInvoicesTable = pgTable("tax_invoices", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "restrict" }),
  sequenceNumber: integer("sequence_number").notNull(),
  invoiceNumber: text("invoice_number").notNull(),
  sellerName: text("seller_name").notNull(),
  issueDatetime: timestamp("issue_datetime", { withTimezone: true }).notNull(),
  sellerVatNumber: text("seller_vat_number").notNull(),
  subtotal: doublePrecision("subtotal").notNull(),
  vatAmount: doublePrecision("vat_amount").notNull(),
  totalAmount: doublePrecision("total_amount").notNull(),
  qrCodeData: text("qr_code_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("invoices_order_id_unique").on(table.orderId),
  uniqueIndex("invoices_sequence_number_unique").on(table.sequenceNumber),
  uniqueIndex("invoices_invoice_number_unique").on(table.invoiceNumber),
]);

export const invoicesTable = taxInvoicesTable;
export const insertInvoiceSchema = createInsertSchema(taxInvoicesTable).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof taxInvoicesTable.$inferSelect;