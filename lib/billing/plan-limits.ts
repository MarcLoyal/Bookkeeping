export type FirmPlan = "trial" | "free" | "basic" | "premium" | "enterprise";

export type PlanLimits = {
  maxClients: number;
  maxUsers: number;
  perClientAssignmentAllowed: boolean;
  /**
   * A fair-use safety net on AI receipt scans per calendar month, not a
   * customer-facing pricing tier — see db/sql/023_ai_scan_plan_limit.sql.
   * Generous by design: it's there to bound unexpected Anthropic API cost
   * from a bug or heavy misuse, not to meter normal usage.
   */
  maxAiScansPerMonth: number;
};

/**
 * The row shape getPlanLimits() actually reads — db/schema/firms.ts's
 * plan/maxClients/maxUsers/perClientAssignmentAllowed/maxAiScansPerMonth
 * columns, which are the same numbers db/sql/018_plan_limits.sql's and
 * db/sql/023_ai_scan_plan_limit.sql's triggers enforce. This is
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
  maxAiScansPerMonth: number;
};

export function getPlanLimits(firm: FirmForPlanLimits): PlanLimits {
  return {
    maxClients: firm.maxClients,
    maxUsers: firm.maxUsers,
    perClientAssignmentAllowed: firm.perClientAssignmentAllowed,
    maxAiScansPerMonth: firm.maxAiScansPerMonth,
  };
}

/**
 * The numbers a firm's plan/maxClients/maxUsers/perClientAssignmentAllowed/
 * maxAiScansPerMonth columns get set to whenever a platform admin assigns
 * a firm to this plan (or a new firm signs up onto 'trial') — see
 * lib/auth/create-firm-for-user.ts and lib/billing/set-firm-plan.ts.
 * 'enterprise' has no entry here on purpose: there's no self-serve
 * enterprise signup, and its limits are whatever a platform admin types
 * in by hand for that one firm, not a fixed tier.
 *
 * maxAiScansPerMonth scales roughly with maxClients/maxUsers but stays
 * deliberately generous at every tier — e.g. Basic's 150/month against 10
 * clients is ~15/client/month, nowhere near a normal bookkeeper's actual
 * receipt volume. Trial matches Premium's number, consistent with "full
 * Premium-level access" already being the rule for every other trial
 * limit.
 */
export const PLAN_DEFAULTS: Record<Exclude<FirmPlan, "enterprise">, PlanLimits> = {
  trial: { maxClients: 10, maxUsers: 5, perClientAssignmentAllowed: true, maxAiScansPerMonth: 500 },
  free: { maxClients: 3, maxUsers: 1, perClientAssignmentAllowed: false, maxAiScansPerMonth: 20 },
  basic: { maxClients: 10, maxUsers: 2, perClientAssignmentAllowed: false, maxAiScansPerMonth: 150 },
  premium: { maxClients: 30, maxUsers: 10, perClientAssignmentAllowed: true, maxAiScansPerMonth: 500 },
};

export const TRIAL_DURATION_DAYS = 7;

export const PLAN_LABELS: Record<FirmPlan, string> = {
  trial: "Trial",
  free: "Free",
  basic: "Basic",
  premium: "Premium",
  enterprise: "Enterprise",
};
