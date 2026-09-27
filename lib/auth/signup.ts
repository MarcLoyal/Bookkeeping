import "server-only";
import { z } from "zod";
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
    // Supabase's own message for a taken email is already user-appropriate
    // ("User already registered") — pass it through rather than inventing
    // a different one.
    return { ok: false, error: error.message };
  }
  if (!data.user) {
    return { ok: false, error: "Could not create your account. Please try again." };
  }

  try {
    await createFirmForUser({ userId: data.user.id, email, name, firmName });
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
