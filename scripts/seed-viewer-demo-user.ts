import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

/**
 * Ensures viewer@keepbooks.demo exists, correctly configured, in the
 * existing demo firm. Originally a one-shot gap-filler for a project
 * seeded before db/seed.ts included a demo Viewer at all — now also
 * corrects drift on a project where the row already exists but is out
 * of date (e.g. accessScope changed from "all" to "assigned" — see
 * db/schema/enums.ts's accessScopeEnum comment and
 * lib/auth/create-team-member.ts: a read-only role has no business
 * defaulting to every client in the firm). Safe to re-run any time;
 * converges to the same end state whether the row is missing, stale, or
 * already correct. Does NOT touch encoder@keepbooks.demo or any other
 * row.
 *
 * Creates the Supabase Auth user FIRST (if missing) and inserts
 * public.users with that real id directly — never a throwaway
 * gen_random_uuid(), which db/sql/004_supabase_auth.sql's FK from
 * public.users.id to auth.users.id rejects on any real Supabase project
 * (this script's first version hit exactly that live).
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

  const [firm] = await sql<{ id: string }[]>`select id from firms where name = 'Keep.Books Demo Firm'`;
  if (!firm) {
    await sql.end();
    throw new Error('No "Keep.Books Demo Firm" found — run `pnpm seed` first.');
  }
  const clients = await sql<{ id: string }[]>`
    select id from clients where firm_id = ${firm.id} and registered_name in ('Demo Trading Corp.', 'Demo Services (Sole Prop)')
  `;

  let userId: string;
  const [existingRow] = await sql<{ id: string; access_scope: string }[]>`select id, access_scope from users where email = ${email}`;

  if (existingRow) {
    userId = existingRow.id;
    if (existingRow.access_scope !== "assigned") {
      await sql`update users set access_scope = 'assigned' where id = ${userId}`;
      console.log(`${email} already existed with access_scope '${existingRow.access_scope}' — corrected to 'assigned'.`);
    } else {
      console.log(`${email} already exists (${userId}) with the correct access_scope.`);
    }
  } else {
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

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: "password123",
      email_confirm: true,
    });

    if (created?.user) {
      userId = created.user.id;
      console.log(`Created Supabase Auth user ${userId} for ${email}.`);
    } else if (createError?.message?.toLowerCase().includes("already registered") || createError?.message?.toLowerCase().includes("already been registered")) {
      const found = await findAuthUserByEmail();
      if (!found) throw new Error(`Supabase says ${email} is already registered, but listUsers() couldn't find it.`);
      userId = found.id;
      console.log(`Supabase Auth user already existed: ${userId}.`);
    } else {
      await sql.end();
      throw new Error(`Failed to create Supabase Auth user for ${email}: ${createError?.message}`);
    }

    await sql`
      insert into users (id, firm_id, email, name, role, access_scope)
      values (${userId}, ${firm.id}, ${email}, 'Vic Viewer', 'viewer', 'assigned')
      on conflict (email) do nothing
    `;
    console.log(`Inserted public.users row for ${email}.`);
  }

  for (const c of clients) {
    await sql`
      insert into user_client_assignments (user_id, client_id)
      values (${userId}, ${c.id})
      on conflict (user_id, client_id) do nothing
    `;
  }
  if (clients.length > 0) {
    console.log(`Ensured client assignments for ${clients.length} demo client(s).`);
  }

  await sql.end();
  console.log(`Done. ${email} is ready to log in with password "password123" (if newly created).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
