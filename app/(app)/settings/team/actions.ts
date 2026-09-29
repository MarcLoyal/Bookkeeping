"use server";

import { revalidatePath } from "next/cache";
import { requireTeamManageAccess } from "@/lib/auth/current-user";
import { createTeamMember } from "@/lib/auth/create-team-member";

export type AddTeamMemberActionState = { error: string | null; success: boolean };

export async function addTeamMemberAction(_prevState: AddTeamMemberActionState, formData: FormData): Promise<AddTeamMemberActionState> {
  const currentUser = await requireTeamManageAccess();

  const result = await createTeamMember(currentUser, {
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    clientIds: formData.getAll("clientIds"),
  });

  if (!result.ok) {
    return { error: result.error, success: false };
  }

  revalidatePath("/settings/team");
  return { error: null, success: true };
}
