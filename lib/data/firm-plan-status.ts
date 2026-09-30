import "server-only";
import { eq, sql } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { clients, firms } from "@/db/schema";
import type { FirmPlan } from "@/lib/billing/plan-limits";

export type FirmPlanStatus = {
  plan: FirmPlan;
  trialEndsAt: Date | null;
  inactiveClientCount: number;
};

/**
 * Powers the Owner-facing plan-status banner (AppLayout, firm_admin only)
 * — deliberately just the three fields that decide whether to show it:
 * current plan, trial end date, and how many of this firm's clients are
 * currently read-only (over the plan's limit). No maxClients/maxUsers
 * here since the banner never needs to show numbers, only state.
 *
 * `firms.select()` with no WHERE still only returns this firm's own row —
 * firms_select (001_functions_triggers_rls.sql) scopes it to
 * app_current_firm_id(), the same reliance getFirmDashboardStats()
 * (lib/data/dashboard.ts) already places on RLS for `clients`.
 */
export async function getFirmPlanStatus(userId: string): Promise<FirmPlanStatus | null> {
  return withUserContext(userId, async (tx) => {
    const [firm] = await tx.select({ plan: firms.plan, trialEndsAt: firms.trialEndsAt }).from(firms).limit(1);
    if (!firm) return null;

    const [{ count: inactiveClientCount }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(eq(clients.status, "inactive"));

    return { plan: firm.plan, trialEndsAt: firm.trialEndsAt, inactiveClientCount };
  });
}
