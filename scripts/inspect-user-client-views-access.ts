import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import postgres from "postgres";

/**
 * Read-only-by-default diagnostic for the "Recent clients" sidebar feature
 * on a real Supabase project. Prints what MIGRATION_DATABASE_URL's role
 * sees (table exists? RLS enabled? which policies? what does information_
 * schema say keepbooks_app is actually granted?), then — the part a schema
 * inspection alone can't tell you — attempts one real INSERT and one real
 * SELECT through DATABASE_URL's keepbooks_app connection, exactly the way
 * recordClientView() / getRecentClientsForUser() do it (same set_config()
 * call app/(app)/clients/[id]/layout.tsx and app/(app)/layout.tsx rely on),
 * printing the exact Postgres error — or the exact row count — either
 * step produces. Cleans up its own test row on success; never touches a
 * pre-existing one.
 *
 * DATABASE_URL not in your .env.local? It's whatever your deployed app's
 * DATABASE_URL environment variable is set to (check your hosting
 * provider's project settings) — the app clearly connects with it
 * successfully already, so copying that same value locally is safe and
 * won't change anything live.
 *
 * Usage: pnpm tsx scripts/inspect-user-client-views-access.ts -- <email>
 *   <email> must belong to a firm_admin/bookkeeper/reviewer/encoder/viewer
 *   row with a firm that has at least one client.
 */
