import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authDb } from "@/db/authClient";
import { auditLog, firms } from "@/db/schema";
import { PLAN_DEFAULTS, TRIAL_DURATION_DAYS, type FirmPlan } from "./plan-limits";

export const setFirmPlanSchema = z
  .object({
    firmId: z.string().uuid(),
    plan: z.enum(["trial", "free", "basic", "premium", "enterprise"]),
    // Only read for 'enterprise' — every other plan uses PLAN_DEFAULTS.
    // Required there since enterprise has no fixed tier ("set by hand
    // per firm" — no self-serve enterprise signup exists).
    maxClients: z.number().int().positive().optional(),
    maxUsers: z.number().int().positive().optional(),
    perClientAssignmentAllowed: z.boolean().optional(),
    maxAiScansPerMonth: z.number().int().positive().optional(),
  })
  .refine(
    (v) =>
      v.plan !== "enterprise" ||
      (v.maxClients && v.maxUsers && v.perClientAssignmentAllowed !== undefined && v.maxAiScansPerMonth),
    {
      message: "Enterprise plans need maxClients, maxUsers, perClientAssignmentAllowed, and maxAiScansPerMonth set explicitly.",
    }
  );

export type SetFirmPlanResult = { ok: true } | { ok: false; error: string };

/**
 * Platform admin's manual "change plan" control — billing isn't
 * automated yet, so this (plus extend-firm-trial.ts) is how a real
 * firm's plan actually gets managed for now.
 *
 * Deliberately does NOT force-shrink anything if the new limits are
 * lower than the firm's current usage: this is a direct, administrative
 * correction (upgrades, fixing a mis-set plan), not the trial-expiry
 * downgrade flow (downgrade-firm-to-free.ts), which is the one place
 * that deliberately auto-picks clients and deactivates staff. If a
 * platform admin sets limits below current usage here, nothing existing
 * is touched — the firm simply can't add anything new past the limit
 * until it's back under (018_plan_limits.sql's triggers still apply to
 * every future INSERT regardless of how the limit got set). Silently
 * deactivating a paying customer's staff as a side effect of an
 * otherwise-ordinary plan change was never asked for.
 *
 * Runs on authDb: platform_admin has no UPDATE policy on firms at all
 * (only the two firms_select policies exist) — same reasoning every
 * other file in lib/billing/ gives for using this connection.
 */
export async function setFirmPlan(platformAdminId: string, input: unknown): Promise<SetFirmPlanResult> {
  const parsed = setFirmPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { firmId, plan } = parsed.data;

  const [firm] = await authDb.select().from(firms).where(eq(firms.id, firmId));
  if (!firm) return { ok: false, error: "Firm not found." };

  const limits: { maxClients: number; maxUsers: number; perClientAssignmentAllowed: boolean; maxAiScansPerMonth: number } =
    plan === "enterprise"
      ? {
          maxClients: parsed.data.maxClients!,
          maxUsers: parsed.data.maxUsers!,
          perClientAssignmentAllowed: parsed.data.perClientAssignmentAllowed!,
          maxAiScansPerMonth: parsed.data.maxAiScansPerMonth!,
        }
      : PLAN_DEFAULTS[plan as Exclude<FirmPlan, "enterprise">];

  // Moving TO 'trial' (including "give them another trial" after they'd
  // moved off it) always starts a fresh 7-day clock — never carries over
  // whatever trialEndsAt happened to already be on the row (could be
  // null, or long expired). Moving to any other plan clears it.
  const trialEndsAt = plan === "trial" ? new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000) : null;

  try {
    await authDb
      .update(firms)
      .set({
        plan,
        ...limits,
        trialEndsAt,
        trialExpiredFlaggedAt: null,
      })
      .where(eq(firms.id, firmId));

    await authDb.insert(auditLog).values({
      actorUserId: platformAdminId,
      action: "PLAN_CHANGE",
      tableName: "firms",
      recordId: firmId,
      before: { plan: firm.plan, maxClients: firm.maxClients, maxUsers: firm.maxUsers },
      after: { plan, ...limits },
    });

    return { ok: true };
  } catch (err) {
    console.error(`setFirmPlan(${firmId}): DB update failed:`, err);
    return { ok: false, error: "Could not change this firm's plan." };
  }
}
