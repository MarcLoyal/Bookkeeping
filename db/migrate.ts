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
  // Tracked so each file in db/sql/ runs exactly once ever, matching how
  // drizzle-kit's own table migrations behave. Without this, re-running
  // db:migrate against an already-migrated database (e.g. to pick up a new
  // 00N_*.sql file) would re-execute every prior file too — and CREATE
  // TRIGGER / CREATE POLICY aren't idempotent, so that fails outright.
  const [{ existed: trackingTableExisted }] = await migrationClient<{ existed: boolean }[]>`
    select exists (select 1 from pg_tables where tablename = '_sql_migrations_applied') as existed
  `;
  await migrationClient`
    create table if not exists _sql_migrations_applied (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `;
  if (!trackingTableExisted) {
    // First time this tracking mechanism has run. If the database already
    // has 001's functions (i.e. it was migrated before this tracking table
    // existed), backfill that one file as applied so it isn't re-run and
    // hit "trigger/policy already exists" — any genuinely new file still
    // runs normally below.
    const [{ exists: alreadyHas001 }] = await migrationClient<{ exists: boolean }[]>`
      select exists (select 1 from pg_proc where proname = 'app_current_user_id') as exists
    `;
    if (alreadyHas001) {
      console.log("Detected an existing install predating migration tracking — backfilling 001_functions_triggers_rls.sql as already applied.");
      await migrationClient`
        insert into _sql_migrations_applied (filename) values ('001_functions_triggers_rls.sql')
        on conflict do nothing
      `;
    }
  }
  const sqlDir = path.join(__dirname, "sql");
  const files = readdirSync(sqlDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const [already] = await migrationClient`
      select 1 from _sql_migrations_applied where filename = ${file}
    `;
    if (already) {
      console.log(`  -> ${file} (already applied, skipping)`);
      continue;
    }
    console.log(`  -> ${file}`);
    const sqlText = readFileSync(path.join(sqlDir, file), "utf-8");
    await migrationClient.unsafe(sqlText);
    await migrationClient`insert into _sql_migrations_applied (filename) values (${file})`;
  }

  console.log("Done.");
  await migrationClient.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
