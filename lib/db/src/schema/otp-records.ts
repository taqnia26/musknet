import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const otpRecordsTable = pgTable("storefront_otp_records", {
  phone: text("phone").primaryKey(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOtpRecordSchema = createInsertSchema(otpRecordsTable).omit({ createdAt: true });
export type InsertOtpRecord = z.infer<typeof insertOtpRecordSchema>;
export type OtpRecord = typeof otpRecordsTable.$inferSelect;