import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser, type Role } from "./current-user";

/**
 * Route Handler-safe auth guards. next/navigation's redirect() throws a
 * value only Server Components/Actions know how to interpret — using it in
 * a Route Handler just crashes the request. These return a NextResponse to
 * send directly, or the resolved user to proceed with.
 */
export async function apiRequireUser(): Promise<{ user: CurrentUser } | { response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  }
  return { user };
}

export async function apiRequireRole(
  allowed: Role[]
): Promise<{ user: CurrentUser } | { response: NextResponse }> {
  const result = await apiRequireUser();
  if ("response" in result) return result;
  if (!allowed.includes(result.user.role)) {
    return { response: NextResponse.json({ error: "Not authorized." }, { status: 403 }) };
  }
  return result;
}
