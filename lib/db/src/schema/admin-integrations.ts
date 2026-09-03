import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";

export const adminIntegrationsTable = pgTable("admin_integrations", {
  providerId: text("provider_id").primaryKey(),
  status: text("status").notNull().default("configured"),
  accountLabel: text("account_label"),
  apiBaseUrl: text("api_base_url"),
  configuredBy: integer("configured_by").references(() => adminUsersTable.id, { onDelete: "set null" }),
  configuredAt: timestamp("configured_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAdminIntegrationSchema = createInsertSchema(adminIntegrationsTable);
export type InsertAdminIntegration = z.infer<typeof insertAdminIntegrationSchema>;
export type AdminIntegration = typeof adminIntegrationsTable.$inferSelect;