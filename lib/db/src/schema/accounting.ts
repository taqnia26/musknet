import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";
import { expenseCategoryEnum } from "./finance";

export const accountingAccountTypeEnum = pgEnum("accounting_account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);
export const accountingNormalBalanceEnum = pgEnum("accounting_normal_balance", ["debit", "credit"]);
export const journalEntryStatusEnum = pgEnum("journal_entry_status", ["draft", "posted", "reversed"]);
export const journalAuditActionEnum = pgEnum("journal_audit_action", [
  "created",
  "updated",
  "posted",
  "reversed",
]);

export const accountingAccountsTable = pgTable("accounting_accounts", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  accountType: accountingAccountTypeEnum("account_type").notNull(),
  normalBalance: accountingNormalBalanceEnum("normal_balance").notNull(),
  parentId: integer("parent_id").references((): AnyPgColumn => accountingAccountsTable.id, { onDelete: "restrict" }),
  isPosting: boolean("is_posting").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("accounting_accounts_code_unique").on(table.code),
  index("accounting_accounts_parent_idx").on(table.parentId),
  index("accounting_accounts_type_active_idx").on(table.accountType, table.isActive),
  check("accounting_accounts_code_not_blank", sql`btrim(${table.code}) <> ''`),
  check("accounting_accounts_names_not_blank", sql`btrim(${table.nameAr}) <> '' and btrim(${table.nameEn}) <> ''`),
  check("accounting_accounts_parent_not_self", sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`),
]);

export const journalEntriesTable = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  entryNumber: text("entry_number").notNull(),
  entryDate: date("entry_date", { mode: "string" }).notNull(),
  description: text("description").notNull(),
  status: journalEntryStatusEnum("status").notNull().default("draft"),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  reversalOfEntryId: integer("reversal_of_entry_id")
    .references((): AnyPgColumn => journalEntriesTable.id, { onDelete: "restrict" }),
  createdBy: integer("created_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  postedBy: integer("posted_by").references(() => adminUsersTable.id, { onDelete: "restrict" }),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("journal_entries_number_unique").on(table.entryNumber),
  uniqueIndex("journal_entries_source_unique")
    .on(table.sourceType, table.sourceId)
    .where(sql`${table.sourceType} is not null and ${table.sourceId} is not null`),
  uniqueIndex("journal_entries_reversal_unique")
    .on(table.reversalOfEntryId)
    .where(sql`${table.reversalOfEntryId} is not null`),
  index("journal_entries_date_idx").on(table.entryDate),
  index("journal_entries_status_date_idx").on(table.status, table.entryDate),
  check("journal_entries_number_not_blank", sql`btrim(${table.entryNumber}) <> ''`),
  check("journal_entries_description_not_blank", sql`btrim(${table.description}) <> ''`),
  check(
    "journal_entries_source_complete",
    sql`(${table.sourceType} is null and ${table.sourceId} is null) or (btrim(${table.sourceType}) <> '' and btrim(${table.sourceId}) <> '')`,
  ),
  check(
    "journal_entries_posting_audit_valid",
    sql`(${table.status} = 'draft' and ${table.postedAt} is null and ${table.postedBy} is null)
      or (${table.status} in ('posted', 'reversed') and ${table.postedAt} is not null and ${table.postedBy} is not null)`,
  ),
  check(
    "journal_entries_reversal_not_self",
    sql`${table.reversalOfEntryId} is null or ${table.reversalOfEntryId} <> ${table.id}`,
  ),
]);

export const journalEntryLinesTable = pgTable("journal_entry_lines", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").notNull()
    .references(() => journalEntriesTable.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  accountId: integer("account_id").notNull()
    .references(() => accountingAccountsTable.id, { onDelete: "restrict" }),
  description: text("description"),
  debit: numeric("debit", { precision: 19, scale: 4, mode: "string" }).notNull().default("0"),
  credit: numeric("credit", { precision: 19, scale: 4, mode: "string" }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("journal_entry_lines_entry_line_unique").on(table.journalEntryId, table.lineNumber),
  index("journal_entry_lines_account_idx").on(table.accountId),
  check("journal_entry_lines_line_number_positive", sql`${table.lineNumber} > 0`),
  check(
    "journal_entry_lines_single_side_positive",
    sql`(${table.debit} > 0 and ${table.credit} = 0) or (${table.credit} > 0 and ${table.debit} = 0)`,
  ),
]);

export const journalEntryAuditTable = pgTable("journal_entry_audit", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").notNull()
    .references(() => journalEntriesTable.id, { onDelete: "restrict" }),
  action: journalAuditActionEnum("action").notNull(),
  actorId: integer("actor_id").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  changes: jsonb("changes").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("journal_entry_audit_entry_created_idx").on(table.journalEntryId, table.createdAt),
  index("journal_entry_audit_actor_idx").on(table.actorId),
]);

export const expenseCategoryAccountMappingsTable = pgTable("expense_category_account_mappings", {
  category: expenseCategoryEnum("category").primaryKey(),
  accountId: integer("account_id").notNull()
    .references(() => accountingAccountsTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("expense_category_account_mappings_account_unique").on(table.accountId),
]);

export const insertAccountingAccountSchema = createInsertSchema(accountingAccountsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export const insertJournalEntrySchema = createInsertSchema(journalEntriesTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export const insertJournalEntryLineSchema = createInsertSchema(journalEntryLinesTable)
  .omit({ id: true, createdAt: true });
export const insertJournalEntryAuditSchema = createInsertSchema(journalEntryAuditTable)
  .omit({ id: true, createdAt: true });
export const insertExpenseCategoryAccountMappingSchema = createInsertSchema(expenseCategoryAccountMappingsTable)
  .omit({ createdAt: true, updatedAt: true });

export type AccountingAccount = typeof accountingAccountsTable.$inferSelect;
export type InsertAccountingAccount = z.infer<typeof insertAccountingAccountSchema>;
export type JournalEntry = typeof journalEntriesTable.$inferSelect;
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntryLine = typeof journalEntryLinesTable.$inferSelect;
export type InsertJournalEntryLine = z.infer<typeof insertJournalEntryLineSchema>;
export type JournalEntryAudit = typeof journalEntryAuditTable.$inferSelect;
export type InsertJournalEntryAudit = z.infer<typeof insertJournalEntryAuditSchema>;
export type ExpenseCategoryAccountMapping = typeof expenseCategoryAccountMappingsTable.$inferSelect;