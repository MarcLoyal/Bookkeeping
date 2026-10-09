import "server-only";
import { and, eq, isNull, lt } from "drizzle-orm";
import { authDb } from "@/db/authClient";
import { firms } from "@/db/schema";

/**
 * Called from getCurrentUser() (lib/auth/current-user.ts) on every
 * authenticated request — the same lazy, checked-on-request pattern every
 * other time-based feature in this app already uses (BIR deadlines
 * widget, activity health), rather than a cron job this app has no
 * infrastructure for at all.
 *
 * Idempotent no-op once flagged (the WHERE clause only ever matches
 * once), and deliberately just a flag — NOT the downgrade itself. The
 * actual downgrade (see downgrade-firm-to-free.ts) is a manual platform
 * admin action, per explicit instruction: watch it run correctly a few
 * times before making day 8 do it automatically.
 *
 * NOT what the platform admin dashboard's expired-trial queue depends on
 * — listExpiredTrialFirms() (lib/data/platform-billing.ts) checks
 * trialEndsAt directly, specifically because this function only ever
 * runs when someone from the firm is actively logging in, so a firm that
 * signs up and never returns would never trip it. This function still
 * exists purely to leave a "first noticed" timestamp on the row
 * (trialExpiredFlaggedAt) for anyone who finds it useful later, not as a
 * gate anything currently depends on.
 *
 * Runs on the RLS-bypassing authDb connection — firms has no UPDATE
 * policy for any firm-scoped role at all (only firms_select exists), so
 * this could never succeed through the normal per-request connection.
 * Same reasoning db/authClient.ts's own doc comment gives for every
 * other legitimate cross-boundary write it lists.
 */
export async function flagTrialExpiredIfNeeded(firmId: string): Promise<void> {
  await authDb
    .update(firms)
    .set({ trialExpiredFlaggedAt: new Date() })
    .where(and(eq(firms.id, firmId), eq(firms.plan, "trial"), lt(firms.trialEndsAt, new Date()), isNull(firms.trialExpiredFlaggedAt)));
}
