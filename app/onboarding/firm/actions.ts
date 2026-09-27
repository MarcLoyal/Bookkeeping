"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createFirmForUser } from "@/lib/auth/create-firm-for-user";
import { getPendingGoogleSignup } from "@/lib/auth/current-user";

export type OnboardingActionState = { error: string | null };

const onboardingSchema = z.object({
  firmName: z.string().min(1, "Firm name is required.").max(200),
  name: z.string().min(1, "Your name is required.").max(200),
});

export async function completeOnboardingAction(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  // Re-derives the pending Google identity server-side rather than trusting
  // a hidden field — the form can't be used to bootstrap a firm for anyone
  // but the currently-authenticated, not-yet-onboarded session.
  const pending = await getPendingGoogleSignup();
  if (!pending) {
    redirect("/login");
  }

  const parsed = onboardingSchema.safeParse({
    firmName: formData.get("firmName"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  try {
    await createFirmForUser({
      userId: pending.id,
      email: pending.email,
      name: parsed.data.name,
      firmName: parsed.data.firmName,
    });
  } catch (err) {
    console.error("Onboarding DB step failed for a Google identity:", err);
    return { error: "Something went wrong finishing your setup. Please try again in a moment." };
  }

  redirect("/dashboard");
}
