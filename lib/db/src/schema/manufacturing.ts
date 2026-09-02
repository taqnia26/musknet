import { check, date, doublePrecision, integer, pgEnum, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { productsTable } from "./products";

export const manufacturingBatchStatusEnum = pgEnum("manufacturing_batch_status", ["in_production", "completed", "quality_check", "approved", "rejected"]);

export const manufacturingBatchesTable = pgTable("manufacturing_batches", {
  id: serial("id").primaryKey(),
  batchNumber: text("batch_number").notNull(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  quantityProduced: integer("quantity_produced").notNull(),
  productionDate: date("production_date", { mode: "string" }).notNull(),
  expiryDate: date("expiry_date", { mode: "string" }),
  costPerUnit: doublePrecision("cost_per_unit").notNull(),
  status: manufacturingBatchStatusEnum("status").notNull(),
}, (table) => [
  uniqueIndex("manufacturing_batch_number_unique").on(table.batchNumber),
  check("manufacturing_quantity_positive", sql`${table.quantityProduced} > 0`),
  check("manufacturing_cost_nonnegative", sql`${table.costPerUnit} >= 0`),
  check("manufacturing_dates_valid", sql`${table.expiryDate} is null or ${table.expiryDate} >= ${table.productionDate}`),
]);

export const insertManufacturingBatchSchema = createInsertSchema(manufacturingBatchesTable).omit({ id: true });