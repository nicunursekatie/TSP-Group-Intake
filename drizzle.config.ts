import { defineConfig } from "drizzle-kit";

const dbUrl = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL must be set");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