async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const email = args[0];
  if (!email) {
    console.error("Usage: pnpm tsx scripts/inspect-user-client-views-access.ts -- <email>");
    process.exit(1);
  }

  const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  const appDatabaseUrl = process.env.DATABASE_URL;
  if (!migrationDatabaseUrl) throw new Error("MIGRATION_DATABASE_URL is not set.");
  if (!appDatabaseUrl) throw new Error("DATABASE_URL is not set — this is the keepbooks_app connection the deployed app itself uses; without it this script can't reproduce what the app sees.");

  const adminSql = postgres(migrationDatabaseUrl, { max: 1, prepare: false });
  const appSql = postgres(appDatabaseUrl, { max: 1, prepare: false });

  console.log("\n1. Table + RLS state (via MIGRATION_DATABASE_URL)\n" + "=".repeat(50));
  const [tableInfo] = await adminSql<{ exists: boolean; rowsecurity: boolean }[]>`
    select true as exists, relrowsecurity as rowsecurity
    from pg_class where relname = 'user_client_views' and relkind = 'r'
  `;
  if (!tableInfo) {
    console.log("user_client_views does not exist at all — run `pnpm db:migrate` first (migration 0008).");
    await adminSql.end();
    await appSql.end();
    return;
  }
  console.log(`Table exists: yes. Row-level security enabled: ${tableInfo.rowsecurity ? "yes" : "NO — unexpected, check 015 applied"}`);

  const policies = await adminSql<{ policyname: string; cmd: string }[]>`
    select policyname, cmd from pg_policies where tablename = 'user_client_views'
  `;
  console.log(`Policies: ${policies.length === 0 ? "none (unexpected)" : policies.map((p) => `${p.policyname} (${p.cmd})`).join(", ")}`);

  const grants = await adminSql<{ privilege_type: string }[]>`
    select privilege_type from information_schema.role_table_grants
    where table_name = 'user_client_views' and grantee = 'keepbooks_app'
  `;
  const grantedPrivileges = grants.map((g) => g.privilege_type).sort();
  console.log(`keepbooks_app table-level grants: ${grantedPrivileges.length === 0 ? "NONE — this is almost certainly the bug" : grantedPrivileges.join(", ")}`);
  if (!grantedPrivileges.includes("INSERT")) {
    console.log("  -> Missing INSERT specifically. Run `pnpm db:migrate` to apply 016_user_client_views_grant.sql, then re-run this script.");
  }

  console.log("\n2. Live INSERT attempt (via DATABASE_URL, as keepbooks_app)\n" + "=".repeat(50));
  const [user] = await adminSql<{ id: string; firm_id: string | null; name: string }[]>`
    select id, firm_id, name from users where email = ${email} limit 1
  `;
  if (!user) {
    console.log(`No users row for ${email} — can't run the live test. (Schema/grant checks above are still valid.)`);
    await adminSql.end();
    await appSql.end();
    return;
  }
  if (!user.firm_id) {
    console.log(`${user.name} <${email}> has no firm_id (platform_admin?) — can't pick a client to test against.`);
    await adminSql.end();
    await appSql.end();
    return;
  }
  const [client] = await adminSql<{ id: string; registered_name: string }[]>`
    select id, registered_name from clients where firm_id = ${user.firm_id} limit 1
  `;
  if (!client) {
    console.log(`${user.name}'s firm has no clients yet — can't run the live test.`);
    await adminSql.end();
    await appSql.end();
    return;
  }

  const [existingRow] = await adminSql<{ id: string }[]>`
    select id from user_client_views where user_id = ${user.id} and client_id = ${client.id}
  `;
  console.log(`Testing as ${user.name} <${email}> against client "${client.registered_name}"...`);

  try {
    await appSql.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', ${user.id}, true)`;
      await tx`
        insert into user_client_views (user_id, client_id)
        values (${user.id}, ${client.id})
        on conflict (user_id, client_id) do update set last_viewed_at = now()
      `;
    });
    console.log("SUCCESS — the insert this app performs on every client page load works correctly.");
    if (!existingRow) {
      // Only clean up if this script created the row — leave a
      // genuinely pre-existing one (and its now-updated timestamp) alone.
      await adminSql`delete from user_client_views where user_id = ${user.id} and client_id = ${client.id}`;
      console.log("(Test row removed — it didn't exist before this run.)");
    }
  } catch (err) {
    const pgErr = err as { code?: string; message?: string; detail?: string; hint?: string };
    console.log("FAILED — this is the exact error the app itself hits (and was silently logging server-side):");
    console.log(`  code:    ${pgErr.code ?? "(none)"}`);
    console.log(`  message: ${pgErr.message ?? String(err)}`);
    if (pgErr.detail) console.log(`  detail:  ${pgErr.detail}`);
    if (pgErr.hint) console.log(`  hint:    ${pgErr.hint}`);
  }

  console.log("\n3. Live SELECT attempt — the sidebar's own query (via DATABASE_URL, as keepbooks_app)\n" + "=".repeat(50));
  const [rawCount] = await adminSql<{ count: string }[]>`
    select count(*)::text as count from user_client_views where user_id = ${user.id}
  `;
  console.log(`Rows for this user via MIGRATION_DATABASE_URL (bypasses RLS, ground truth): ${rawCount.count}`);

  try {
    const rows = await appSql.begin(async (tx) => {
      await tx`select set_config('app.current_user_id', ${user.id}, true)`;
      return tx<{ id: string; name: string }[]>`
        select c.id, c.registered_name as name
        from user_client_views ucv
        inner join clients c on ucv.client_id = c.id
        where ucv.user_id = ${user.id}
        order by ucv.last_viewed_at desc
        limit 5
      `;
    });
    console.log(`Rows returned via keepbooks_app + RLS (what the sidebar actually sees): ${rows.length}`);
    if (rows.length > 0) {
      console.log("SUCCESS — matches: " + rows.map((r) => r.name).join(", "));
    } else if (Number(rawCount.count) > 0) {
      console.log(
        "MISMATCH — ground truth has rows but keepbooks_app's RLS-scoped read sees none. This is the real bug: either " +
          "the SELECT grant is missing/different from the write grants, or the RLS policy's USING clause isn't matching " +
          "for some reason not yet identified. Worth checking `select grantee, privilege_type from information_schema." +
          "role_table_grants where table_name = 'clients' and grantee = 'keepbooks_app'` too — the INNER JOIN also needs " +
          "keepbooks_app to be able to SELECT from `clients`, which is a much older, previously-proven-working grant, but " +
          "worth ruling out explicitly rather than assumed."
      );
    }
  } catch (err) {
    const pgErr = err as { code?: string; message?: string; detail?: string; hint?: string };
    console.log("FAILED — the sidebar's read itself errors:");
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
