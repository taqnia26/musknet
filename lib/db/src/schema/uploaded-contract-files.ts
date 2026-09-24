import { date, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
  uploadedBy: integer("uploaded_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uploaded_contract_files_object_path_unique").on(table.objectPath),
]);

export const insertUploadedContractFileSchema = createInsertSchema(uploadedContractFilesTable)
  .omit({ id: true, uploadedAt: true });
export type InsertUploadedContractFile = z.infer<typeof insertUploadedContractFileSchema>;
export type UploadedContractFile = typeof uploadedContractFilesTable.$inferSelect;