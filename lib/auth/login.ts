import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authDb } from "@/db/authClient";
import { auditLog, users } from "@/db/schema";
import { verifyPassword } from "./password";
import { createSession, destroySession } from "./session";

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

  if (!row || !row.active) {
    return { ok: false, error: "Invalid email or password." };
  }

  const valid = await verifyPassword(password, row.passwordHash);
  if (!valid) {
    return { ok: false, error: "Invalid email or password." };
  }

  await createSession(row.id, row.tokenVersion);
  await authDb
    .insert(auditLog)
    .values({ actorUserId: row.id, action: "LOGIN", tableName: "users", recordId: row.id });

  return { ok: true };
}

export async function logout(): Promise<void> {
  await destroySession();
}
