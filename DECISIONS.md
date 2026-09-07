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

## BIR form replicas (2550Q, 2551Q)

`components/bir/` and `app/(app)/clients/[id]/reports/[report]/bir-2550q-form.tsx` /
`bir-2551q-form.tsx` render visual replicas of two actual BIR forms —
field positions, labels, and line numbers copied from the real form PDFs
the user supplied for this feature (2550Q April 2024 ENCS, 2551Q January
2018 ENCS), not invented. This is the one exception to "never invent BIR
form layouts": the layout is transcribed from an authentic specimen, not
guessed.

Only lines this app has real data for are filled in — Part I background
info from the client record, and the sales/purchases/output-input VAT (or
percentage-tax) figures already computed by `lib/tax/vat-return.ts` /
`lib/tax/percentage-tax.ts`. Every other line (schedules, prior-quarter
carryovers, capital goods amortization, EWT withheld, advance VAT,
penalties, the ATC lookup on 2551Q's ~20-category table, payment/signature
sections) renders as blank boxes with an inline note, rather than an
assumed zero — this app doesn't track that data, and a blank is honest
where a zero would misrepresent an unknown as a fact.

Eight other forms were supplied in the same batch (1701A, 1701Q, 1702Q,
1702RT, 1702MX, 1601C, 1601EQ, 2307) but were not replicated at the time —
this app had no computation engine at all for income tax, withholding, or
the 2307 certificate. Phase 3 (per Scope above) is building those engines
form by form; see "Withholding tax (1601-EQ, 2307)" below for the first
group.

## Withholding tax (1601-EQ, 2307)

Phase 3, Group 1: `lib/data/withholding.ts` aggregates posted `purchases`
rows flagged `ewtApplicable = 'yes'` — no new computation logic was needed,
since expanded withholding tax is entered as a manually-typed amount at
posting time (`ewtCode`/`ewtAmountCentavos`), not computed by this app.
Two views on the same underlying data:

- `getWithholdingByAtcCode` groups by ATC code, for 1601-EQ's Part II
  schedule (`bir-1601eq-form.tsx`) — one return per client per quarter.
- `getWithholdingCertificates` groups by contact then by ATC code within
  that contact, bucketing income payments into calendar months, for
  2307's Part III (`bir-2307-certificate.tsx`, at
  `/clients/[id]/contacts/[contactId]/2307`) — one certificate per payee
  per quarter, linked from the Contacts list for supplier/both contacts.

`lib/tax/atc-codes.ts` is a description lookup (code → nature-of-income +
rate), transcribed from the Schedule of Alphanumeric Tax Codes printed on
1601-EQ's own page 2 (the source PDF's ATC table on 2307's page 2 also
exists, but its text extraction came back with codes and descriptions in
scrambled column order — unusable without guessing the correspondence, so
it wasn't used). This is deliberately not exhaustive; `ewtCode` itself
stays free text entered at posting time, unvalidated against this list —
an unrecognized code still renders, just without a description, rather
than being rejected or guessed at.

Not tracked, left blank on both forms: remittances/credits from prior
filings, penalties, Part III payment details (1601-EQ), and 2307's Section
B (money payments subject to business-tax withholding — a different tax
category from expanded withholding tax), plus all signature/accreditation
fields.

## Chart of accounts

`lib/accounting/coa-template.ts` (`PH_SME_CHART_OF_ACCOUNTS`) is the PH SME
template SPEC.md §11 describes, instantiated for every new client at
onboarding. `fsLineMapping` on each account drives Trial Balance / Income
Statement / Balance Sheet assembly, so report code never hardcodes an
account code — only ever a semantic FS line. No BIR form layout was
invented anywhere in this phase (no forms are rendered yet).

New template entries added later (e.g. `2065 Salaries Payable`, added for
the payroll subsystem) only apply to clients created afterward — there's no
backfill mechanism that retroactively adds a new account to an
already-onboarded client's chart of accounts. A firm onboarded before a
given account existed needs it added by hand (Chart of Accounts screen).

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

## Payroll subsystem

