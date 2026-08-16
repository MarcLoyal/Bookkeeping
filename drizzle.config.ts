import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv({ path: ".env.local" });

if (!process.env.MIGRATION_DATABASE_URL) {
  throw new Error(
    "MIGRATION_DATABASE_URL is not set. Copy .env.example to .env.local and configure it."
  );
}

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
