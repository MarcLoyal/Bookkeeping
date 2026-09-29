import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import postgres from "postgres";

/**
 * One-off gap-filler: db/seed.ts only inserts its demo users the very
 * first time it runs (it short-circuits entirely once "Keep.Books Demo
 * Firm" already exists — see its own top-of-main comment), so a project
 * seeded before encoder/viewer were added to that script never got them
 * and re-running `pnpm seed` is a no-op. This inserts just the missing
 * viewer@keepbooks.demo row into the existing demo firm, matching
 * db/seed.ts's own values exactly. Idempotent (ON CONFLICT on the unique
 * email index) — safe to re-run, and does nothing if the row already
 * exists. Does NOT touch encoder@keepbooks.demo or any other row.
 *
 * Run `pnpm migrate-demo-users` afterward to turn this into a real,
 * loggable-into Supabase Auth identity — same as every other demo user.
 */
async function main() {
  const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!migrationDatabaseUrl) throw new Error("MIGRATION_DATABASE_URL is not set.");

  const sql = postgres(migrationDatabaseUrl, { max: 1, prepare: false });

  const [firm] = await sql<{ id: string }[]>`select id from firms where name = 'Keep.Books Demo Firm'`;
  if (!firm) {
    throw new Error('No "Keep.Books Demo Firm" found — run `pnpm seed` first.');
  }

  const inserted = await sql<{ id: string }[]>`
    insert into users (id, firm_id, email, name, role, access_scope)
    values (gen_random_uuid(), ${firm.id}, 'viewer@keepbooks.demo', 'Vic Viewer', 'viewer', 'all')
    on conflict (email) do nothing
    returning id
  `;

  if (inserted.length > 0) {
    console.log(`Inserted viewer@keepbooks.demo (${inserted[0].id}) into the demo firm.`);
  } else {
    console.log("viewer@keepbooks.demo already exists — nothing to do.");
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
