"use server";

import { redirect } from "next/navigation";
import { resetPassword } from "@/lib/auth/password-reset";

export async function resetPasswordAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const result = await resetPassword({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  redirect("/login?reset=1");
}
