import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withUserContext } from "@/db/client";
import { authDb } from "@/db/authClient";
import { clients, userClientAssignments, users } from "@/db/schema";
import type { CurrentUser } from "./current-user";
import { createSupabaseAdminClient } from "./supabase-admin";

function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

// Owner may invite any of these; Bookkeeper is restricted to "encoder"
// below, checked in code AND by db/sql/010_bookkeeper_add_encoder_rls.sql's
// users_insert policy (the real enforcement — this schema only produces a
// friendlier error before that RLS check is ever reached).
const INVITABLE_ROLES = ["firm_admin", "bookkeeper", "reviewer", "encoder", "viewer"] as const;

export const createTeamMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, "Name is required.").max(200),
  role: z.enum(INVITABLE_ROLES),
  clientIds: z.array(z.string().uuid()).default([]),
});

export type CreateTeamMemberResult = { ok: true } | { ok: false; error: string };

/**
 * Invites a new team member into the current user's firm:
 *   - Owner (firm_admin) may invite any role.
 *   - Bookkeeper may only invite an Encoder, and may only assign that
 *     Encoder to clients the Bookkeeper can themselves access — both
 *     checked here for a clean error message, and enforced again (the
 *     real backstop) by db/sql/010_bookkeeper_add_encoder_rls.sql.
 *
 * A Bookkeeper's new Encoder is always access_scope 'assigned' with at
 * least one client required: defaulting it to 'all' would hand the new
 * Encoder broader access than the Bookkeeper who created it has any
 * business granting. A new Viewer is also always 'assigned' (even with
 * zero clients picked) — a read-only role has no business defaulting to
 * every client in the firm. Every other Owner-created role defaults to
 * 'all' unless specific clients are picked, matching accessScopeEnum's
 * documented general intent (db/schema/enums.ts).
 *
 * Uses supabase.auth.admin.inviteUserByEmail() — sends Supabase's own
 * invite email, landing at app/auth/confirm/route.ts exactly like a
 * password-reset link does (see lib/auth/password-reset.ts), then on to
 * /reset-password to set a password. Reuses already-verified infra rather
 * than a new, untested email flow.
 */
export async function createTeamMember(currentUser: CurrentUser, input: unknown): Promise<CreateTeamMemberResult> {
  if (currentUser.role !== "firm_admin" && currentUser.role !== "bookkeeper") {
    return { ok: false, error: "Only an Owner or Bookkeeper can add team members." };
  }
  if (!currentUser.firmId) {
    return { ok: false, error: "No firm on this account." };
  }

  const parsed = createTeamMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { email, name, role, clientIds } = parsed.data;

  if (currentUser.role === "bookkeeper") {
    if (role !== "encoder") {
      return { ok: false, error: "Bookkeepers can only add Encoder accounts." };
    }
    if (clientIds.length === 0) {
      return { ok: false, error: "Pick at least one client to assign this Encoder to." };
    }
  }

  // Bypasses RLS by design — see db/authClient.ts. Checking whether this
  // email is already registered has to see across every firm, which no
  // RLS-scoped session can ever correctly do.
  const [existingRow] = await authDb.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).limit(1);
  if (existingRow) {
    return { ok: false, error: `This email is already registered (role: ${existingRow.role}).` };
  }

  // Whichever clients were requested must be ones the INVITER can already
  // access — RLS's clients_select already scopes this correctly for both
  // Owner (whole firm) and Bookkeeper (their own access_scope), so
  // anything requested but not returned here isn't accessible to them.
  if (clientIds.length > 0) {
    const accessible = await withUserContext(currentUser.id, (tx) =>
      tx.select({ id: clients.id }).from(clients).where(eq(clients.firmId, currentUser.firmId!))
    );
    const accessibleIds = new Set(accessible.map((c) => c.id));
    const invalid = clientIds.filter((id) => !accessibleIds.has(id));
    if (invalid.length > 0) {
      return { ok: false, error: "One or more selected clients aren't ones you have access to." };
    }
  }

  // Viewer always defaults to 'assigned', even with zero clients picked
  // (sees nothing until an Owner assigns some) — a read-only role
  // shouldn't default to seeing every client in the firm just because it
  // can't write anything. Every other role keeps the general default:
  // 'assigned' once specific clients are picked, 'all' otherwise.
  const accessScope = role === "viewer" || clientIds.length > 0 ? "assigned" : "all";

  const supabase = createSupabaseAdminClient();
  let authUserId: string;
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl()}/auth/confirm?next=/reset-password`,
    data: { full_name: name },
  });

  if (invited?.user) {
    authUserId = invited.user.id;
  } else if (inviteError?.message?.toLowerCase().includes("already registered") || inviteError?.message?.toLowerCase().includes("already been registered")) {
    const found = await findAuthUserByEmail(supabase, email);
    if (!found) {
      return { ok: false, error: "Something went wrong looking up this email. Please try again." };
    }
    authUserId = found.id;
  } else {
    return { ok: false, error: inviteError?.message ?? "Could not send the invite. Please try again." };
  }

  try {
    await withUserContext(currentUser.id, async (tx) => {
      await tx.insert(users).values({ id: authUserId, firmId: currentUser.firmId!, email, name, role, accessScope });
      if (clientIds.length > 0) {
        await tx.insert(userClientAssignments).values(clientIds.map((clientId) => ({ userId: authUserId, clientId })));
      }
    });
  } catch (err) {
    // Mirrors lib/auth/invite-platform-admin.ts's own documented gap: the
    // Supabase Auth user (and its invite email) now exist, but the profile
    // row insert failed — most likely the RLS check itself rejecting an
    // out-of-scope role/client combination that slipped past the checks
    // above. scripts/delete-test-signup.ts can clean up the orphaned auth
    // user by hand if needed.
    console.error("Team member invite: DB insert failed after the Supabase Auth user was created/found:", err);
    return { ok: false, error: "Something went wrong finishing this invite. Please try again, or check with an Owner." };
  }

  return { ok: true };
}

// The admin API has no direct getUserByEmail — page through listUsers().
// Same pattern as lib/auth/invite-platform-admin.ts and the migrate-demo-
// users/create-platform-admin scripts.
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
