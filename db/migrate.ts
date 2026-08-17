import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const APP_ROLE = "keepbooks_app";

/**
 * db/sql/001_functions_triggers_rls.sql GRANTs to `keepbooks_app` but never
 * creates it — this sandbox's local Postgres had that role pre-provisioned
 * outside the committed migration path, which meant the pipeline wasn't
 * actually reproducible against a genuinely fresh database (e.g. a new
 * Supabase project). This closes that gap: idempotent (a pre-existing role's
 * password is left untouched), and only prints a DATABASE_URL when it
 * actually created the role, since only then do we know its password.
 */
async function ensureAppRole(migrationClient: postgres.Sql, connectionString: string) {
  const [{ exists }] = await migrationClient<{ exists: boolean }[]>`
    select exists (select 1 from pg_roles where rolname = ${APP_ROLE}) as exists
  `;
  if (exists) {
    console.log(`Role ${APP_ROLE} already exists — leaving it (and its password) untouched.`);
    return;
  }

  const password = process.env.APP_DB_ROLE_PASSWORD || randomBytes(24).toString("base64url");
  console.log(`Role ${APP_ROLE} does not exist — creating it...`);
  await migrationClient.unsafe(`CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${password.replace(/'/g, "''")}'`);

  const url = new URL(connectionString);
  url.username = APP_ROLE;
  url.password = password;
  console.log(`Created ${APP_ROLE}. Set DATABASE_URL to:\n  ${url.toString()}`);
}

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error("MIGRATION_DATABASE_URL is not set.");
  }

  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  console.log(`Ensuring the ${APP_ROLE} role exists...`);
  await ensureAppRole(migrationClient, connectionString);

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
