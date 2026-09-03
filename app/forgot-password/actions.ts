"use server";

import { requestPasswordReset } from "@/lib/auth/password-reset";

export async function forgotPasswordAction(
  _prevState: { submitted: boolean },
  formData: FormData
): Promise<{ submitted: boolean }> {
  await requestPasswordReset({ email: formData.get("email") });
  return { submitted: true };
}