Phase 3, built for BIR Form 1601-C (monthly remittance of compensation
withholding tax) and confirmed with the user as a real payroll engine, not
a manual monthly-total entry field.

**Scope correction made during design.** The "mixed income earner" question
from the Phase 3 kickoff (a client who is both a compensation earner and a
business/professional) is about *the client's own* compensation income from
*someone else's* payroll (reported to them via BIR Form 2316) — unrelated
to this app's payroll engine, which computes what a client *who is an
employer* owes on *their own* staff. Building 1701Q/1701A later confirmed
this doesn't even need the manual compensation-income input this note
originally proposed — see "Individual income tax (1701Q, 1701A)" below:
neither form's own computation ever touches compensation income at all.

**Schema** (`db/schema/payroll.ts`): `employees` holds only payroll-specific
attributes, referencing a `contacts` row (type `employee`) for identity —
same split as purchases/sales referencing a contact rather than duplicating
its fields. No tax-exemption/dependents field: TRAIN (RA 10963) removed
personal and additional exemptions from Sec. 24(A) — withholding runs off
gross taxable compensation alone. `payroll_runs` mirrors `sales_invoices`/
`purchases`: `journalEntryId` null = draft/not yet posted; no bespoke
immutability trigger, matching those tables (the linked `journal_entries`
row is what's actually immutable once posted). `payslips` snapshots every
computed figure at run time so a later rate change never retroactively
alters history, same reasoning as invoices freezing their own VAT figures.

**Scope deliberately excluded, by design, not oversight:**
- **Daily/weekly pay frequencies** — only `monthly`/`semi_monthly` are
  supported. Daily-rate payroll needs attendance/timekeeping data this app
  doesn't track; half-building it would silently compute wrong amounts on
  absences.
- **Per-benefit-type de minimis ceilings** — one lump `deMinimisCentavos`
  field per payslip, trusted to the bookkeeper as already within the RR
  11-2018/RMC ceilings for whatever benefit types it covers. Not validated
  against those ceilings here.
- **Minimum Wage Earner status** — a bookkeeper-attested flag
  (`employees.isMinimumWageEarner`), not computed from a regional
  wage-order table. This app has no source for current regional minimum
  wages (the same limitation that blocked RDO codes).
- **13th month pay combining with other bonuses for the ₱90,000 ceiling** —
  `lib/tax/thirteenth-month.ts` checks 13th month pay alone against the
  ceiling (Sec. 32(B)(7)(e), NIRC as amended by RA 10963). This app has no
  "other benefits" bucket to combine it with.

**Statutory rates — three different resolutions, deliberately:**
- **SSS** (`sss_contribution_brackets`) ships empty. SSS's own schedule is a
  frequently-revised, flat-peso-per-bracket circular schedule; no verified
  current source was reachable from this sandbox (same reasoning as RDO
  codes). The bookkeeper maintains it.
- **PhilHealth/Pag-IBIG** reuse the existing `tax_rules` key/value table
  (new keys: `philhealth_rate`, `philhealth_salary_floor`,
  `philhealth_salary_ceiling`, `pagibig_rate_ee`, `pagibig_rate_er`,
  `pagibig_salary_cap`) rather than a bespoke table — both are a flat rate
  with a floor/ceiling, the same shape `vat_rate`/`eight_percent_rate`
  already use. Also ships empty; bookkeeper-maintained.
- **The annual graduated withholding tax schedule**
  (`withholding_tax_brackets`, `lib/tax/withholding-compensation.ts`) IS
  seeded (`db/seed.ts`) — unlike the above, it's written directly into RA
  10963 (TRAIN Law) Sec. 24(A)(2)(a) itself, effective Jan 1, 2023, not a
  revisable circular. Confident enough to seed, but still flagged
  unverified (`lastVerifiedAt` left null) pending CPA sign-off, same as
  every other seeded rate in this codebase. One frequency-agnostic ANNUAL
  table: the computation annualizes a period's taxable compensation, looks
  up the bracket, then de-annualizes the tax — mathematically equivalent to
  BIR's separate per-frequency tables (RR 11-2018) without seeding one
  table per frequency.
- Computing a payslip **throws** (`MissingStatutoryRateError`,
  `NoMatchingSssBracketError`, `NoMatchingWithholdingBracketError`) rather
  than silently producing a zero deduction if a required rate/bracket isn't
  configured for the pay date — a wrong silent zero is worse than a loud
  failure here.

**GL posting** (`buildPayrollRunLines` in `lib/accounting/posting.ts`): one
aggregated journal entry per run across every payslip — not one line per
employee; per-employee detail lives in the `payslips` table, not the GL.
Posted through the General Journal book: payroll isn't one of the standard
books of account this app already models (GJ, CRB, CDB, SJ, PJ), so an
accrual entry not tied to a specific cash movement goes through GJ, same as
any other adjusting entry. Net pay credits a new `2065 Salaries Payable`
liability rather than cash directly — actual payout is a separate Cash
Disbursement against it, reusing the existing AP/AR-style
accrue-then-disburse pattern rather than building a new disbursement flow.

The engine — schema, RLS, GL posting, and the full withholding/SSS/
PhilHealth/Pag-IBIG/13th-month computation — is verified end-to-end
against a real Postgres in `db/__tests__/payroll.test.ts` (skips
gracefully, rather than failing, if a dev DB hasn't had SSS/PhilHealth/
Pag-IBIG rates entered yet).

## Payroll UI

Employees (list + create) and Payroll Runs (list + create + detail) under
each client, plus the two settings-side pieces the engine needs to
actually compute anything: an "Add Rule" form on `/settings/tax-rules`
(generic key/value — the same form that already covers `vat_rate` etc. now
also covers the new `philhealth_*`/`pagibig_*` keys, no payroll-specific
code needed there) and a new "SSS Contribution Brackets" table + add-form
on the same page (SSS's schedule doesn't fit the key/value shape — see
"Payroll subsystem" above). Both are firm_admin-only, matching the page's
existing guard; neither supports editing/deleting a row, same reasoning as
`tax_rules` — a rate change is a new row with its own `effectiveFrom`.

The new-payroll-run form is a client component (not the usual
FormData-from-`<form>` pattern) because it's a dynamic per-employee table —
one row of optional amount fields per employee, built from React state and
submitted as structured JSON, rather than trying to encode a variable
number of rows into flat FormData field names.

**Bug found and fixed while verifying this against a running instance**:
`useJsonPost` only called `router.push()` on success, which is a no-op in
Next's App Router when the target URL is the *same* one the user is
already on (a page redirecting to itself, like these two settings
add-forms do) — so a successful submit didn't visibly update the list
until a manual reload, even though the row was actually saved. Fixed by
also calling `router.refresh()` unconditionally after `push()`; harmless
for every other existing form (whose push already goes to a different
URL and fetches fresh data on its own).

Not yet built: employee/payroll-run editing, a payslip PDF/print layout
(the detail page is an on-screen table only), and no automatic 13th-month
computation — the amount is entered per employee, not summed from the
year's prior payslips.

## Individual income tax (1701Q, 1701A)

Phase 3. Re-reading the actual 1701Q/1701A form PDFs before building
(same "transcribe from an authentic specimen" policy as every other BIR
form replica) corrected a real scoping mistake from the payroll design
above: **neither form's computation ever touches compensation income, at
all** — 1701A is explicitly titled "Individuals Earning Income PURELY
from Business/Profession" (OSD or 8% only — no itemized-deduction option,
no compensation section), and 1701Q's Schedule I/II only ever compute tax
on business/professional Sales/Revenues, even when the taxpayer checks a
"Mixed Income" ATC classification box. A true mixed-income annual
reconciliation needs the full BIR Form 1701, which was never one of the 8
forms in the original Phase 3 list — out of scope, not built.

