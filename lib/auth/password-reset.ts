import "server-only";
import { z } from "zod";
import { authDb } from "@/db/authClient";
import { auditLog } from "@/db/schema";
import { createSupabaseServerClient } from "./supabase-server";

function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

export const requestResetSchema = z.object({ email: z.string().email() });

/**
 * Always resolves to { ok: true } regardless of whether the email matches an
 * account — same anti-enumeration reasoning as before this app moved to
 * Supabase Auth, just enforced by Supabase now instead of by us: whether
 * the email exists, rate limiting, and actually sending the email are all
 * Supabase's job (resetPasswordForEmail() itself never reveals whether the
 * address is registered). See app/auth/confirm/route.ts for where the
 * emailed link lands.
 */
export async function requestPasswordReset(input: unknown): Promise<{ ok: true }> {
  const parsed = requestResetSchema.safeParse(input);
  if (!parsed.success) return { ok: true };

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl()}/auth/confirm?next=/reset-password`,
  });

  return { ok: true };
}

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type ResetPasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Requires an active Supabase session — only reachable after clicking the
 * emailed link through app/auth/confirm/route.ts, which establishes one.
 * No separate token handling here; Supabase already verified the link.
 */
export async function resetPassword(input: unknown): Promise<ResetPasswordResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { ok: false, error: error.message };
  }

  await authDb.insert(auditLog).values({ actorUserId: user.id, action: "PASSWORD_RESET", tableName: "users", recordId: user.id });

  // Supabase sends its own "your password was changed" notification email
  // by default (configurable in the dashboard) — no need for the old
  // lib/email/send.ts call this replaced.
  return { ok: true };
}
