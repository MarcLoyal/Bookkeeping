"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { setClientArchived } from "@/lib/auth/set-client-archived";

export type SetClientArchivedActionState = { error: string | null; success: boolean };

export async function setClientArchivedAction(
  _prevState: SetClientArchivedActionState,
  formData: FormData
): Promise<SetClientArchivedActionState> {
  const currentUser = await requireCurrentUser();

  const clientId = formData.get("clientId");
  const result = await setClientArchived(currentUser, {
    clientId,
    archived: formData.get("archived") === "true",
  });

  if (!result.ok) {
    return { error: result.error, success: false };
  }

  revalidatePath(`/clients/${typeof clientId === "string" ? clientId : ""}`);
  revalidatePath("/clients");
  return { error: null, success: true };
}
