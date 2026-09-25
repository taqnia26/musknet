import { sql } from "drizzle-orm";
import { check, date, index, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { adminUsersTable } from "./admin-users";
import { ownerUsersTable } from "./owner-users";
import { journalEntriesTable } from "./accounting";

export const ownerObligationsTable = pgTable("owner_obligations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 19, scale: 4, mode: "string" }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  recurrence: text("recurrence").notNull().default("once"),
  liableParty: text("liable_party").notNull(),
  clientKey: text("client_key").notNull(),
  renewalOf: integer("renewal_of"),
  createdBy: integer("created_by").notNull().references(() => ownerUsersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("owner_obligations_client_key_unique").on(t.clientKey),
  uniqueIndex("owner_obligations_renewal_of_unique").on(t.renewalOf),
  check("owner_obligations_amount_positive", sql`${t.amount} > 0`),
  check("owner_obligations_party_valid", sql`${t.liableParty} in ('owner', 'company')`),
  check("owner_obligations_recurrence_valid", sql`${t.recurrence} in ('once', 'monthly')`),
]);

export const ownerObligationEventsTable = pgTable("owner_obligation_events", {
  id: serial("id").primaryKey(),
  obligationId: integer("obligation_id").notNull().references(() => ownerObligationsTable.id),
  kind: text("kind").notNull(),
  amount: numeric("amount", { precision: 19, scale: 4, mode: "string" }),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  payer: text("payer"),
  status: text("status").notNull().default("pending"),
  clientKey: text("client_key").notNull(),
  evidence: text("evidence"),
  accountCode: text("account_code"),
  reason: text("reason"),
  journalEntryId: integer("journal_entry_id").references(() => journalEntriesTable.id),
  correctionReason: text("correction_reason"),
  correctionEvidence: text("correction_evidence"),
  correctedBy: integer("corrected_by").references(() => adminUsersTable.id),
  correctedAt: timestamp("corrected_at", { withTimezone: true }),
  reversalEntryId: integer("reversal_entry_id").references(() => journalEntriesTable.id),
  createdByOwner: integer("created_by_owner").references(() => ownerUsersTable.id),
  reviewedBy: integer("reviewed_by").references(() => adminUsersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("owner_obligation_events_client_key_unique").on(t.clientKey),
  uniqueIndex("owner_obligation_events_journal_unique").on(t.journalEntryId),
  index("owner_obligation_events_obligation_idx").on(t.obligationId),
  check("owner_obligation_events_kind_valid", sql`${t.kind} in ('payment', 'transfer')`),
  check("owner_obligation_events_status_valid", sql`${t.status} in ('pending', 'approved', 'rejected', 'corrected')`),
  check("owner_obligation_events_amount_valid", sql`${t.amount} is null or ${t.amount} > 0`),
]);

export const ownerObligationInstallmentsTable = pgTable("owner_obligation_installments", {
  id: serial("id").primaryKey(),
  obligationId: integer("obligation_id").notNull().references(() => ownerObligationsTable.id),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  amount: numeric("amount", { precision: 19, scale: 4, mode: "string" }).notNull(),
  createdBy: integer("created_by").notNull().references(() => ownerUsersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("owner_obligation_installments_obligation_idx").on(t.obligationId),
  check("owner_obligation_installments_amount_positive", sql`${t.amount} > 0`),
]);

export const ownerInstallmentRevisionsTable = pgTable("owner_installment_revisions", {
  id: serial("id").primaryKey(),
  installmentId: integer("installment_id").notNull().references(() => ownerObligationInstallmentsTable.id),
  previousDate: date("previous_date", { mode: "string" }).notNull(),
  previousAmount: numeric("previous_amount", { precision: 19, scale: 4, mode: "string" }).notNull(),
  nextDate: date("next_date", { mode: "string" }).notNull(),
  nextAmount: numeric("next_amount", { precision: 19, scale: 4, mode: "string" }).notNull(),
  changedBy: integer("changed_by").notNull().references(() => ownerUsersTable.id),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ownerJournalReviewsTable = pgTable("owner_journal_reviews", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").notNull().references(() => journalEntriesTable.id),
  decision: text("decision").notNull(),
  reason: text("reason").notNull(),
  evidence: text("evidence").notNull(),
  reviewedBy: integer("reviewed_by").notNull().references(() => adminUsersTable.id),
  reversalEntryId: integer("reversal_entry_id").references(() => journalEntriesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("owner_journal_reviews_entry_unique").on(t.journalEntryId),
  check("owner_journal_reviews_decision_valid", sql`${t.decision} in ('retain', 'reverse')`),
]);

export const insertOwnerObligationSchema = createInsertSchema(ownerObligationsTable);
export const insertOwnerObligationEventSchema = createInsertSchema(ownerObligationEventsTable);
export const insertOwnerObligationInstallmentSchema = createInsertSchema(ownerObligationInstallmentsTable);
export const insertOwnerInstallmentRevisionSchema = createInsertSchema(ownerInstallmentRevisionsTable);
export const insertOwnerJournalReviewSchema = createInsertSchema(ownerJournalReviewsTable);