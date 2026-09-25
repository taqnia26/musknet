import { check, date, index, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminUsersTable } from "./admin-users";
import { productsTable } from "./products";

export const productionPlansTable = pgTable("production_plans", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  category: text("category").notNull(),
  productType: text("product_type").notNull(),
  priority: text("priority").notNull().default("normal"),
  targetLaunchDate: date("target_launch_date", { mode: "string" }),
  targetProductionDate: date("target_production_date", { mode: "string" }),
  plannedQuantity: integer("planned_quantity").notNull(),
  manufacturingCountry: text("manufacturing_country").notNull(),
  factory: text("factory").notNull(),
  estimatedCost: numeric("estimated_cost", { precision: 19, scale: 4, mode: "string" }).notNull(),
  status: text("status").notNull().default("planning"),
  notes: text("notes").notNull().default(""),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  securedAt: timestamp("secured_at", { withTimezone: true }),
  securedBy: integer("secured_by").references(() => adminUsersTable.id, { onDelete: "set null" }),
  fundingNote: text("funding_note"),
  createdBy: integer("created_by").references(() => adminUsersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("production_plans_status_idx").on(table.status),
  index("production_plans_product_idx").on(table.productId),
  check("production_plans_quantity_positive", sql`${table.plannedQuantity} > 0`),
  check("production_plans_cost_nonnegative", sql`${table.estimatedCost} >= 0`),
  check("production_plans_priority_valid", sql`${table.priority} IN ('low', 'normal', 'high', 'urgent')`),
  check("production_plans_status_valid", sql`${table.status} IN ('future', 'planning', 'under_review', 'approved', 'scheduled', 'in_production', 'completed', 'on_hold', 'cancelled')`),
]);

export const insertProductionPlanSchema = createInsertSchema(productionPlansTable).omit({
  id: true, approvedAt: true, securedAt: true, securedBy: true, fundingNote: true,
  createdBy: true, createdAt: true, updatedAt: true,
});
export type InsertProductionPlan = z.infer<typeof insertProductionPlanSchema>;
export type ProductionPlan = typeof productionPlansTable.$inferSelect;