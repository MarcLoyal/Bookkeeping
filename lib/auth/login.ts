import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authDb } from "@/db/authClient";
import { auditLog, users } from "@/db/schema";
import { createSupabaseServerClient } from "./supabase-server";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginResult = { ok: true } | { ok: false; error: string };

/** Only when the email matches a real user — an unrecognized email has no firm to attribute a failed attempt to, and would otherwise just be typo/bot noise (see DECISIONS.md, "Audit trail: sign-in events..."). */
async function logFailedAttempt(email: string, reason: string): Promise<void> {
  const [row] = await authDb.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) return;
  await authDb.insert(auditLog).values({ actorUserId: row.id, action: "LOGIN_FAILED", tableName: "users", recordId: row.id, reason });
}

export async function login(input: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password." };
  }
  const { email, password } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    await logFailedAttempt(email, "Incorrect password");
    return { ok: false, error: "Invalid email or password." };
  }

  // Bypasses RLS by design — see db/authClient.ts. Looking up this app's own
  // profile row for a just-verified Supabase Auth identity, before any
  // session/tenant RLS context exists for it.
  const [row] = await authDb.select().from(users).where(eq(users.id, data.user.id)).limit(1);

  if (!row || !row.active) {
    // Supabase's own credential check already succeeded — this account is
    // deactivated on our side, or has no profile row at all (shouldn't
    // happen for anyone created through this app's own flows). Either way,
    // don't leave a valid Supabase session sitting around for an account
    // this app won't let in.
    await supabase.auth.signOut();
    if (row) await logFailedAttempt(email, "Account inactive");
    return { ok: false, error: "Invalid email or password." };
  }

  await authDb.insert(auditLog).values({ actorUserId: row.id, action: "LOGIN", tableName: "users", recordId: row.id });

  return { ok: true };
}

export async function logout(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await authDb.insert(auditLog).values({ actorUserId: user.id, action: "LOGOUT", tableName: "users", recordId: user.id });
  }
  await supabase.auth.signOut();
}
