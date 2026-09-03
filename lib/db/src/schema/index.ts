// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

export * from "./customers";
export * from "./otp-records";
export * from "./carts";
export * from "./cart-items";
export * from "./addresses";
export * from "./orders";
export * from "./order-items";
export * from "./categories";
export * from "./products";
export * from "./coupons";
export * from "./order-addresses";
export * from "./admin-users";
export * from "./admin-sessions";
export * from "./admin-permissions";
export * from "./owner-users";
export * from "./owner-sessions";
export * from "./owner-session-notifications";
export * from "./wholesale-distributors";
export * from "./inventory-movements";
export * from "./hr";
export * from "./finance";
export * from "./manufacturing";
export * from "./exhibitions";
export * from "./invoices";
export * from "./accounting";
