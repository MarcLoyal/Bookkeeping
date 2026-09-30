import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { authDb } from "@/db/authClient";
import { auditLog, clients, firms, users } from "@/db/schema";
import { PLAN_DEFAULTS } from "./plan-limits";

export type DowngradeResult =
  | { ok: true; clientsKeptActive: { id: string; name: string }[]; clientsMadeReadOnly: number; staffDeactivated: number }
  | { ok: false; error: string };

/**
 * The manual downgrade action a platform admin triggers from the
 * dashboard's expired-trial queue — see DECISIONS.md for why this is a
 * manual click rather than something day 8 does on its own. Also usable
 * against a Basic/Premium firm that's simply been moved to Free by hand
 * (see set-firm-plan.ts) — "downgrade" here means "make this firm's
 * actual state match the Free plan's limits," not specifically
 * "trial expired."
 *
 * Runs on authDb (RLS-bypassing): platform_admin has no INSERT/UPDATE
 * policy on clients or users at all (both are scoped to
 * app_current_firm_id(), which is NULL for a platform_admin session) —
 * this is exactly the kind of legitimate cross-tenant operation
 * db/authClient.ts's own doc comment describes, not a shortcut.
 *
 * Order within the one transaction matters for
 * db/sql/018_plan_limits.sql's triggers, though every step here happens
 * to be safe regardless of order (each one only ever REDUCES the active
 * count/seat count, and firms.max_clients/max_users only ever gates a
 * client/user row trying to become newly counted — changing the firm's
 * own limit downward never itself re-checks existing rows). Kept in this
 * order anyway because it reads the way the feature was described:
 * pick which clients stay active → shrink the plan → clear out the
 * excess staff.
 */
export async function downgradeFirmToFree(platformAdminId: string, firmId: string): Promise<DowngradeResult> {
  const [firm] = await authDb.select().from(firms).where(eq(firms.id, firmId));
  if (!firm) return { ok: false, error: "Firm not found." };

  return authDb.transaction(async (tx) => {
    const { maxClients, maxUsers, perClientAssignmentAllowed } = PLAN_DEFAULTS.free;

    // Most-recently-viewed first (across any user at the firm), oldest/
    // never-viewed last — the top `maxClients` stay active, matching
    // "auto-pick, Owner can swap after" (see swap-active-client.ts for
    // the swap side of that). Raw SQL, not the query builder — matches
    // lib/data/platform-dashboard.ts's own established pattern for a
    // GROUP BY + MAX() + ORDER BY combination like this one.
    const candidates = (await tx.execute(sql`
      select c.id, c.registered_name as name, max(v.last_viewed_at) as last_viewed
      from clients c
      left join user_client_views v on v.client_id = c.id
      where c.firm_id = ${firmId} and c.status in ('onboarding', 'active')
      group by c.id, c.registered_name
      order by max(v.last_viewed_at) desc nulls last, c.created_at desc
    `)) as unknown as { id: string; name: string; last_viewed: Date | null }[];

    const keep = candidates.slice(0, maxClients);
    const demote = candidates.slice(maxClients);

    if (demote.length > 0) {
      await tx
        .update(clients)
        .set({ status: "inactive" })
        .where(
          inArray(
            clients.id,
            demote.map((c) => c.id)
          )
        );
    }

    await tx
      .update(firms)
      .set({
        plan: "free",
        maxClients,
        maxUsers,
        perClientAssignmentAllowed,
        trialEndsAt: null,
        trialExpiredFlaggedAt: null,
      })
      .where(eq(firms.id, firmId));

    const deactivated = await tx
      .update(users)
      .set({ active: false })
      .where(and(eq(users.firmId, firmId), ne(users.role, "firm_admin"), ne(users.role, "client_user"), eq(users.active, true)))
      .returning({ id: users.id });

    await tx.insert(auditLog).values({
      actorUserId: platformAdminId,
      action: "PLAN_DOWNGRADE",
      tableName: "firms",
      recordId: firmId,
      before: { plan: firm.plan, maxClients: firm.maxClients, maxUsers: firm.maxUsers },
      after: { plan: "free", maxClients, maxUsers },
    });

    return {
      ok: true,
      clientsKeptActive: keep.map((c) => ({ id: c.id, name: c.name })),
      clientsMadeReadOnly: demote.length,
      staffDeactivated: deactivated.length,
    };
  });
}
