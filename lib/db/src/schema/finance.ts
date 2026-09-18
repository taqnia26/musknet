import { check, date, doublePrecision, integer, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { adminUsersTable } from "./admin-users";

export const expenseCategoryEnum = pgEnum("expense_category", ["rent", "salaries", "utilities", "marketing", "shipping", "other"]);
export const financialPeriodStatusEnum = pgEnum("financial_period_status", ["draft", "closed"]);
export const purchaseCategoryEnum = pgEnum("purchase_category", ["direct_materials_oils", "travel_tickets", "meeting_hospitality", "shipping", "marketing", "utilities", "other"]);
export const purchasePaymentSourceEnum = pgEnum("purchase_payment_source", ["company_account", "owner_account"]);

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  category: expenseCategoryEnum("category").notNull(),
  amount: doublePrecision("amount").notNull(),
  description: text("description").notNull(),
  expenseDate: date("expense_date", { mode: "string" }).notNull(),
  receiptUrl: text("receipt_url"),
  idempotencyKey: text("idempotency_key"),
  createdBy: integer("created_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("expenses_idempotency_key_unique").on(table.idempotencyKey),
  check("expenses_amount_positive", sql`${table.amount} > 0`),
]);

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 19, scale: 4, mode: "string" }).notNull(),
  purchaseDate: date("purchase_date", { mode: "string" }).notNull(),
  notes: text("notes"),
  category: purchaseCategoryEnum("category").notNull(),
  paymentSource: purchasePaymentSourceEnum("payment_source").notNull(),
  invoiceObjectPath: text("invoice_object_path"),
  invoiceContentType: text("invoice_content_type"),
  invoiceSize: integer("invoice_size"),
  idempotencyKey: text("idempotency_key"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdBy: integer("created_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("purchases_idempotency_key_unique").on(table.idempotencyKey),
  check("purchases_amount_positive", sql`${table.amount} > 0`),
  check("purchases_invoice_size_valid", sql`${table.invoiceSize} is null or (${table.invoiceSize} > 0 and ${table.invoiceSize} <= 10485760)`),
]);

export const financialPeriodsTable = pgTable("financial_periods", {
  id: serial("id").primaryKey(),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  totalRevenue: doublePrecision("total_revenue").notNull(),
  totalExpenses: doublePrecision("total_expenses").notNull(),
  netProfit: doublePrecision("net_profit").notNull(),
  status: financialPeriodStatusEnum("status").notNull().default("draft"),
}, (table) => [
  check("financial_period_dates_valid", sql`${table.periodEnd} >= ${table.periodStart}`),
  check("financial_period_totals_nonnegative", sql`${table.totalRevenue} >= 0 and ${table.totalExpenses} >= 0`),
]);

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true, createdAt: true });
export const insertFinancialPeriodSchema = createInsertSchema(financialPeriodsTable).omit({ id: true });