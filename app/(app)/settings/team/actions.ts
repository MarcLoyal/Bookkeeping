"use server";

import { revalidatePath } from "next/cache";
import { requireTeamManageAccess } from "@/lib/auth/current-user";
import { createTeamMember } from "@/lib/auth/create-team-member";
import { editTeamMemberAssignments } from "@/lib/auth/edit-team-member-assignments";
import { setTeamMemberActive } from "@/lib/auth/set-team-member-active";

export type AddTeamMemberActionState = { error: string | null; success: boolean; warning: string | null };

export async function addTeamMemberAction(_prevState: AddTeamMemberActionState, formData: FormData): Promise<AddTeamMemberActionState> {
  const currentUser = await requireTeamManageAccess();

  const result = await createTeamMember(currentUser, {
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    clientIds: formData.getAll("clientIds"),
  });

  if (!result.ok) {
    return { error: result.error, success: false, warning: null };
  }

  revalidatePath("/settings/team");
  return { error: null, success: true, warning: result.warning ?? null };
}

export type EditAssignmentsActionState = { error: string | null; success: boolean };

export async function editAssignmentsAction(_prevState: EditAssignmentsActionState, formData: FormData): Promise<EditAssignmentsActionState> {
  const currentUser = await requireTeamManageAccess();

  const accessScopeValue = formData.get("accessScope");
  const result = await editTeamMemberAssignments(currentUser, {
    targetUserId: formData.get("targetUserId"),
    clientIds: formData.getAll("clientIds"),
    accessScope: accessScopeValue ? accessScopeValue : undefined,
  });

  if (!result.ok) {
    return { error: result.error, success: false };
  }

  revalidatePath("/settings/team");
  return { error: null, success: true };
}

export type SetActiveActionState = { error: string | null; success: boolean; warning: string | null };

export async function setActiveAction(_prevState: SetActiveActionState, formData: FormData): Promise<SetActiveActionState> {
  const currentUser = await requireTeamManageAccess();

  const result = await setTeamMemberActive(currentUser, {
    targetUserId: formData.get("targetUserId"),
    active: formData.get("active") === "true",
  });

  if (!result.ok) {
    return { error: result.error, success: false, warning: null };
  }

  revalidatePath("/settings/team");
  return { error: null, success: true, warning: result.warning ?? null };
}
