"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { swapActiveClient } from "@/lib/billing/swap-active-client";

export type SwapActiveClientActionState = { error: string | null; success: boolean; deactivatedClientName: string | null };

export async function swapActiveClientAction(
  _prevState: SwapActiveClientActionState,
  formData: FormData
): Promise<SwapActiveClientActionState> {
  const currentUser = await requireCurrentUser();

  const result = await swapActiveClient(currentUser, { activateClientId: formData.get("activateClientId") });
  if (!result.ok) {
    return { error: result.error, success: false, deactivatedClientName: null };
  }

  revalidatePath("/clients");
  return { error: null, success: true, deactivatedClientName: result.deactivatedClientName };
}
