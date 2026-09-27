"use server";

import { redirect } from "next/navigation";
import { signUp } from "@/lib/auth/signup";

export type SignupActionState = { error: string | null; needsEmailConfirmation: boolean };

export async function signupAction(_prevState: SignupActionState, formData: FormData): Promise<SignupActionState> {
  const result = await signUp({
    firmName: formData.get("firmName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.ok) {
    return { error: result.error, needsEmailConfirmation: false };
  }

  if (result.needsEmailConfirmation) {
    return { error: null, needsEmailConfirmation: true };
  }

  redirect("/dashboard");
}
