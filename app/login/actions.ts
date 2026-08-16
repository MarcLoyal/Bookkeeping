"use server";

import { redirect } from "next/navigation";
import { login } from "@/lib/auth/login";

export async function loginAction(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const result = await login({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  redirect("/dashboard");
}