**Scope split between the two forms**, matching what each form itself
actually supports:
- **1701Q** (quarterly): available to any Single Proprietor/Professional
  client, all three regimes (itemized, OSD, 8%) — the real form supports
  itemized deductions via Schedule I's Item 37/39.
- **1701A** (annual): available only to OSD or 8% clients, per the form's
  own stated scope. A `graduated_itemized` individual client sees no
  1701A tab at all (would need the full 1701, not built) but still gets
  1701Q.
- Gated on `taxpayerType` being `sole_prop` or `professional` — a plain
  `individual` taxpayerType is a pure compensation earner who doesn't
  self-file business income tax at all; corporations use the 1702 series
  (a later Phase 3 group).

**Cumulative computation** (`lib/tax/individual-income-tax.ts`,
`lib/tax/quarter-label.ts`'s `quarterBoundsFor`): both the graduated and
8% schedules on 1701Q are cumulative year-to-date per Sec. 74, NIRC — each
quarter's own figures plus everything since Jan 1 through the prior
quarter, computed fresh from this app's own Income Statement for the
right date ranges each time, not carried forward as stored state. 1701Q
has no Q4 checkbox on the real form (Q4 is reconciled directly on the
Annual Return) — the report page shows an explanatory notice instead of
the form for a Q4 date range.

**Reuses, not new tables**: the graduated bracket table is the SAME
`withholding_tax_brackets` the payroll withholding engine already seeds
(Sec. 24(A)(2)(a) is one schedule, used both ways) — applied directly here
with no annualize/de-annualize step, since the income figure passed in is
already annual or cumulative-to-date. Cross-checked against the actual
1701A/1701Q PDFs' own printed rate table, which matches exactly — good
independent confirmation the seeded figures are correct. The 8% schedule
reuses the existing `lib/tax/eight-percent.ts` unchanged, just fed a
cumulative (1701Q) or full-year (1701A) gross-receipts figure instead of
a single period's.

**Real, derived, but assumption-bearing figures**: "tax payment for
previous quarters" (1701Q Item 56, 1701A Item 58) is computed as what the
graduated/8% tax would have been on the cumulative income through the end
of the prior quarter — not an actual recorded payment (this app tracks
none). Labeled on the form itself as assuming that amount was actually
paid. Creditable tax withheld figures (1701Q Items 57-58, 1701A Items
59-60) ARE real, tracked data — `sales_invoices.ewtWithheldByCustomerCentavos`
(new `getEwtWithheldByCustomerTotal` query in `lib/data/tax-reports.ts`),
previously captured but never surfaced in any report.

**Rounding**: both forms print "DO NOT enter Centavos; 49 Centavos or Less
drop down; 50 or more round up" — a whole-peso half-up rounding rule
distinct from how this app displays money everywhere else (always 2
decimals). `roundToWholePesos()` applies this ONLY at the point these two
components render an `AmountBoxes` value; all underlying computation
stays exact in centavos. Because each line is rounded independently for
display (matching how a preparer fills in each box on the real paper
form), displayed subtotals can be off by ±1 peso from summing the
already-rounded lines above them — the underlying tax-due figures are
still computed from the exact, unrounded totals, so this is a display-only
artifact, not a computation bug.

**Not tracked, left blank**: spousal information (Part II/V on both
forms — this app has no spousal data model at all), prior-year excess
credits, foreign tax credits, penalties, GPP partner income shares, and
payment details.

## Corporate income tax (1702Q, 1702-RT)

Phase 3, completing the confirmed 8-form list (1702MX explicitly dropped —
"No on PEZA/BOI"). Gated on `taxpayerType === "corporation"` and
`incomeTaxRegime` being `rcit` or `mcit_applicable`; a `sole_prop`/
`professional` client never sees these tabs (uses 1701Q/1701A instead).

**`dateOperationsCommenced`** (new nullable `date` column on `clients`,
migration `0003_loud_robbie_robertson.sql`): drives the MCIT 4th-taxable-
year gate (Sec. 27(E), NIRC as amended by RA 11534). Confirmed as real
data the form itself asks for — 1702-RT's own Part I Item 10 is "Date of
Incorporation/Organization" — rather than inventing a field. No general
client-edit page exists in this app, so a narrow, single-field
click-to-edit component (`date-operations-commenced-field.tsx`) plus its
own route was built instead of a full edit form, consistent with how
every other single-field admin update in this app is scoped. Nullable:
until it's set, MCIT simply doesn't apply — the forms show a "MCIT
comparison not applied" notice rather than assuming a date.

**RCIT vs. MCIT, "whichever is higher"** (`lib/tax/corporate-income-tax.ts`):
Sec. 27(A) NIRC as amended by RA 11534 (CREATE Act) sets the general RCIT
rate at 25%, with a 20% rate for MSME domestic corporations (net taxable
income ≤ ₱5M AND total assets ≤ ₱100M excluding land). This app cannot
auto-determine MSME eligibility — land isn't broken out from Property &
Equipment in the chart of accounts — so `rcit_rate` is a single
configurable `tax_rules` value, defaulting to the conservative 25%, with a
note to verify per client before filing. MCIT (Sec. 27(E)) is 2% of gross
income, applying from the 4th taxable year after operations commenced;
CREATE's temporary 1% reduction (Jul 2020–Jun 2023) has expired and isn't
modeled. `higherOfRcitOrMcit()` picks the higher due amount, per the form's
own printed instruction — both 1702Q Schedule 3 and 1702-RT Item 43 show
this comparison explicitly rather than silently substituting one figure.

**Corporate OSD is 40% of gross income, not gross sales** — confirmed
directly from both 1702Q's and 1702-RT's own printed formulas, and
genuinely different from individual OSD (40% of gross *sales* on
1701Q/1701A). Also unlike 1701Q's individual OSD schedule (where Cost of
Sales/Services is only subtracted for itemized filers), corporations
always subtract COS before Gross Income regardless of itemized/OSD
election — 1702Q's Item 2 has no "(applicable only if availing Itemized
Deductions)" qualifier that 1701Q's equivalent line does. Both were
close-reads of the actual specimens, not assumptions.

