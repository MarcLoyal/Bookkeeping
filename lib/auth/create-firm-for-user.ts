import "server-only";
import { authDb } from "@/db/authClient";
import { auditLog, firms, users } from "@/db/schema";
import { PLAN_DEFAULTS, TRIAL_DURATION_DAYS } from "@/lib/billing/plan-limits";

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
    await tx.insert(auditLog).values({ actorUserId: userId, action: "SIGNUP", tableName: "firms", recordId: firm.id });
    return firm;
  });
}
