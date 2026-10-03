import { check, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { companyOrdersTable } from "./distributor-portal";
import { adminUsersTable } from "./admin-users";

export const orderEditAuditsTable = pgTable("order_edit_audits", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "restrict" }),
  companyOrderId: integer("company_order_id").references(() => companyOrdersTable.id, { onDelete: "restrict" }),
  requestKey: text("request_key").notNull().unique(),
  actorId: integer("actor_id").notNull().references(() => adminUsersTable.id, { onDelete: "restrict" }),
  editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
  beforeSnapshot: jsonb("before_snapshot").$type<Record<string, unknown>>().notNull(),
  afterSnapshot: jsonb("after_snapshot").$type<Record<string, unknown>>().notNull(),
}, (t) => [
  check("order_edit_audits_request_key_check", sql`length(${t.requestKey}) between 16 and 200`),
  check("order_edit_audits_before_snapshot_check", sql`jsonb_typeof(${t.beforeSnapshot}) = 'object'`),
  check("order_edit_audits_after_snapshot_check", sql`jsonb_typeof(${t.afterSnapshot}) = 'object'`),
  check("order_edit_audits_check", sql`(${t.orderId} is not null)::integer + (${t.companyOrderId} is not null)::integer = 1`),
  index("order_edit_audits_order_idx").on(t.orderId, t.editedAt),
  index("order_edit_audits_company_order_idx").on(t.companyOrderId, t.editedAt),
]);
export const insertOrderEditAuditSchema = createInsertSchema(orderEditAuditsTable).omit({ id: true, editedAt: true });
export type InsertOrderEditAudit = z.infer<typeof insertOrderEditAuditSchema>;
export type OrderEditAudit = typeof orderEditAuditsTable.$inferSelect;