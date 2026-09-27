import "server-only";
import { eq } from "drizzle-orm";
import { authDb } from "@/db/authClient";
import { auditLog, users } from "@/db/schema";
import { createSupabaseServerClient } from "./supabase-server";

export type OAuthCallbackResult =
  | { outcome: "signed_in"; redirectTo: string }
  | { outcome: "needs_onboarding"; redirectTo: "/onboarding/firm" }
  | { outcome: "error"; redirectTo: string };

/**
 * Completes the Google OAuth PKCE flow (app/auth/callback/route.ts) and
 * decides where the browser goes next: an existing profile signs in like
 * any other LOGIN, a deactivated one is bounced the same way login.ts
 * bounces a deactivated password sign-in, and a Google identity with no
 * public.users row at all (brand-new signup) is routed to onboarding to
 * collect a firm name instead of being auto-provisioned with one.
 */
export async function handleOAuthCallback(code: string, next: string): Promise<OAuthCallbackResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return { outcome: "error", redirectTo: "/login?oauth_error=1" };
  }

  // Bypasses RLS by design — see db/authClient.ts. Looking up this app's own
  // profile row for a just-verified Supabase Auth identity, before any
  // session/tenant RLS context exists for it.
  const [row] = await authDb.select().from(users).where(eq(users.id, data.user.id)).limit(1);

  if (!row) {
    return { outcome: "needs_onboarding", redirectTo: "/onboarding/firm" };
  }

  if (!row.active) {
    await supabase.auth.signOut();
    return { outcome: "error", redirectTo: "/login?oauth_error=inactive" };
  }

  await authDb.insert(auditLog).values({ actorUserId: row.id, action: "LOGIN", tableName: "users", recordId: row.id });

  return { outcome: "signed_in", redirectTo: next };
}
