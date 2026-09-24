import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";
import { wholesaleDistributorsTable } from "./wholesale-distributors";

export const distributorContractStatuses = ["draft", "seller_signed", "sent", "final", "cancelled"] as const;
export type DistributorContractStatus = typeof distributorContractStatuses[number];

export const distributorContractsTable = pgTable("distributor_contracts", {
  id: serial("id").primaryKey(),
  contractNumber: text("contract_number").notNull(),
  distributorId: integer("distributor_id").references(() => wholesaleDistributorsTable.id, { onDelete: "set null" }),
  contractType: text("contract_type").notNull(),
  templateVersion: integer("template_version").notNull().default(0),
  status: text("status").notNull().default("draft"),
  contractDate: timestamp("contract_date", { withTimezone: true }),
  hijriDateStr: text("hijri_date_str"),
  gregorianDateStr: text("gregorian_date_str"),
  contractDayName: text("contract_day_name"),
  sellerName: text("seller_name").notNull(),
  sellerCrNumber: text("seller_cr_number").notNull(),
  sellerCrDate: text("seller_cr_date").notNull(),
  sellerCrIssuer: text("seller_cr_issuer").notNull(),
  sellerAddress: text("seller_address").notNull(),
  sellerRepName: text("seller_rep_name").notNull(),
  sellerRepTitle: text("seller_rep_title").notNull(),
  buyerCompanyName: text("buyer_company_name").notNull(),
  buyerCrNumber: text("buyer_cr_number"),
  buyerCrDate: text("buyer_cr_date"),
  buyerCrIssuer: text("buyer_cr_issuer"),
  buyerNeighborhood: text("buyer_neighborhood"),
  buyerCity: text("buyer_city"),
  buyerPoBox: text("buyer_po_box"),
  buyerPostalCode: text("buyer_postal_code"),
  buyerRepName: text("buyer_rep_name"),
  buyerRepTitle: text("buyer_rep_title"),
  buyerEmail: text("buyer_email"),
  buyerPhone: text("buyer_phone"),
  showroomName: text("showroom_name"),
  showroomLocation: text("showroom_location"),
  showroomCity: text("showroom_city"),
  marginPercent: numeric("margin_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  minOrderValue: numeric("min_order_value", { precision: 12, scale: 2 }).notNull().default("3000"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default("15"),
  latePaymentWeeklyRate: numeric("late_payment_weekly_rate", { precision: 5, scale: 2 }).notNull().default("2"),
  latePaymentCapRate: numeric("late_payment_cap_rate", { precision: 5, scale: 2 }).notNull().default("10"),
  inspectionDays: integer("inspection_days").notNull().default(7),
  warrantyMonths: integer("warranty_months").notNull().default(6),
  deliveryDays: integer("delivery_days").notNull().default(15),
  paymentDays: integer("payment_days").notNull().default(30),
  products: jsonb("products").$type<unknown[]>().notNull().default([]),
  notes: text("notes"),
  signingTokenHash: text("signing_token_hash"),
  signingTokenExpiresAt: timestamp("signing_token_expires_at", { withTimezone: true }),
  sentForSignatureAt: timestamp("sent_for_signature_at", { withTimezone: true }),
  sellerSignaturePath: text("seller_signature_path"),
  sellerSignedAt: timestamp("seller_signed_at", { withTimezone: true }),
  sellerSignedBy: text("seller_signed_by"),
  sellerSignedByUserId: integer("seller_signed_by_user_id").references(() => adminUsersTable.id, { onDelete: "set null" }),
  sellerSignedIp: text("seller_signed_ip"),
  buyerSignaturePath: text("buyer_signature_path"),
  buyerSignedAt: timestamp("buyer_signed_at", { withTimezone: true }),
  buyerSignedName: text("buyer_signed_name"),
  buyerSignedIp: text("buyer_signed_ip"),
  buyerSignedUserAgent: text("buyer_signed_user_agent"),
  downloadTokenHash: text("download_token_hash"),
  downloadTokenExpiresAt: timestamp("download_token_expires_at", { withTimezone: true }),
  finalPdfPath: text("final_pdf_path"),
  createdBy: integer("created_by").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("distributor_contracts_number_unique").on(table.contractNumber),
  uniqueIndex("distributor_contracts_signing_token_unique").on(table.signingTokenHash),
  uniqueIndex("distributor_contracts_download_token_unique").on(table.downloadTokenHash),
]);

export const insertDistributorContractSchema = createInsertSchema(distributorContractsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDistributorContract = z.infer<typeof insertDistributorContractSchema>;
export type DistributorContract = typeof distributorContractsTable.$inferSelect;