import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withUserContext } from "@/db/client";
import { users } from "@/db/schema";
import { createSupabaseServerClient } from "./supabase-server";

export type Role = "firm_admin" | "bookkeeper" | "reviewer" | "client_user";

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
  if (!user) redirect("/login");
  return user;
}

export async function requireStaffUser(): Promise<CurrentUser> {
  const user = await requireCurrentUser();
  if (user.role === "client_user") redirect("/dashboard");
  return user;
}

export async function requireFirmAdmin(): Promise<CurrentUser> {
  const user = await requireCurrentUser();
  if (user.role !== "firm_admin") redirect("/dashboard");
  return user;
}
