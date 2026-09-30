"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/current-user";
import { downgradeFirmToFree, previewDowngradeFirmToFree, type DowngradePreview } from "@/lib/billing/downgrade-firm-to-free";
import { extendFirmTrial } from "@/lib/billing/extend-firm-trial";
import { setFirmPlan } from "@/lib/billing/set-firm-plan";

const TRIALS_PATH = "/settings/platform-admins/trials";

/** Called directly from the client (not a <form> action) — see expired-trial-row.tsx's two-step Downgrade button. */
export async function previewDowngradeAction(firmId: string): Promise<DowngradePreview> {
  await requirePlatformAdmin();
  return previewDowngradeFirmToFree(firmId);
}

export type SimpleActionResult = { ok: true } | { ok: false; error: string };

/** Called directly from the client, after the preview above has been shown and confirmed. */
export async function downgradeFirmAction(firmId: string): Promise<SimpleActionResult> {
  const admin = await requirePlatformAdmin();
  const result = await downgradeFirmToFree(admin.id, firmId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(TRIALS_PATH);
  return { ok: true };
}

export type FormActionState = { error: string | null; success: boolean };

export async function extendTrialAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const admin = await requirePlatformAdmin();

  const firmId = formData.get("firmId");
  const days = Number(formData.get("days"));
  const result = await extendFirmTrial(admin.id, { firmId, days });
  if (!result.ok) return { error: result.error, success: false };

  revalidatePath(TRIALS_PATH);
  return { error: null, success: true };
}

export async function changePlanAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const admin = await requirePlatformAdmin();

  const firmId = formData.get("firmId");
  const plan = formData.get("plan");
  const maxClientsRaw = formData.get("maxClients");
  const maxUsersRaw = formData.get("maxUsers");
  const perClientAssignmentAllowedRaw = formData.get("perClientAssignmentAllowed");

  const result = await setFirmPlan(admin.id, {
    firmId,
    plan,
    maxClients: maxClientsRaw ? Number(maxClientsRaw) : undefined,
    maxUsers: maxUsersRaw ? Number(maxUsersRaw) : undefined,
    perClientAssignmentAllowed: plan === "enterprise" ? perClientAssignmentAllowedRaw === "true" : undefined,
  });
  if (!result.ok) return { error: result.error, success: false };

  revalidatePath(TRIALS_PATH);
  return { error: null, success: true };
}
