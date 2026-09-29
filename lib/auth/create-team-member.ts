import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withUserContext } from "@/db/client";
import { authDb } from "@/db/authClient";
import { clients, firms, userClientAssignments, users } from "@/db/schema";
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

const ROLE_LABELS: Record<string, string> = {
  firm_admin: "Owner",
  bookkeeper: "Bookkeeper",
  reviewer: "Reviewer",
  encoder: "Encoder",
  viewer: "Viewer",
};

export const createTeamMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, "Name is required.").max(200),
  role: z.enum(INVITABLE_ROLES),
  clientIds: z.array(z.string().uuid()).default([]),
});

// `warning` covers a partial success: the person IS attached to the firm
// (the part that actually matters) but the courtesy notification email
// failed to send — surfaced so the Team page can say so instead of
// claiming an unqualified success. Never silent either way, per the
// safety rules this was built to satisfy.
export type CreateTeamMemberResult = { ok: true; warning?: string } | { ok: false; error: string };

/**
 * Adds a team member to the current user's firm:
 *   - Owner (firm_admin) may add any role.
 *   - Bookkeeper may only add an Encoder, and may only assign that
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
 * Three outcomes for an email that already has SOME identity:
 *   1. Already a member of THIS firm — reported as such, nothing changed.
 *   2. Already belongs to a DIFFERENT firm (or is a platform_admin, whose
 *      firm_id is NULL but who is very much not adoptable as a firm
 *      member) — refused with a clear error, nothing changed.
 *   3. A Supabase Auth identity exists (e.g. they signed in with Google
 *      once) but has no public.users row anywhere — this is the
 *      "half-finished signup" case, and it's exactly as eligible to
 *      become a team member as a brand-new email: attach them to this
 *      firm using their EXISTING auth id (no new Supabase Auth user
 *      created), then send a magic-link "sign in" email via
 *      signInWithOtp() rather than inviteUserByEmail() — inviteUserByEmail
 *      is for brand-new identities only and errors out on one that
 *      already exists (this was the original bug: that error was being
 *      silently swallowed and treated as "done," attaching the row with
 *      no email ever sent). signInWithOtp() works for any existing
 *      identity regardless of how they originally signed in (Google or
 *      password) and doesn't touch their existing credentials — they can
 *      still sign in with Google afterward exactly as before, the magic
 *      link is just an additional way in for this one email.
 *
 * A genuinely new email (no auth identity at all) still goes through
 * inviteUserByEmail() as before — sends Supabase's own invite email,
 * landing at app/auth/confirm/route.ts exactly like a password-reset
 * link does (see lib/auth/password-reset.ts), then on to /reset-password
 * to set a password.
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
  // email already has a profile row has to see across every firm, which
  // no RLS-scoped session can ever correctly do.
  const [existingRow] = await authDb.select({ id: users.id, role: users.role, firmId: users.firmId }).from(users).where(eq(users.email, email)).limit(1);
  if (existingRow) {
    if (existingRow.firmId === currentUser.firmId) {
      return { ok: false, error: `${email} is already a member of this firm (role: ${ROLE_LABELS[existingRow.role] ?? existingRow.role}).` };
    }
    if (existingRow.firmId) {
      return { ok: false, error: `${email} already belongs to a different firm. It can't be added here.` };
    }
    // firmId is NULL but a profile row exists anyway — a platform_admin,
    // the only other role with no firm. Never adoptable as a firm member.
    return { ok: false, error: `${email} is already registered (role: ${ROLE_LABELS[existingRow.role] ?? existingRow.role}).` };
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

  // Fetched once and passed into whichever Supabase email call ends up
  // firing below — available in that project's email template as
  // {{ .Data.firm_name }} / {{ .Data.role_label }} if it's been
  // customized to reference them (see DECISIONS.md for suggested copy).
  const [firm] = await authDb.select({ name: firms.name }).from(firms).where(eq(firms.id, currentUser.firmId)).limit(1);
  const templateData = { full_name: name, firm_name: firm?.name ?? "your firm", role_label: ROLE_LABELS[role] ?? role };

  // No public.users row anywhere for this email — but a Supabase Auth
  // identity might already exist for it (e.g. a half-finished Google
  // signup, or someone another firm never got around to onboarding).
  // Reusing an existing identity's id, rather than always creating a new
  // one, is what makes case 3 in this function's doc comment work.
  const existingAuthUser = await findAuthUserByEmail(supabase, email);

  let authUserId: string;
  let isNewInvite: boolean;

  if (existingAuthUser) {
    authUserId = existingAuthUser.id;
    isNewInvite = false;
  } else {
    const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl()}/auth/confirm?next=/reset-password`,
      data: templateData,
    });

    if (invited?.user) {
      authUserId = invited.user.id;
      isNewInvite = true;
    } else if (inviteError?.message?.toLowerCase().includes("already registered") || inviteError?.message?.toLowerCase().includes("already been registered")) {
      // Race: the identity was created between the listUsers() check above
      // and this call. Fall back to treating it as an existing identity
      // rather than failing outright.
      const found = await findAuthUserByEmail(supabase, email);
      if (!found) {
        return { ok: false, error: "Something went wrong looking up this email. Please try again." };
      }
      authUserId = found.id;
      isNewInvite = false;
    } else {
      return { ok: false, error: inviteError?.message ?? "Could not send the invite. Please try again." };
    }
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
    // Supabase Auth user (new or reused) now exists, but the profile row
    // insert failed — most likely the RLS check itself rejecting an
    // out-of-scope role/client combination that slipped past the checks
    // above. scripts/delete-test-signup.ts can clean up an orphaned NEW
    // auth user by hand if needed — but NOT for a reused existing
    // identity, which existed before this call and must not be deleted.
    console.error("Team member add: DB insert failed after resolving the Supabase Auth identity:", err);
    return { ok: false, error: "Something went wrong finishing this. Please try again, or check with an Owner." };
  }

  if (isNewInvite) {
    return { ok: true };
  }

  // Existing identity attached — let them know, with a link to sign in.
  // The email's actual subject/body is whatever this Supabase project's
  // "Magic Link" template says (templateData above is available to that
  // template as {{ .Data.firm_name }} / {{ .Data.role_label }} if it's
  // been customized to use them) — see DECISIONS.md for suggested copy
  // to paste into the Supabase dashboard if it hasn't been customized yet.
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${appUrl()}/auth/confirm?next=/dashboard`,
      data: templateData,
    },
  });

  if (otpError) {
    console.error(`Team member add: attached ${email} but the sign-in email failed to send:`, otpError);
    return { ok: true, warning: `Added, but the sign-in email failed to send. Tell ${email} to sign in with Google directly.` };
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
