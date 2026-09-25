import { check, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";

export const orderPaymentLinkEmailStatuses = ["pending", "sent", "failed"] as const;

export const orderPaymentLinksTable = pgTable("storefront_order_payment_links", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  providerInvoiceId: text("provider_invoice_id"),
  paymentUrl: text("payment_url"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  emailStatus: text("email_status").notNull().default("pending"),
  emailError: text("email_error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("storefront_order_payment_links_order_id_unique").on(table.orderId),
  uniqueIndex("storefront_order_payment_links_provider_invoice_id_unique").on(table.providerInvoiceId),
  check("storefront_order_payment_links_email_status_check", sql`${table.emailStatus} in ('pending', 'sent', 'failed')`),
]);

export const insertOrderPaymentLinkSchema = createInsertSchema(orderPaymentLinksTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrderPaymentLink = z.infer<typeof insertOrderPaymentLinkSchema>;
export type OrderPaymentLink = typeof orderPaymentLinksTable.$inferSelect;