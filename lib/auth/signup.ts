import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authDb } from "@/db/authClient";
import { users } from "@/db/schema";
import { createFirmForUser } from "./create-firm-for-user";
import { createSupabaseServerClient } from "./supabase-server";

// Kept in sync with the pattern= hints on app/signup/signup-form.tsx's
// password field — the form gives immediate browser-level feedback, this
// is the authoritative check.
export const PASSWORD_MIN_LENGTH = 8;
const UPPERCASE_RE = /[A-Z]/;
const SPECIAL_CHAR_RE = /[^A-Za-z0-9]/;

export const signupSchema = z
  .object({
    firmName: z.string().min(1, "Firm name is required.").max(200),
    name: z.string().min(1, "Your name is required.").max(200),
    email: z.string().email(),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .regex(UPPERCASE_RE, "Password must include at least one uppercase letter.")
      .regex(SPECIAL_CHAR_RE, "Password must include at least one special character."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignupResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; error: string };

/**
 * Self-serve firm signup: creates a Supabase Auth user, then hands off to
 * createFirmForUser() to create the firm + first user row (see that file
 * for why it bypasses RLS).
 *
 * needsEmailConfirmation reflects whether Supabase actually established a
 * session (data.session is set) or the account is pending email
 * confirmation, per this project's Supabase dashboard settings — the
 * caller shows a "check your email" state instead of redirecting when
 * true, rather than assuming one or the other.
 */
export async function signUp(input: unknown): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { firmName, name, email, password } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // Supabase's own message for a taken email ("User already registered")
    // is already user-appropriate when that email genuinely has a firm —
    // passed through as-is. But the identical message also fires for an
    // email that only ever got as far as a Google sign-in and never
    // finished naming a firm (no public.users row at all yet) — the
    // generic message is a dead end for that person ("already
    // registered," with no way back in via this form). Give a specific,
    // actionable message instead: bypasses RLS the same way
    // createFirmForUser below does, for the same reason — this has to
    // see across every firm.
    if (error.message.toLowerCase().includes("already registered") || error.message.toLowerCase().includes("already been registered")) {
      const [existingProfileRow] = await authDb.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (!existingProfileRow) {
        return {
          ok: false,
          error: "You've already started signing in with this email (e.g. with Google) but haven't finished setting up your firm. Sign in with that same method to pick up where you left off.",
        };
      }
    }
    return { ok: false, error: error.message };
  }
  if (!data.user) {
    return { ok: false, error: "Could not create your account. Please try again." };
  }

  try {
    await createFirmForUser({ userId: data.user.id, email, name, firmName, signupMethod: "email" });
  } catch (err) {
    // The Supabase Auth user now exists but has no firm/profile row — a
    // genuine gap, not handled here: retrying signup with the same email
    // will hit Supabase's "already registered" error above, with no way
    // yet to resume rather than start over. Rare (this is a DB failure
    // immediately after a successful upstream call), but real — flagged
    // in DECISIONS.md rather than silently assumed away.
    console.error("Signup DB step failed after Supabase Auth user was created:", err);
    return { ok: false, error: "Something went wrong finishing your signup. Please try again in a moment." };
  }

  return { ok: true, needsEmailConfirmation: !data.session };
}
