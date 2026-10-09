"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { recordLegalAcceptance } from "@/lib/data/legal-acceptances";

export type AcceptTermsActionState = { error: string | null };

export async function acceptTermsAction(_prevState: AcceptTermsActionState, formData: FormData): Promise<AcceptTermsActionState> {
  // Re-derives the current session server-side rather than trusting a
  // hidden field — same reasoning as completeOnboardingAction
  // (app/onboarding/firm/actions.ts): this can only ever record
  // acceptance for whoever is actually signed in right now.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (formData.get("acceptedTerms") !== "true") {
    return { error: "You must check the box to continue." };
  }

  await recordLegalAcceptance(user.id);
  redirect("/dashboard");
}
