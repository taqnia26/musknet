import { check, date, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";

export const uploadedContractFilesTable = pgTable("uploaded_contract_files", {
  id: serial("id").primaryKey(),
  ownerType: text("owner_type").notNull(),
  ownerId: integer("owner_id").notNull(),
  ownerName: text("owner_name").notNull(),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  notes: text("notes"),
  contractType: text("contract_type"),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }),
  paymentTerm: text("payment_term"),
  paymentDays: integer("payment_days"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  signedDate: date("signed_date", { mode: "string" }),
  termsConfirmedAt: timestamp("terms_confirmed_at", { withTimezone: true }),
  termsConfirmedBy: integer("terms_confirmed_by").references(() => adminUsersTable.id, { onDelete: "restrict" }),
  creditLimit: numeric("credit_limit", { precision: 14, scale: 2 }),
  creditLimitApprovedBy: integer("credit_limit_approved_by").references(() => adminUsersTable.id, { onDelete: "restrict" }),
  creditLimitApprovedAt: timestamp("credit_limit_approved_at", { withTimezone: true }),
  creditLimitApprovalReason: text("credit_limit_approval_reason"),
  uploadedBy: integer("uploaded_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("uploaded_contract_files_credit_limit_nonnegative", sql`${table.creditLimit} is null or ${table.creditLimit} >= 0`),
  check("uploaded_contract_files_credit_approval_complete", sql`
    (${table.creditLimitApprovedBy} is null and ${table.creditLimitApprovedAt} is null and ${table.creditLimitApprovalReason} is null)
    or (${table.creditLimit} is not null and ${table.creditLimitApprovedBy} is not null and
      ${table.creditLimitApprovedAt} is not null and length(trim(${table.creditLimitApprovalReason})) between 10 and 500)
  `),
  uniqueIndex("uploaded_contract_files_object_path_unique").on(table.objectPath),
]);

export const insertUploadedContractFileSchema = createInsertSchema(uploadedContractFilesTable)
  .omit({ id: true, uploadedAt: true });
export type InsertUploadedContractFile = z.infer<typeof insertUploadedContractFileSchema>;
export type UploadedContractFile = typeof uploadedContractFilesTable.$inferSelect;