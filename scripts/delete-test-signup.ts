import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

/**
 * Deletes a test signup so its email is completely free to reuse (e.g. for
 * create-platform-admin.ts): the whole firm it created — cascades to
 * clients, journal entries, and everything under them, per the ON DELETE
 * CASCADE chain from firms down (see db/schema) — plus its Supabase Auth
 * user.
 *
 * Refuses to touch a firm with any posted/reversed journal entries: the
 * DB's own immutability trigger (enforce_journal_entry_immutability)
 * rejects deleting those outright ("Use a reversing entry instead", db/sql/
 * 001_functions_triggers_rls.sql). This script does not attempt to work
 * around that — a failure here means there's real financial history under
 * this email that needs a human decision, not an automated cleanup.
 *
 * Interactive by default: prints exactly what's about to be deleted (firm
 * name, client/journal-entry counts, any other users in the same firm) and
 * asks for confirmation before doing anything irreversible. Pass --yes to
 * skip the prompt for non-interactive use.
 *
 * Also checks for a Supabase Auth user with this email independently of
 * whether a public.users row exists — covers the documented gap in
 * lib/auth/signup.ts where a DB failure right after a successful Supabase
 * Auth signup leaves an orphaned auth user with no profile row at all.
 *
 * Usage: pnpm delete-test-signup -- <email> [--yes]
 */
async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const autoConfirm = args.includes("--yes");
  const email = args.find((a) => a !== "--yes");

  if (!email) {
    console.error("Usage: pnpm delete-test-signup -- <email> [--yes]");
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
  // statement_timeout: a stuck DELETE (e.g. blocked on a lock held by some
  // other session) fails loudly within 15s instead of hanging silently
  // forever with no error — reported live as an indistinguishable-looking
  // hang after confirming, and this is the fix for the "no error, ever"
  // half of that; see the confirm() rewrite below for the other half.
  const sql = postgres(migrationDatabaseUrl, { max: 1, prepare: false, connection: { statement_timeout: 15000 } });

  const [profileRow] = await sql<{ id: string; firm_id: string | null; role: string }[]>`
    select id, firm_id, role from users where email = ${email}
  `;

  if (!profileRow) {
    console.log(`No public.users row for ${email}.`);
  } else if (!profileRow.firm_id) {
    console.log(`Found a public.users row for ${email} with no firm (role: ${profileRow.role}).`);
    if (!autoConfirm && !(await confirm("Delete this users row?"))) {
      console.log("Aborted — nothing deleted.");
      await sql.end();
      return;
    }
    await sql`delete from users where id = ${profileRow.id}`;
    console.log("Deleted.");
  } else {
    const [firm] = await sql<{ name: string }[]>`select name from firms where id = ${profileRow.firm_id}`;
    const [{ count: clientCount }] = await sql<{ count: number }[]>`
      select count(*)::int as count from clients where firm_id = ${profileRow.firm_id}
    `;
    const [{ count: entryCount }] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from journal_entries je
      join clients c on c.id = je.client_id
      where c.firm_id = ${profileRow.firm_id}
    `;
    const [{ count: otherUserCount }] = await sql<{ count: number }[]>`
      select count(*)::int as count from users where firm_id = ${profileRow.firm_id} and id != ${profileRow.id}
    `;

    console.log(`Found firm "${firm?.name}" (${profileRow.firm_id}) for ${email}:`);
    console.log(`  ${clientCount} client(s), ${entryCount} journal entry(ies)`);
    if (otherUserCount > 0) {
      console.log(`  ${otherUserCount} OTHER user(s) also belong to this firm — they'll be deleted too.`);
    }
    console.log("  All of the above will be deleted along with the firm.");

    if (!autoConfirm && !(await confirm("Delete this firm and everything under it?"))) {
      console.log("Aborted — nothing deleted.");
      await sql.end();
      return;
    }

    console.log("Deleting...");
    try {
      await sql`delete from firms where id = ${profileRow.firm_id}`;
    } catch (err) {
      console.error(
        `\nCould not delete: ${(err as Error).message}\n` +
          "If this mentions a posted/reversed journal entry, that's this app's immutability " +
          "protection working as intended — decide by hand how to proceed rather than forcing it."
      );
      await sql.end();
      process.exit(1);
    }
    console.log("Deleted the firm and everything under it.");
  }

  // Independent of the public.users lookup above — see doc comment.
  console.log("Checking Supabase Auth...");
  const perPage = 200;
  let authUser: { id: string } | null = null;
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
    console.log(`No Supabase Auth user for ${email} — nothing left to clean up.`);
  } else {
    const { error } = await supabase.auth.admin.deleteUser(authUser.id);
    if (error) throw new Error(`Failed to delete Supabase Auth user: ${error.message}`);
    console.log(`Deleted the Supabase Auth user (${authUser.id}).`);
  }

  await sql.end();
  console.log(`\n${email} is now completely free to reuse.`);
}

/**
 * Deliberately not readline: reported live as hanging silently (no error,
 * no output at all) after typing "y" and pressing Enter — indistinguishable,
 * from the outside, between readline never seeing the keypress and the
 * DELETE below hanging on a lock (see the statement_timeout fix for the
 * latter). The most likely cause for the former is process.stdin sitting
 * paused when this script starts (observed with some tsx/pnpm invocation
 * paths) — readline's own auto-resume has had version-dependent gaps for
 * exactly this. Listening on stdin directly and calling resume() explicitly
 * sidesteps that entirely rather than trying to out-guess readline's
 * TTY detection.
 */
async function confirm(question: string): Promise<boolean> {
  process.stdout.write(`${question} [y/N] `);
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (chunk) => {
      process.stdin.pause();
      resolve(chunk.toString().trim().toLowerCase() === "y");
    });
    process.stdin.resume();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
