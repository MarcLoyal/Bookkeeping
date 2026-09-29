import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * A privileged Supabase client using SUPABASE_SERVICE_ROLE_KEY — bypasses
 * Supabase Auth's normal user-facing restrictions (can create/list/delete/
 * invite/ban any auth.users row directly). Reserved for
 * lib/auth/invite-platform-admin.ts, lib/auth/create-team-member.ts, and
 * lib/auth/set-team-member-active.ts only — every prior use of this key
 * in this app was from a standalone script
 * (scripts/migrate-demo-users-to-supabase-auth.ts,
 * scripts/create-platform-admin.ts); invite-platform-admin.ts was the first
 * time the *running app* held it, so treat it with the same care as
 * MIGRATION_DATABASE_URL's password. Do NOT import this for anything else.
 *
 * Reads process.env directly as static literal expressions rather than
 * through a requireEnv(name) helper — that pattern (process.env[name] with
 * a variable key) has caused two real bugs elsewhere in this app (see
 * DECISIONS.md), so it's not being reintroduced here even though this
 * particular file's Node.js-only runtime was never actually at risk from
 * it (unlike the browser/Edge Runtime cases that broke).
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
