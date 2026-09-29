import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withUserContext } from "@/db/client";
import { users } from "@/db/schema";
import { createSupabaseServerClient } from "./supabase-server";

export type Role = "firm_admin" | "bookkeeper" | "reviewer" | "client_user" | "platform_admin" | "encoder" | "viewer";

export type CurrentUser = {
  id: string;
  firmId: string | null;
  clientId: string | null;
  email: string;
  name: string;
  role: Role;
};

/**
 * Verifies the request's Supabase Auth session, then fetches the matching
 * public.users profile row THROUGH RLS (a user can always see their own
 * row — see users_select policy).
 *
 * Uses supabase.auth.getUser(), not getSession(): getUser() round-trips to
 * Supabase's Auth server to confirm the token is still valid; getSession()
 * only reads the local cookie unverified. Per Supabase's own guidance,
 * anything security-sensitive (this is — it's the gate on every protected
 * page) must use getUser().
 *
 * NOT wrapped in React's cache(): Server Actions can involve more than one
 * internal render pass (e.g. to compute a redirect's RSC diff), and memoizing
 * this across those passes was observed to leak a stale "no session" result
 * into the pass that actually has the request's cookies, incorrectly
 * bouncing an authenticated mutation to /login. The extra round trip this
 * costs is a Supabase Auth call plus a single indexed row lookup — cheap
 * next to that risk.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  return withUserContext(authUser.id, async (tx) => {
    const [row] = await tx.select().from(users).where(eq(users.id, authUser.id)).limit(1);
    if (!row || !row.active) return null;
    return {
      id: row.id,
      firmId: row.firmId,
      clientId: row.clientId,
      email: row.email,
      name: row.name,
      role: row.role as Role,
    };
  });
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user) return user;

  // A Google identity that authenticated but never finished naming a firm
  // (e.g. they closed the tab mid-onboarding) has a real Supabase session
  // but no profile row — send them back to finish, not to /login, where
  // they'd have no way to resume. A deactivated *existing* account still
  // falls through to /login below, since it has a profile row already.
  const pending = await getPendingGoogleSignup();
  if (pending) redirect("/onboarding/firm");

  redirect("/login");
}

export async function requireStaffUser(): Promise<CurrentUser> {
  const user = await requireCurrentUser();
  if (user.role === "client_user") redirect("/dashboard");
  return user;
}

/**
 * Gates reports, books, and anything else that shows totals/balances
 * across more than one person's work — Encoder is explicitly excluded per
 * Team & Roles' spec ("NO reports, NO dashboard totals, NO balances, NO
 * exports"). This is a real server-side refusal (redirect before any
 * query runs), not just a hidden nav link — RLS alone would only make
 * these views nearly empty for an encoder (their own drafts don't roll up
 * into anything meaningful), which isn't the same as actually refusing
 * the request.
 *
 * Deliberately built on requireCurrentUser(), not requireStaffUser(): a
 * handful of these pages (client reports, the general ledger book) are
 * also how client_user views their own client's reports — this only
 * excludes Encoder, not every non-staff role.
 */
export async function requireReportAccess(): Promise<CurrentUser> {
  const user = await requireCurrentUser();
  if (user.role === "encoder") redirect("/dashboard");
  return user;
}

export async function requireFirmAdmin(): Promise<CurrentUser> {
  const user = await requireCurrentUser();
  if (user.role !== "firm_admin") redirect("/dashboard");
  return user;
}

export async function requirePlatformAdmin(): Promise<CurrentUser> {
  const user = await requireCurrentUser();
  if (user.role !== "platform_admin") redirect("/dashboard");
  return user;
}

export type PendingGoogleSignup = { id: string; email: string; name: string };

/**
 * Distinguishes, for a Google identity with no public.users row, "hasn't
 * signed in yet" from "signed in but hasn't finished naming a firm" — used
 * by app/onboarding/firm (to gate/prefill the form) and requireCurrentUser
 * below (to send an incomplete signup there instead of to /login, without
 * misrouting a deactivated *existing* account the same way).
 */
export async function getPendingGoogleSignup(): Promise<PendingGoogleSignup | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const hasProfile = await withUserContext(authUser.id, async (tx) => {
    const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.id, authUser.id)).limit(1);
    return !!row;
  });
  if (hasProfile) return null;

  const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const name = (typeof metadata.full_name === "string" && metadata.full_name) || (typeof metadata.name === "string" && metadata.name) || "";

  return { id: authUser.id, email: authUser.email ?? "", name };
}
