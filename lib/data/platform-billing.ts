import "server-only";
import { and, asc, eq, lt } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { firms, users } from "@/db/schema";
import type { FirmPlan } from "@/lib/billing/plan-limits";

export type ExpiredTrialFirmRow = {
  id: string;
  name: string;
  plan: FirmPlan;
  ownerName: string | null;
  ownerEmail: string | null;
  trialEndsAt: Date;
};

/**
 * The platform admin dashboard's expired-trial queue: every firm still on
 * the trial plan whose trialEndsAt has passed, oldest-expired first —
 * computed directly from the date, not from trialExpiredFlaggedAt.
 *
 * Deliberately NOT keyed off the flag: flagTrialExpiredIfNeeded()
 * (lib/billing/flag-expired-trials.ts) only runs as a side effect of
 * someone from the firm logging in, so a trial that signs up and never
 * comes back would never get flagged and would sit invisible to platform
 * admins forever — exactly the case that matters most here. A trial is
 * expired once its date has passed, full stop; whether anyone from the
 * firm has been active since plays no part in that.
 *
 * `plan = 'trial'` alone already excludes a firm a platform admin
 * extended (extend-firm-trial.ts moves trialEndsAt into the future,
 * which fails `lt(trialEndsAt, now())` on its own) or moved off trial
 * entirely (set-firm-plan.ts / downgrade-firm-to-free.ts both change
 * `plan` away from 'trial') — no separate flag needed to keep either
 * case out of this list.
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
        .select({ id: firms.id, name: firms.name, plan: firms.plan, trialEndsAt: firms.trialEndsAt })
        .from(firms)
        .where(and(eq(firms.plan, "trial"), lt(firms.trialEndsAt, new Date())))
        .orderBy(asc(firms.trialEndsAt)),
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
        trialEndsAt: firm.trialEndsAt!,
      };
    });
  });
}
