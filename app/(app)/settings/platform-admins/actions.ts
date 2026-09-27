"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/current-user";
import { invitePlatformAdmin } from "@/lib/auth/invite-platform-admin";

export type InviteActionState = { error: string | null; success: boolean };

export async function inviteAdminAction(_prevState: InviteActionState, formData: FormData): Promise<InviteActionState> {
  const currentAdmin = await requirePlatformAdmin();

  const result = await invitePlatformAdmin(currentAdmin.id, {
    email: formData.get("email"),
    name: formData.get("name"),
  });

  if (!result.ok) {
    return { error: result.error, success: false };
  }

  revalidatePath("/settings/platform-admins");
  return { error: null, success: true };
}