**Cumulative computation**: 1702Q reuses the exact same `quarterBoundsFor`
/ `incomeStatementFor` machinery built for 1701Q — Sec. 74 NIRC cumulative
year-to-date, computed fresh from the Income Statement each time, not
stored state. Schedule 3 (MCIT) additionally needs each individual
quarter's own (non-cumulative) gross income, queried per-quarter and
summed, since MCIT's 2% base is cumulative gross income rather than
cumulative taxable income. 1702Q likewise has no Q4 filing (reconciled on
the Annual Return) — same explanatory-notice treatment as 1701Q.

**1702-RT's "previous quarters' payment" lines** (Items 45-46): computed
as what the first three quarters' 1702Q filings would have paid — RCIT or
MCIT, whichever basis was higher for that cumulative period — assuming
that amount was actually paid, the same "derived, not recorded" pattern
already used for 1701Q/1701A's equivalent lines.

**Real, disclosed gaps, not simplifications** (each noted directly on the
form, not silently zeroed): NOLCO / net operating loss carry-over
(Schedule III/IIIA — needs multi-year loss history this app doesn't
persist), MCIT excess-credit carryforward across the 3 succeeding years
(Schedule IV — same reason), the 17-category itemized-deduction breakdown
(Schedule I — this app's chart of accounts has one aggregate Operating
Expenses figure, not 17 line items), and MSME rate auto-determination (see
above). Schedule V (book-vs-tax reconciliation) is skipped by design,
consistent with this app's existing book-net-income-is-taxable-income
simplification. Part V (PEZA/special-law tax relief) isn't reproduced —
out of scope per "No on PEZA/BOI."

## Known non-blocking follow-ups

- Next.js 16 deprecates `middleware.ts` in favor of `proxy.ts`; the build
  logs a deprecation warning. Not yet migrated — functionally identical for
  now, tracked as a cheap follow-up.
- Local Postgres accumulates some harmless test-residue clients from ad hoc
  manual QA during development ("Smoke Test Co." and similar) — cosmetic
  clutter in `/clients`, doesn't affect the two demo clients' data or any
  acceptance test. A fresh `db:migrate` + `seed` against a clean database
  clears it.
