import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import postgres from "postgres";

/**
 * Read-only diagnostic for a reported cross-firm leak in the dashboard's
 * "Recent Activity" panel (audit_log). Run this against your REAL
 * production MIGRATION_DATABASE_URL to check what's actually live, since
 * this sandbox could not reproduce the leak against the RLS policies
 * currently committed in db/sql/ — the two leading explanations are (a)
 * production is missing a migration this sandbox has applied, or (b) the
 * leak isn't a data leak at all but a caching issue. This script only
 * checks (a); see DECISIONS.md for the full investigation.
 *
 * Prints:
 *   1. Every db/sql/*.sql migration filename vs what's actually recorded
 *      in _sql_migrations_applied — anything "in repo, NOT applied" is a
 *      direct, concrete lead.
 *   2. Whether RLS is enabled on audit_log/users/clients, and the live
 *      text of every policy on each — compare this output directly
 *      against db/sql/001_functions_triggers_rls.sql (and 006, 007) by
 *      eye; a mismatch here is the smoking gun if there is one.
 *
 * DATABASE_URL/MIGRATION_DATABASE_URL not in your .env.local? They're
 * whatever your deployed app's env vars are set to (check your hosting
 * provider's project settings) — the app is clearly connecting with them
 * successfully already, so copying those same values locally is safe and
 * won't change anything live. This script never writes anything.
 *
 * Usage: pnpm tsx scripts/diagnose-audit-log-rls.ts
 */
async function main() {
  const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!migrationDatabaseUrl) throw new Error("MIGRATION_DATABASE_URL is not set.");
  const sql = postgres(migrationDatabaseUrl, { max: 1, prepare: false });

  console.log("\n1. Applied migrations (from _sql_migrations_applied)\n" + "=".repeat(60));
  try {
    const applied = await sql<{ filename: string; applied_at: Date }[]>`
      select filename, applied_at from _sql_migrations_applied order by applied_at
    `;
    if (applied.length === 0) {
      console.log("  _sql_migrations_applied is EMPTY or the table doesn't exist — no hand-authored db/sql/ migrations have ever been applied here.");
    } else {
      applied.forEach((r) => console.log(`  ${r.applied_at.toISOString()}  ${r.filename}`));
    }
    console.log(`\n  ${applied.length} migration(s) applied. Compare this list by eye against the files in db/sql/ —`);
    console.log(`  anything present in db/sql/ but missing here is a real, direct lead: that policy/trigger simply isn't live.`);
  } catch (err) {
    console.log("  Could not read _sql_migrations_applied:", err instanceof Error ? err.message : err);
  }

  console.log("\n2. RLS state + live policy text for audit_log, users, clients\n" + "=".repeat(60));
  for (const table of ["audit_log", "users", "clients"]) {
    const [info] = await sql<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      select relrowsecurity, relforcerowsecurity from pg_class where relname = ${table} and relkind = 'r'
    `;
    if (!info) {
      console.log(`\n  ${table}: TABLE NOT FOUND`);
      continue;
    }
    console.log(`\n  ${table}: RLS enabled=${info.relrowsecurity}, forced=${info.relforcerowsecurity}`);
    const policies = await sql<{ polname: string; cmd: string; qual: string | null; with_check: string | null }[]>`
      select polname, case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else '*' end as cmd,
             pg_get_expr(polqual, polrelid) as qual, pg_get_expr(polwithcheck, polrelid) as with_check
      from pg_policy where polrelid = ${table}::regclass
      order by polname
    `;
    if (policies.length === 0) {
      console.log(`    NO POLICIES — every row is either fully visible (if RLS is off) or fully hidden (if RLS is on with no policies).`);
    }
    policies.forEach((p) => {
      console.log(`    [${p.cmd}] ${p.polname}`);
      if (p.qual) console.log(`      USING: ${p.qual}`);
      if (p.with_check) console.log(`      WITH CHECK: ${p.with_check}`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log("Expected (from this repo's db/sql/001_functions_triggers_rls.sql):");
  console.log(`  audit_log_select: app_current_role() IN ('firm_admin','reviewer') AND EXISTS (SELECT 1 FROM users au WHERE au.id = audit_log.actor_user_id AND au.firm_id = app_current_firm_id())`);
  console.log(`  users_select: id = app_current_user_id() OR firm_id = app_current_firm_id()`);
  console.log(`  clients_select: id IN (SELECT app_accessible_client_ids())`);
  console.log("If what printed above for any of these three differs from this, that's the bug.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
