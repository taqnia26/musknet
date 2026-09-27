import { date, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type SallaInvoiceLine = {
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
};

// Historical source documents only. Deliberately separate from tax_invoices:
// importing a document must never issue an invoice, move stock, or post a journal.
export const sallaInvoicesTable = pgTable("salla_invoice_archive", {
  id: serial("id").primaryKey(),
  sallaInvoiceId: text("salla_invoice_id").notNull(),
  sallaOrderId: text("salla_order_id").notNull(),
  invoiceNumber: text("invoice_number"),
  invoiceUuid: text("invoice_uuid"),
  invoiceReferenceId: text("invoice_reference_id"),
  qrCode: text("qr_code"),
  paymentMethod: text("payment_method"),
  invoiceType: text("invoice_type").notNull(),
  issuedOn: date("issued_on", { mode: "string" }).notNull(),
  currency: text("currency").notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  shippingCost: numeric("shipping_cost", { precision: 14, scale: 2 }).notNull(),
  codCost: numeric("cod_cost", { precision: 14, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 14, scale: 2 }).notNull(),
  vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull(),
  vatPercent: numeric("vat_percent", { precision: 6, scale: 2 }),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
  items: jsonb("items").$type<SallaInvoiceLine[]>().notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("salla_invoice_archive_source_id_unique").on(table.sallaInvoiceId),
]);

export const insertSallaInvoiceSchema = createInsertSchema(sallaInvoicesTable).omit({ id: true, importedAt: true });
export type SallaInvoice = typeof sallaInvoicesTable.$inferSelect;
export type InsertSallaInvoice = z.infer<typeof insertSallaInvoiceSchema>;