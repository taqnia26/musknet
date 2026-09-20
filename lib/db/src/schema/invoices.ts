import { date, doublePrecision, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { wholesaleDistributorsTable } from "./wholesale-distributors";
import { productsTable } from "./products";

export const taxInvoicesTable = pgTable("tax_invoices", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "restrict" }),
  distributorId: integer("distributor_id").references(() => wholesaleDistributorsTable.id, { onDelete: "restrict" }),
  creationKey: text("creation_key"),
  sequenceNumber: integer("sequence_number").notNull(),
  invoiceNumber: text("invoice_number").notNull(),
  sellerName: text("seller_name").notNull(),
  issueDatetime: timestamp("issue_datetime", { withTimezone: true }).notNull(),
  dueDate: date("due_date", { mode: "string" }),
  sellerVatNumber: text("seller_vat_number").notNull(),
  buyerName: text("buyer_name"),
  buyerTaxNumber: text("buyer_tax_number"),
  buyerCommercialRegistrationNumber: text("buyer_commercial_registration_number"),
  buyerAddress: text("buyer_address"),
  subtotal: doublePrecision("subtotal").notNull(),
  vatAmount: doublePrecision("vat_amount").notNull(),
  totalAmount: doublePrecision("total_amount").notNull(),
  qrCodeData: text("qr_code_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("invoices_order_id_unique").on(table.orderId),
  uniqueIndex("invoices_sequence_number_unique").on(table.sequenceNumber),
  uniqueIndex("invoices_invoice_number_unique").on(table.invoiceNumber),
  uniqueIndex("invoices_creation_key_unique").on(table.creationKey),
]);

export const invoicesTable = taxInvoicesTable;
export const insertInvoiceSchema = createInsertSchema(taxInvoicesTable).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof taxInvoicesTable.$inferSelect;

export const invoiceItemsTable = pgTable("tax_invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => taxInvoicesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  productName: text("product_name").notNull(),
  sku: text("sku"),
  quantity: integer("quantity").notNull(),
  unitPrice: doublePrecision("unit_price").notNull(),
  subtotal: doublePrecision("subtotal").notNull(),
  vatAmount: doublePrecision("vat_amount").notNull(),
  totalAmount: doublePrecision("total_amount").notNull(),
});

export const insertInvoiceItemSchema = createInsertSchema(invoiceItemsTable).omit({ id: true });
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InvoiceItem = typeof invoiceItemsTable.$inferSelect;