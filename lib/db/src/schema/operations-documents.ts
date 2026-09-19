import { check, date, integer, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { productsTable } from "./products";
import { purchasesTable } from "./finance";
import { manufacturingBatchesTable } from "./manufacturing";
import { adminUsersTable } from "./admin-users";

export const purchaseReceiptStatusEnum = pgEnum("purchase_receipt_status", ["draft", "posted", "voided"]);
export const purchaseReceiptPaymentStatusEnum = pgEnum("purchase_receipt_payment_status", ["unpaid", "paid", "partial"]);

export const purchaseReceiptsTable = pgTable("purchase_receipts", {
  id: serial("id").primaryKey(),
  receiptNumber: text("receipt_number").notNull(),
  vendorName: text("vendor_name").notNull(),
  vendorReference: text("vendor_reference"),
  purchaseId: integer("purchase_id").references(() => purchasesTable.id, { onDelete: "restrict" }),
  receiptDate: date("receipt_date", { mode: "string" }).notNull(),
  paymentStatus: purchaseReceiptPaymentStatusEnum("payment_status").notNull().default("unpaid"),
  paymentSource: text("payment_source").notNull().default("company_account"),
  amount: numeric("amount", { precision: 19, scale: 4, mode: "string" }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 19, scale: 4, mode: "string" }).notNull().default("0"),
  paymentReference: text("payment_reference"),
  status: purchaseReceiptStatusEnum("status").notNull().default("draft"),
  createdBy: integer("created_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  postedBy: integer("posted_by").references(() => adminUsersTable.id, { onDelete: "restrict" }),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("purchase_receipts_number_unique").on(table.receiptNumber),
  index("purchase_receipts_date_idx").on(table.receiptDate),
  check("purchase_receipts_amount_nonnegative", sql`${table.amount} >= 0`),
  check("purchase_receipts_paid_amount_nonnegative", sql`${table.paidAmount} >= 0`),
  check("purchase_receipts_paid_amount_lte_amount", sql`${table.paidAmount} <= ${table.amount}`),
  check("purchase_receipts_payment_source", sql`${table.paymentSource} in ('company_account', 'owner_account')`),
]);

export const purchaseReceiptLinesTable = pgTable("purchase_receipt_lines", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id").notNull().references(() => purchaseReceiptsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  unitCost: numeric("unit_cost", { precision: 19, scale: 4, mode: "string" }).notNull(),
  totalCost: numeric("total_cost", { precision: 19, scale: 4, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("purchase_receipt_lines_receipt_idx").on(table.receiptId),
  check("purchase_receipt_lines_quantity_positive", sql`${table.quantity} > 0`),
  check("purchase_receipt_lines_cost_nonnegative", sql`${table.unitCost} >= 0 and ${table.totalCost} >= 0`),
]);

export const purchaseReceiptPaymentsTable = pgTable("purchase_receipt_payments", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id").notNull().references(() => purchaseReceiptsTable.id, { onDelete: "restrict" }),
  paymentKey: text("payment_key").notNull(),
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  amount: numeric("amount", { precision: 19, scale: 4, mode: "string" }).notNull(),
  paymentSource: text("payment_source").notNull(),
  paymentReference: text("payment_reference"),
  createdBy: integer("created_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("purchase_receipt_payments_receipt_key_unique").on(table.receiptId, table.paymentKey),
  index("purchase_receipt_payments_receipt_idx").on(table.receiptId),
  check("purchase_receipt_payments_amount_positive", sql`${table.amount} > 0`),
  check("purchase_receipt_payments_source", sql`${table.paymentSource} in ('company_account', 'owner_account')`),
]);

export const manufacturingInputLinesTable = pgTable("manufacturing_input_lines", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => manufacturingBatchesTable.id, { onDelete: "cascade" }),
  materialProductId: integer("material_product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  unitCostSnapshot: numeric("unit_cost_snapshot", { precision: 19, scale: 4 }).notNull().default("0"),
  totalCost: numeric("total_cost", { precision: 19, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("manufacturing_input_lines_batch_material_unique").on(table.batchId, table.materialProductId),
  check("manufacturing_input_lines_quantity_positive", sql`${table.quantity} > 0`),
  check("manufacturing_input_lines_cost_nonnegative", sql`${table.unitCostSnapshot} >= 0 and ${table.totalCost} >= 0`),
]);

export const insertPurchaseReceiptSchema = createInsertSchema(purchaseReceiptsTable).omit({ id: true, createdAt: true });
export const insertPurchaseReceiptLineSchema = createInsertSchema(purchaseReceiptLinesTable).omit({ id: true, createdAt: true });
export const insertManufacturingInputLineSchema = createInsertSchema(manufacturingInputLinesTable).omit({ id: true, createdAt: true });
export const insertPurchaseReceiptPaymentSchema = createInsertSchema(purchaseReceiptPaymentsTable).omit({ id: true, createdAt: true });