import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

/**
 * Read-only diagnostic: prints everything this app knows about one email
 * address — its public.users row (if any) and its Supabase Auth identity
 * (if any) — side by side. Built for exactly the kind of confusion this
 * app's invite/signup flows can produce: "does this email have a firm? a
 * Supabase login? both? neither?" isn't always obvious from the outside,
 * and every mutation script here (delete-test-signup.ts,
 * migrate-demo-users-to-supabase-auth.ts) assumes you already know which
 * case you're in before running it. This makes no changes at all.
 *
 * Usage: pnpm inspect-user -- <email>
 */
async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const email = args[0];
  if (!email) {
    console.error("Usage: pnpm inspect-user -- <email>");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  if (!migrationDatabaseUrl) throw new Error("MIGRATION_DATABASE_URL is not set.");

  const sql = postgres(migrationDatabaseUrl, { max: 1, prepare: false });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\n${email}\n${"=".repeat(email.length)}`);

  console.log("\npublic.users row:");
  const [profileRow] = await sql<
    { id: string; firm_id: string | null; role: string; access_scope: string; active: boolean; created_at: Date }[]
  >`select id, firm_id, role, access_scope, active, created_at from users where email = ${email}`;
  if (!profileRow) {
    console.log("  none");
  } else {
    console.log(`  id: ${profileRow.id}`);
    console.log(`  role: ${profileRow.role}`);
    console.log(`  access_scope: ${profileRow.access_scope}`);
    console.log(`  active: ${profileRow.active}`);
    console.log(`  created_at: ${profileRow.created_at.toISOString()}`);
    if (profileRow.firm_id) {
      const [firm] = await sql<{ name: string }[]>`select name from firms where id = ${profileRow.firm_id}`;
      console.log(`  firm: ${firm?.name ?? "(not found)"} (${profileRow.firm_id})`);
    } else {
      console.log("  firm: none (expected only for platform_admin)");
    }
  }

  console.log("\nSupabase Auth identity:");
  let authUser: { id: string; email_confirmed_at?: string | null; created_at: string; app_metadata: { provider?: string; providers?: string[] } } | null = null;
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers() failed: ${error.message}`);
    const found = data.users.find((u) => u.email === email);
    if (found) {
      authUser = found;
      break;
    }
    if (data.users.length < perPage) break;
  }
  if (!authUser) {
    console.log("  none");
  } else {
    console.log(`  id: ${authUser.id}`);
    console.log(`  confirmed: ${authUser.email_confirmed_at ? "yes" : "no"}`);
    console.log(`  created_at: ${authUser.created_at}`);
    console.log(`  provider(s): ${authUser.app_metadata.providers?.join(", ") ?? authUser.app_metadata.provider ?? "unknown"}`);
  }

  console.log("");
  if (authUser && !profileRow) {
    console.log(
      "Diagnosis: a Supabase Auth identity exists but no public.users row — this is a \"pending\" state (half-finished " +
        "Google signup, or a not-yet-onboarded invite). Signing in again with the same method now resumes it correctly."
    );
  } else if (authUser && profileRow && authUser.id !== profileRow.id) {
    console.log(
      "Diagnosis: id mismatch between the Supabase Auth identity and the public.users row for this email — this " +
        "shouldn't happen (the FK from users.id to auth.users.id should prevent it) and is worth investigating directly."
    );
  } else if (authUser && profileRow) {
    console.log("Diagnosis: fully set up — a real Supabase Auth identity backing a real public.users row.");
  } else if (!authUser && profileRow) {
    console.log("Diagnosis: a public.users row with no matching Supabase Auth identity — cannot sign in at all until one is created.");
  } else {
    console.log("Diagnosis: nothing exists for this email in either place.");
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
