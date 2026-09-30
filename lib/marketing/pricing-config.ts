import { PLAN_DEFAULTS, TRIAL_DURATION_DAYS } from "@/lib/billing/plan-limits";

/**
 * Single source of truth for the public Pricing page's copy
 * (app/(marketing)/pricing/page.tsx). Two different kinds of numbers live
 * here, deliberately kept apart:
 *
 * - Client/seat counts and the per-client-assignment feature are read
 *   straight off lib/billing/plan-limits.ts's PLAN_DEFAULTS — the SAME
 *   numbers already enforced by real DB triggers
 *   (db/sql/018_plan_limits.sql) the moment a firm signs up onto a plan.
 *   A marketing page promising a different number than what the product
 *   actually enforces would be worse than no page at all, so these are
 *   never restated here.
 * - monthlyPricePhp and REFERRAL_PROGRAM.discountPercent are true
 *   PLACEHOLDERS — there is no billing/payment system yet (see this PR's
 *   description), so nothing in the codebase enforces a price. Update
 *   them here, in one place, rather than hunting through the page
 *   component, once real numbers are ready.
 *
 * RECEIPT_CAPTURE_HIGHLIGHT (below) is a deliberate, later addition to
 * this file: the original version of this Pricing page said nothing
 * about AI receipt capture, since that feature was still sitting on a
 * separate, unmerged PR at the time and hadn't shipped to production
 * yet. This copy was added once you asked for it specifically — it
 * describes the feature generically (no scan-count numbers, no mention
 * of firms.maxAiScansPerMonth or its fair-use cap), so it stays correct
 * regardless of which PR merges first.
 */

export type PricingTierId = "basic" | "premium" | "enterprise";

export type PricingTier = {
  id: PricingTierId;
  name: string;
  tagline: string;
  /** PLACEHOLDER. Monthly price in PHP, or null for "Custom" (Enterprise — contact sales, no fixed sticker price). */
  monthlyPricePhp: number | null;
  /** Shown as a small tag on the card — Enterprise's "large corporations" positioning, per spec. */
  positioningTag?: string;
  clientsIncluded: string;
  subUserSeats: string;
  perClientAssignment: boolean;
  features: string[];
  ctaLabel: string;
};

export const TRIAL_OFFER = {
  days: TRIAL_DURATION_DAYS,
  maxClients: PLAN_DEFAULTS.trial.maxClients,
  description: `Full system access for ${TRIAL_DURATION_DAYS} days, no credit card required — manage up to ${PLAN_DEFAULTS.trial.maxClients} clients and try every feature before you commit.`,
};

/** PLACEHOLDER discount — finalize with a real number before launch. */
export const REFERRAL_PROGRAM = {
  discountPercent: 20,
  description:
    "Refer another bookkeeping firm to Keep.Books. Once they subscribe to a paid plan, you both get 20% off your next billing cycle — our way of saying thanks for spreading the word.",
};

/** Short highlight line shown near the top of the Pricing page. Deliberately generic — no scan counts or plan-specific numbers. */
export const RECEIPT_CAPTURE_HIGHLIGHT = "New: snap a photo of a receipt or invoice and Keep.Books drafts the entry for you — just review and confirm.";

const REPORTS_LINE = "Trial Balance, Income Statement, Balance Sheet, loose-leaf books, and every applicable BIR form";

/** PLACEHOLDER prices — finalize before launch. Everything else here reflects PLAN_DEFAULTS. */
export const PRICING_TIERS: PricingTier[] = [
  {
    id: "basic",
    name: "Basic",
    tagline: "For a solo bookkeeper managing a handful of clients",
    monthlyPricePhp: 2499,
    clientsIncluded: `Up to ${PLAN_DEFAULTS.basic.maxClients} clients`,
    subUserSeats: `${PLAN_DEFAULTS.basic.maxUsers} user seats`,
    perClientAssignment: PLAN_DEFAULTS.basic.perClientAssignmentAllowed,
    features: ["Chart of accounts + manual transaction encoding", REPORTS_LINE, "Client portal for document sharing", "Email support"],
    ctaLabel: "Start your free trial",
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "For a growing practice managing multiple clients with a small team",
    monthlyPricePhp: 7999,
    clientsIncluded: `Up to ${PLAN_DEFAULTS.premium.maxClients} clients`,
    subUserSeats: `${PLAN_DEFAULTS.premium.maxUsers} user seats`,
    perClientAssignment: PLAN_DEFAULTS.premium.perClientAssignmentAllowed,
    features: [
      "Everything in Basic",
      "Payroll processing (1601-C, 1601-EQ, 2307)",
      "Team roles: Owner, Bookkeeper, Reviewer, Encoder, Viewer",
      "Assign specific bookkeepers to specific clients",
      "Priority email support",
    ],
    ctaLabel: "Start your free trial",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For large corporations and multi-branch firms with custom needs",
    monthlyPricePhp: null,
    positioningTag: "Recommended for large corporations",
    clientsIncluded: "Custom — sized to your firm",
    subUserSeats: "Custom user seats",
    perClientAssignment: true,
    features: ["Everything in Premium", "Custom client and user limits", "Dedicated onboarding", "Priority support with a named contact"],
    ctaLabel: "Contact us",
  },
];
