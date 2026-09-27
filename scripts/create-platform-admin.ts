import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

/**
 * Creates a platform_admin account: a real Supabase Auth user (admin API,
 * no password set — these accounts sign in with "Continue with Google",
 * same as the walkthrough already given for bookkeepers) plus its
 * matching public.users row (role: platform_admin, firm_id: NULL — a
 * platform admin isn't scoped to any one firm).
 *
 * Deliberately does NOT go through app/onboarding/firm: that flow always
 * creates a *firm* for a brand-new Google identity, which a platform
 * admin explicitly should not have. Run this first, then sign in with
 * Google using the same email — app/auth/callback/route.ts finds the
 * public.users row this script created and signs straight in rather than
 * routing to onboarding.
 *
 * There's deliberately no public "sign up as admin" page (see
 * DECISIONS.md) — the first admin is created by running this script by
 * hand against your own Supabase project; that first admin can later
 * invite the other 1-2 (in-app invite flow: not built yet).
 *
 * Idempotent: safe to re-run for the same email.
 *
 * Usage: pnpm create-platform-admin -- <email> "<name>"
 */
async function main() {
  const [, , email, name] = process.argv;
  if (!email || !name) {
    console.error('Usage: pnpm create-platform-admin -- <email> "<name>"');
    process.exit(1);
  }

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
  async function findAuthUserByEmail(targetEmail: string) {
    const perPage = 200;
    for (let page = 1; ; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(`listUsers() failed: ${error.message}`);
      const found = data.users.find((u) => u.email === targetEmail);
      if (found) return found;
      if (data.users.length < perPage) return null;
    }
  }

  let authUserId: string;
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (created?.user) {
    authUserId = created.user.id;
    console.log(`Created Supabase Auth user ${authUserId} for ${email}`);
  } else if (createError?.message?.toLowerCase().includes("already registered")) {
    const found = await findAuthUserByEmail(email);
    if (!found) throw new Error(`Supabase says ${email} is already registered, but listUsers() couldn't find it.`);
    authUserId = found.id;
    console.log(`Supabase Auth user already existed: ${authUserId}`);
  } else {
    throw new Error(`Failed to create Supabase Auth user for ${email}: ${createError?.message}`);
  }

  const [existingRow] = await sql<{ id: string; role: string }[]>`select id, role from users where id = ${authUserId}`;
  if (existingRow) {
    console.log(`public.users row already exists for ${authUserId} (role: ${existingRow.role}) — nothing to do.`);
    await sql.end();
    return;
  }

  await sql`
    insert into users (id, firm_id, email, name, role, active)
    values (${authUserId}, NULL, ${email}, ${name}, 'platform_admin', true)
  `;
  await sql`
    insert into audit_log (actor_user_id, action, table_name, record_id)
    values (${authUserId}, 'ADMIN_CREATED', 'users', ${authUserId})
  `;

  console.log(`\nDone. ${email} is now a platform admin. Sign in with "Continue with Google" using this same email.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
