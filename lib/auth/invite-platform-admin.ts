import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withUserContext } from "@/db/client";
import { authDb } from "@/db/authClient";
import { users } from "@/db/schema";
import { createSupabaseAdminClient } from "./supabase-admin";

export const invitePlatformAdminSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, "Name is required.").max(200),
});

export type InvitePlatformAdminResult = { ok: true } | { ok: false; error: string };

/**
 * Invites a new platform admin: creates a Supabase Auth user with no
 * password (these accounts sign in with "Continue with Google" only, same
 * as every platform admin so far) and the matching public.users row.
 *
 * Uses supabase.auth.admin.createUser() rather than inviteUserByEmail() —
 * deliberately the exact same mechanism scripts/create-platform-admin.ts
 * already uses and has been verified live, rather than a new, untested
 * code path (invite emails, their own redirectTo) for no real benefit:
 * the invited admin is simply told to sign in with Google afterward,
 * exactly like the first admin was.
 *
 * The profile row insert goes through withUserContext(currentAdminId, ...)
 * — normal RLS, not authDb — relying on db/sql/006_platform_admin_rls.sql's
 * policy letting an authenticated platform_admin create another. The only
 * RLS bypass here is the pre-check below, which is inherently cross-tenant
 * (see its comment).
 */
export async function invitePlatformAdmin(currentAdminId: string, input: unknown): Promise<InvitePlatformAdminResult> {
  const parsed = invitePlatformAdminSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { email, name } = parsed.data;

  // Bypasses RLS by design — see db/authClient.ts. Checking whether this
  // email is already registered has to see across every firm, which no
  // RLS-scoped session (platform_admin included) can ever correctly do —
  // this is the one narrow, system-wide check this feature needs.
  const [existingRow] = await authDb.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
  if (existingRow) {
    return { ok: false, error: `This email is already registered (role: ${existingRow.role}).` };
  }

  const supabase = createSupabaseAdminClient();

  let authUserId: string;
  const { data: created, error: createError } = await supabase.auth.admin.createUser({ email, email_confirm: true });

  if (created?.user) {
    authUserId = created.user.id;
  } else if (createError?.message?.toLowerCase().includes("already registered")) {
    // No matching public.users row (checked above) but the email already
    // has a Supabase Auth identity — e.g. an interrupted signup that never
    // finished its profile row (see lib/auth/signup.ts's documented gap).
    // Reuse that identity rather than failing.
    const found = await findAuthUserByEmail(supabase, email);
    if (!found) {
      return { ok: false, error: "Something went wrong looking up this email. Please try again." };
    }
    authUserId = found.id;
  } else {
    return { ok: false, error: createError?.message ?? "Could not create the invited account. Please try again." };
  }

  try {
    await withUserContext(currentAdminId, async (tx) => {
      await tx.insert(users).values({ id: authUserId, firmId: null, email, name, role: "platform_admin" });
    });
  } catch (err) {
    // Mirrors lib/auth/signup.ts's own documented gap: the Supabase Auth
    // user now exists but has no profile row, with no way yet to resume —
    // scripts/delete-test-signup.ts can clean this up by hand if needed.
    console.error("Platform admin invite: DB insert failed after the Supabase Auth user was created/found:", err);
    return { ok: false, error: "Something went wrong finishing this invite. Please try again in a moment." };
  }

  return { ok: true };
}

// The admin API has no direct getUserByEmail — page through listUsers().
// Same pattern as scripts/create-platform-admin.ts and
// scripts/migrate-demo-users-to-supabase-auth.ts.
async function findAuthUserByEmail(supabase: ReturnType<typeof createSupabaseAdminClient>, email: string) {
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers() failed: ${error.message}`);
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
}
