import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authDb } from "@/db/authClient";
import { auditLog, firms } from "@/db/schema";

export const extendFirmTrialSchema = z.object({
  firmId: z.string().uuid(),
  days: z.number().int().positive().max(365),
});

export type ExtendFirmTrialResult = { ok: true; newTrialEndsAt: Date } | { ok: false; error: string };

/**
 * Platform admin's manual "extend trial" control. Only meaningful for a
 * firm currently on the trial plan — extending a Free/Basic/Premium/
 * Enterprise firm's (nonexistent) trial clock isn't a real action;
 * refused with a clear message rather than silently doing nothing.
 *
 * `days` is added from `trialEndsAt` (or from now, whichever is later —
 * a trial already flagged expired gets `days` from today, not from its
 * old, already-passed end date) — never from `now()` unconditionally,
 * so extending an already-generous trial twice is additive, not a reset.
 *
 * Runs on authDb — same reasoning as every other file in lib/billing/:
 * platform_admin has no UPDATE policy on firms at all.
 */
export async function extendFirmTrial(platformAdminId: string, input: unknown): Promise<ExtendFirmTrialResult> {
  const parsed = extendFirmTrialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { firmId, days } = parsed.data;

  const [firm] = await authDb.select().from(firms).where(eq(firms.id, firmId));
  if (!firm) return { ok: false, error: "Firm not found." };
  if (firm.plan !== "trial") {
    return { ok: false, error: "This firm isn't on the trial plan — change its plan instead of extending a trial." };
  }

  const now = new Date();
  const base = firm.trialEndsAt && firm.trialEndsAt > now ? firm.trialEndsAt : now;
  const newTrialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  try {
    await authDb
      .update(firms)
      .set({ trialEndsAt: newTrialEndsAt, trialExpiredFlaggedAt: null })
      .where(eq(firms.id, firmId));

    await authDb.insert(auditLog).values({
      actorUserId: platformAdminId,
      action: "TRIAL_EXTENDED",
      tableName: "firms",
      recordId: firmId,
      before: { trialEndsAt: firm.trialEndsAt },
      after: { trialEndsAt: newTrialEndsAt },
    });

    return { ok: true, newTrialEndsAt };
  } catch (err) {
    console.error(`extendFirmTrial(${firmId}): DB update failed:`, err);
    return { ok: false, error: "Could not extend this firm's trial." };
  }
}
