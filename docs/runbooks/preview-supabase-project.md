# Runbook: a separate Supabase project for testing and previews

Pre-launch checklist item 4. Today every Vercel Preview deployment (every
open PR) and every local dev environment that has real credentials points
at the **same** Supabase project as production, unless someone's
`.env.local` happens to differ. That means a PR preview poking at test
data is one accidental write away from touching real firm data. This
separates them: a second, disposable Supabase project used only for
Preview deployments and non-production testing, wired in via Vercel's
per-environment variable scoping (the same mechanism already documented
in `DECISIONS.md` — "Fix: 'Continue with Google' hangs forever when a
public env var is missing" — for why `NEXT_PUBLIC_*` vars need their
Preview scope checked separately from Production).

Everything here needs your Supabase account and your Vercel project's
dashboard — nothing is reachable or automatable from this sandbox (no
credentials for either service here). Steps are marked **[YOU]**.

## 1. Create the new Supabase project **[YOU]**

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New
   project**.
2. Name it clearly, e.g. `keepbooks-preview` — something that can never be
   confused with the production project in a dashboard list.
3. Pick any region; it doesn't need to match production's (this project
   only ever serves test traffic, latency doesn't matter).
4. Note the **database password** you set here — you'll need it for the
   connection strings in step 2.
5. Once provisioned, go to **Settings → API** and note:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY`

   And **Settings → Database** for the connection strings (see below).

## 2. Apply this app's schema to the new project **[YOU, from your machine]**

This part *is* just running this repo's existing scripts — nothing new to
build — pointed at the new project instead of production. From a machine
with this repo checked out and `pnpm install` already run:

1. Create a throwaway `.env.local` (or temporarily edit your existing one
   — just don't commit it) with the new project's values:
   ```
   # Settings -> Database -> Connection string -> "Transaction" pooler,
   # for the app role; "Session" pooler or direct connection for the
   # schema-owning migration role. Use the keepbooks_app / keepbooks role
   # names and passwords you set up the same way production's are set up
   # (see DECISIONS.md's original Supabase Auth migration entry) — this
   # new project starts with only Supabase's own default `postgres` role,
   # so you'll need to create these two roles here too, exactly as you did
   # for production.
   DATABASE_URL=postgres://keepbooks_app:<password>@<preview-project-host>:6543/postgres
   MIGRATION_DATABASE_URL=postgres://keepbooks:<password>@<preview-project-host>:5432/postgres

   NEXT_PUBLIC_SUPABASE_URL=https://<preview-project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from step 1>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key from step 1>

   APP_URL=http://localhost:3000
   ```
2. Run the same commands used against production originally:
   ```
   pnpm db:generate   # only if you have uncommitted schema changes; normally skip — migrations are already committed
   pnpm db:migrate
   pnpm seed
   ```
   `db:migrate` creates every table, RLS policy, and trigger from scratch
   (it's the same script that set up production — see `db/migrate.ts` and
   `db/sql/*.sql`). `seed` populates the same demo firm/clients/transactions
   used for local dev.
3. Create real Supabase Auth identities for the demo users the same way
   production's were created — `scripts/migrate-demo-users-to-supabase-auth.ts`
   is exactly that script; re-run it against this new project's
   `.env.local`.

**Re-running `pnpm seed` against a non-empty database is not currently
safe** — `db/seed.ts` has no `onConflict`/truncate handling, so a second
run will hit unique-constraint errors rather than cleanly resetting. For a
"wipe and start over" reset on this preview project specifically (never do
this against production): drop and recreate the `public` schema from the
Supabase SQL editor —
```sql
drop schema public cascade;
create schema public;
```
— then re-run `pnpm db:migrate && pnpm seed` from step 2. This is
deliberately not scripted here: it's a one-line SQL statement you run
manually and only ever against the preview project, and scripting it
risks someone running it against the wrong `DATABASE_URL` by accident.

## 3. Point Vercel's Preview environment at the new project **[YOU]**

1. Vercel project → **Settings → Environment Variables**.
2. For each of `DATABASE_URL`, `MIGRATION_DATABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`: add (or edit) the variable, and set its
   value **scoped to "Preview" only** — leave Production's existing value
   for these vars untouched and scoped to "Production" only. Vercel lets
   one variable name hold different values per environment; this is the
   same scoping mechanism `DECISIONS.md` already documents mattering for
   `NEXT_PUBLIC_SUPABASE_URL` specifically.
3. `APP_URL` should also get a Preview-scoped value — Vercel's own
   `VERCEL_URL` system env var gives you the actual preview deployment's
   URL if you'd rather template it dynamically, but a fixed placeholder
   value is fine too since `APP_URL` here is only used to build the
   password-reset redirect link.
4. **Double-check Production's values are untouched** after this — adding
   a Preview-scoped value for a variable that already has a
   Production-scoped value should not affect Production, but verify in the
   dashboard's list view (it shows each variable's scopes) rather than
   trusting that by assumption.
5. Every *new* PR opened after this point will build its preview against
   the new project automatically — no per-PR action needed. Already-open
   PRs need a fresh deployment (push a commit, or use Vercel's "Redeploy")
   to pick up the change, same caveat `DECISIONS.md` already notes for
   `NEXT_PUBLIC_*` vars specifically (build-time inlining, not
   runtime-read).

## 4. Verify **[YOU]**

Open any PR's preview deployment (or push a trivial commit to a branch to
get a fresh one) and confirm:

- Login with a demo user from step 2's seed data works.
- The data visible (client list, dashboard) matches the preview project's
  seed data, not production's real firms.
- Supabase dashboard for the **preview** project shows the write activity
  (e.g. `audit_log` rows) when you interact with the preview deployment —
  confirming traffic is actually isolated, not just configured to look
  isolated.

## Ongoing use

- Local dev environments that want real Supabase Auth (rather than no
  credentials at all, this sandbox's normal state) should also point at
  the preview project's credentials, never production's — treat the
  preview project as the shared "safe to break" target for both Preview
  deployments and any local testing that needs a real Supabase backend.
- Because `pnpm seed` isn't idempotent (see step 2), periodically reset
  the preview project with the `drop schema` + re-migrate + re-seed
  sequence above if its data drifts too far from a clean baseline to be
  useful for testing.
