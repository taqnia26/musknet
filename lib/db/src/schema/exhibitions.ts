import { check, date, doublePrecision, integer, pgEnum, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { productsTable } from "./products";

export const exhibitionStatusEnum = pgEnum("exhibition_status", ["planned", "ongoing", "completed", "cancelled"]);

export const exhibitionsTable = pgTable("exhibitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  budget: doublePrecision("budget").notNull(),
  status: exhibitionStatusEnum("status").notNull(),
  notes: text("notes"),
}, (table) => [
  check("exhibition_dates_valid", sql`${table.endDate} >= ${table.startDate}`),
  check("exhibition_budget_nonnegative", sql`${table.budget} >= 0`),
]);

export const exhibitionProductsTable = pgTable("exhibition_products", {
  id: serial("id").primaryKey(),
  exhibitionId: integer("exhibition_id").notNull().references(() => exhibitionsTable.id, { onDelete: "restrict" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "restrict" }),
  quantityAllocated: integer("quantity_allocated").notNull(),
  quantitySold: integer("quantity_sold").notNull().default(0),
}, (table) => [
  uniqueIndex("exhibition_product_unique").on(table.exhibitionId, table.productId),
  check("exhibition_product_quantities_valid", sql`${table.quantityAllocated} >= 0 and ${table.quantitySold} >= 0 and ${table.quantitySold} <= ${table.quantityAllocated}`),
]);

export const insertExhibitionSchema = createInsertSchema(exhibitionsTable).omit({ id: true });
export const insertExhibitionProductSchema = createInsertSchema(exhibitionProductsTable).omit({ id: true });