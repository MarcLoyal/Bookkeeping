import Link from "next/link";
import { Check } from "lucide-react";
import {
  ANNUAL_BONUS_OFFER,
  BILLING_CADENCE_NOTE,
  CLIENT_DEFINITION_NOTE,
  PLAN_POSITIONING_NOTE,
  PRICING_TIERS,
  REFERRAL_PROGRAM,
  TRIAL_OFFER,
  type PricingTier,
} from "@/lib/marketing/pricing-config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getFirmPlanStatus } from "@/lib/data/firm-plan-status";
import { PLAN_LABELS, type FirmPlan } from "@/lib/billing/plan-limits";

export const metadata = {
  title: "Pricing — Keep.Books",
  description: "Simple, launch pricing for Philippine bookkeeping firms. Start with a 7-day free trial.",
};

function formatPhp(amount: number) {
  return `₱${amount.toLocaleString("en-PH")}`;
}

// No self-serve billing/checkout exists yet (see this file's own PRICING_TIERS
// comment) — relative standing only decides the wording ("Upgrade" vs "Switch
// Plan"), never which actions are actually allowed. 'trial'/'free' both rank
// below the two real paid tiers shown here, so moving off either one always
// reads as an upgrade.
const PLAN_RANK: Record<FirmPlan, number> = { trial: 0, free: 0, basic: 1, premium: 2, enterprise: 3 };

const SUPPORT_EMAIL = "mrcabanador@gmail.com";

function buildPlanChangeMailto(tier: PricingTier, currentPlan: FirmPlan) {
  const upgrading = PLAN_RANK[tier.id] > PLAN_RANK[currentPlan];
  const subject = `I want to ${upgrading ? "upgrade to" : "switch to"} ${tier.name}`;
  const body = `Hi, I'd like to ${upgrading ? "upgrade" : "switch"} my firm from the ${PLAN_LABELS[currentPlan]} plan to the ${tier.name} plan. Please let me know the next steps.`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function TierCard({ tier, currentPlan }: { tier: PricingTier; currentPlan: FirmPlan | null }) {
  const highlighted = tier.id === "enterprise";
  return (
    <div
      className={`flex flex-col rounded-xl border p-6 ${
        highlighted ? "border-slate-900 bg-white shadow-lg shadow-slate-900/10" : "border-slate-200 bg-white shadow-sm"
      }`}
    >
      {tier.positioningTag && (
        <span className="mb-3 inline-block w-fit rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">{tier.positioningTag}</span>
      )}
      <h3 className="text-lg font-bold text-slate-900">{tier.name}</h3>
      <p className="mt-1 text-sm text-slate-500">{tier.tagline}</p>

      <div className="mt-5">
        {tier.annualPricePhp !== null ? (
          <>
            <p>
              <span className="text-3xl font-bold tracking-tight text-slate-900">{formatPhp(tier.annualPricePhp)}</span>
              <span className="text-sm text-slate-500"> / year</span>
            </p>
            {tier.monthlyPricePhp !== null && <p className="mt-1 text-xs text-slate-400">≈ {formatPhp(tier.monthlyPricePhp)}/month</p>}
            <p className="mt-1 text-xs text-slate-400">{BILLING_CADENCE_NOTE}</p>
          </>
        ) : (
          <p className="text-3xl font-bold tracking-tight text-slate-900">Custom</p>
        )}
      </div>

      <div className="mt-5 space-y-1.5 border-y border-slate-100 py-5 text-sm text-slate-700">
        <p>
          <span className="font-semibold text-slate-900">{tier.clientsIncluded}</span>
        </p>
        {tier.transactionsIncluded && (
          <p>
            <span className="font-semibold text-slate-900">{tier.transactionsIncluded}</span>
          </p>
        )}
        <p>
          <span className="font-semibold text-slate-900">{tier.subUserSeats}</span>
        </p>
        <p>
          <span className="font-semibold text-slate-900">{tier.perClientAssignment ? "Yes" : "No"}</span> per-client staff assignment
        </p>
      </div>

      {tier.addOnLine && <p className="mt-5 rounded-md bg-slate-50 p-3 text-sm text-slate-600">{tier.addOnLine}</p>}

      <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-600">
        {tier.features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {tier.annualBonusEligible && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <p className="text-sm font-medium text-slate-900">{ANNUAL_BONUS_OFFER.headline}</p>
          <p className="mt-1 text-xs text-slate-500">{ANNUAL_BONUS_OFFER.finePrint}</p>
        </div>
      )}

      {(() => {
        const ctaClassName = `mt-6 block rounded-md px-4 py-2.5 text-center text-sm font-medium ${
          highlighted ? "border border-slate-300 text-slate-900 hover:bg-slate-50" : "bg-slate-900 text-white hover:bg-slate-800"
        }`;

        // Enterprise keeps its existing "Contact us" → /signup link unchanged
        // regardless of login state — it has no fixed tier to compare a
        // signed-in firm's plan against in the first place.
        if (tier.id === "enterprise" || currentPlan === null) {
          return (
            <Link href="/signup" className={ctaClassName}>
              {tier.ctaLabel}
            </Link>
          );
        }

        if (currentPlan === tier.id) {
          return (
            <span className="mt-6 block cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-4 py-2.5 text-center text-sm font-medium text-slate-500">
              Current Plan
            </span>
          );
        }

        const upgrading = PLAN_RANK[tier.id] > PLAN_RANK[currentPlan];
        return (
          <a href={buildPlanChangeMailto(tier, currentPlan)} className={ctaClassName}>
            {upgrading ? "Upgrade" : "Switch Plan"}
          </a>
        );
      })()}
    </div>
  );
}

export default async function PricingPage() {
  const user = await getCurrentUser();
  // null covers both "not logged in" and "logged in but no firm plan to
  // compare against" (platform_admin, client_user) — both fall back to the
  // same default signup-flow button as a logged-out visitor.
  const currentPlan = user?.firmId ? (await getFirmPlanStatus(user.id))?.plan ?? null : null;
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-block rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Launch pricing
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Simple pricing, built for Philippine bookkeeping firms</h1>
        <p className="mt-4 text-base text-slate-600">
          We just launched, so pricing is intentionally friendly to early firms — no surprise fees, no long-term lock-in. Every plan starts with a free
          trial.
        </p>
      </div>

      <div className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">{TRIAL_OFFER.days}-day free trial</p>
        <p className="text-sm text-slate-600">{TRIAL_OFFER.description}</p>
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-slate-500">{PLAN_POSITIONING_NOTE}</p>

      <div className="mx-auto mt-6 grid max-w-5xl gap-6 md:grid-cols-3">
        {PRICING_TIERS.map((tier) => (
          <TierCard key={tier.id} tier={tier} currentPlan={currentPlan} />
        ))}
      </div>

      <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-slate-400">{CLIENT_DEFINITION_NOTE}</p>

      <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-slate-900">Refer a firm, save {REFERRAL_PROGRAM.discountPercent}%</p>
        <p className="mt-2 text-sm text-slate-600">{REFERRAL_PROGRAM.description}</p>
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-slate-500">
        Have questions about plans or billing?{" "}
        <Link href="/faq" className="font-medium text-slate-900 hover:underline">
          Check our FAQ
        </Link>{" "}
        or{" "}
        <Link href="/signup" className="font-medium text-slate-900 hover:underline">
          start your free trial
        </Link>{" "}
        — no credit card required.
      </p>
    </div>
  );
}
