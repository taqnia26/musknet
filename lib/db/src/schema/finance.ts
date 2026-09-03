import { check, date, doublePrecision, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { adminUsersTable } from "./admin-users";

export const expenseCategoryEnum = pgEnum("expense_category", ["rent", "salaries", "utilities", "marketing", "shipping", "other"]);
export const financialPeriodStatusEnum = pgEnum("financial_period_status", ["draft", "closed"]);

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
export const insertFinancialPeriodSchema = createInsertSchema(financialPeriodsTable).omit({ id: true });