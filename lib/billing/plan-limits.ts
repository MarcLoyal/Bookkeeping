export type FirmPlan = "trial" | "free" | "basic" | "premium" | "enterprise";

export type PlanLimits = {
  maxClients: number;
  maxUsers: number;
  perClientAssignmentAllowed: boolean;
};

/**
 * The row shape getPlanLimits() actually reads — db/schema/firms.ts's
 * plan/maxClients/maxUsers/perClientAssignmentAllowed columns, which are
 * the same numbers db/sql/018_plan_limits.sql's triggers enforce. This is
 * deliberately NOT derived from `plan` alone: an 'enterprise' firm has no
 * fixed numbers (set by hand per firm, see PLAN_DEFAULTS below), so the
 * row itself has to be the source of truth, not a plan → limits table
 * looked up at read time.
 */
export type FirmForPlanLimits = {
  plan: FirmPlan;
  maxClients: number;
  maxUsers: number;
  perClientAssignmentAllowed: boolean;
};

export function getPlanLimits(firm: FirmForPlanLimits): PlanLimits {
  return {
    maxClients: firm.maxClients,
    maxUsers: firm.maxUsers,
    perClientAssignmentAllowed: firm.perClientAssignmentAllowed,
  };
}

/**
 * The numbers a firm's plan/maxClients/maxUsers/perClientAssignmentAllowed
 * columns get set to whenever a platform admin assigns a firm to this
 * plan (or a new firm signs up onto 'trial') — see
 * lib/auth/create-firm-for-user.ts and lib/billing/set-firm-plan.ts.
 * 'enterprise' has no entry here on purpose: there's no self-serve
 * enterprise signup, and its limits are whatever a platform admin types
 * in by hand for that one firm, not a fixed tier.
 */
export const PLAN_DEFAULTS: Record<Exclude<FirmPlan, "enterprise">, PlanLimits> = {
  trial: { maxClients: 10, maxUsers: 5, perClientAssignmentAllowed: true },
  free: { maxClients: 3, maxUsers: 1, perClientAssignmentAllowed: false },
  basic: { maxClients: 10, maxUsers: 2, perClientAssignmentAllowed: false },
  premium: { maxClients: 30, maxUsers: 10, perClientAssignmentAllowed: true },
};

export const TRIAL_DURATION_DAYS = 7;

export const PLAN_LABELS: Record<FirmPlan, string> = {
  trial: "Trial",
  free: "Free",
  basic: "Basic",
  premium: "Premium",
  enterprise: "Enterprise",
};
