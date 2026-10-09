import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import postgres from "postgres";

/**
 * Read-only check for the exact failure mode this session's incident was
 * about: a table existing in the schema but keepbooks_app missing a real
 * GRANT on it. Two phases, same structure as scripts/inspect-user-client-
 * views-access.ts — schema/grant inspection via MIGRATION_DATABASE_URL,
 * then (when available) a live SELECT via DATABASE_URL (as keepbooks_app)
 * using the exact set_config() pattern withUserContext() uses, not just an
 * information_schema lookup, since that's the only way to prove the actual
 * runtime path requireCurrentUser() -> hasAcceptedCurrentLegalTerms() takes
 * actually works, rather than inferring it from grants alone.
 *
 * DATABASE_URL is optional: some environments (e.g. a Codespace with only
 * the migration role's credentials) can't obtain the keepbooks_app
 * connection string at all. When it's not set, phase 2 is skipped with a
 * note and only the MIGRATION_DATABASE_URL checks run.
 *
 * Usage: pnpm check-legal-acceptances-access
 */
async function main() {
  const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  const appDatabaseUrl = process.env.DATABASE_URL;
  if (!migrationDatabaseUrl) throw new Error("MIGRATION_DATABASE_URL is not set.");

  const adminSql = postgres(migrationDatabaseUrl, { max: 1, prepare: false });
  const appSql = appDatabaseUrl ? postgres(appDatabaseUrl, { max: 1, prepare: false }) : null;

  console.log("\n1. Table + RLS state (via MIGRATION_DATABASE_URL)\n" + "=".repeat(50));
  const [tableInfo] = await adminSql<{ exists: boolean; rowsecurity: boolean }[]>`
    select true as exists, relrowsecurity as rowsecurity
    from pg_class where relname = 'legal_acceptances' and relkind = 'r'
  `;
  if (!tableInfo) {
    console.log("legal_acceptances does not exist — migration 024 did not apply (or applied against a different database than DATABASE_URL points at).");
    await adminSql.end();
    await appSql?.end();
    return;
  }
  console.log(`Table exists: yes. Row-level security enabled: ${tableInfo.rowsecurity ? "yes" : "NO — unexpected, check 024 applied"}`);

  const policies = await adminSql<{ policyname: string; cmd: string }[]>`
    select policyname, cmd from pg_policies where tablename = 'legal_acceptances'
  `;
  console.log(`Policies: ${policies.length === 0 ? "none (unexpected)" : policies.map((p) => `${p.policyname} (${p.cmd})`).join(", ")}`);

  const grants = await adminSql<{ privilege_type: string }[]>`
    select privilege_type from information_schema.role_table_grants
    where table_name = 'legal_acceptances' and grantee = 'keepbooks_app'
  `;
  const grantedPrivileges = grants.map((g) => g.privilege_type).sort();
  console.log(`keepbooks_app table-level grants: ${grantedPrivileges.length === 0 ? "NONE — this is the bug" : grantedPrivileges.join(", ")}`);

  console.log("\n2. Live SELECT as keepbooks_app, scoped to a real signed-in user (via DATABASE_URL)\n" + "=".repeat(50));
  if (!appSql) {
    console.log("SKIPPED — DATABASE_URL is not set in this environment. Phase 1's grants check above is the only signal for keepbooks_app access; it is not a substitute for a live query as that role.");
    await adminSql.end();
    return;
  }

  const [anyUser] = await adminSql<{ id: string; email: string }[]>`select id, email from users limit 1`;
  if (!anyUser) {
    console.log("No users exist in this database — can't run the live test. (Schema/grant checks above are still valid.)");
    await adminSql.end();
    await appSql.end();
    return;
  }

  try {
    const rows = await appSql.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', ${anyUser.id}, true)`;
      return tx<{ count: number }[]>`select count(*)::int as count from legal_acceptances`;
    });
    console.log(`SUCCESS — keepbooks_app can query legal_acceptances as ${anyUser.email} (the exact path hasAcceptedCurrentLegalTerms() takes).`);
    console.log(`Rows currently visible to that user under RLS: ${rows[0].count}`);
  } catch (err) {
    const pgErr = err as { code?: string; message?: string; detail?: string; hint?: string };
    console.log("FAILED — this is the exact error every protected page would hit right now:");
    console.log(`  code:    ${pgErr.code ?? "(none)"}`);
    console.log(`  message: ${pgErr.message ?? String(err)}`);
    if (pgErr.detail) console.log(`  detail:  ${pgErr.detail}`);
    if (pgErr.hint) console.log(`  hint:    ${pgErr.hint}`);
  }

  await adminSql.end();
  await appSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
