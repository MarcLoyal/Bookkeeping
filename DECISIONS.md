# Decisions & assumptions

This log records every assumption, deviation from SPEC.md, and judgment call
made while building Phase 0 (Foundation) and Phase 1 (Ledger + Books).
Ordered roughly by area, most consequential first within each area.

## Scope

Only **Phase 0** (auth, firms, clients, tenant isolation) and **Phase 1**
(chart of accounts, manual transaction encoding, posting, reversal, period
locks, Trial Balance / Income Statement / Balance Sheet, loose-leaf books +
PDF export) are built, per SPEC.md's own instruction to stop and demo after
Phase 1. Not built yet, on purpose:

- **AI capture / extraction** (Phase 2) — `/lib/tax/` and an extraction
  review queue don't exist yet. Non-negotiable rule #8 ("AI extraction never
  posts directly") is therefore vacuously true right now, not yet exercised.
- **Tax engine / BIR forms (2550Q, SLSP, 1701Q, etc.)** (Phase 3+) —
  `tax_rules` exists and is seeded (see below), but nothing computes a filed
  return from it yet. Acceptance tests #7, #8, #11 (quarter VAT tie-out,
  SLSP, AI JSON-on-blur) are Phase 2/3 and intentionally not implemented.
- **Attachments / source documents, year-end pack, client portal** — not
  started.

## Infrastructure: Supabase → local Postgres + a dev auth shim

The spec targets Supabase (Postgres + Supabase Auth + Storage). This sandbox
has no real Supabase project or credentials, so:

- **Database**: a local Postgres 16 instance stands in for Supabase's
  Postgres. Two roles, mirroring how Supabase separates the schema owner
  from the RLS-bound `authenticated` role: `keepbooks` (schema owner —
  `MIGRATION_DATABASE_URL`, used only by `db:generate`/`db:migrate`/`seed`)
  and `keepbooks_app` (non-owner — `DATABASE_URL`, used by every runtime app
  query). This split is load-bearing, not cosmetic: Postgres table owners
  bypass RLS by default, so if the app connected as the owner every RLS
  policy in `db/sql/001_functions_triggers_rls.sql` would silently do
  nothing.
