import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { authDb } from "@/db/authClient";
import { auditLog, passwordResetTokens, users } from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import { hashPassword } from "./password";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 3;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

export const requestResetSchema = z.object({ email: z.string().email() });

/**
 * Always resolves to { ok: true } regardless of whether the email matches an
 * account, whether the account is active, or whether the requester is
 * rate-limited — the caller (and the page) must show the same "check your
 * email" message every time, so a bad actor can't use this to enumerate
 * registered emails.
 */
export async function requestPasswordReset(input: unknown): Promise<{ ok: true }> {
  const parsed = requestResetSchema.safeParse(input);
  if (!parsed.success) return { ok: true };
  const { email } = parsed.data;

  // Bypasses RLS by design, same as lib/auth/login.ts — looking up a user by
  // email has to happen before any session/tenant context exists.
  const [user] = await authDb.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.active) return { ok: true };

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recent = await authDb
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.userId, user.id), gt(passwordResetTokens.createdAt, windowStart)));
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) return { ok: true };

  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await authDb.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt,
  });

  const resetUrl = `${appUrl()}/reset-password?token=${rawToken}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your Keep.Books password",
    text: `We received a request to reset your Keep.Books password. This link expires in 30 minutes:\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
  });

  return { ok: true };
}

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Missing reset token."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type ResetPasswordResult = { ok: true } | { ok: false; error: string };

export async function resetPassword(input: unknown): Promise<ResetPasswordResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { token, password } = parsed.data;
  const tokenHash = hashToken(token);

  const [tokenRow] = await authDb
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt < new Date()) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  const [user] = await authDb.select().from(users).where(eq(users.id, tokenRow.userId)).limit(1);
  if (!user || !user.active) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await hashPassword(password);

  await authDb.transaction(async (tx) => {
    // Bumping tokenVersion invalidates every session issued before this
    // reset — see lib/auth/current-user.ts.
    await tx
      .update(users)
      .set({ passwordHash, tokenVersion: user.tokenVersion + 1 })
      .where(eq(users.id, user.id));
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, tokenRow.id));
    await tx.insert(auditLog).values({
      actorUserId: user.id,
      action: "PASSWORD_RESET",
      tableName: "users",
      recordId: user.id,
    });
  });

  await sendEmail({
    to: user.email,
    subject: "Your Keep.Books password was changed",
    text: `Your Keep.Books password was just changed. If this wasn't you, contact your firm administrator right away.`,
  });

  return { ok: true };
}
