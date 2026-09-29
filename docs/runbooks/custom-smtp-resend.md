# Runbook: custom SMTP (Resend) for Supabase Auth emails

Pre-launch checklist item 3. This is a Resend account + Supabase dashboard
configuration task — there is no `lib/email/` code in this app to change.
Every email this app sends goes through **Supabase Auth's own mailer**,
triggered from these four call sites:

| Flow | Code | Supabase Auth template |
|---|---|---|
| Self-serve firm signup (email confirmation, if enabled in dashboard) | `lib/auth/signup.ts` — `supabase.auth.signUp()` | "Confirm signup" |
| Team member invite (new identity) | `lib/auth/create-team-member.ts` — `supabase.auth.admin.inviteUserByEmail()` | "Invite user" |
| Team member invite (existing identity, e.g. already in another firm) | `lib/auth/create-team-member.ts` — `supabase.auth.signInWithOtp()` | "Magic Link" |
| Password reset | `lib/auth/password-reset.ts` — `supabase.auth.resetPasswordForEmail()` | "Reset password" |

By default Supabase sends these through its own built-in mailer, which is
rate-limited (a handful of emails per hour on the free tier) and sends
`from` a generic `noreply@mail.app.supabase.io`-style address — fine for
development, not something to launch on. Pointing Supabase at a real SMTP
provider (Resend) removes the rate limit and sends from this firm's own
domain.

Nothing below can be done from this environment — it needs your Resend
account and your Supabase project's dashboard. Steps are in order; each is
marked **[YOU]** since none of it is delegable.

## 1. Create a Resend account and verify a sending domain **[YOU]**

1. Sign up at [resend.com](https://resend.com) (their free tier — 3,000
   emails/month, 100/day — is enough for launch; upgrade later if volume
   grows).
2. **Domains → Add Domain.** Use a domain you control — ideally a
   subdomain dedicated to transactional mail (e.g. `mail.yourfirm.app` or
   `notify.yourfirm.app`) rather than your root domain, so a deliverability
   problem never touches your main site's mail reputation.
3. Resend gives you a set of DNS records (SPF, DKIM, and usually DMARC) to
   add at your domain registrar / DNS host. Add them there.
4. Wait for DNS to propagate, then click **Verify** in Resend. This can
   take anywhere from a few minutes to a few hours depending on your DNS
   host's TTL.

You cannot proceed to step 3 until this domain shows **Verified** in
Resend — Supabase (and Resend itself) will reject mail from an unverified
sending domain.

## 2. Create a Resend SMTP API key **[YOU]**

1. In Resend: **API Keys → Create API Key.**
2. Name it something identifiable, e.g. `keepbooks-supabase-smtp`.
3. Permission: **Sending access** is enough — this key only needs to send,
   never to read/manage your Resend account.
4. Copy the key immediately (Resend shows it once). Treat it like any other
   production secret — it goes into Supabase's dashboard in the next step,
   nowhere in this repo, and never into `.env.local`/`.env.example` (no app
   code reads it; Supabase's own backend uses it directly).

Resend's SMTP connection details (same for every account):

- **Host:** `smtp.resend.com`
- **Port:** `465` (SSL) or `587` (TLS) — either works with Supabase
- **Username:** `resend`
- **Password:** the API key from above

## 3. Configure custom SMTP in the Supabase dashboard **[YOU]**

1. Open your Supabase project → **Authentication → Settings** (technically
   **Authentication → Settings → SMTP Settings**, depending on your
   dashboard version — search "SMTP" in the settings sidebar if it moves).
2. Toggle **Enable Custom SMTP** on.
3. Fill in:
   - **Sender email:** an address at your verified domain, e.g.
     `noreply@mail.yourfirm.app`. This is the visible `From` address on
     every invite/reset/confirmation email.
   - **Sender name:** e.g. `Keep.Books` — whatever you want recipients to
     see in their inbox.
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** the API key from step 2
4. Save. Supabase's dashboard has a "Send test email" affordance on this
   page in most versions — use it before moving on.

## 4. (Optional, recommended) customize the email templates **[YOU]**

Still in **Authentication → Settings**, there is a separate **Email
Templates** section (or **Authentication → Email Templates**) with one
editable template per flow in the table above (`Confirm signup`,
`Invite user`, `Magic Link`, `Reset Password`). Supabase's defaults are
generic and unbranded. At minimum:

- Set the subject lines to something recognizable, e.g. "You've been
  invited to Keep.Books" instead of the default "You have been invited".
- The body is HTML with Supabase's own template variables (`{{ .ConfirmationURL }}`,
  `{{ .Token }}`, etc. — the editor lists exactly which variables each
  template supports; don't remove the ones already wired into the default,
  or the link/OTP in the email will stop working).
- This is optional for launch — the checklist item is "custom SMTP", not
  "custom templates" — but doing it now avoids a second round-trip through
  this same settings page later.

## 5. Test end-to-end against a real deployment **[YOU]**

Once steps 1–3 are done, exercise every flow in the table above against
your actual deployed app (not this sandbox, which has no Supabase
credentials at all):

1. **Password reset** — cheapest to test, no side effects. Go to
   `/forgot-password`, submit a real email you control, confirm the email
   arrives from your Resend-verified domain (check the `From` address and
   headers, not just that mail arrived) within a minute or two.
2. **Team invite (new identity)** — from `/settings/team`, invite an email
   address that has never signed in to this app before. Confirm the invite
   email arrives and the link logs the recipient in as a pending team
   member.
3. **Team invite (existing identity)** — invite an email that already has
   a Supabase Auth identity in this project (e.g. from another firm's
   team, or a platform admin). Confirms the `signInWithOtp()` path
   specifically.
4. **Signup confirmation**, if your project has "Confirm email" enabled
   under **Authentication → Settings → User Signups** — sign up a fresh
   firm at `/signup` and confirm the confirmation email arrives.

If any of these don't arrive: check Resend's **Logs** tab first (it shows
every send attempt and the exact rejection reason if Supabase's request to
Resend failed) before assuming the Supabase side is misconfigured.

## Rollback

If custom SMTP causes problems (e.g. deliverability worse than Supabase's
default, or a misconfigured DNS record blocking mail entirely), turn
**Enable Custom SMTP** back off in step 3's dashboard page — Supabase
immediately falls back to its own built-in mailer with no other change
needed. Nothing in the app's code path changes either way; every call site
in the table above is unaffected by which mailer Supabase uses underneath.
