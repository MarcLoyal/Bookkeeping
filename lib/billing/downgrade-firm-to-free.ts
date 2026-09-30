import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { authDb } from "@/db/authClient";
import { auditLog, clients, firms, users } from "@/db/schema";
import { PLAN_DEFAULTS } from "./plan-limits";

export type DowngradeResult =
  | { ok: true; clientsKeptActive: { id: string; name: string }[]; clientsMadeReadOnly: number; staffDeactivated: number }
  | { ok: false; error: string };

type ClientCandidate = { id: string; name: string; last_viewed: Date | null };

/**
 * Most-recently-viewed first (across any user at the firm), oldest/
 * never-viewed last — shared by the real downgrade below AND
 * previewDowngradeFirmToFree() so the platform admin dashboard's "here's
 * what will happen" preview can never drift from what actually happens on
 * confirm. Raw SQL, not the query builder — matches
 * lib/data/platform-dashboard.ts's own established pattern for a GROUP BY
 * + MAX() + ORDER BY combination like this one. Takes any drizzle-like
 * executor (a `tx` inside a transaction, or `authDb` directly for a plain
 * read) since neither caller needs a transaction just to SELECT.
 */
async function selectDowngradeCandidates(db: { execute: typeof authDb.execute }, firmId: string): Promise<ClientCandidate[]> {
  return (await db.execute(sql`
    select c.id, c.registered_name as name, max(v.last_viewed_at) as last_viewed
    from clients c
    left join user_client_views v on v.client_id = c.id
    where c.firm_id = ${firmId} and c.status in ('onboarding', 'active')
    group by c.id, c.registered_name
    order by max(v.last_viewed_at) desc nulls last, c.created_at desc
  `)) as unknown as ClientCandidate[];
}

/** Same staff the downgrade below deactivates: every non-Owner, non-client_user role that's currently active. */
async function selectStaffToDeactivate(db: { select: typeof authDb.select }, firmId: string) {
  return db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.firmId, firmId), ne(users.role, "firm_admin"), ne(users.role, "client_user"), eq(users.active, true)));
}

export type DowngradePreview =
  | {
      ok: true;
      clientsToKeepActive: { id: string; name: string }[];
      clientsToMakeReadOnly: { id: string; name: string }[];
      staffToDeactivate: { id: string; name: string; role: string }[];
    }
  | { ok: false; error: string };

/**
 * Read-only dry run for the platform admin dashboard's "here's what will
 * happen" confirmation step, before downgradeFirmToFree() actually runs.
 * Deliberately reuses selectDowngradeCandidates/selectStaffToDeactivate
 * rather than a separate hand-written query — this preview being wrong
 * (showing different clients/staff than the real action touches) would be
 * worse than not having a preview at all.
 */
export async function previewDowngradeFirmToFree(firmId: string): Promise<DowngradePreview> {
  const [firm] = await authDb.select().from(firms).where(eq(firms.id, firmId));
  if (!firm) return { ok: false, error: "Firm not found." };

  const { maxClients } = PLAN_DEFAULTS.free;
  const [candidates, staff] = await Promise.all([selectDowngradeCandidates(authDb, firmId), selectStaffToDeactivate(authDb, firmId)]);

  return {
    ok: true,
    clientsToKeepActive: candidates.slice(0, maxClients).map((c) => ({ id: c.id, name: c.name })),
    clientsToMakeReadOnly: candidates.slice(maxClients).map((c) => ({ id: c.id, name: c.name })),
    staffToDeactivate: staff,
  };
}

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
    // the swap side of that). Shared with previewDowngradeFirmToFree()
    // above so the dashboard's preview can never show different clients
    // than this actually keeps/demotes.
    const candidates = await selectDowngradeCandidates(tx, firmId);

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
