import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error("MIGRATION_DATABASE_URL is not set.");
  }

  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  console.log("Running drizzle-kit table migrations...");
  await migrate(db, { migrationsFolder: "./db/migrations" });

  console.log("Applying hand-authored SQL (functions, triggers, RLS)...");
  const sqlDir = path.join(__dirname, "sql");
  const files = readdirSync(sqlDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    console.log(`  -> ${file}`);
    const sqlText = readFileSync(path.join(sqlDir, file), "utf-8");
    await migrationClient.unsafe(sqlText);
  }

  console.log("Done.");
  await migrationClient.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
