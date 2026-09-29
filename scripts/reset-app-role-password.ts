import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { randomBytes } from "node:crypto";
import postgres from "postgres";

const APP_ROLE = "keepbooks_app";

/**
 * Resets keepbooks_app's password and prints the DATABASE_URL to set —
 * needed whenever that password is unknown or lost. db/migrate.ts's
 * ensureAppRole() only ever prints it once, at role-CREATION time; a
 * pre-existing role's password is deliberately left untouched (and thus
 * unprintable) by that script on every later run.
 *
 * Uses MIGRATION_DATABASE_URL (privileged enough to ALTER another role,
 * same as ensureAppRole()'s own CREATE ROLE) to reset the password, then
 * builds DATABASE_URL by copying MIGRATION_DATABASE_URL's host/port/
 * database/query-string and swapping in keepbooks_app + the new
 * password — so pooler-specific settings (sslmode, pgbouncer params,
 * etc.) carry over exactly rather than being retyped by hand.
 */
async function main() {
  const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!migrationDatabaseUrl) throw new Error("MIGRATION_DATABASE_URL is not set.");

  const sql = postgres(migrationDatabaseUrl, { max: 1, prepare: false });

  const [{ exists }] = await sql<{ exists: boolean }[]>`
    select exists (select 1 from pg_roles where rolname = ${APP_ROLE}) as exists
  `;
  if (!exists) {
    await sql.end();
    throw new Error(`Role ${APP_ROLE} does not exist yet — run \`pnpm db:migrate\` first, which creates it and prints its password.`);
  }

  const password = randomBytes(24).toString("base64url");
  await sql.unsafe(`ALTER ROLE ${APP_ROLE} WITH PASSWORD '${password.replace(/'/g, "''")}'`);
  await sql.end();

  const url = new URL(migrationDatabaseUrl);
  url.username = APP_ROLE;
  url.password = password;

  console.log(`Reset ${APP_ROLE}'s password.\n`);
  console.log(`Set DATABASE_URL to:\n  ${url.toString()}\n`);
  console.log("Add that line to .env.local (locally) and to your hosting provider's environment variables (deployed).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
