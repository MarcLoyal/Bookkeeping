import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authDb } from "@/db/authClient";
import { auditLog, users } from "@/db/schema";
import { verifyPassword } from "./password";
import { createSession, destroySession, getSessionClaims } from "./session";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(input: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password." };
  }
  const { email, password } = parsed.data;

  // Bypasses RLS by design — see db/authClient.ts. This is the one place in
  // the app allowed to look up a user by email before a session exists.
  const [row] = await authDb.select().from(users).where(eq(users.email, email)).limit(1);

  // No row at all: don't log anything — there's no user to attribute a
  // failed attempt to (and no firm for that firm's audit trail to scope
  // it to), so this is typo/bot noise, not a firm-relevant security event.
  if (!row) {
    return { ok: false, error: "Invalid email or password." };
  }

  if (!row.active) {
    await authDb
      .insert(auditLog)
      .values({ actorUserId: row.id, action: "LOGIN_FAILED", tableName: "users", recordId: row.id, reason: "Account inactive" });
    return { ok: false, error: "Invalid email or password." };
  }

  const valid = await verifyPassword(password, row.passwordHash);
  if (!valid) {
    await authDb
      .insert(auditLog)
      .values({ actorUserId: row.id, action: "LOGIN_FAILED", tableName: "users", recordId: row.id, reason: "Incorrect password" });
    return { ok: false, error: "Invalid email or password." };
  }

  await createSession(row.id, row.tokenVersion);
  await authDb
    .insert(auditLog)
    .values({ actorUserId: row.id, action: "LOGIN", tableName: "users", recordId: row.id });

  return { ok: true };
}

export async function logout(): Promise<void> {
  // Read the session's claims before destroying it, so the logout event can
  // still be attributed to the right user.
  const claims = await getSessionClaims();
  if (claims) {
    await authDb
      .insert(auditLog)
      .values({ actorUserId: claims.userId, action: "LOGOUT", tableName: "users", recordId: claims.userId });
  }
  await destroySession();
}
