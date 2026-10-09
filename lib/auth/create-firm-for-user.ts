import "server-only";
import { authDb } from "@/db/authClient";
import { auditLog, firms, legalAcceptances, users } from "@/db/schema";
import { PLAN_DEFAULTS, TRIAL_DURATION_DAYS } from "@/lib/billing/plan-limits";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal/versions";

/**
 * Creates a new firm and its first user (role firm_admin) in one
 * transaction, on the RLS-bypassing schema-owning connection (see
 * db/authClient.ts) — bypassing RLS here isn't a shortcut: the
 * users_insert policy requires an *existing* firm_admin to already be
 * acting, which is circular for a firm that by definition has no users
 * yet.
 *
 * Shared by both signup paths: email/password signup (lib/auth/signup.ts,
 * which creates the Supabase Auth user itself first) and Google sign-in for
 * a brand-new identity (app/onboarding/firm, where Supabase Auth already
 * created the user during the OAuth callback and this just needs a firm
 * name to finish the profile).
 *
 * Unconditionally records a legal_acceptances row for the current Terms/
 * Privacy version alongside the firm and user — there's no separate
 * "accepted" flag on this function's input because both callers' own
 * form schemas (signupSchema in lib/auth/signup.ts,
 * onboardingSchema in app/onboarding/firm/actions.ts) already require
 * the consent checkbox to be checked before this function is ever
 * reached; by the time either caller gets here, consent is a precondition,
 * not something left to re-check.
 */
export async function createFirmForUser(input: {
  userId: string;
  email: string;
  name: string;
  firmName: string;
  signupMethod: "email" | "google";
}) {
  const { userId, email, name, firmName, signupMethod } = input;
  return authDb.transaction(async (tx) => {
    const trialEndsAt = new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const [firm] = await tx
      .insert(firms)
      .values({ name: firmName, plan: "trial", trialEndsAt, ...PLAN_DEFAULTS.trial })
      .returning();
    await tx.insert(users).values({
      id: userId,
      firmId: firm.id,
      email,
      name,
      role: "firm_admin",
      signupMethod,
    });
    await tx.insert(legalAcceptances).values({
      userId,
      termsVersion: CURRENT_TERMS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    });
    await tx.insert(auditLog).values({ actorUserId: userId, action: "SIGNUP", tableName: "firms", recordId: firm.id });
    return firm;
  });
}
