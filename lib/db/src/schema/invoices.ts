import { check, date, doublePrecision, integer, pgTable, serial, text, timestamp, uniqueIndex, numeric } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { wholesaleDistributorsTable } from "./wholesale-distributors";
import { productsTable } from "./products";
import { exhibitionsTable } from "./exhibitions";
import { distributorContractsTable } from "./distributor-contracts";
import { uploadedContractFilesTable } from "./uploaded-contract-files";

export const taxInvoicesTable = pgTable("tax_invoices", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "restrict" }),
  distributorId: integer("distributor_id").references(() => wholesaleDistributorsTable.id, { onDelete: "restrict" }),
  contractId: integer("contract_id").references(() => distributorContractsTable.id, { onDelete: "set null" }),
  uploadedContractFileId: integer("uploaded_contract_file_id").references(() => uploadedContractFilesTable.id, { onDelete: "restrict" }),
  contractNumber: text("contract_number"),
  contractType: text("contract_type"),
  contractDiscountPercent: numeric("contract_discount_percent", { precision: 5, scale: 2 }),
  paymentDays: integer("payment_days"),
  paymentTerm: text("payment_term"),
  taxTreatment: text("tax_treatment"),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }),
  exhibitionId: integer("exhibition_id").references(() => exhibitionsTable.id, { onDelete: "restrict" }),
  creationKey: text("creation_key"),
  historical: text("historical").notNull().default("no"),
  historicalCreationFingerprint: text("historical_creation_fingerprint"),
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
  discountAmount: doublePrecision("discount_amount").notNull().default(0),
  vatAmount: doublePrecision("vat_amount").notNull(),
  totalAmount: doublePrecision("total_amount").notNull(),
  qrCodeData: text("qr_code_data").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedByAdminId: integer("archived_by_admin_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("invoice_single_channel", sql`(case when ${table.orderId} is not null then 1 else 0 end + case when ${table.distributorId} is not null then 1 else 0 end + case when ${table.exhibitionId} is not null then 1 else 0 end) = 1`),
  check("invoice_single_contract_source", sql`not (${table.contractId} is not null and ${table.uploadedContractFileId} is not null)`),
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
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "restrict" }),
  productName: text("product_name").notNull(),
  // Null for invoices issued before bilingual snapshots existed.
  productNameEn: text("product_name_en"),
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
