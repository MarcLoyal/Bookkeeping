import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

/**
 * One-time script: creates the 3 demo accounts (seeded by db/seed.ts) as
 * real Supabase Auth users, then updates their public.users.id to match
 * (relying on ON UPDATE CASCADE — see db/sql/004_supabase_auth.sql — to
 * carry every reference along: user_client_assignments, audit_log,
 * journal_entries.posted_by/created_by, period_locks). Their old bcrypt
 * password_hash never carried over to Supabase Auth's own user store —
 * this is what actually makes "admin@keepbooks.demo" / "password123"
 * loggable-into again after the migration.
 *
 * Idempotent: safe to re-run. Skips a demo user entirely if db/seed.ts
 * hasn't been run against this database yet (no matching row to update).
 */
const DEMO_USERS = [
  { email: "admin@keepbooks.demo", password: "password123" },
  { email: "bookkeeper@keepbooks.demo", password: "password123" },
  { email: "reviewer@keepbooks.demo", password: "password123" },
];

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  if (!migrationDatabaseUrl) throw new Error("MIGRATION_DATABASE_URL is not set.");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const sql = postgres(migrationDatabaseUrl, { max: 1, prepare: false });

  // The admin API has no direct getUserByEmail — page through listUsers().
  // Closure over `supabase` sidesteps an awkward generic-inference mismatch
  // TS hits when this client's type is named as a standalone parameter.
  async function findAuthUserByEmail(email: string) {
    const perPage = 200;
    for (let page = 1; ; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(`listUsers() failed: ${error.message}`);
      const found = data.users.find((u) => u.email === email);
      if (found) return found;
      if (data.users.length < perPage) return null;
    }
  }

  for (const { email, password } of DEMO_USERS) {
    console.log(`\n${email}`);

    const [existingRow] = await sql<{ id: string }[]>`select id from users where email = ${email}`;
    if (!existingRow) {
      console.log("  -> no matching public.users row — skipping (run pnpm seed first if this is unexpected)");
      continue;
    }

    let authUserId: string;
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (created?.user) {
      authUserId = created.user.id;
      console.log(`  -> created Supabase Auth user ${authUserId}`);
    } else if (createError?.message?.toLowerCase().includes("already been registered") || createError?.message?.toLowerCase().includes("already registered")) {
      const found = await findAuthUserByEmail(email);
      if (!found) throw new Error(`Supabase says ${email} is already registered, but listUsers() couldn't find it.`);
      authUserId = found.id;
      console.log(`  -> Supabase Auth user already existed: ${authUserId}`);
    } else {
      throw new Error(`Failed to create Supabase Auth user for ${email}: ${createError?.message}`);
    }

    if (existingRow.id === authUserId) {
      console.log("  -> public.users.id already matches — nothing to update");
      continue;
    }

    await sql`update users set id = ${authUserId} where id = ${existingRow.id}`;
    console.log(`  -> updated public.users.id: ${existingRow.id} -> ${authUserId}`);
  }

  // db/sql/004_supabase_auth.sql added the FK to auth.users as NOT VALID,
  // since it can't have been satisfied by any pre-existing row before this
  // script ran (see that file's comment). Now that the demo users above are
  // re-keyed, confirm the constraint actually holds for the whole table.
  // Non-fatal: a stray users row this script doesn't know about (not one of
  // the 3 demo accounts) would fail this and should be looked at, but
  // shouldn't make an otherwise-successful run look like it failed.
  const [{ exists: constraintExists }] = await sql<{ exists: boolean }[]>`
    select exists (select 1 from pg_constraint where conname = 'users_id_auth_users_id_fk') as exists
  `;
  if (constraintExists) {
    try {
      await sql`alter table users validate constraint users_id_auth_users_id_fk`;
      console.log("\nValidated: every public.users row now has a matching auth.users row.");
    } catch (err) {
      console.warn(
        `\nWARNING: could not validate users_id_auth_users_id_fk — some public.users row (not one of the 3 demo accounts) still has no matching auth.users row: ${(err as Error).message}`
      );
    }
  }

  await sql.end();
  console.log(`\nDone. Demo accounts are now real Supabase Auth users — sign in with any of the emails above and password "password123".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