- **Auth**: a small JWT-cookie session shim (`lib/auth/session.ts`, `jose` +
  `bcryptjs`) replaces Supabase Auth. `db/authClient.ts` is a
  deliberately-narrow owner-role connection used **only** for the login
  credential lookup (checking a password requires reading a user row by
  email before you can prove you *are* that user — the same reason Supabase
  keeps `auth.users` outside the app's RLS-governed schema). Every other
  query goes through `db/client.ts#withUserContext`, which sets
  `app.current_user_id` as a transaction-local session variable that RLS
  policies read via `app_current_user_id()`.
- **Storage**: not used yet (Phase 2 attachments).

None of this changes the data model or the RLS/trigger design — swapping in
real Supabase Auth later means replacing `lib/auth/*` and pointing
`DATABASE_URL`/`MIGRATION_DATABASE_URL` at the Supabase project; the schema,
triggers, and RLS policies are already Supabase-shaped (`SECURITY DEFINER`
helpers mirroring `auth.uid()`, etc.).

## Password reset: token revocation and email abstraction

- **Session revocation**: sessions are stateless JWTs (see above), which
  normally have no server-side revocation mechanism. A password reset needs
  one — otherwise a stolen session survives its own owner's reset. Fixed
  with a `users.token_version` integer, embedded as a `tv` claim at login
  and bumped on every password reset; `getCurrentUser()` rejects any JWT
  whose `tv` claim doesn't match the current DB value. `middleware.ts`
  deliberately does *not* also enforce this (it only checks JWT
  signature/expiry, no DB access at the Edge) — an earlier version had
  middleware redirect an "authed" user away from `/login`, which fought
  `getCurrentUser()`'s DB-backed redirect for a session invalidated by a
  reset and looped forever between `/login` and `/dashboard`. Removed;
  `app/login/page.tsx` already does that redirect itself with the full
  check.
- **Reset tokens**: `password_reset_tokens` (RLS enabled, zero policies —
  same deny-by-default pattern as everything else, reachable only through
  the owner-role `authDb` connection) stores a SHA-256 hash of a random
  token, never the token itself, mirroring how `passwordHash` never stores
  a plaintext password. 30-minute expiry, single use, and a per-user rate
  limit (3 requests / 15 minutes) on issuing new ones.
- **Email enumeration**: `requestPasswordReset()` always resolves to
  `{ ok: true }` — whether the address exists, is inactive, or is
  rate-limited is never observable from the response.
- **No email provider configured**: `lib/email/send.ts` logs to the server
  console instead of sending real mail (see its docstring for how to swap
  in a real provider later). `DEV_EMAIL_OUTBOX_PATH`, if set, additionally
  appends each email as a JSON line to that file — a dev/test-only escape
  hatch so `e2e/password-reset.test.ts` can read the reset link without a
  real inbox; unset in production, nothing writes there.

## Architecture: Route Handlers instead of Server Actions for mutations

Every mutating form (`POST /api/clients`, transaction encoding, reversal)
goes through a Next.js Route Handler + a small `useJsonPost` client hook,
rather than a Server Action. Login is the one exception — it stays a Server
Action. This is a deliberate, if debatable, choice: it keeps the client/
server boundary as an explicit JSON contract (easy to test with `curl`/
Playwright, easy to reason about cookie handling), at the cost of a little
more boilerplate than `<form action={...}>`. Either approach can enforce the
same auth/RLS/DB-trigger guarantees; this was a judgment call, not a
compliance requirement.

## RLS + `INSERT ... RETURNING` doesn't mix

Under Postgres RLS, `INSERT ... RETURNING` re-runs the table's `SELECT`
policy against the just-inserted row, inside the same command. Our RLS
helper functions (`app_accessible_client_ids()` etc.) are marked `STABLE`
for performance, and a `STABLE` function's snapshot doesn't see the current
command's own uncommitted insert — so `RETURNING` intermittently fails with
"new row violates row-level security policy" even though the insert itself
is perfectly legal and a subsequent, separate `SELECT` sees the row fine.

Fix: every insert in `lib/data/*.ts` generates its id client-side
(`crypto.randomUUID()`) and omits `.returning()`. This is a Postgres/RLS
interaction, not a bug in the policies themselves.

## Money and tax rates

- **Money is `bigint` centavos everywhere** (`lib/money.ts`), never a float,
  per rule #1. Rounding (`roundHalfUp`) happens exactly once, at the point a
  rate is applied (`applyRate`) — never re-rounded downstream.
- **Tax rates live only in `tax_rules`** (rule #6). `db/seed.ts` is the one
  place a rate literal (`"0.12"`, etc.) appears in the codebase — it's the
  data going *into* `tax_rules`, not business logic reading a hardcoded
  rate. Acceptance test #9 (`db/__tests__/acceptance.test.ts`) greps
  `app/`, `lib/`, `db/` for `0.12`/`12%`/`1.12` and asserts zero hits,
  explicitly excluding `db/seed.ts`'s data literal and illustrative
  comments inside `__tests__`/`.test.ts` files (comments explaining "this
  computes a 12%-style rate" in a unit test aren't the hardcoding rule #6
  is guarding against — the rule is about business logic).
- Seeded `tax_rules` values (VAT 12%, percentage tax 1%, EWT rates, 8%
  threshold, VAT registration threshold) are a **starting point** dated
  2024-01-01 (EOPT Act / RR 3-2024 effectivity), sourced from SPEC.md §5.1
  and flagged there and in `db/seed.ts` as requiring CPA verification
  before any real filing — never treat them as authoritative without
  checking current BIR issuances.

## Chart of accounts

`lib/accounting/coa-template.ts` (`PH_SME_CHART_OF_ACCOUNTS`) is the PH SME
template SPEC.md §11 describes, instantiated for every new client at
onboarding. `fsLineMapping` on each account drives Trial Balance / Income
Statement / Balance Sheet assembly, so report code never hardcodes an
account code — only ever a semantic FS line. No BIR form layout was
invented anywhere in this phase (no forms are rendered yet).

## Posting logic simplifications (Phase 1, documented for Phase 2/3 revisit)

- **EWT nets directly against Accounts Payable** on a purchase
  (`buildPurchaseLines` in `lib/accounting/posting.ts`) rather than being
  journalized through a separate EWT clearing/settlement flow. Correct for
  the balance-sheet effect (AP is credited net of EWT withheld, EWT payable
  is credited the withheld amount) but doesn't yet model per-payee EWT
  certificate tracking (2307) — that's Phase 3 (tax engine) territory.
- **Non-VAT sales bucket as "exempt"** for `Demo Services (Sole Prop)`
  (non-VAT, 8% income tax option): `buildSalesInvoiceLines` has vatable/
  zero-rated/exempt buckets; a non-VAT taxpayer's sales aren't really BIR
  "VAT-exempt" in the technical sense, they're simply outside the VAT
  system — "exempt" is used here as the closest existing bucket rather than
  adding a fourth ("non-VAT") bucket that Phase 3's percentage-tax
  computation doesn't yet consume anyway. Revisit when percentage tax
  (2551Q) is built.
- **No opening-balance import.** Every seeded client's books start from
  zero with an owner-capital-injection-style first transaction, not an
  imported prior-period trial balance. There's no UI or data-layer support
  for importing opening balances in Phase 1.

## Loose-leaf books (Phase 1, spec §3 / acceptance test #10)

- **The General Ledger paginates per account** — one loose-leaf "card" per
  account, each with its own `Page N of M` — rather than one running page
  count across the whole GL document. This matches how physical loose-leaf
  ledgers are actually organized (one card per account) and is the
  interpretation used for "continuous page numbers" in acceptance test #10:
  continuity is proven *within* each account's card (no gaps/duplicates),
  not as a single number spanning every account.
- **Brought-forward balance for page 1 of each account starts at zero for
  the selected date range**, not the account's true historical balance
  before `from`. `listLedgerLines` only fetches rows inside `[from, to]`,
  so a mid-year range (e.g. Q2 only) will under-state an account's running
  balance on page 1 relative to reality. For a balance-accurate printout in
  Phase 1, run the book since client inception (or full fiscal year) rather
  than an arbitrary mid-period slice. Carrying forward a true prior-period
  balance is deferred — it needs either a stored period-end snapshot or an
  unbounded backward query, neither built yet.
- PDF export (`app/api/clients/[id]/books/[book]/pdf/route.ts`) re-navigates
  headless Chromium (Playwright) to the *same* on-screen book route rather
  than re-implementing layout — pagination/BF-CF math is computed exactly
  once, in `lib/accounting/loose-leaf.ts`, and both the screen and the PDF
  render identical HTML/CSS (`@media print` in `app/globals.css`).
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (`.env.example`) is an optional
  override for hosts where the pre-fetched Chromium binary's revision
  doesn't match the installed `playwright` package's expected revision —
  unset in normal deployments.

## Multi-tenant isolation proof (acceptance test #6)

Proven with a `client_user`-role user scoped to a single client
(`clientId` on `users`), since that's the literal case SPEC.md's acceptance
test #6 describes ("Client A's user"). `bookkeeper`/`reviewer` roles are
scoped via `user_client_assignments` instead (a different, also-tested-by-
construction mechanism — `app_accessible_client_ids()` handles both); the
seeded demo `bookkeeper`/`reviewer` users have no assignment rows, so by
design they currently see zero clients until a `firm_admin` assigns them
one (not yet exercised by a UI in Phase 1 — assignment rows would need to be
inserted directly or a future admin screen).

## Acceptance test fixtures are intentionally permanent

`db/__tests__/acceptance.test.ts` creates one throwaway client
("Acceptance Test Co.", fixed id, idempotent — re-running the suite reuses
it rather than creating a new one every time) to post real entries against
and then prove immutability by attempting direct `UPDATE`/`DELETE` against
Postgres, bypassing the app layer entirely. Those posted/reversed journal
entries are **not** deleted in `afterAll` — they can't be: the immutability
trigger blocks `DELETE` on a posted/reversed entry for every role, including
the schema owner, which is the whole point. This is expected, not test
pollution; the throwaway client keeps it fully isolated from the two real
demo clients' books and reports.

## Known non-blocking follow-ups

- Next.js 16 deprecates `middleware.ts` in favor of `proxy.ts`; the build
  logs a deprecation warning. Not yet migrated — functionally identical for
  now, tracked as a cheap follow-up.
- Local Postgres accumulates some harmless test-residue clients from ad hoc
  manual QA during development ("Smoke Test Co." and similar) — cosmetic
  clutter in `/clients`, doesn't affect the two demo clients' data or any
  acceptance test. A fresh `db:migrate` + `seed` against a clean database
  clears it.
