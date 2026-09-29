import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

/**
 * One-off gap-filler: db/seed.ts only inserts its demo users the very
 * first time it runs (it short-circuits entirely once "Keep.Books Demo
 * Firm" already exists — see its own top-of-main comment), so a project
 * seeded before encoder/viewer were added to that script never got them
 * and re-running `pnpm seed` is a no-op. This inserts just the missing
 * viewer@keepbooks.demo row into the existing demo firm. Does NOT touch
 * encoder@keepbooks.demo or any other row.
 *
 * Unlike db/seed.ts's own users insert — which uses a throwaway local
 * UUID, re-keyed later by migrate-demo-users-to-supabase-auth.ts — this
 * creates the Supabase Auth user FIRST and inserts public.users with that
 * real id directly. The "throwaway UUID, re-key later" two-step only
 * works where db/sql/004_supabase_auth.sql's FK from public.users.id to
 * auth.users.id doesn't exist yet (local Postgres has no `auth` schema at
 * all — see that file's own comment). On a real Supabase project the FK
 * IS present (added NOT VALID, but enforced for every new insert/update
 * from the moment it's added), so a bare `gen_random_uuid()` id is
 * rejected immediately with a foreign key violation (confirmed live —
 * this is what the first version of this script hit). This script never
 * puts the row through that invalid intermediate state at all, so there's
 * no separate re-keying step needed afterward.
 *
 * Idempotent: does nothing if a public.users row for viewer@keepbooks.demo
 * already exists, and reuses an existing Supabase Auth user for that
 * email if one is already there — same "already registered" fallback
 * pattern as migrate-demo-users-to-supabase-auth.ts. Safe to re-run.
 */
async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  if (!migrationDatabaseUrl) throw new Error("MIGRATION_DATABASE_URL is not set.");

  const email = "viewer@keepbooks.demo";
  const sql = postgres(migrationDatabaseUrl, { max: 1, prepare: false });

  const [existingRow] = await sql<{ id: string }[]>`select id from users where email = ${email}`;
  if (existingRow) {
    console.log(`${email} already has a public.users row (${existingRow.id}) — nothing to do.`);
    await sql.end();
    return;
  }

  const [firm] = await sql<{ id: string }[]>`select id from firms where name = 'Keep.Books Demo Firm'`;
  if (!firm) {
    await sql.end();
    throw new Error('No "Keep.Books Demo Firm" found — run `pnpm seed` first.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The admin API has no direct getUserByEmail — page through listUsers().
  // Nested closure over `supabase`, not a standalone function taking it as
  // a parameter: migrate-demo-users-to-supabase-auth.ts (same createUser +
  // fallback pattern) found that shape hits an awkward generic-inference
  // mismatch in this Supabase client's types when named as a standalone
  // parameter, so this mirrors its fix rather than reintroducing that.
  async function findAuthUserByEmail() {
    const perPage = 200;
    for (let page = 1; ; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(`listUsers() failed: ${error.message}`);
      const found = data.users.find((u) => u.email === email);
      if (found) return found;
      if (data.users.length < perPage) return null;
    }
  }

  let authUserId: string;
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });

  if (created?.user) {
    authUserId = created.user.id;
    console.log(`Created Supabase Auth user ${authUserId} for ${email}.`);
  } else if (createError?.message?.toLowerCase().includes("already registered") || createError?.message?.toLowerCase().includes("already been registered")) {
    const found = await findAuthUserByEmail();
    if (!found) throw new Error(`Supabase says ${email} is already registered, but listUsers() couldn't find it.`);
    authUserId = found.id;
    console.log(`Supabase Auth user already existed: ${authUserId}.`);
  } else {
    await sql.end();
    throw new Error(`Failed to create Supabase Auth user for ${email}: ${createError?.message}`);
  }

  await sql`
    insert into users (id, firm_id, email, name, role, access_scope)
    values (${authUserId}, ${firm.id}, ${email}, 'Vic Viewer', 'viewer', 'all')
    on conflict (email) do nothing
  `;

  await sql.end();
  console.log(`Done. ${email} is ready to log in with password "password123".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
