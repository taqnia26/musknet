import {
  boolean,
  doublePrecision,
  date,
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
import { categoriesTable } from "./categories";

export type ProductImage = {
  url: string;
  alt: string;
};

export type ProductNote = {
  type: "top" | "heart" | "base";
  nameAr: string;
  nameEn: string;
};

export const productsTable = pgTable("storefront_products", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  descriptionAr: text("description_ar").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  slug: text("slug").notNull(),
  price: doublePrecision("price").notNull(),
  compareAtPrice: doublePrecision("compare_at_price"),
  weightKg: doublePrecision("weight_kg").notNull().default(0),
  costPrice: doublePrecision("cost_price").notNull().default(0),
  discountPrice: doublePrecision("discount_price"),
  discountEndsOn: date("discount_ends_on", { mode: "string" }),
  mpn: text("mpn"),
  brand: text("brand"),
  subtitleAr: text("subtitle_ar"),
  promotionalTitleAr: text("promotional_title_ar"),
  maxPerCustomer: integer("max_per_customer"),
  requiresShipping: boolean("requires_shipping").notNull().default(true),
  allowOrderAttachment: boolean("allow_order_attachment").notNull().default(false),
  allowCustomerNote: boolean("allow_customer_note").notNull().default(false),
  taxable: boolean("taxable").notNull().default(true),
  registrationNumber: text("registration_number"),
  tags: text("tags").array().notNull().default([]),
  seoTitleAr: text("seo_title_ar"),
  seoDescriptionAr: text("seo_description_ar"),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id, { onDelete: "restrict" }),
  images: jsonb("images").$type<ProductImage[]>().notNull().default([]),
  notes: jsonb("notes").$type<ProductNote[]>().notNull().default([]),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  reorderPoint: integer("reorder_point").notNull().default(5),
  targetStockQuantity: integer("target_stock_quantity").notNull().default(20),
  averageCost: numeric("average_cost", { precision: 19, scale: 4, mode: "string" }).notNull().default("0"),
  sku: text("sku"),
  barcode: text("barcode"),
  operationalType: text("operational_type").notNull().default("finished_good"),
  unitOfMeasure: text("unit_of_measure").notNull().default("unit"),
  preferredSupplier: text("preferred_supplier"),
  sellable: boolean("sellable").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  isBestseller: boolean("is_bestseller").notNull().default(false),
  showOnDistributors: boolean("show_on_distributors").notNull().default(true),
  distributorNameOverride: text("distributor_name_override"),
  distributorImageOverride: text("distributor_image_override"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("storefront_products_slug_unique").on(table.slug),
  uniqueIndex("storefront_products_sku_unique").on(table.sku),
]);

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;