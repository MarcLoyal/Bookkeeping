import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withUserContext } from "@/db/client";
import { journalEntries, users } from "@/db/schema";
import type { CurrentUser } from "./current-user";
import { createSupabaseAdminClient } from "./supabase-admin";

export const setActiveSchema = z.object({
  targetUserId: z.string().uuid(),
  active: z.boolean(),
});

export type SetActiveResult = { ok: true; warning?: string } | { ok: false; error: string };

// Supabase bans, rather than deletes, so the auth identity (and every
// public.users FK to it) survives — a duration string, not a boolean;
// GoTrue has no dedicated "forever" value, so this uses the same
// ~100-year duration commonly used to mean it. Unbanning uses the
// literal string "none". Best-effort: this app has no way to verify
// this call's exact behavior without a real Supabase project (no live
// credentials in this environment) — the `active` flag below is the
// PROVEN backstop regardless (getCurrentUser() already refuses a
// deactivated row on every subsequent request), so a failure here is
// surfaced as a warning, never treated as the deactivation itself failing.
const BAN_FOREVER = "876000h";
const UNBAN = "none";

/**
 * Deactivates or reactivates a team member — never deletes, so their name
 * stays attached to every past journal entry/audit_log row exactly as
 * BIR record-keeping and this app's audit trail require.
 *
 *   - Owner may deactivate/reactivate anyone except themselves, and can
 *     never remove the firm's last active Owner — both checked here for
 *     a clean message, and enforced again (the real backstop) by
 *     db/sql/012_team_lifecycle_rls.sql's users_no_self_deactivation and
 *     users_last_owner_stays_active triggers.
 *   - Bookkeeper may only deactivate/reactivate an Encoder, and only one
 *     on their own clients — enforced by that same migration's
 *     users_update policy + users_bookkeeper_active_only trigger (which
 *     also rejects a Bookkeeper's update touching any column besides
 *     `active`).
 *
 * Deactivating also asks Supabase Auth to ban the identity (see
 * BAN_FOREVER above) so an already-issued session token is rejected
 * immediately, not just on this app's own next request — best-effort,
 * see that constant's own comment for why it can't be more than that
 * here. Reactivating un-bans the same way.
 */
export async function setTeamMemberActive(currentUser: CurrentUser, input: unknown): Promise<SetActiveResult> {
  if (currentUser.role !== "firm_admin" && currentUser.role !== "bookkeeper") {
    return { ok: false, error: "Only an Owner or Bookkeeper can deactivate or reactivate a team member." };
  }
  if (!currentUser.firmId) {
    return { ok: false, error: "No firm on this account." };
  }

  const parsed = setActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { targetUserId, active } = parsed.data;

  if (!active && targetUserId === currentUser.id) {
    return { ok: false, error: "You cannot deactivate your own account." };
  }

  const draftWarning = await withUserContext(currentUser.id, async (tx) => {
    if (active) return null; // only relevant when deactivating
    const drafts = await tx
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.createdBy, targetUserId), eq(journalEntries.status, "draft")));
    return drafts.length > 0 ? `They have ${drafts.length} unposted draft${drafts.length === 1 ? "" : "s"} — deactivating won't delete them, but no one else can edit them as this person.` : null;
  });

  try {
    await withUserContext(currentUser.id, (tx) => tx.update(users).set({ active }).where(eq(users.id, targetUserId)));
  } catch (err) {
    // Covers every RLS/trigger refusal above with one message — Postgres's
    // own error text (e.g. "at least one active Owner") is logged for
    // debugging but not shown verbatim, matching this app's existing
    // pattern of not leaking raw DB errors to the UI.
    console.error(`Team member ${active ? "reactivate" : "deactivate"}: DB update failed:`, err);
    const fallback = active ? "Could not reactivate this account." : "Could not deactivate this account.";
    const message = err instanceof Error && err.message.includes("last active Owner") ? "A firm must always have at least one active Owner." : fallback;
    return { ok: false, error: message };
  }

  let sessionWarning: string | null = null;
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.auth.admin.updateUserById(targetUserId, { ban_duration: active ? UNBAN : BAN_FOREVER });
    if (error) throw error;
  } catch (err) {
    console.error(`Team member ${active ? "reactivate" : "deactivate"}: Supabase session ${active ? "unban" : "ban"} failed:`, err);
    sessionWarning = active
      ? "Reactivated, but couldn't confirm their sign-in was fully restored — ask them to try signing in."
      : "Deactivated, but couldn't confirm their existing sign-in session was revoked immediately — it will still stop working on their next action in this app.";
  }

  const warning = [draftWarning, sessionWarning].filter(Boolean).join(" ") || undefined;
  return { ok: true, warning };
}
