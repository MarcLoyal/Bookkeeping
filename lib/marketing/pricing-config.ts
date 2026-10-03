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
 * transactionsIncluded, addOnLine, and ANNUAL_BONUS_OFFER are PLACEHOLDERS
 * too, same reasoning as monthlyPricePhp: there is no transaction-metering,
 * usage-tracking, add-on-purchase, or annual-billing system yet, so none of
 * these numbers are enforced anywhere in the product today. This is a
 * deliberate, content-only update ahead of that backend work — see
 * DECISIONS.md's "Pricing content update: Custom plan rename, transaction
 * allowances, annual bonus" entry.
 *
 * Still says nothing about AI receipt capture, same as PR #44's original
 * reasoning: that feature's UI (claude/receipt-capture-ui, PR #43) is still
 * unmerged, and advertising a feature that isn't live in production yet
 * would be worse than leaving it out until it ships. Add it back in once
 * #43 merges.
 */

export type PricingTierId = "basic" | "premium" | "enterprise";

export type PricingTier = {
  id: PricingTierId;
  name: string;
  tagline: string;
  /** PLACEHOLDER. Monthly price in PHP, or null for "Custom" (contact sales, no fixed sticker price). */
  monthlyPricePhp: number | null;
  /** Shown as a small tag on the card — Custom's "large corporations" positioning, per spec. */
  positioningTag?: string;
  clientsIncluded: string;
  /** PLACEHOLDER — not enforced by any metering system yet. Omit for tiers with no fixed allowance (e.g. Custom). */
  transactionsIncluded?: string;
  subUserSeats: string;
  perClientAssignment: boolean;
  features: string[];
  /** PLACEHOLDER — optional upsell line shown inside the card, below the limits block. No purchase flow exists yet. */
  addOnLine?: string;
  /** Whether this tier's card shows the annual-prepay bonus-client-slots offer (see ANNUAL_BONUS_OFFER). */
  annualBonusEligible?: boolean;
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

/**
 * PLACEHOLDER — shown on every annual-bonus-eligible tier's card (Basic and
 * Premium; see PricingTier.annualBonusEligible). No annual billing cycle or
 * bonus-slot grant exists in the product yet.
 */
export const ANNUAL_BONUS_OFFER = {
  headline: "Pay one full year upfront and get 2 bonus client slots, permanently.",
  finePrint:
    "Granted once per account with a full annual upfront payment. Yours to keep even if you change your billing cycle later. Semi-annual payments do not qualify.",
};

/** Shown once, near the plan cards. */
export const PLAN_POSITIONING_NOTE =
  "Basic and Premium are built for small and medium business clients. High-volume clients are covered by Custom.";

/**
 * Shown once, near the plan comparison. Defines what counts against a
 * plan's client limit — matters now that cards show a fixed "N active
 * clients" number instead of "Up to N clients".
 */
export const CLIENT_DEFINITION_NOTE =
  "A client is an active client business managed within your workspace. Archived clients do not use a slot.";

const REPORTS_LINE = "Trial Balance, Income Statement, Balance Sheet, loose-leaf books, and every applicable BIR form";

/** PLACEHOLDER prices — finalize before launch. Everything else here reflects PLAN_DEFAULTS. */
export const PRICING_TIERS: PricingTier[] = [
  {
    id: "basic",
    name: "Basic",
    tagline: "For a solo bookkeeper managing a handful of clients",
    monthlyPricePhp: 2499,
    clientsIncluded: `${PLAN_DEFAULTS.basic.maxClients} active clients`,
    transactionsIncluded: "3,000 transactions per month",
    subUserSeats: `${PLAN_DEFAULTS.basic.maxUsers} user seats`,
    perClientAssignment: PLAN_DEFAULTS.basic.perClientAssignmentAllowed,
    features: ["Chart of accounts + manual transaction encoding", REPORTS_LINE, "Client portal for document sharing", "Email support"],
    addOnLine: "Need a little more room? Add 5 clients and 1,500 transactions a month for ₱7,500/year.",
    annualBonusEligible: true,
    ctaLabel: "Start your free trial",
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "For a growing practice managing multiple clients with a small team",
    monthlyPricePhp: 7999,
    clientsIncluded: `${PLAN_DEFAULTS.premium.maxClients} active clients`,
    transactionsIncluded: "15,000 transactions per month",
    subUserSeats: `${PLAN_DEFAULTS.premium.maxUsers} user seats`,
    perClientAssignment: PLAN_DEFAULTS.premium.perClientAssignmentAllowed,
    features: [
      "Everything in Basic",
      "Payroll processing (1601-C, 1601-EQ, 2307)",
      "Team roles: Owner, Bookkeeper, Reviewer, Encoder, Viewer",
      "Assign specific bookkeepers to specific clients",
      "Priority email support",
    ],
    annualBonusEligible: true,
    ctaLabel: "Start your free trial",
  },
  {
    id: "enterprise",
    name: "Custom",
    tagline: "Custom client capacity and users. Contact us for a quote.",
    monthlyPricePhp: null,
    positioningTag: "Recommended for large corporations",
    clientsIncluded: "Custom — sized to your firm",
    subUserSeats: "Custom user seats",
    perClientAssignment: true,
    features: ["Everything in Premium", "Custom client and user limits", "Dedicated onboarding", "Priority support with a named contact"],
    ctaLabel: "Contact us",
  },
];
