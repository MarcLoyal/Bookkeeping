import type { FirmPlanStatus } from "@/lib/data/firm-plan-status";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Owner-only (see AppLayout, which fetches getFirmPlanStatus() only for
 * firm_admin and passes it in here). Two distinct situations this can
 * show for, never both at once: Free-with-read-only-clients (post-
 * downgrade state) or a trial that's ending soon/already past
 * trialEndsAt but not yet acted on. Every other plan/state renders
 * nothing — this is a "you need to do something" notice, not a general
 * plan-info bar.
 *
 * "Approaching" trial end is defined as 2 days or fewer remaining
 * (including already past) — enough warning to reach out before the
 * day-8 flag/downgrade cycle without nagging for the whole trial.
 */
export function PlanStatusBanner({ status }: { status: FirmPlanStatus | null }) {
  if (!status) return null;

  if (status.plan === "free" && status.inactiveClientCount > 0) {
    return (
      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="font-semibold">You&apos;re on the Free plan.</span> {status.inactiveClientCount}{" "}
        {status.inactiveClientCount === 1 ? "client is" : "clients are"} read-only — their records are safe and exports still
        work, but new entries are blocked. Contact us to upgrade and pick which clients are active again.
      </div>
    );
  }

  if (status.plan === "trial" && status.trialEndsAt) {
    const daysLeft = Math.ceil((status.trialEndsAt.getTime() - Date.now()) / DAY_MS);
    if (daysLeft <= 2) {
      return (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">{daysLeft > 0 ? `Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.` : "Your trial has ended."}</span>{" "}
          Contact us to upgrade — there&apos;s no self-serve payment yet, so nothing changes on your account until we hear
          from you.
        </div>
      );
    }
  }

  return null;
}
