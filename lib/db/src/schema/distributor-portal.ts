import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { wholesaleDistributorsTable } from "./wholesale-distributors";
import { adminUsersTable } from "./admin-users";
import { taxInvoicesTable } from "./invoices";
import { productsTable } from "./products";

export const distributorPortalAccountsTable = pgTable("distributor_portal_accounts", {
  id: serial("id").primaryKey(),
  distributorId: integer("distributor_id").notNull().references(() => wholesaleDistributorsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("distributor_portal_accounts_company_unique").on(table.distributorId),
  uniqueIndex("distributor_portal_accounts_email_unique").on(table.email),
]);

export const distributorPortalSessionsTable = pgTable("distributor_portal_sessions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => distributorPortalAccountsTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("distributor_portal_sessions_token_unique").on(table.tokenHash),
  index("distributor_portal_sessions_account_idx").on(table.accountId),
]);

export const distributorPortalLoginAttemptsTable = pgTable("distributor_portal_login_attempts", {
  keyHash: text("key_hash").notNull(),
  failures: integer("failures").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.keyHash] }),
]);

export const companyOrdersTable = pgTable("company_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  distributorId: integer("distributor_id").notNull().references(() => wholesaleDistributorsTable.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("pending_review"),
  idempotencyKey: text("idempotency_key").notNull(),
  contractId: integer("contract_id"),
  uploadedContractFileId: integer("uploaded_contract_file_id"),
  snapshotTerms: jsonb("snapshot_terms").$type<Record<string, unknown>>().notNull(),
  snapshotTotals: jsonb("snapshot_totals").$type<Record<string, number>>().notNull(),
  snapshotFingerprint: text("snapshot_fingerprint").notNull(),
  reviewSnapshot: jsonb("review_snapshot").$type<Record<string, unknown>>(),
  reviewedByAdminId: integer("reviewed_by_admin_id").references(() => adminUsersTable.id, { onDelete: "set null" }),
  decisionAt: timestamp("decision_at", { withTimezone: true }),
  decisionReason: text("decision_reason"),
  invoiceId: integer("invoice_id").references(() => taxInvoicesTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("company_orders_number_unique").on(table.orderNumber),
  uniqueIndex("company_orders_company_key_unique").on(table.distributorId, table.idempotencyKey),
  uniqueIndex("company_orders_invoice_unique").on(table.invoiceId),
  index("company_orders_company_created_idx").on(table.distributorId, table.createdAt),
  index("company_orders_status_created_idx").on(table.status, table.createdAt),
]);

export const companyOrderItemsTable = pgTable("company_order_items", {
  id: serial("id").primaryKey(),
  companyOrderId: integer("company_order_id").notNull().references(() => companyOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  productName: text("product_name").notNull(),
  productNameEn: text("product_name_en").notNull(),
  sku: text("sku"),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
}, (table) => [
  index("company_order_items_order_idx").on(table.companyOrderId),
  uniqueIndex("company_order_items_return_source_unique").on(table.id, table.companyOrderId, table.productId),
]);

export const companyOrderDecisionsTable = pgTable("company_order_decisions", {
  id: serial("id").primaryKey(),
  companyOrderId: integer("company_order_id").notNull().references(() => companyOrdersTable.id, { onDelete: "restrict" }),
  decision: text("decision").notNull(),
  actorAdminId: integer("actor_admin_id").references(() => adminUsersTable.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  reason: text("reason"),
  reviewSnapshot: jsonb("review_snapshot").$type<Record<string, unknown>>().notNull(),
  changesAcknowledged: boolean("changes_acknowledged").notNull().default(false),
});

export const insertDistributorPortalAccountSchema = createInsertSchema(distributorPortalAccountsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDistributorPortalAccount = z.infer<typeof insertDistributorPortalAccountSchema>;
export type DistributorPortalAccount = typeof distributorPortalAccountsTable.$inferSelect;
export type DistributorPortalSession = typeof distributorPortalSessionsTable.$inferSelect;
export type CompanyOrder = typeof companyOrdersTable.$inferSelect;
export type CompanyOrderItem = typeof companyOrderItemsTable.$inferSelect;
export type CompanyOrderDecision = typeof companyOrderDecisionsTable.$inferSelect;