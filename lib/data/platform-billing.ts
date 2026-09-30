import "server-only";
import { asc, eq, isNotNull } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { firms, users } from "@/db/schema";
import type { FirmPlan } from "@/lib/billing/plan-limits";

export type ExpiredTrialFirmRow = {
  id: string;
  name: string;
  plan: FirmPlan;
  ownerName: string | null;
  ownerEmail: string | null;
  trialExpiredFlaggedAt: Date;
};

/**
 * The platform admin dashboard's expired-trial queue: every firm whose
 * day-8 check (flagTrialExpiredIfNeeded(), lib/billing/flag-expired-
 * trials.ts) has already flagged it, oldest flag first — matching "a
 * queue," not most-recent-first. Only reads `trialExpiredFlaggedAt`, not
 * `trialEndsAt` directly: a firm a platform admin already extended (which
 * clears the flag, see extend-firm-trial.ts) or changed off trial (which
 * also clears it, see set-firm-plan.ts) correctly falls out of this list
 * even if its old trialEndsAt is technically still in the past.
 *
 * Runs through withUserContext, not authDb: firms_select_platform_admin
 * (007_platform_admin_dashboard.sql) already grants platform_admin
 * unconditional SELECT on firms, and users_select_platform_admin_owners
 * grants the same for firm_admin rows specifically — this is an ordinary
 * read, not one of the cross-tenant writes db/authClient.ts's doc comment
 * reserves authDb for.
 */
export async function listExpiredTrialFirms(platformAdminId: string): Promise<ExpiredTrialFirmRow[]> {
  return withUserContext(platformAdminId, async (tx) => {
    const [firmRows, ownerRows] = await Promise.all([
      tx
        .select({ id: firms.id, name: firms.name, plan: firms.plan, trialExpiredFlaggedAt: firms.trialExpiredFlaggedAt })
        .from(firms)
        .where(isNotNull(firms.trialExpiredFlaggedAt))
        .orderBy(asc(firms.trialExpiredFlaggedAt)),
      tx
        .select({ firmId: users.firmId, name: users.name, email: users.email, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.role, "firm_admin")),
    ]);

    // Earliest firm_admin per firm — same "who actually signed this firm
    // up" convention listFirmsForDashboard() uses (lib/data/platform-
    // dashboard.ts), for the same reason: a firm can have more than one
    // Owner-role account via in-app staff invites.
    const ownerByFirm = new Map<string, (typeof ownerRows)[number]>();
    for (const owner of ownerRows) {
      if (!owner.firmId) continue;
      const existing = ownerByFirm.get(owner.firmId);
      if (!existing || owner.createdAt < existing.createdAt) ownerByFirm.set(owner.firmId, owner);
    }

    return firmRows.map((firm) => {
      const owner = ownerByFirm.get(firm.id);
      return {
        id: firm.id,
        name: firm.name,
        plan: firm.plan,
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        // Non-null by the WHERE clause above — asserted, not re-checked,
        // to keep the row type callers see (ExpiredTrialFirmRow) honest.
        trialExpiredFlaggedAt: firm.trialExpiredFlaggedAt!,
      };
    });
  });
}
