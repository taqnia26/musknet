import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: "./drizzle",
  dialect: "postgresql",
  // Manual recovery archives live outside public and must never be pushed.
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
