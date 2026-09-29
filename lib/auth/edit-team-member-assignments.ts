import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withUserContext } from "@/db/client";
import { clients, userClientAssignments, users } from "@/db/schema";
import type { CurrentUser } from "./current-user";

export const editAssignmentsSchema = z.object({
  targetUserId: z.string().uuid(),
  clientIds: z.array(z.string().uuid()).default([]),
  // Owner-only (silently ignored for a Bookkeeper's request — the form
  // never renders this field for one, and db/sql/012_team_lifecycle_rls.sql's
  // trigger would reject a Bookkeeper's users UPDATE outright regardless).
  accessScope: z.enum(["all", "assigned"]).optional(),
});

export type EditAssignmentsResult = { ok: true } | { ok: false; error: string };

/**
 * Changes which clients a staff member is assigned to:
 *   - Owner may edit anyone's assignments.
 *   - Bookkeeper may only edit an Encoder's, and only to clients the
 *     Bookkeeper can themselves access — both checked here for a clean
 *     error message, and enforced again (the real backstop) by
 *     db/sql/010_bookkeeper_add_encoder_rls.sql's uca_write policy,
 *     unchanged since that PR — it was already FOR ALL (covers
 *     INSERT/UPDATE/DELETE), not just the INSERT it was originally
 *     written for.
 *
 * Diffs the requested clientIds against the target's current assignments
 * (as visible to the EDITOR — RLS's uca_select already scopes this the
 * same way it scopes the Team page's own "Clients" column) and inserts/
 * deletes only what changed, rather than clearing and re-adding
 * everything: a Bookkeeper editing an Encoder who also has an assignment
 * to a client OUTSIDE the Bookkeeper's own access must never be able to
 * see or touch that row at all, and a full clear-and-replace would
 * silently drop it.
 */
export async function editTeamMemberAssignments(currentUser: CurrentUser, input: unknown): Promise<EditAssignmentsResult> {
  if (currentUser.role !== "firm_admin" && currentUser.role !== "bookkeeper") {
    return { ok: false, error: "Only an Owner or Bookkeeper can edit assignments." };
  }
  if (!currentUser.firmId) {
    return { ok: false, error: "No firm on this account." };
  }

  const parsed = editAssignmentsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { targetUserId, clientIds, accessScope } = parsed.data;

  return withUserContext(currentUser.id, async (tx) => {
    const [target] = await tx.select({ id: users.id, role: users.role, firmId: users.firmId }).from(users).where(eq(users.id, targetUserId)).limit(1);
    if (!target || target.firmId !== currentUser.firmId) {
      return { ok: false, error: "That team member wasn't found." };
    }

    if (currentUser.role === "bookkeeper" && target.role !== "encoder") {
      return { ok: false, error: "Bookkeepers can only edit an Encoder's client assignments." };
    }

    if (clientIds.length > 0) {
      const accessible = await tx.select({ id: clients.id }).from(clients).where(eq(clients.firmId, currentUser.firmId!));
      const accessibleIds = new Set(accessible.map((c) => c.id));
      const invalid = clientIds.filter((id) => !accessibleIds.has(id));
      if (invalid.length > 0) {
        return { ok: false, error: "One or more selected clients aren't ones you have access to." };
      }
    }

    const current = await tx.select({ clientId: userClientAssignments.clientId }).from(userClientAssignments).where(eq(userClientAssignments.userId, targetUserId));
    const currentIds = new Set(current.map((c) => c.clientId));
    const requestedIds = new Set(clientIds);

    const toAdd = clientIds.filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !requestedIds.has(id));

    try {
      if (toAdd.length > 0) {
        await tx.insert(userClientAssignments).values(toAdd.map((clientId) => ({ userId: targetUserId, clientId })));
      }
      for (const clientId of toRemove) {
        await tx.delete(userClientAssignments).where(and(eq(userClientAssignments.userId, targetUserId), eq(userClientAssignments.clientId, clientId)));
      }
      if (accessScope && currentUser.role === "firm_admin") {
        await tx.update(users).set({ accessScope }).where(eq(users.id, targetUserId));
      }
    } catch (err) {
      console.error("Edit team member assignments: DB write failed:", err);
      return { ok: false, error: "Something went wrong saving these assignments. Please try again." };
    }

    return { ok: true };
  });
}
