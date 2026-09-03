import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withUserContext } from "@/db/client";
import { users } from "@/db/schema";
import { getSessionClaims } from "./session";

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
 * Fetches the session's user row THROUGH RLS (a user can always see their own
 * row — see users_select policy).
 *
 * NOT wrapped in React's cache(): Server Actions can involve more than one
 * internal render pass (e.g. to compute a redirect's RSC diff), and memoizing
 * this across those passes was observed to leak a stale "no session" result
 * into the pass that actually has the request's cookies, incorrectly
 * bouncing an authenticated mutation to /login. The extra DB round-trip this
 * costs is a single indexed row lookup — cheap next to that risk.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const claims = await getSessionClaims();
  if (!claims) return null;
  const { userId, tokenVersion } = claims;

  return withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!row || !row.active) return null;
    // A password reset bumps users.tokenVersion, invalidating every JWT
    // issued before it — stateless sessions have no other revocation path.
    if (row.tokenVersion !== tokenVersion) return null;
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
