import "server-only";
import { createSupabaseServerClient } from "./supabase-server";

/**
 * For the public marketing pages' nav only — "Log in" vs. "Go to
 * Dashboard". Deliberately NOT getCurrentUser(): that also runs a Postgres
 * query (via withUserContext) plus a trial-expiry check, which marketing
 * pages (anonymous ad/referral traffic, much higher volume than the
 * authenticated app) shouldn't pay for just to decide a nav label.
 * supabase.auth.getUser() alone still round-trips to Supabase's Auth
 * server to verify the session token (not a locally-cached read), so this
 * is still an honest signed-in check — it just stops short of confirming
 * the matching public.users row is still active. A deactivated account
 * would briefly see "Go to Dashboard" here; clicking it still hits
 * requireCurrentUser()'s real check on the protected route itself.
 */
export async function isAuthenticated(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}
