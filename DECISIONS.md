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

## Reference compliance reports (SLS, SLP, MAP, Alphalist of Employees)

Four additional Reports tabs, distinct from the earlier BIR form replicas:
plain listings the bookkeeper copies from manually, not attempts to
reproduce an official form's exact layout (no authentic specimen was
supplied for any of the four) — plain-English column labels throughout,
same "computation aid, not an official form" disclaimer banner as every
other report.

**Always shown, even empty**: unlike the tax-computation tabs (gated on
taxpayer type/VAT status/regime), all four always appear in the tab bar
regardless of client type, per explicit instruction — a client with no
data for the selected range gets a plain "No … in this period" empty
state rather than a hidden tab.

**Summary List of Sales / Summary of Purchases** (`lib/data/tax-reports.ts`
`listSalesInvoicesForPeriod`/`listPurchasesForPeriod`): one row per posted
`sales_invoices`/`purchases` record in range, joined to `contacts` for
customer/supplier identity — same posted-only + date-range filter every
other tax report already uses. Purchases includes every posted purchase,
not just EWT-withheld ones (that subset is the separate MAP report).
`contacts.tin`/`.address` are nullable — the schema comment already flagged
this as expected for SLSP (`db/schema/contacts.ts`) — rendered as an amber
"missing" note rather than a blank cell, so a bookkeeper notices before
relying on the row.

**Monthly Alphalist of Payees (MAP)** (`lib/data/withholding.ts`
`getWithholdingByPayee`): almost entirely reuse — groups the same
`listWithheldPurchases()` rows 1601-EQ's `getWithholdingByAtcCode` already
uses, just by payee (and ATC code, since one payee can have more than one
income type in a period) instead of by code alone. Lists every withheld
transaction in range with **no BIR inclusion threshold applied** — per
explicit instruction, the bookkeeper applies the official rules themselves
before submission, this app doesn't track filing thresholds anywhere else
either.

**Alphalist of Employees** (`lib/data/payroll.ts`
`getAnnualEmployeeCompensationSummary`): the one genuinely new query — no
existing function rolls payslips up per-employee across a date range
(`listPayrollRuns`/`getPayrollRunWithPayslips` are both per-run only).
Sums every payslip component from posted payroll runs (joined through
`journal_entries.status = 'posted'`, same immutability convention payroll
already follows) by pay date in range, per employee. Reports each
component as stored on the payslip (basic pay, overtime, other taxable
earnings, de minimis, 13th month pay, gross taxable income, SSS/
PhilHealth/Pag-IBIG, withholding tax, net pay) rather than deriving a
"non-taxable compensation" total — the exempt portion of 13th month pay
isn't separately persisted anywhere this app could sum without inventing
a number.

**Tenant isolation**: all four reuse the exact same `withUserContext()` /
RLS path as every other report — no new isolation work, since
`sales_invoices`, `purchases`, `contacts`, `employees`, and `payslips`
already had firm/client-scoped RLS policies from Phase 1/3.

## Audit trail: sign-in events, failed logins, plain-English descriptions

Phase 0 of a larger real-multi-tenancy effort (Auth migration to Supabase
Auth and self-serve firm signup are separate, later phases — not started
here). Before touching anything, audited what the audit trail actually
already did: it was already firm-isolated by RLS for any number of firms
(`audit_log_select` scopes to `actor_user_id`'s firm matching the caller's
firm — not hardcoded to the one demo firm), and `lib/auth/login.ts`
already logged successful logins. So this phase is narrower than it might
sound — three additions, not a rebuild:

- **Logout logging** (`lib/auth/login.ts#logout`): reads the session's
  claims before destroying the cookie, so the event is still attributable.
- **Failed-login logging**: only when the email matches a real user (wrong
  password, or an inactive account attempting to sign in) — an unknown
  email isn't logged at all, since there's no user (and so no firm) to
  attribute it to, and logging every typo/bot hit against the login form
  would be noise, not a firm-relevant security signal. Uses `audit_log`'s
  existing `reason` column, previously unused.
- **Plain-English descriptions** (`lib/audit-log-labels.ts`,
  `describeAuditEntry()`): a pure, unit-tested function turning
  action+table+before/after into a sentence ("Signed in", "Role changed:
  bookkeeper → reviewer", "Created sales invoice") instead of raw
  `UPDATE users`. Deliberately narrow — only login/logout/failed-login and
  a `users`-table role/active-flag diff get special-cased; everything else
  falls back to "Created/Updated/Deleted <table>". Role changes were
  already captured by the existing `audit_users` trigger (before/after
  JSON) — this only makes that diff legible, no new logging path.
- Reads `before`/`after` JSONB in `lib/data/audit-log.ts` to compute the
  description server-side, then **discards them** — never returns raw
  JSON to a client component, since a `users` row's `before`/`after`
  includes `password_hash`.
- Failed-login rows get a distinct amber treatment on both the Audit Log
  page and the dashboard's Recent Activity preview, so a firm admin
  notices them without reading every row.

## Phase 1 of real multi-tenancy: migrating to real Supabase Auth

Replaces the dev JWT-cookie shim (`lib/auth/session.ts`, `lib/auth/password.ts`,
the custom `password_reset_tokens` flow) with real Supabase Auth — the
originally-documented production target (see "Infrastructure" above),
now actually wired up. Foundation only: this PR does not add self-serve
signup, Google sign-in, or platform admins — those are later phases, once
this is live and verified.

**Architecture correction made before writing any code**: the plan going
into this assumed RLS's `app_current_user_id()` helper would need to
switch to reading Supabase's `auth.uid()`. That's wrong for this app's
architecture — `auth.uid()` only auto-populates on connections that go
through Supabase's PostgREST layer (which sets `request.jwt.claims` per
request); this app connects directly via `postgres.js` (`db/client.ts`),
never through PostgREST. So `app_current_user_id()` and every RLS policy
are **completely unchanged** — `withUserContext()`'s existing
transaction-local `app.current_user_id` session variable is still exactly
how RLS learns who's asking. The only change is *where the verified user
id comes from*: `supabase.auth.getUser()` (a real round-trip to Supabase's
Auth server, not just decoding a cookie) instead of verifying our own JWT.
This is a smaller, safer migration than originally scoped, and a real
improvement worth flagging: it means zero RLS/SQL-policy churn, and the
existing local sandbox Postgres needs no Supabase-specific compatibility
shims to keep the DB-level acceptance tests (including the multi-tenant
isolation test) running exactly as before.

**Schema**: `users.id` no longer has `defaultRandom()` — it's always
supplied explicitly now, meant to equal the corresponding
`auth.users.id`. `password_hash`/`token_version` are dropped (Supabase
Auth owns both credential storage and session revocation). The FK from
`public.users.id` to `auth.users.id` (`db/sql/004_supabase_auth.sql`) is
added **conditionally** — real Supabase Postgres has an `auth` schema,
this sandbox's local Postgres never will (no local Supabase Auth service
exists to back it), so the migration checks for `auth.users` before
adding the constraint. Nothing in the app reads that FK's existence, so
skipping it locally changes nothing about behavior or tests — it's an
integrity backstop, not something application logic depends on. The 7
columns referencing `users.id` (`user_client_assignments.user_id`,
`audit_log.actor_user_id`, `journal_entries.posted_by`/`created_by`,
`password_reset_tokens.user_id`, `period_locks.locked_by`/`unlocked_by`)
all gained `ON UPDATE CASCADE`, so a user's row can be re-keyed to a new
Supabase Auth UID without losing any history — exactly what
`scripts/migrate-demo-users-to-supabase-auth.ts` relies on.

**`lib/auth/*` rewrite**: `login()`/`logout()` use
`signInWithPassword()`/`signOut()`; `getCurrentUser()` uses `getUser()`
(never `getSession()` — `getSession()` only reads the local cookie
unverified, `getUser()` round-trips to confirm the token is still valid,
which matters since this gates every protected page). LOGIN/LOGOUT/
LOGIN_FAILED audit logging (Phase 0, already shipped) is unchanged in
behavior, just sourced from Supabase's result instead of our own bcrypt
check. `password_reset_tokens` is now dead (left in place, not dropped —
dropping a table is the one kind of schema change worth being
conservative about) — reset is `resetPasswordForEmail()` +
`updateUser()`, landing through a new `app/auth/confirm/route.ts`
(Supabase's documented `verifyOtp()` pattern) that establishes a session
before redirecting to `/reset-password`, which now needs no token in the
URL or form — a valid Supabase session there IS the proof the link was
legitimate. `lib/email/send.ts` and `e2e/password-reset.test.ts` are
removed — Supabase sends its own reset/confirmation emails now, so the
whole dev-outbox abstraction has nothing left to do. `middleware.ts`
follows Supabase's official Next.js App Router session-refresh pattern
verbatim, rather than improvising one.

**What's still unverified — needs a live Supabase project**: everything
past `/login` now depends on `supabase.auth.getUser()` succeeding, which
requires a real `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` and network access
neither this sandbox has. What *was* verified here: the full unit/
acceptance test suite (114 tests, unaffected — they call `withUserContext`
directly with a known id, bypassing the auth layer entirely) still
passes; `pnpm tsc --noEmit` is clean; `pnpm build` compiles successfully,
including the Edge-runtime `middleware.ts`. The actual sign-in/reset/
logout round trip against a real Supabase project — and in particular
whether Supabase's password-reset email actually links to
`/auth/confirm` with the `token_hash`/`type` shape this code expects,
which depends on Supabase's own email template configuration — has not
been exercised end-to-end and is the main thing to verify together before
merging.

**Real bug this caught, live**: running `pnpm db:migrate` against a real
Supabase project failed — `db/sql/004_supabase_auth.sql`'s
`ADD CONSTRAINT ... FOREIGN KEY (id) REFERENCES auth.users(id)` validates
every existing row immediately, and the demo firm's 3 pre-existing
`public.users` rows (created before this migration, under the old auth
system) have no matching `auth.users` row yet — that only happens once
`scripts/migrate-demo-users-to-supabase-auth.ts` re-keys them, which is a
separate, later step. Chicken-and-egg: the migration can't run before the
script, but the script needs the migration's schema changes (dropped
`password_hash` etc.) to already be in place. Fixed by adding the
constraint `NOT VALID` (skips checking existing rows, still enforced for
every new insert/update from that point on) and having the migration
script call `VALIDATE CONSTRAINT` as its own last step, once the demo
users it just re-keyed actually satisfy it. Reproduced the exact failure
locally first (a throwaway `auth` schema + empty `auth.users` table,
confirmed byte-for-byte against the real error message), then confirmed
the `NOT VALID` version succeeds immediately and `VALIDATE CONSTRAINT`
correctly fails before re-keying and succeeds after, before shipping the
fix — not just reasoned about abstractly.

**Second bug this caught, live**: with the FK fixed, `pnpm migrate-demo-users`
got further but then failed on `admin@keepbooks.demo`'s re-key with
"Posted journal entry ... is immutable. Use a reversing entry instead."
The `ON UPDATE CASCADE` on `journal_entries.posted_by`/`created_by`
(added in `db/sql/004_supabase_auth.sql`) touches those columns even on
already-posted entries — but `enforce_journal_entry_immutability()`'s
only allowed exception was the reversal status-flip, and even that
required `posted_by` to stay byte-for-byte unchanged. Checked every
other `ON UPDATE CASCADE`d column first (`period_locks`, `audit_log`,
`user_client_assignments`) — none of the rest have an immutability
trigger, only `journal_entries` does. Fixed in
`db/sql/005_immutability_allow_user_rekey.sql`: the trigger now allows
an update where the *only* things that change are `posted_by`/
`created_by` — status and every financial field (amounts, dates, lines,
book, reference) must stay exactly as-is, or it's still rejected exactly
as before. Not a weakening of rule #3: the app itself never runs
`UPDATE journal_entries SET posted_by = ...` anywhere — only this
privileged, one-time re-keying script does — so the narrower exception
doesn't open up anything the running app could exploit. Verified against
real posted *and* reversed entries in the seeded demo data: reproduced
the exact reported error first, confirmed the fix lets the re-key cascade
through on both statuses, then confirmed genuine tampering (changing an
`entry_date`, editing a `description`) is still rejected on both —
before reverting the test re-key and shipping.

**Demo accounts**: `scripts/migrate-demo-users-to-supabase-auth.ts`
(`pnpm migrate-demo-users`) creates the 3 seeded demo accounts as real
Supabase Auth users and re-keys their `public.users.id` to match —
idempotent, safe to re-run. Their old bcrypt hashes never carried over
(there's nowhere for them to go); this script is what makes
`admin@keepbooks.demo` / `password123` loggable-into again post-migration.

**Removed as dead weight**: `bcryptjs`, `jose` (both unused once
`lib/auth/session.ts`/`password.ts` are gone), `AUTH_SECRET` (nothing
reads it anymore).

## Phase 2 of real multi-tenancy: self-serve firm signup

Builds on Phase 1's Supabase Auth foundation — a new `/signup` page where
a bookkeeper creates their own firm and becomes its first `firm_admin`,
no manual provisioning needed. Google sign-in on this page is Phase 3,
not added here (the form is email/password only for now).

**`lib/auth/signup.ts`**: `supabase.auth.signUp()` first, then — on
success — one transaction on `authDb` (the RLS-bypassing schema-owning
connection, same one `login.ts`/`password-reset.ts` already use) creates
the `firms` row and its first `users` row, `role: 'firm_admin'`,
`id` set to the Supabase Auth user's own id. Bypassing RLS here isn't a
shortcut: `users_insert`'s policy requires an *existing* `firm_admin` to
already be acting, which is circular for a firm that by definition has
no users yet — this is the one place in the app a brand-new identity has
to be bootstrapped outside RLS. `db/authClient.ts`'s doc comment was
updated to name all three legitimate callers now that there's a third.

**Email confirmation is handled either way, not assumed**: whether
Supabase requires confirming your email before a session exists is a
Supabase dashboard setting this app doesn't control or know in advance.
`signUp()` returns `needsEmailConfirmation: !data.session` — the caller
shows "check your email" when true, redirects straight to `/dashboard`
when Supabase already established a session. Untested against a live
project (same limitation as Phase 1 — this sandbox can't reach one), so
this is the first thing to verify live before merging.

**A real, disclosed gap, not a simplification**: if the Supabase Auth
call succeeds but the DB transaction fails right after (rare — a DB
failure immediately following a successful upstream call, not a normal
validation failure), the result is an orphaned Supabase Auth user with no
firm/profile row. Retrying signup with the same email then hits
Supabase's "already registered" error with no way to resume rather than
start over. Not handled in this phase — flagged here rather than silently
assumed away. Resuming an interrupted signup (detecting "this email has
an auth identity but no profile" and completing just the DB step) would
close this gap if it turns out to matter in practice.

**Audit trail**: `signUp()` writes its own `SIGNUP` audit_log row,
correctly attributed to the new user (their `id` already exists in this
same transaction by the time it's written) — labeled "Firm created" in
`lib/audit-log-labels.ts`. The generic `audit_users` trigger also fires
on the `users` insert with a `NULL` actor (this transaction never sets
`app.current_user_id`, so `app_current_user_id()` has nothing to read) —
same as every demo user's own creation via `db/seed.ts`, already-accepted
behavior, not new here. Added a `PASSWORD_RESET` label too while touching
this file — it existed as an audit action since Phase 0/1 but had no
human-readable description yet, falling back to "PASSWORD_RESET users".

**Verified**: the DB transaction shape (insert firm, insert its first
firm_admin, insert the SIGNUP audit row) run directly against the local
sandbox schema and rolled back cleanly — proves the SQL-level operations
this transaction performs are sound, though the full flow starting from
a real `supabase.auth.signUp()` call is what still needs a live
walkthrough. Full test suite (116, two new for the added labels),
`tsc --noEmit`, and `pnpm build` all pass.

**Password confirmation + complexity** (added after initial review):
a "Confirm password" field, checked server-side via zod's `.refine()`
against `password` (the same generic error-banner pattern every other
form validation error in this app already uses — no new per-field error
UI introduced). Complexity requirements (min 8 chars, one uppercase, one
special character) are enforced by the schema and, redundantly, by the
password `<input>`'s `pattern`/`minLength` attributes for immediate
browser feedback before the form even submits — the zod schema is what's
authoritative, the `pattern` is a convenience layer matching the existing
project convention (e.g. the employee TIN field). The three requirements
are listed as a plain bullet list directly under the field, not left for
the user to discover only after a failed submit. Verified by running the
exact zod schema standalone (too-short / no-uppercase / no-special-char /
mismatched / valid cases) rather than just reading it — `lib/auth/signup.ts`
imports `"server-only"`, so this had to be a schema-only script outside
the module, not a `pnpm test` unit test (matches this codebase's existing
precedent of not unit-testing the other auth schemas directly, e.g.
`resetPasswordSchema`).

## Phase 3 of real multi-tenancy: Google Sign-In

Google Sign-In using Supabase Auth's OAuth provider support, built on top
of Phase 1's migration to real Supabase Auth (`lib/auth/supabase-server.ts`,
`middleware.ts`'s session-refresh pattern) — no schema changes, since
`public.users.id` already just has to equal `auth.users.id` regardless of
which provider created that identity.

**A second, different OAuth pattern, not a variant of the existing one**:
`app/auth/confirm/route.ts` (Phase 1, password reset) uses Supabase's
email-link/OTP pattern — `verifyOtp({type, token_hash})` against a
`token_hash` query param. Google's flow is PKCE — a `code` query param
exchanged via `exchangeCodeForSession(code)` — a different Supabase API
entirely, so this is a new route (`app/auth/callback/route.ts`), not a
branch added to the existing one.

**`signInWithOAuth()` has to run client-side**: it redirects the browser
itself to Google's consent screen, which a Server Action can't do (it can
only return a redirect *response*, not navigate the browser to a
different origin mid-request in the way this needs). This is the one auth
flow in the app that needs a browser-side Supabase client
(`lib/auth/supabase-browser.ts`, `createBrowserClient`) — every other
flow (password login, signup, reset) posts to a Server Action and never
needed one.

**One button, both pages, no separate "signup via Google" flow**:
`signInWithOAuth()` doesn't distinguish login intent from signup intent —
Supabase creates the Google identity if it's new or signs in an existing
one either way. `components/auth/google-sign-in-button.tsx` is the same
component on `/login` and `/signup`; `app/auth/callback/route.ts` is what
decides afterward whether this is a returning user or a brand-new one
that needs onboarding.

**Brand-new Google identities don't get an auto-generated firm** (the
recommended, confirmed design): rather than inventing a firm name like
"Jane's Firm" or leaving `firms.name` blank, a Google identity that
authenticates with no matching `public.users` row is redirected to
`/onboarding/firm` to name their firm and confirm their display name
(pre-filled from Google's profile via `user_metadata.full_name`/`name`,
editable — Supabase doesn't guarantee which key a given provider version
populates, so both are checked with the profile still editable either
way). Submitting that form calls the same `createFirmForUser()` helper
email/password signup uses.

**`createFirmForUser()` extracted from `lib/auth/signup.ts`** into
`lib/auth/create-firm-for-user.ts` — the transaction (insert `firms`,
insert the first `users` row as `firm_admin`, insert the `SIGNUP` audit
row) was identical logic needed from two call sites now: email/password
signup (which creates the Supabase Auth user itself first) and Google
onboarding (where Supabase Auth already created the user during the OAuth
callback, so this just finishes the profile). Still bypasses RLS via
`authDb` for the same reason as before — `users_insert`'s policy requires
an *existing* `firm_admin` to already be acting, circular for a firm with
no users yet.

**Distinguishing "hasn't signed up" from "signed in, never finished
onboarding" from "existing account, deactivated"**: a Google identity
that authenticates but closes the tab before naming a firm has a real
Supabase session with no `public.users` row — different from a fresh
visitor (no session at all) and from an existing but deactivated account
(has a row, just `active: false`). `lib/auth/current-user.ts`'s new
`getPendingGoogleSignup()` distinguishes exactly this case, and
`requireCurrentUser()` now sends that specific case to `/onboarding/firm`
to resume instead of `/login`, where they'd have no way to finish. A
deactivated existing account still falls through to `/login` unchanged,
since it has a profile row (`getCurrentUser()`'s existing `!row.active`
check).

**Existing users signing in with Google for the first time**: whether
Supabase auto-links a new Google identity to an existing email/password
account with the same, verified email (so `sign in with Google` on an
existing bookkeeper's email lands on their same account) or creates a
separate identity is controlled by Supabase project-level settings this
app doesn't control from code — expected/desired behavior per Supabase's
docs, but unverified against the live project (same sandbox network
limitation as every other live-auth step this phase). First thing to
confirm during the live walkthrough, alongside the OAuth redirect itself.

**`middleware.ts`**: `/auth/callback` added to `PUBLIC_PATHS`, same
reason `/auth/confirm` already was — the request lands with no session
cookie yet (that's what the route itself is about to establish), so it
would otherwise get bounced to `/login` before ever running.
`/onboarding/firm` needed no such change: middleware only gates on
"is there *any* Supabase session," which a pending Google identity has —
the page itself (via `getPendingGoogleSignup()`) is what decides whether
that session belongs there.

**Platform admin role/invite UI**: intentionally out of this PR. Creating
the first platform admin account and the in-app "invite another admin"
flow both depend on this Google Sign-In wiring existing first, but are
being sequenced as separate follow-up work rather than folded in here, to
keep this change reviewable on its own (per the earlier "no giant change"
guidance for this whole multi-tenancy effort).

**Verified**: full test suite (116, unchanged — no new pure logic to unit
test here beyond what Phase 1/2 already cover), `tsc --noEmit`, and
`pnpm build` (which correctly picked up both new routes,
`/auth/callback` and `/onboarding/firm`) all pass. The actual OAuth
redirect round-trip through Google and Supabase is unverified from this
sandbox (no egress to real Google/Supabase endpoints) — this PR is opened
as a draft for the same reason Phase 1's was, pending a live walkthrough.

## Phase 3, part 2: `platform_admin` role and the first admin account

Adds a `platform_admin` value to `user_role` (single-statement migration,
`ALTER TYPE ... ADD VALUE`, generated by `drizzle-kit` off the schema
change — no hand-authored SQL needed here) and the scaffolding to create
and recognize an account with it. Deliberately does **not** include an
in-app "invite another admin" page yet — see below.

**`firmId`/`clientId` needed no schema change**: both were already
nullable on `users` (`firmId` for firms not yet fully set up, `clientId`
for anyone who isn't a `client_user`), so a platform admin — who belongs
to no firm at all — just has both `NULL`. `app_current_firm_id()` and
`app_current_client_id()` (both `SELECT ... FROM users WHERE id = ...`)
resolve to `NULL` for them without any change, and RLS functions that key
off firm/client scoping (`app_accessible_client_ids()`, the `clients`/
`firms` policies) simply return nothing for a platform admin — not an
error, just an empty result, since none of their `WHEN` branches match
`platform_admin`. `app_is_staff()` deliberately does **not** include
`platform_admin` — that function means "does firm-scoped bookkeeping
work," which is a different question from "is this a platform admin,"
and conflating them would have been wrong the moment platform-admin-only
UI needs its own gate.

**No new RLS policy for `users`**: the existing `users_select` policy's
`id = app_current_user_id()` clause already lets any row see itself
regardless of role or firm, which is all `getCurrentUser()` needs. A
policy letting a platform admin see and manage *other* `platform_admin`
rows (needed once the invite-other-admins page exists) is deferred to
that page's own PR rather than added speculatively now with nothing yet
to exercise it.

**How the first (and any) admin account gets created**:
`scripts/create-platform-admin.ts`, run by hand against a real Supabase
project (`pnpm create-platform-admin -- <email> "<name>"`) — mirrors
`migrate-demo-users-to-supabase-auth.ts`'s shape (Admin API via
`SUPABASE_SERVICE_ROLE_KEY`, `MIGRATION_DATABASE_URL` for the direct
insert). Creates the Supabase Auth user with **no password** — admin
accounts sign in with "Continue with Google" only, per the earlier
decision that admin accounts should support Google sign-in the same way
bookkeepers do — then inserts the matching `public.users` row directly
(`role: platform_admin`, `firm_id: NULL`) and an `ADMIN_CREATED` audit
row (new label: "Platform admin created"). Idempotent — re-running for
an email that already has both rows is a no-op.

**Why this bypasses `app/onboarding/firm` entirely, on purpose**: that
flow (Phase 3, part 1) is what a brand-new Google identity hits when it
has no `public.users` row yet, and it always creates a *firm*. Running
`create-platform-admin.ts` first means the `public.users` row already
exists with `role: platform_admin` by the time that person ever clicks
"Continue with Google" — `app/auth/callback/route.ts`'s existing
`hasProfile` check finds it and signs them straight in, never routing
through onboarding at all. No new code needed in the callback route or
onboarding page for this — the existing "does a profile row already
exist" branch was already exactly what this needed.

**`/dashboard` placeholder, not a real admin dashboard**: without a
special case, a platform admin landing on `/dashboard` would see an
empty "Firm Dashboard" (RLS-scoped client/draft queries correctly return
nothing for them, so nothing crashes — it's just a misleading empty
state, not a bug). Added a minimal, honest placeholder for
`role === "platform_admin"` instead of building the real admin landing
page now. The "Clients" nav link is also hidden for this role in
`app/(app)/layout.tsx`, same reasoning — a platform admin has no
clients, ever, unlike a firm admin who might just have zero today.

**Deliberately out of this PR**: the in-app "invite another admin" page.
Per the earlier confirmed design, that flow will use the Admin API's
`inviteUserByEmail()` (creating the `auth.users` row and the matching
`public.users` row together, same shape as this script) from a
server-side route gated by a new `requirePlatformAdmin()` guard and,
almost certainly, `SUPABASE_SERVICE_ROLE_KEY` reachable from the running
app rather than only from standalone scripts — real new surface area,
sequenced as its own follow-up once there's a second/third admin to
actually invite.

**Verified**: migration applied cleanly against the local sandbox
database (`ALTER TYPE ... ADD VALUE`, no data to migrate). Full test
suite (117 — one new case for the `ADMIN_CREATED` label), `tsc --noEmit`,
and `pnpm build` all pass. The script itself — the live Admin API calls
and the actual "Continue with Google" sign-in as a pre-created platform
admin — is unverified from this sandbox (no egress to a real Supabase
project); opened as a draft PR pending you running it against your own
project.

## Fix: `create-platform-admin.ts` arg parsing, plus a cleanup script

Two small additions on top of the `platform_admin` PR, both found via live
use rather than anticipated in advance.

**`pnpm <script> -- <args>` (the bare form, without `run`) forwarded the
`--` separator itself as an argument**, reported live: `pnpm
create-platform-admin -- mrcabanador@gmail.com "Marc Abanador"` sent `"--"`
to Supabase's admin API as the email, which understandably rejected it as
an invalid address. `pnpm run <script> -- <args>` and plain `npm` both
strip the separator; this pnpm form apparently doesn't. Fixed by filtering
a literal `"--"` out of `process.argv` before parsing in
`create-platform-admin.ts` — correct either way, regardless of which
convention the caller's pnpm version follows. Verified in isolation
(`process.argv` set to both the with-`--`and without-`--`shapes, same
parse result both times) rather than just reasoning about it, since this
is exactly the kind of off-by-one argv bug that's easy to "fix" wrong.

**`scripts/delete-test-signup.ts`** (new): a real leftover from Phase 2
testing — a plain email/password signup under the same email wanted for
the first platform admin — needed cleaning up first, properly, not just
by deleting a `users` row and leaving the firm/clients/journal entries
behind. Deletes the whole firm (`DELETE FROM firms WHERE id = ...`
cascades to `clients` and everything under them per the existing ON
DELETE CASCADE chain — see `db/schema`) plus the matching Supabase Auth
user, so the email is completely free to reuse. Two safety properties,
not afterthoughts:

- **Refuses to touch a firm with any posted/reversed journal entries** —
  the DB's own `enforce_journal_entry_immutability` trigger rejects
  deleting those outright ("Use a reversing entry instead"), and this
  script does not attempt to work around that. A failure here means real
  financial history exists under this email and needs a human decision,
  not automated cleanup.
- **Interactive confirmation by default**: prints the firm name, client
  and journal-entry counts, and — importantly — any *other* users
  belonging to the same firm (who'd be deleted too) before asking to
  proceed. `--yes` skips the prompt for non-interactive use.

Also independently checks for a Supabase Auth user with the target email
even when no `public.users` row exists, covering the documented gap in
`lib/auth/signup.ts` (a DB failure right after a successful Supabase Auth
signup leaves an orphaned auth user with no profile row).

**Verified against the local sandbox database** (wrapped in `BEGIN` /
`ROLLBACK`, nothing persisted): inserted a throwaway firm + user + client
and confirmed `DELETE FROM firms` cascades cleanly to all three. The
delete-blocking behavior for posted/reversed entries was confirmed by
reading `enforce_journal_entry_immutability` directly (a plain
`IF OLD.status IN ('posted','reversed') THEN RAISE EXCEPTION` on
`TG_OP = 'DELETE'`) rather than constructing a fully-balanced posted
entry through the separate balance-check trigger just to re-derive
something already unambiguous from source. The Supabase Admin API calls
(listing/deleting the real auth user) are unverified from this sandbox,
same limitation as every other live-auth script this phase.

## Fix: `delete-test-signup.ts` hanging silently after confirmation

Reported live: typed "y" at the confirmation prompt, pressed Enter, then
2+ minutes of total silence — no error, no further output, nothing
deleted. Two candidate causes, genuinely indistinguishable from the
outside with the script as it stood, since neither produced any output:

1. The `readline`-based `confirm()` never actually saw the keypress.
   `process.stdin` sitting paused when the script starts has been an
   observed gap in some `tsx`/`pnpm` invocation paths, and readline's own
   auto-resume-on-TTY-detection hasn't reliably covered every such case
   across Node versions.
2. The `DELETE FROM firms` itself hung — e.g. blocked on a lock held by
   some other session — and `postgres.js` had no statement timeout, so a
   genuinely stuck query would wait forever with no error.

Both fixed, since the report couldn't distinguish which one actually
happened:

- `confirm()` no longer uses `readline`. It listens on `process.stdin`
  directly and calls `.resume()` explicitly before attaching the
  listener, sidestepping readline's TTY auto-detection entirely rather
  than trying to out-guess which Node/tsx/pnpm combination triggers the
  gap.
- The `postgres.js` client now sets `connection: { statement_timeout:
  15000 }` — a stuck `DELETE` now fails loudly within 15 seconds instead
  of hanging indefinitely.
- Added `console.log("Deleting...")` / `"Checking Supabase Auth..."`
  immediately before each network/DB call that follows confirmation, so
  a future hang (if one still happens) is immediately locatable — "never
  printed 'Deleting...'" now unambiguously means the confirmation step,
  not the delete.

Unverified against the user's actual environment (this sandbox can't
reproduce their exact tsx/pnpm/terminal combination or reach their real
Supabase project) — the `statement_timeout` addition is verifiable
reasoning about `postgres.js`'s documented behavior, not a live
reproduction of the hang. If it recurs, the new log lines should make
clear which half of the fix (if either) actually addressed it.

## Fix: `create-platform-admin.ts` failing after `db:migrate` was never run

Reported live: the script created the Supabase Auth user successfully,
then failed inserting into `public.users` with `PostgresError: invalid
input value for enum user_role: "platform_admin"` — the target database
had never had `db/migrations/0005_curved_stark_industries.sql` (adds
`platform_admin` to the enum) applied. Running `pnpm create-platform-admin`
never runs migrations itself — `pnpm db:migrate` is a separate, explicit
step — and nothing in the script or the earlier usage instructions said
so, so the ordering wasn't obvious.

Two things, not one: getting this specific run unstuck, and stopping the
same failure mode from creating another orphaned auth user next time.

**This run**: the Supabase Auth user it created
(`c9b56cc6-fa90-4efd-9ec7-b7d243402f92`) has no matching `public.users`
row — the exact "orphaned auth user" case `delete-test-signup.ts` was
already built to handle (it checks for a Supabase Auth user by email
independently of whether a profile row exists). No new cleanup code
needed; re-running that script for the same email finds and removes it.

**Going forward**: `create-platform-admin.ts` now checks
`pg_enum`/`pg_type` for `platform_admin` on `user_role` *before* ever
calling `supabase.auth.admin.createUser()`, and fails fast with an
actionable message ("Run `pnpm db:migrate` against it first...") instead
of creating an auth user it can't yet finish provisioning. Turns this
specific failure mode into "nothing happened, here's why" instead of
"partially happened, here's a mess to clean up." Verified the query
itself against the local sandbox database (already migrated — confirms
the `pg_enum`/`pg_type` join correctly resolves `true`); the "not yet
migrated" branch is straightforward catalog-lookup logic, not
independently re-verified against an artificially un-migrated database.

## Fix: "Continue with Google" hangs forever when a public env var is missing

Reported live on the PR #22 preview: clicking the button got stuck on
"Redirecting to Google..." permanently, with the only signal being a
browser console error — `Uncaught (in promise) Error:
NEXT_PUBLIC_SUPABASE_URL is not set.`

**Two separate things, both real**:

1. **The env var actually is missing from that deployment.**
   `NEXT_PUBLIC_*` vars are inlined into the client bundle at *build*
   time, not read at runtime — unlike server-side code (every other auth
   flow this phase: login, signup, password reset), which reads
   `process.env` live on each request and had been working fine on this
   same preview. This is very likely a Vercel project setting: environment
   variables can be scoped per Vercel environment (Production / Preview /
   Development), and `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` need the "Preview" scope checked, not
   just "Production" — otherwise Preview builds simply don't have them,
   silently, no build error either, since Next.js doesn't require
   `NEXT_PUBLIC_*` vars to exist. This is a Vercel dashboard setting, not
   something fixable from this codebase or this sandbox (no access to the
   live Vercel project). Also worth remembering once the setting's fixed:
   editing an env var afterward doesn't retroactively fix an
   already-built deployment — it needs one more fresh build to pick it up.

2. **`GoogleSignInButton`'s error handling had a real gap**, independent
   of the above and worth fixing regardless of root cause:
   `createSupabaseBrowserClient()` can throw synchronously (a missing
   required env var is exactly one way), and that call wasn't wrapped in
   try/catch. The throw became an unhandled promise rejection —
   console-only, invisible to an actual user — and `setPending(false)`
   never ran, so the button stayed stuck on "Redirecting to Google..."
   with no visible error, forever. Now wrapped: any failure from either
   `createSupabaseBrowserClient()` or `signInWithOAuth()` itself surfaces
   as a normal on-page error message and un-sticks the button. This means
   *any* future misconfiguration of this kind fails visibly on the page
   instead of silently in the console — not just this specific one.

**Deliberately not added**: a build-time hard-fail in `next.config.ts` if
these vars are missing. Considered it, since it would catch a Vercel
scope misconfiguration like this one directly in the build log — but this
sandbox's own `NEXT_PUBLIC_SUPABASE_URL` is (and always has been, all
phases) intentionally blank locally, since there's no real Supabase
project reachable here; a hard build-time throw would break this
project's own `pnpm build` verification step, which every phase in this
project has relied on. A soft `console.warn` was considered too, but
given the actual fix here is a one-line Vercel dashboard setting rather
than a code change, it didn't seem worth the added config-file surface
for a warning easy to keep scrolling past anyway.

## Fix: `middleware.ts` gave a generic error instead of naming the missing var

Reported live, on a *manually-triggered* CLI deployment
(`npx vercel deploy`, run after confirming Preview-scoped env vars
existed via `vercel env add`): a 500 (`MIDDLEWARE_INVOCATION_FAILED`) on
every route, with the runtime log reading `Error: Your project's URL and
Key are required to create a Supabase client.` — Supabase's own generic
message, not this app's.

**Answering the direct question ("what does middleware.ts expect?")**:
the same two vars as everywhere else — `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. But `middleware.ts` read them
differently from every other Supabase client in this app:
`lib/auth/supabase-server.ts` and `lib/auth/supabase-browser.ts` both go
through a `requireEnv()` guard that throws a specific, named message
("`NEXT_PUBLIC_SUPABASE_URL` is not set.") *before* ever calling
`createServerClient()`/`createBrowserClient()`. `middleware.ts` instead
read `process.env.NEXT_PUBLIC_SUPABASE_URL!` directly with a bare
non-null assertion — no guard — so a missing/empty value there was
passed straight into `createServerClient()`, which threw its own
generic internal message instead. That mismatch in error message is
exactly why this looked like a *different* problem from the earlier
"NEXT_PUBLIC_SUPABASE_URL is not set" report, when it may well be the
same underlying cause surfacing through a different, unguarded code
path. `middleware.ts` now has its own small `requireEnv()` (not shared
with `supabase-server.ts`'s, which is gated by `"server-only"` and
assumes the Node runtime — middleware runs in a separate Edge runtime,
so this stays self-contained rather than crossing that boundary for a
two-line helper). This doesn't fix a genuinely missing/empty var — it
makes the runtime log say exactly which one it is instead of a message
that doesn't mention env vars at all.

**On the manual CLI deploy itself**: flagged by you as a possible
factor, and it's a reasonable thing to be suspicious of — `vercel
deploy` run locally is a different pipeline from the Git-integrated
build this whole project's testing has otherwise gone through (every
other live verification this phase used a PR's auto-generated preview).
Whether Vercel's CLI path resolves Preview-scoped env vars identically
for Edge Middleware specifically as the Git-integrated path does isn't
something verifiable from here — no Vercel dashboard/API/log access
exists in this sandbox. Recommended you fall back to the PR's normal
Git-integrated preview (a dashboard redeploy with the build cache off,
or a fresh push) now that the vars are confirmed to exist at the project
level, rather than continuing to debug the one-off CLI path — that's the
pipeline actually used going forward anyway (production deploys happen
via Git push to `main`, not local `vercel deploy`).

**Update**: confirmed via `vercel env ls` that the Preview-scoped vars
exist with correct values, and a manual `vercel deploy --force` (fresh
build, cache off) still showed the identical error. Rules out a stale
cache or a scoping/typo mistake as the cause on the CLI side, and
strengthens rather than weakens the suspicion above — this now looks
specific to the manual CLI deploy pipeline itself, not the env var
configuration. This commit exists to trigger a fresh Git-integrated
preview build for PR #22 as the next, cleaner data point.

## Root cause, finally: `requireEnv(name)` broke Next.js's static env inlining

The actual bug, after several rounds of ruling out Vercel configuration
(scoping, values, cache, even the CLI deploy path itself, all
conclusively cleared — see `vercel env pull` confirming the real value
reaches Vercel's own build resolution) — the code was wrong, not Vercel.

**The pattern**: `lib/auth/supabase-browser.ts` and (after an earlier
"fix" in this same file, made in direct response to a *different* report
in this same thread) `middleware.ts` both read their env vars through a
small helper:

```ts
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}
// called as requireEnv("NEXT_PUBLIC_SUPABASE_URL")
```

**Why this silently breaks**: Next.js's `NEXT_PUBLIC_*` inlining isn't a
runtime environment lookup for browser code or Edge Runtime code (Edge
Middleware included) — both run in restricted, non-Node.js execution
contexts with no real OS-level `process.env`. Next.js instead does a
*build-time static text substitution*: it scans the source for the exact
literal expression `process.env.NEXT_PUBLIC_X` (dot notation, the var
name a literal identifier right there in the code) and replaces that
specific expression with the actual value, like a macro. It cannot do
this for `process.env[name]`, because `name` is a variable — there's no
way for the bundler to know at build time what string it'll hold. The
substitution silently doesn't happen; at runtime `process.env` in these
contexts is empty/undefined, so `process.env[name]` evaluates to
`undefined` regardless of what was actually configured in Vercel.

This is why every earlier "config" symptom looked real: the value being
missing from the *shipped code* is indistinguishable from the value
being missing from *Vercel* purely by testing the app from the outside —
both produce the exact same "NEXT_PUBLIC_SUPABASE_URL is not set" error.
It took inspecting the actual compiled output to tell them apart.

**How this was actually found, not just reasoned about**: set fake
non-empty values locally, ran a real `pnpm build`, and grepped the
compiled `.next/` output for the fake string. First run (before the
fix): the fake *value* appeared nowhere in the shipped bundle, but the
literal *name* `"NEXT_PUBLIC_SUPABASE_URL"` did — as `sP("NEXT_PUBLIC_
SUPABASE_URL")`, `requireEnv()` minified, called with the var's name as
an inert string argument. That's the smoking gun: the value never made
it in, only the name did, exactly matching the "value provably exists in
Vercel, app still says it's missing" symptom. After rewriting to static
literal `process.env.NEXT_PUBLIC_X` expressions (below), the same test
showed the fake value correctly present in both `.next/static/` (the
browser bundle) and `.next/server/edge/` (the middleware bundle).

**Fix, in all three files that touch these vars**
(`lib/auth/supabase-browser.ts`, `lib/auth/supabase-server.ts`,
`middleware.ts`): removed the `requireEnv(name)` indirection entirely,
replaced with each var read as a literal `process.env.NEXT_PUBLIC_X`
expression assigned straight to a local, then checked. This is required
for `supabase-browser.ts` (browser) and `middleware.ts` (Edge Runtime).
`supabase-server.ts` runs on the Node.js runtime, where `process.env` is
a real, live, fully dynamic object at request time — its version of this
pattern was never actually broken (which is exactly why login/signup/
password-reset all worked fine throughout Phase 1/2, while only the
Google Sign-In code paths failed) — but it's fixed too, for the same
reason the helper isn't being kept around anywhere in this codebase:
it's a footgun that already caused two real bugs when the same pattern
was copied into contexts where it doesn't work, and a third copy
elsewhere in the future was a real, foreseeable risk otherwise.

**On my own earlier "fix" making this worse**: the `middleware.ts`
change made a few turns ago in this same thread — replacing a bare
`process.env.NEXT_PUBLIC_SUPABASE_URL!` with `requireEnv("NEXT_PUBLIC_
SUPABASE_URL")` specifically to produce a clearer error message —
introduced the *exact* dynamic-key bug into a file that hadn't had it
before. The original bare literal access would have worked correctly
the moment the env var was genuinely present in Vercel; my change broke
that, so every subsequent test (including the one right after
confirming the vars via `vercel env pull`) was doomed regardless of
Vercel-side correctness. Worth stating plainly rather than folding into
the rest of this note: that was a real regression I introduced while
trying to improve error messages, not an unrelated, pre-existing issue.

**Verified**: full test suite (117), `tsc --noEmit`, and two from-scratch
`pnpm build` runs — one reproducing the bug with fake values (proving
the failure), one after the fix with the same fake values (proving the
recovery), both confirmed by directly grepping compiled build output
rather than just re-reading the source and assuming. The live Vercel
deployment is still unverified from this sandbox (no egress) — next step
is a real preview build with real credentials.

## Phase 3, part 3: invite other platform admins

`/settings/platform-admins` — visible only to `platform_admin` (new
`requirePlatformAdmin()` guard, mirroring `requireFirmAdmin()`). Lists
current platform admins and lets one invite another by email + name.
This is the piece explicitly deferred out of the earlier `platform_admin`
PR, now that there's an actual first admin to use it.

**New RLS, finally added** (`db/sql/006_platform_admin_rls.sql`): two
narrow, additive policies letting an authenticated `platform_admin` see
and insert *other* `platform_admin` rows (`firm_id IS NULL` on both
sides) through the normal `withUserContext()` path — the carve-out
flagged as deferred in the previous PR's `DECISIONS.md` entry. Postgres
combines multiple permissive policies per command with OR, so these add
to the existing `users_select`/`users_insert` rather than replacing them.
**Verified live** against the local sandbox database, not just written
and trusted: seeded two platform admin rows via the schema-owning role
(mirroring how `create-platform-admin.ts` actually bootstraps), then, as
the real RLS-enforcing `keepbooks_app` role with `app.current_user_id`
set to one of them, confirmed all four properties hold — sees both
existing platform admins (not just itself), can insert a third, sees
zero firm-scoped users, and a crafted attempt to insert a `firm_admin`
row for an arbitrary firm is rejected outright by RLS.

**Why the profile-row insert goes through normal RLS but the pre-check
doesn't**: creating the new admin's `public.users` row is done by an
*already-authenticated* platform admin with a real session — unlike the
bootstrap cases `authDb` exists for (signup, first-admin creation),
there's nothing circular here, so it goes through
`withUserContext(currentAdminId, ...)` like any other authenticated
write, relying on the new policy above. But checking whether the
invited email is *already registered anywhere* is inherently
cross-tenant — no RLS-scoped session, platform admin included, can
correctly answer "does this email exist in any firm" through RLS (a
bare query would just see nothing, silently letting a collision through
to fail confusingly later at the DB's unique constraint instead). That
one check uses `authDb`, added as a fifth listed legitimate caller in
`db/authClient.ts`'s doc comment.

**`supabase.auth.admin.createUser()`, not `inviteUserByEmail()`** — a
deliberate change from what was suggested when this was first flagged
as a follow-up. `createUser()` is the exact mechanism
`scripts/create-platform-admin.ts` already uses and that's already been
verified live (the first admin account). `inviteUserByEmail()` would
introduce a new, untested code path (Supabase's invite email template,
its own `redirectTo`) for no real benefit — the invited admin is simply
told, after a successful invite, to sign in with "Continue with Google"
using that email, exactly like the first admin was onboarded. No
password is set, consistent with every platform admin so far.

**`lib/auth/supabase-admin.ts`** (new): the first time the *running app*
(not a standalone script) holds `SUPABASE_SERVICE_ROLE_KEY`. Reads its
env vars as static literal `process.env.X` expressions, not through a
`requireEnv(name)` helper — that pattern caused two real, separately-
diagnosed bugs earlier this phase (see the "Root cause, finally" entry
above) and isn't being reintroduced anywhere in this codebase again,
even in a Node-only file like this one that was never actually at risk
from it.

**Deliberately out of this page**: deactivating or removing an admin.
Only invite + list are built. Revisit when there's an actual need to
remove one rather than building it speculatively now.

**Verified**: the RLS policies (live, as above); the invite schema
(`email` + `name`) via a standalone script exercising valid/invalid
cases, same precedent as `signupSchema` (can't import
`invite-platform-admin.ts` directly outside Next.js — it's guarded by
`"server-only"`). Full test suite (117, unchanged — no new pure logic
beyond the schema, already covered above), `tsc --noEmit`, and
`pnpm build` (picked up `/settings/platform-admins`) all pass. The
actual live invite flow — a real `createUser()` call reaching Supabase,
and the invited admin actually signing in with Google afterward — is
unverified from this sandbox (no egress to a real Supabase project);
opened as a draft PR pending a live walkthrough with a second real
email address.

## Platform admin dashboard, part 1: stats + firms/bookkeepers table

Replaces `/dashboard`'s platform-admin placeholder with the real thing:
an overview stats row and a searchable firms/bookkeepers table. Split
from the rest of the originally-requested dashboard (a "recent platform
activity" feed of firm signups and admin actions) per an explicit
phasing discussion — that piece needs its own, separately-scoped RLS
decision and is deliberately not in this PR.

**One schema change**: `signup_method` (new enum, `'email' | 'google'`)
on `users`, set once at account creation by the two places that already
know which path they're on — `lib/auth/signup.ts` (`'email'`) and
`app/onboarding/firm/actions.ts` (`'google'`) — both via
`createFirmForUser()`'s now-required `signupMethod` param. Worth noting
what this closes: even the audit log didn't distinguish these before —
both paths wrote an identical `SIGNUP` action with nothing to tell them
apart, since they share the same bootstrap helper. NULL for rows that
predate this column and for anything that isn't a firm's owner (demo
seed data, platform admins, staff invited later).

**RLS: two real per-row grants, three SECURITY DEFINER aggregates —
deliberately not one broad grant.** Confirmed with the product owner
beforehand: platform admins should see firm names/owners/client counts
and audit summaries, explicitly *not* full client data or raw
before/after diffs. Two shapes came out of that:

- `firms_select_platform_admin` (broad — `app_current_role() =
  'platform_admin'`) and `users_select_platform_admin_owners` (narrow —
  same, plus `role = 'firm_admin'`): real row-level policies, because the
  dashboard genuinely needs per-row firm names and owner name/email, and
  neither is sensitive the way a client record is.
- `platform_total_active_users()`, `platform_client_counts()`, and
  `platform_firms_last_active()`: SECURITY DEFINER functions (same
  pattern this file already uses for `app_accessible_client_ids()`)
  instead of widening `clients_select` or `audit_log_select` at all.
  Considered the alternative — grant broad SELECT and trust the app's
  queries to only ask for safe columns — and rejected it: RLS filters
  rows, not columns, so a broad grant is one differently-written query
  away from exposing full client rows or raw audit diffs later. These
  functions return only the specific aggregate needed (a count, a
  timestamp) and nothing else; **no RLS policy granting platform_admin
  access to `clients` or `audit_log` exists anywhere in this schema.**
  `platform_firms_last_active()` only ever reads `action = 'LOGIN'` rows,
  which structurally never carry a before/after payload (neither
  `lib/auth/login.ts` nor `lib/auth/oauth-callback.ts` ever sets one when
  logging a LOGIN) — safe by construction, not just by convention.

**Verified live**, not just written and trusted: seeded a test platform
admin, then — as the real RLS-enforcing `keepbooks_app` role with a
session context set, against the actual local seed data (1 firm, 3
clients, 3 users) — confirmed every one of: firm visible, the one
firm_admin/owner row visible, zero bookkeeper/reviewer rows visible, a
plain `SELECT * FROM clients` returns **zero rows** even though the
functions can still compute the right count from the same table, same
for a plain `SELECT * FROM audit_log`, and all three functions return
the numerically correct values against the real seeded data.

**"Owner" for a firm with more than one `firm_admin`** (co-admins are
possible via existing in-app staff invites): defined as the
earliest-created `firm_admin` row for that firm — computed in
application code (`lib/data/platform-dashboard.ts`) after an RLS-scoped
fetch, not a SQL `DISTINCT ON`, since the current scale doesn't need it
and this keeps the query portable rather than depending on a specific
Drizzle version's support for that clause. Confirmed this definition
with the product owner before building.

**"Last active" and the aggregate functions' own reach**: like every
other `SECURITY DEFINER` function in this file
(`app_accessible_client_ids()` included), these three don't themselves
check "is the caller a platform admin" — a function's `EXECUTE`
privilege isn't restricted by role. The boundary is where it's always
been in this app: `requirePlatformAdmin()` gates the only route that
calls them. Not a new gap, the same shape as everything else here.

**Verification limits from this sandbox**: no real Supabase project
reachable here, so nothing in this PR could be exercised through an
actual authenticated browser session — the same constraint every other
auth-gated feature this phase has had. Went further than usual anyway:
stood up a temporary, unauthenticated test route calling
`getPlatformStats()`/`listFirmsForDashboard()` directly against real
local seed data, confirmed it's blocked by middleware exactly as
expected (no real `NEXT_PUBLIC_SUPABASE_URL` locally), then removed it
before committing — nothing resembling a debug/test route ships. The SQL
verification above and a standalone script checking the date-boundary
math (`startOfWeek`/`startOfMonth`) and the earliest-owner-per-firm
reduction logic are what stand in for it. `pnpm test` (117, unchanged),
`tsc --noEmit`, and `pnpm build` (picked up no new routes — this
replaces a branch inside the existing `/dashboard` page) all pass.

**Deliberately out of this PR**: the "recent platform activity" feed
(firm signups, admin actions) and any deeper per-firm activity/detail
view beyond the current row-expansion (firm ID, owner email, full
signup/last-active timestamps) — both flagged as follow-ups when this
was scoped, not overlooked.

## Dashboard health indicators + platform growth chart

Two small phases, built together per an explicit go-ahead: activity-health
badges + a growth chart on the platform admin dashboard, and a client
activity badge + a needs-attention feed on the bookkeeper dashboard. A
third piece (BIR deadlines widget) was scoped in the same conversation
but deliberately held for its own pass — real due-date domain logic,
wanted its own confirmation round before being built.

**`lib/activity-health.ts`**: one pure function
(`activityHealthFor(lastActiveAt, now)` → `active | quiet | dormant |
never`, 7/14-day thresholds) shared by both dashboards — a platform
admin's firms table feeds it each firm's last LOGIN; the bookkeeper
dashboard feeds it each client's most recent journal entry. Same
three-tier read on "how long since something happened here" in both
places, just a different timestamp. `components/activity-badge.tsx`
renders it as a small colored dot + label. Verified the day-boundary
math directly (7.0 days = active, 7.01 = quiet, 14.0 = quiet, 14.01 =
dormant, etc.) via a standalone script — boundary conditions are exactly
where this kind of thing gets built wrong.

**Growth chart — no new dependency.** Checked first: no charting library
exists anywhere in this app. Built a plain inline SVG bar chart instead
of introducing one for an 8-12-bar view — thin bars, rounded data-ends,
per-bar hover/focus tooltip (mouse and keyboard), `aria-label` per bar
standing in for a separate table view given how few data points there
are. Loaded the dataviz skill before writing it (its own trigger: "any
chart, in any output medium, including inline SVG") and used its
validated sequential-blue default (`#2a78d6`) for the single series,
re-validated with the palette script against this app's actual white
surface rather than the skill's own default surface, per the skill's own
instruction to do so. No dark mode: this app has none anywhere, so this
chart doesn't invent one either.

**Weekly bucketing had a real trap, caught before it shipped wrong**:
Postgres's `date_trunc('week', ...)` is always ISO/Monday-based. This
file already had a `startOfWeek()` helper for the "new firms this week"
stat card that rolls back to *Sunday* — fine for that label, wrong for
this chart if reused. Wrote a separate `mondayOfWeek()` specifically for
the zero-filled week-bucket list this query generates, and verified live
that it produces the identical date Postgres's own `date_trunc` does for
a real seeded firm's `created_at`, not just that the two looked
plausible in isolation.

**Client status + needs-attention feed — no new grants, mostly reused
code.** `getClientLastActivity()` (new, `lib/data/dashboard.ts`) is a
plain `GROUP BY` over `journal_entries` through the existing RLS a
bookkeeper/reviewer/firm_admin already has — no new policy needed, this
was never gated the way the platform-admin side was. The needs-attention
feed doesn't introduce a query at all: `listFirmDrafts()` already
existed (built for the `/drafts` page and the "Unposted Drafts" stat
card) and is exactly "drafts across every client, oldest first" — reused
as-is, just capped to 6 rows for the dashboard widget. Added to the
dashboard's right column for every staff role, not just `firm_admin`
(who previously had the only thing there, "Recent Activity" from the
audit log) — bookkeeper/reviewer had an empty gap in that column before
this, now filled.

**Verified**: activity-health boundaries and week-bucket alignment via
standalone scripts (both above); `getClientLastActivity()`'s grouping
verified live against real local seed data (3 clients, distinct
`journal_entries` timestamps) as the actual firm_admin session, RLS
correctly scoping to just that firm's clients. Full test suite (117,
unchanged), `tsc --noEmit`, and `pnpm build` all pass — no new routes,
everything lives inside the existing `/dashboard` page for both roles.

## Phase 3: BIR deadlines widget

`/dashboard`'s new first section for bookkeeper/firm_admin/reviewer:
every active client's current filing obligation, across every applicable
BIR form, sorted soonest-due first, with overdue/due-soon flagged
visually. The due-date rules and the "derive from client profile, not
`client_tax_types`" data-source decision were both confirmed with the
product owner in a prior planning round, before any of this was written.

**`lib/tax/bir-deadlines.ts`** — new, pure, real vitest coverage (21
tests) matching this project's existing rigor for `lib/tax/*.ts` (this
is compliance-relevant date math, not cosmetic UI logic, so it gets the
same treatment as the VAT/withholding/income-tax modules already tested
this way — not a lighter-touch standalone script). Two pieces:

- `applicableForms(client)`: which of the 7 confirmed forms a client
  files, derived from `vatStatus`/`taxpayerType`/`withholdingAgent` —
  fields captured for every real client at onboarding, unlike
  `client_tax_types` (see the earlier "does the data model support this"
  research: that table's own schema comment says it "drives the
  compliance calendar," but nothing in this app has ever read or written
  it for a real client, only demo seed data).
- `currentDeadlineFor(formCode, today, fiscalYearEndMonth)`: the
  current/nearest obligation for one form. 2550Q/2551Q/1601-EQ are
  always calendar-quarter based (VAT/percentage/withholding periods
  don't follow a fiscal year even for a fiscal-year corporation);
  1701Q/1701A are fixed calendar dates (individuals can't elect a fiscal
  year under Philippine tax law); 1702Q/1702-RT are fiscal-year-aware,
  tested against both a calendar (Dec) and a non-calendar (June 30)
  fiscal year end, including the transition right after each one's own
  annual close.

**A real, disclosed simplification**: `taxpayerType: "partnership"` is
treated as filing corporate-type forms (1702Q/1702-RT) — correct for an
ordinary business partnership, wrong for a General Professional
Partnership (GPP), which isn't taxed at the entity level at all. This
app has no field distinguishing the two. Documented in the module's own
doc comment, not silently assumed away — a GPP is a real but
comparatively rare case among typical bookkeeping-firm clients.

**What this widget is not**: a record of what's actually been filed.
This app has no filing-status tracking anywhere on any client — so
"overdue" here means "the calendar due date has passed," not "confirmed
not filed." Stated plainly in the widget component's own doc comment.
Only `status = 'active'` clients are included — onboarding clients may
not have a finalized tax profile yet, inactive ones are no longer being
serviced.

**`lib/data/deadlines.ts`**: assembles the flat, sorted list — active
clients through existing RLS (no new grant; a bookkeeper/reviewer/
firm_admin already sees exactly the clients they should), each run
through `applicableForms()` + `currentDeadlineFor()`, sorted by due date.

**Verified end-to-end against real local seed data**, not just unit
tests in isolation: pulled the 3 seeded clients' actual tax-profile
columns via `psql`, fed them through the real `applicableForms()`/
`currentDeadlineFor()` functions in a standalone script, and confirmed
all 7 expected forms appeared, correctly attributed to the right
clients, correctly sorted, with the onboarding-status client correctly
excluded — including a real, naturally-occurring overdue case (a
corporation's 1702-RT, due back in April, correctly sorting to the top
as the most overdue item relative to today).

**Verified**: 21 new tests (138 total, up from 117), `tsc --noEmit`,
`pnpm build` all pass — no new routes, lives inside the existing
`/dashboard` page.

## Platform admin dashboard restyle: stat tiles, sidebar shell, Overview trends

Purely a visual pass over `/dashboard` for `platform_admin` — no new
routes, no change to what data a platform admin can see (same RLS
grants from 007, plus one small precedented extension below), no change
to the Firms & Bookkeepers table's behavior.

**Sidebar + topbar shell, scoped to `platform_admin` only.** `app/(app)/
layout.tsx` now branches on `user.role === "platform_admin"` before
rendering: platform admins get a dedicated left-sidebar (logo, Dashboard
/ Platform Admins nav) + topbar ("Welcome, {name} · {role}", sign out)
shell; every other role keeps the original single top-nav bar
unchanged. Deliberately kept as a branch inside the existing shared
layout rather than a new route group — the two platform_admin routes
already live under `(app)`, and splitting them into their own group
would touch routing/redirects for a task that's visual only.

**Stat cards** (`stat-card.tsx`): colored circular icon badge, hero
number (`Intl.NumberFormat` compact — `1,284` stays as-is, `12.9K` past
four digits), and a real vs-previous-period delta — not a decorative
placeholder. Icon accent colors are the dataviz skill's categorical
palette (`references/palette.md`), fixed slots 1–4 (blue/orange/aqua/
yellow) — one identity color per card, not a magnitude ramp.

**Every delta is a real computed comparison, not a fabricated number**:
- Total Firms: current vs. count as of 7 days ago.
- New Firms This Week / This Month: current period vs. the immediately
  preceding one (same week-start convention `startOfWeek()` already
  used elsewhere in this file, not the Monday/ISO convention
  `getFirmSignupsByWeek` uses for its chart buckets — those two
  conventions already coexist deliberately per that function's own
  comment).
- Active Users (All Firms): this one has no exact answer — the app
  keeps no historical snapshot of account status. `previous` is
  "currently-active users that already existed 7 days ago"
  (`platform_active_users_before(cutoff)`, new SECURITY DEFINER SQL
  function in `008_platform_dashboard_deltas.sql`, same shape as
  007's `platform_total_active_users()` and needed for the same reason:
  platform_admin has no row-level SELECT on firm-scoped `users` rows,
  only the two aggregate functions). This is a disclosed approximation
  (active rarely flips), not an exact "active users as of that date"
  figure — said so in both the SQL file's comment and
  `getPlatformStats`'s.
- `previous === 0` is handled explicitly (shows "New" instead of a
  division-by-zero/Infinity percentage).

**Overview section**: two cards, per spec ("2-3 smaller cards... reuse
the existing weekly growth chart for one of these"). First is the
existing `PlatformGrowthChart` — its drawing logic is untouched, only
its container's heading style was adjusted to match the new card
language (`text-xs uppercase` label instead of `text-sm font-semibold`)
so it reads as one of the row rather than a mismatched leftover.
Second is new: `overview-sparkline-card.tsx`, a cumulative-firms trend
(`getCumulativeFirmsByWeek` — one `COUNT WHERE created_at < cutoff` per
week, same "simple sequential queries over a small fixed range" pattern
`listFirmsForDashboard`'s owner-per-firm lookup already uses, for the
same reason: obviously correct over premature-clever). Sparkline follows
the dataviz skill's stat-tile trend contract literally: muted-hue line,
current-period point picked out in the card's own accent, light area
wash under the line.

**Scope decision, made deliberately**: did not add a third Overview
card or a weekly "active users" trend. Both would need a new
table-returning SECURITY DEFINER function (RLS blocks a plain SELECT
across firm-scoped `users` rows for platform_admin — see 007's own doc
comment on why that's a deliberate summary-only boundary, not an
oversight to route around). Extending the same pattern once (the
Active Users delta) is proportionate for a "restyle" task; doing it
twice more to manufacture a third card nobody asked for is scope creep
past what a visual pass should touch.

**Verified**: `tsc --noEmit`, `pnpm test` (138 tests, all passing
against the real local Postgres, no changes needed), `pnpm build` all
clean. Visual check: real login wasn't reachable in this sandbox
(`.env.local`'s Supabase vars are unset here — platform-admin sign-in
is Google-OAuth-only, per `create-platform-admin.ts`'s own doc comment,
so there's no password-based path in either case), so the actual
`StatCard`/`OverviewSparklineCard`/`PlatformGrowthChart`/layout
components were rendered standalone with `react-dom/server` against
representative data and the project's own compiled Tailwind output,
then screenshotted — confirmed sidebar/topbar, all four stat cards
(including the `previous === 0` → "New" case), and both Overview cards
render as intended. Scratch render/screenshot scripts were deleted
afterward, not committed.

## Firm/bookkeeper dashboard restyle: same shared pieces as the platform admin one

Extends the previous restyle (PR #26) to `/dashboard` for `firm_admin`/
`bookkeeper`/`reviewer` — reusing the same components rather than
building parallel ones, per explicit instruction. `platform_admin` is
untouched; `client_user` (never had sidebar-worthy nav — its one real
page is reached by an immediate redirect, not by using this nav) keeps
the original top-nav shell.

**Confirmed before building, per the two explicit questions:**
1. BIR due-date math already matches the agreed table exactly —
   2550Q/2551Q at quarter-end+25 days, 1601-EQ at the last day of the
   following month, 1701Q fixed at May 15/Aug 15/Nov 15, 1701A at April
   15 — all in `lib/tax/bir-deadlines.ts` from PR #25, covered by its
   existing 21 tests. Nothing changed here.
2. **No new migration.** Every new stat derives from `clients` and
   `journal_entries`, both already fully RLS-granted to a firm's own
   staff for their own firm — no schema or RLS change, just two new
   lightweight query functions in `lib/data/dashboard.ts` (same "no
   migration needed, just a new query" latitude PR #26 established).

**Shared, not duplicated**: `SidebarShell` (`app/(app)/layout.tsx`) is
now one component instantiated for both `platform_admin` and every
staff role, with only the nav item list swapped (`PLATFORM_ADMIN_NAV` vs.
`staffNav(role)` — Tax Rules/Audit Log stay `firm_admin`-only, same as
the pre-restyle top-nav). `StatCard` (`app/(app)/dashboard/stat-card.tsx`)
gained three additive, backward-compatible capabilities instead of a
second component: `stat` now accepts a plain `number` (no delta) as well
as a `PeriodStat`; an optional `caption` for a static line in place of a
delta ("Next 30 days"); an optional `href` that wraps the card in a
`Link`, restoring the pre-restyle firm dashboard's clickable-card
affordance for Total Clients / Unposted Drafts. Every existing
`platform_admin` call site is unaffected (still passes a `PeriodStat` +
`deltaCaption`, same as before).

**The 4 stat cards, and why each delta is/isn't there:**
- **Total Clients** — real delta vs. 7 days ago, computed in JS from
  `clients.createdAt` (already fetched by `getFirmDashboardStats`, no
  new query).
- **Clients Needing Attention** — currently-active clients not in
  "active" activity health (same Active/Quiet/Dormant threshold as each
  client's own badge). New `getClientAttentionStat()`: the `previous`
  side evaluates the *same* set of today's active clients against their
  activity health 7 days ago, via `getClientLastActivity(userId, asOf)`
  — `getClientLastActivity` gained an optional `asOf` param (`WHERE
  created_at <= asOf`, additive, existing call sites unaffected) rather
  than a new function. Verified live against the real seeded DB that
  `.where(asOf ? lte(...) : undefined)` correctly omits the clause when
  `asOf` is absent (drizzle-orm supports this directly).
- **Unposted Drafts** — no delta. A draft that got posted since is
  invisible to a `status = 'draft'` query regardless of any date filter,
  so "drafts 7 days ago" isn't reconstructable from current data, only
  approximable in a way that could read as confidently wrong rather than
  approximate. Card just shows the number, clickable through to
  `/drafts` (restoring the old card's link).
- **Upcoming Deadlines** — no delta either; it's a forward-looking
  calendar count derived fresh from today's date and the current active
  client roster, not an event count, so "vs last period" has no natural
  meaning. Shows "Next 30 days" as a static caption instead. Count =
  `listUpcomingDeadlines()` results with `dueDateIso <= today+30`
  (deliberately includes already-overdue items too — an overdue due
  date is trivially within that window, and the card's job is to flag
  what needs action soon, overdue included).

**Below the stat row**: reordered to stats → deadlines → the two-column
client-list/needs-attention layout (previously deadlines sat above the
stats). The three widgets there — `DeadlinesWidget`, the Recent Clients
table, the Needs Attention list (and firm_admin's Recent Activity feed)
— needed no visual changes at all: they already used the same
`rounded-lg border border-slate-200 bg-white` card language and
`text-sm font-semibold text-slate-900` section-header convention PR #26
established for "Firms & Bookkeepers" — just repositioned, functionally
untouched.

**Verified**: `tsc --noEmit`, `pnpm test` (138 tests, all passing
against the real local Postgres, no test changes needed), `pnpm build`
all clean. Same visual-verification approach as PR #26 (no live
Supabase in this sandbox): rendered the real `StatCard`/`DeadlinesWidget`/
`ActivityBadge` components standalone via `react-dom/server` against
representative data and the project's own compiled CSS, screenshotted
both a `firm_admin` view (full nav, +Add Client button, all 4 stat
cards, Recent Activity section) and a `bookkeeper` view (trimmed nav,
no +Add Client, no Recent Activity) — confirmed both render correctly
and the role-based nav/section filtering works as intended. Scratch
render/screenshot scripts were not committed.

**Self-review pass caught and fixed three real bugs before this PR went
up for review** (ran `/code-review` against the diff after opening it):

1. **Delta color was inverted for "Clients Needing Attention."**
   `formatDelta()` always colored an increase green — correct for
   Total Firms/Total Clients (more is good) but backwards for this
   metric, where more clients needing attention is bad news. A firm
   going from 2 to 6 attention-needing clients would have shown "▲
   +200%" in the same green used for genuinely good growth. Fixed by
   adding a `goodDirection?: "up" | "down"` prop to `StatCard`
   (default `"up"`, so every existing platform-admin call site is
   unaffected) — the ▲/▼ symbol still reflects the actual direction of
   change, only the color now reflects whether that direction is good
   for this specific metric. Verified with a rendered before/after
   check: 2→6 now shows red, 6→2 shows green, and the 0→3 "New" case
   (no prior-week baseline) correctly shows red rather than the
   default green a bare "New" badge would imply.
2. **Dropped the Unposted Drafts card's amber warning state.** The
   pre-restyle card turned amber (border/background/text) the moment
   `draftCount > 0` — a real at-a-glance urgency cue lost when it
   became a plain `StatCard` with a fixed teal icon badge and no
   conditional styling. Restored via a `warnWhenPositive?: boolean`
   prop: when true and the current value is > 0, the whole card
   switches to the amber treatment (same colors as before), otherwise
   unaffected. Every other `StatCard` usage passes neither prop and is
   unchanged.
3. **`getClientAttentionStat` was silently doubling a query the page
   already ran.** It called `getClientLastActivity(userId)` (no
   `asOf`) for its "current" side — the exact same call
   `app/(app)/dashboard/page.tsx` already makes directly for the
   client table's activity badges. Every dashboard load was issuing
   two identical `MAX(created_at) GROUP BY client_id` queries in
   separate transactions instead of one. Fixed by having the function
   take `activeClientIds` and `lastActivityNow` as params (both
   already available at the call site — the former derivable from
   `getFirmDashboardStats`'s client rows, the latter the page's
   existing `getClientLastActivity(user.id)` call) instead of
   re-fetching them; it now only issues the one genuinely new query
   (last activity as of 7 days ago). This moves it out of the initial
   `Promise.all` (it now depends on that batch's results) but nets out
   ahead: one added sequential step in exchange for removing two fully
   redundant round trips.

Re-verified after the fixes: `tsc --noEmit`, `pnpm test` (138 tests),
`pnpm build` all clean.

## Team & Roles, PR A: role model + RLS rewrite

First of a 4-PR split (A: roles + RLS — this PR; B: invites + team page;
C: per-client assignment UI; D folded into B unless it turns out not to
fit). Confirmed with you before writing any code: the role mapping and
its two reconciliation points, what per-client access already existed,
that a migration was needed, and the PR split itself.

### Role mapping and the two reconciliations

`firm_admin` → Owner and `client_user` map with no behavior change.
Two roles genuinely differed from the new spec and were tightened, both
approved beforehand:

- **Bookkeeper could not create clients.** `clients_insert` was
  `firm_admin`-only. Now `firm_admin` or `bookkeeper`
  (`app_can_manage_structure()`).
- **Reviewer was identical to Bookkeeper** — full write access via the
  old blanket `app_is_staff()`-gated policies, with no "post/approve
  only" distinction anywhere. Tightened via a genuine RLS split
  (separate INSERT/UPDATE/DELETE policies replacing the old single
  `FOR ALL` ones) plus a new trigger, `enforce_reviewer_status_only_update()`
  (mirrors `enforce_journal_entry_immutability()`'s own OLD-vs-NEW
  column-diffing pattern from 001) — a reviewer's UPDATE on
  `journal_entries` may only change `status`/`posted_by`/`posted_at`,
  nothing else, even when bundled into the same UPDATE as a legitimate
  status change.

**One judgment call flagged, not pre-cleared**: the spec's Bookkeeper
bullet is "add/edit entries, post, view reports, export, add clients" —
grammatically "add/edit" modifies *entries*, and "add clients" has no
matching "edit clients." I extended `clients_update` to Bookkeeper too
(not just `clients_insert`), since a create-only/permanently-uneditable
client record seemed like an impractical, likely-unintended reading —
but this one wasn't explicitly asked for, unlike the other two. Easy to
narrow back to `firm_admin`-only if that reading's wrong.

**Follow-up, confirmed after review**: keep Bookkeeper edit access, but
verify two things and add tests. Checked both against the actual SQL
rather than assuming:

1. **Bookkeeper edit is already scoped by `access_scope`, not "every
   client in the firm."** `clients_update`'s `USING` clause was already
   `id IN (SELECT app_accessible_client_ids())` — the same
   scope-respecting function every read already goes through, not a
   broader `firm_id = app_current_firm_id()` check. An `'assigned'`-scope
   Bookkeeper genuinely can only edit clients they're assigned to; an
   `'all'`-scope one edits whatever they can already see. This was
   already correct by construction (write scope was always meant to
   mirror read scope), just not yet asserted by a test — added three:
   assigned-scope edit succeeds on the assigned client, fails on an
   unassigned one, and an all-scope Bookkeeper can edit anything in the
   firm.
2. **Delete was NOT actually Owner-only — it was no-one-only.** No
   `clients_delete` policy existed anywhere (001 never added one, and
   009 didn't either). Postgres RLS denies a command outright when no
   policy grants it, for every role including Owner — so "delete stays
   Owner-only" wasn't yet true; nobody could delete a client via the app
   role at all. Added `clients_delete` (firm_admin-only, same
   `app_accessible_client_ids()` scoping as everything else) — this is
   purely defensive: no UI, API route, or data-layer function anywhere
   in the app currently calls a client delete, so this changes no live
   behavior today, it just makes the intended rule actually enforceable
   the moment such a feature exists. Two tests added: Bookkeeper's
   DELETE silently matches zero rows (RLS, not an app-level check);
   Owner's DELETE succeeds against a client fixture built specifically
   dependent-free for the test (`journal_entries.client_id` is `ON
   DELETE RESTRICT`, so the suite's normal fixture clients — which carry
   accounts/contacts/entries from other tests — could never actually be
   deleted regardless of RLS).

Encoder and Viewer are new roles, built fresh — no reconciliation needed.

### Per-client access: `access_scope`, not an inferred default

`app_accessible_client_ids()` and `user_client_assignments` already
existed exactly as described — every table's RLS already joins through
it. But the existing behavior was "bookkeeper/reviewer with zero
assignments see zero clients" (assignment mandatory, no toggle), the
opposite of what's needed here. Per your explicit correction: added a
real column, `users.access_scope` (`'all' | 'assigned'`), rather than
inferring the mode from "has any assignment rows" — inferring it would
have silently widened access the moment someone's last assignment was
removed, or the day a plan downgrade took away the Owner's ability to
manage assignments.

- `firm_admin` ignores this column entirely — Owner always sees every
  client in the firm, full stop.
- `bookkeeper`/`reviewer`/`encoder`/`viewer`: `'all'` (the column's
  default for new rows) sees every firm client; `'assigned'` sees only
  what's explicitly granted, even if that's currently zero.
- RLS enforces whichever value is on the row **regardless of plan** —
  `getPlanLimits(firm).perClientAssignmentAllowed` (this PR: always
  `true`, trial values only — 5 users, 10 clients) will, in PR C, gate
  only whether an *Owner can change* the setting in the UI. A downgrade
  freezing that UI can never by itself widen anyone's actual access.
- **Migration safety**: every pre-existing `bookkeeper`/`reviewer` row
  is explicitly backfilled to `'assigned'` (`UPDATE users SET
  access_scope = 'assigned' WHERE role IN (...)`) — the column's own
  `DEFAULT 'all'` would otherwise silently widen every existing firm's
  access the moment this migration ran. Verified live: a fresh
  zero-assignment `'assigned'` user sees zero clients; an `'all'` user
  sees every firm client; Owner sees everything regardless.

### The RLS rewrite itself (`db/sql/009_team_roles_rls.sql`)

Replaces every blanket `app_is_staff()`-gated write policy (one
`FOR ALL` per table, shared by firm_admin/bookkeeper/reviewer alike)
with per-role, per-action policies. New helper functions:
`app_can_manage_structure()` (firm_admin/bookkeeper — clients, accounts,
contacts, client_tax_types) and `app_can_encode()`. `client_counters`
and `tax_rules` are untouched (still `app_is_staff()`/firm_admin-only
respectively — nothing in the new spec asks to change either).

`journal_entries`/`journal_lines` carry the real complexity: Encoder's
INSERT requires `status = 'draft' AND created_by = self`; UPDATE/DELETE
require `created_by = self AND status = 'draft'` (immutability trigger
already blocks posted/reversed deletes for everyone); SELECT filters to
`created_by = self` for Encoder specifically — the RLS-level answer to
"cannot see other people's entries," not an app-layer filter. The four
specialized document tables (sales_invoices, purchases, cash_receipts/
disbursements + their _lines) got the identical pattern, joining through
to their linked `journal_entries` row via `journal_entry_id` (none of
them have their own `created_by` column) — their own `status` columns
are collection/business status, unrelated to draft/posted.

**A real Postgres gotcha rediscovered, not introduced**: `INSERT ...
RETURNING` re-checks the SELECT policy against a snapshot that doesn't
yet include the statement's own uncommitted row — `app_accessible_
client_ids()` (and by extension any INSERT into `clients` with
`.returning()`) hits this for every role, including firm_admin.
`lib/data/clients.ts`'s `createClient()` already documented and worked
around this before this PR touched anything; `db/__tests__/team-roles-
rls.test.ts` hit the identical false-positive independently while being
written and uses the same workaround (generate the id client-side, skip
`.returning()`, confirm with a follow-up SELECT).

**Rollback**: `db/rollback/009_team_roles_rls.sql` restores every
policy/function/trigger to its exact pre-009 body. Deliberately lives
outside `db/sql/` — `db:migrate` auto-applies anything in `db/sql/`
ending in `.sql`, sorted by filename, and a same-named rollback file
placed there would have sorted *before* `009_team_roles_rls.sql` itself
and run against a database that hadn't been migrated yet (caught this
before ever running it, by reasoning through the sort order — no bad
migration was ever applied).

### A capability that didn't exist yet: standalone drafts

Discovered while wiring Encoder's "add entry" flow: every existing
`post*()` function (`postGeneralJournal`, `postSalesInvoice`, ...)
inserts a draft row **only as an internal step**, immediately flipping
it to posted within the same call — there was no code path anywhere
that left a journal entry as a genuinely persisted, unposted draft.
"Unposted Drafts" (the `/drafts` page, the dashboard card) has always
had real read-side support and a real RLS/DB model (`entryStatusEnum`
includes `'draft'`, the balance-on-post trigger only fires `IF v_status
IN ('posted', 'reversed')`) but no write path had ever used it — Encoder
is the first role that actually needs one. Added `createDraftGeneralJournal()`
(`lib/data/post-transaction.ts`) and `POST /api/clients/[id]/transactions/
draft-journal`, reusing `buildGeneralJournalLines()`'s existing
balance-check. Deliberately general-journal only for now — the four
specialized document forms still always post immediately; their RLS
already supports an encoder-authored draft (same as journal_entries),
but wiring their own forms to a draft-saving path is a UI follow-up, not
part of this PR's *minimal* encoder flow.

### Encoder's minimal home page

`/dashboard`'s new `encoder` branch (before the firm-facing branch, so
it never even calls the aggregate queries that branch fetches): their
own drafts (`listFirmDrafts(user.id)` — needs no `created_by` filter in
the query itself, RLS's `journal_entries_select` already scopes it to
"my entries" for this role) plus a client picker that jumps straight to
the draft-entry form, bypassing the client's full transaction ledger
entirely. **Editing/deleting an existing draft has full RLS support**
(covered by the test suite) but no UI built yet — "an add-entry button"
was the spec's own bar for *this* minimal page; the gap is a contained
UI follow-up, not an enforcement gap.

### UI-guard audit — what's covered, what leans on RLS alone

"Match the database — hide nav links and buttons a role cannot use,"
enforced server-side, not just by hiding UI:

- `SidebarShell`'s nav is role-specific (Encoder: Dashboard only, no
  Clients link; everyone else unchanged plus Owner-only Tax
  Rules/Audit Log).
- New `requireReportAccess()` guard (`lib/auth/current-user.ts`) — built
  on `requireCurrentUser()`, not `requireStaffUser()`, deliberately:
  client reports and the general ledger book are also how `client_user`
  views their own client's numbers, so this only excludes Encoder, not
  every non-staff role. Applied to the reports page and the books page.
- `/clients/[id]/transactions/new/[type]`: reviewer/viewer redirected
  outright (neither may add anything); Encoder redirected to
  `general_journal` specifically if it tries another type.
- `/clients/[id]/layout.tsx`'s tab bar is skipped entirely for Encoder
  (Accounts/Contacts/Employees/Payroll/Books/Reports are all things this
  role has no reason to browse).
- `/clients/new` and `POST /api/clients`: `firm_admin`/`bookkeeper` only
  now (was `firm_admin`-only) — the create-client reconciliation, made
  to actually work end-to-end, not just at the RLS layer.
- **Not yet given an explicit page-level Encoder redirect**: the
  Accounts/Contacts/Employees/Payroll CRUD pages themselves. RLS is the
  real backstop everywhere regardless (verified: Encoder cannot write to
  any of these; reads return only what `app_accessible_client_ids()`
  already allows), so nothing is actually exposed — this is a UI-polish
  gap, not a security one, and the highest-value surfaces (reports,
  books, transaction creation, the dashboard itself) are covered.

### Demo accounts + tests

Seeded `encoder@keepbooks.demo` / `viewer@keepbooks.demo` into the demo
firm (`db/seed.ts`, same pattern as the existing three, `access_scope:
'all'` set explicitly), added to `scripts/migrate-demo-users-to-
supabase-auth.ts`'s `DEMO_USERS` so they become real, loggable-into
Supabase Auth identities the same way. **All five demo accounts
(including these two) must be deleted before launch** — flagged here,
in `db/seed.ts`'s own completion log, and in README.md.

`db/__tests__/team-roles-rls.test.ts` — 32 tests against the real
`keepbooks_app` RLS-enforcing role (same pattern as `acceptance.test.ts`):
`access_scope` visibility (all/assigned/zero-assignment/Owner-always-
sees-everything), the Bookkeeper client-creation fix, Encoder's full
add/edit/delete-own + can't-see-others'/can't-post matrix, Reviewer's
post-only + can't-sneak-a-field-change-in-alongside-a-status-change,
Viewer's read-only, Bookkeeper's unchanged full access, and
`sales_invoices` as a representative sample of the four document tables
(same policy pattern, not independently retested four times). Also
covers the client edit/delete follow-up below: `'assigned'`-scope
Bookkeeper can edit an assigned client but not one outside their
assignment, `'all'`-scope Bookkeeper can edit any firm client, and
Bookkeeper cannot delete a client (Owner can). Writing
these tests caught a real, unrelated test-isolation bug: adding new
`firm_admin`-role fixture rows exposed that `db/__tests__/payroll.test.ts`'s
own admin lookup (`WHERE role = 'firm_admin' LIMIT 1`, no firm filter,
no `ORDER BY`) could non-deterministically pick up a *different* firm's
firm_admin the moment more than one existed in the dev database — fixed
to scope by the same firm that owns its `TEST_CLIENT_ID` fixture,
matching the pattern `acceptance.test.ts` already used correctly.

Deliberately **not** covered here (PR B's territory — invites and the
team page don't exist yet at the time this paragraph was written; see
the follow-up below for the narrow slice that now does): the
last-Owner rule, invite expiry/revocation, Google-invite email
matching. PR B gets its own test file for those.

**Verified**: `tsc --noEmit`, `pnpm test` (170 tests — 138 pre-existing
+ 32 new, all passing against the real local Postgres), `pnpm build`
all clean.

### Follow-up: a minimal "add team member" flow, pulled forward from PR B

While testing PR A on the real Supabase project, the next thing needed
was a way to actually create the Encoder demo-equivalent account
*through the app* (logged in as Bookkeeper) rather than via `pnpm seed`
— which surfaced that **no one could add a team member from the app at
all yet**: PR A only built the role model + RLS, and PR B (invites +
team page) hadn't started. Rather than block on the full PR B scope,
this adds just enough to unblock that test, with three explicit rules:

1. **Bookkeeper can only create Encoder accounts** — enforced by
   `db/sql/010_bookkeeper_add_encoder_rls.sql`'s rewritten
   `users_insert` policy (`WITH CHECK`s the new row's `role` when the
   inserting session is a bookkeeper), not just by the form only
   offering "Encoder" when the current user isn't an Owner. Owner keeps
   the original unrestricted insert.
2. **Bookkeeper can only assign that Encoder to clients the Bookkeeper
   is assigned to** — the rewritten `uca_write` policy on
   `user_client_assignments` requires, for a bookkeeper-authored row,
   both `client_id IN (SELECT app_accessible_client_ids())` (the same
   function edit/create already use for scope-respecting access) and
   that the target user is an Encoder in the bookkeeper's own firm (so
   this can't be repurposed to touch some other staff member's
   assignments). A bookkeeper-created Encoder is always `access_scope
   = 'assigned'` with at least one client required — defaulting it to
   `'all'` would hand the new Encoder broader access than the
   Bookkeeper who created it has any business granting, even for an
   `'all'`-scope Bookkeeper.
3. **Owner can still add any role** — both policies stay unconditional
   for `firm_admin`, unchanged from before.

`lib/auth/create-team-member.ts` mirrors `invite-platform-admin.ts`'s
already-proven shape: `supabase.auth.admin.inviteUserByEmail()` sends
Supabase's own invite email, landing at the existing
`app/auth/confirm/route.ts` (already generic over OTP `type`, no
change needed) and on to `/reset-password` to set a password — the
exact same landing path the password-reset flow already uses and has
been verified live, rather than a new untested email flow. New page:
`/settings/team` (`requireTeamManageAccess()`: Owner or Bookkeeper),
with a nav link shown only to those two roles.

Not built (deliberately out of scope for this slice, still PR B's
job): editing/deactivating an existing member, removing a client
assignment after the fact, invite expiry/revocation, the last-Owner
rule, a firm's seat/plan limit on how many members can be added.

Also seeded the one demo row this surfaced was missing:
`viewer@keepbooks.demo` never got backfilled into an already-seeded
project the way `encoder@keepbooks.demo` didn't either — but the user
wants to create their own Encoder through the new team page above to
test it end-to-end, not have the seed script mint a second one.
`db/seed.ts` itself can't be re-run for this, since its `main()`
short-circuits entirely once "Keep.Books Demo Firm" already exists.

**Verified**: `tsc --noEmit`, `pnpm test` (176 tests — 170 above + 6
new RLS tests for `users_insert`/`uca_write`), `pnpm build` all clean.
Not verified live against Supabase (no real inbox to receive the
invite email in this environment) — the invite call itself reuses
`inviteUserByEmail()`/`app/auth/confirm/route.ts` exactly as already
proven by `invite-platform-admin.ts` and the password-reset flow, so
the only genuinely new surface is the RLS policies above, which are
covered by real DB-level tests.

**Bug found live, fixed same day**: the first version of
`scripts/seed-viewer-demo-user.ts` inserted the new row with
`id = gen_random_uuid()` — mirroring `db/seed.ts`'s own "throwaway
local id, re-key later via `migrate-demo-users-to-supabase-auth.ts`"
pattern. That pattern only works where
`db/sql/004_supabase_auth.sql`'s FK from `public.users.id` to
`auth.users.id` doesn't exist — local Postgres, which has no `auth`
schema at all (see that file's own comment). On the user's real
Supabase project the FK IS present (added `NOT VALID`, but enforced
for every new insert from the moment it's added), so the random id
was rejected immediately with a foreign key violation — this local
sandbox's Postgres has no `auth` schema either, so the bug wasn't
caught by `tsc`/tests/build, only by running it against real data.
Fixed by creating the Supabase Auth user FIRST
(`supabase.auth.admin.createUser()`, same call
`migrate-demo-users-to-supabase-auth.ts` uses) and inserting
`public.users` with that real id directly — the row is never in an
FK-violating state, so there's no separate re-keying step needed
afterward; running `pnpm migrate-demo-users` after this script is now
a harmless no-op for `viewer@keepbooks.demo`, not a required step.

### Follow-up: Viewer's demo/default access_scope was 'all' — not intentional

Asked directly: no, this wasn't a deliberate security decision. The
demo seed's `accessScope: "all"` for both Encoder and Viewer was
purely a demo-data convenience — "makes clear these two see every demo
client without needing per-client assignment set up separately" (the
seed script's own comment) — not a considered default for the Viewer
*role*. On reflection it's the wrong default for a read-only role
specifically: Viewer can't write anything, so there's no
least-privilege reason for it to default to seeing every client in
the firm the moment someone's added. (Encoder is left as `"all"` here
— not asked about, and Encoder's own write scope is a separate
question the user hasn't raised.)

Changed:
- `lib/auth/create-team-member.ts`: a new Viewer's `access_scope` is
  now always `'assigned'`, even with zero clients picked (sees nothing
  until an Owner assigns some) — previously it followed the same
  "assigned if clients picked, else all" rule as every other role.
  Every other role's default is unchanged.
- `db/schema/enums.ts`'s `accessScopeEnum` comment updated to note the
  Viewer exception to the general "new members default to 'all'" rule.
- `db/seed.ts`: `viewer@keepbooks.demo` now seeded `accessScope:
  "assigned"` with explicit `user_client_assignments` rows for both
  demo clients (so the demo account still has something to view,
  rather than being seeded into a state where it sees nothing and
  looks broken).
- `scripts/seed-viewer-demo-user.ts`: rewritten from a one-shot
  insert-if-missing script into an idempotent convergence script — it
  now also corrects an already-existing row's `access_scope` to
  `'assigned'` and backfills the missing client assignments, since the
  user's real Supabase project already has this row seeded with the
  old `"all"` default from before this change. **Re-run
  `pnpm seed-viewer-demo-user`** to apply the fix there; no other step
  needed.

Not changed: an Owner creating a Viewer can still effectively grant
firm-wide visibility by checking every client in the picker — the
difference is that ends up as `'assigned'` with every client listed
explicitly, not the `'all'` flag, which is arguably more audit-friendly
anyway (every grant is an explicit row, not an implicit flag).

**Verified**: `tsc --noEmit` clean, `pnpm test` still 176/176 (this
change doesn't touch RLS, only application-layer defaults and seed
data, so no new RLS test was needed), `pnpm build` clean. Did not run
`db/seed.ts` end-to-end against a fresh firm in this environment (the
local sandbox already has a seeded demo firm, and renaming it to force
a fresh run was blocked as a shared-resource mutation) — reviewed the
diff by hand instead: the new insert follows the exact same
`.returning()`-then-reference pattern already used for every other
seed insert in this file, ordered after both demo clients exist.

- Next.js 16 deprecates `middleware.ts` in favor of `proxy.ts`; the build
  logs a deprecation warning. Not yet migrated — functionally identical for
  now, tracked as a cheap follow-up.
- Local Postgres accumulates some harmless test-residue clients from ad hoc
  manual QA during development ("Smoke Test Co." and similar) — cosmetic
  clutter in `/clients`, doesn't affect the two demo clients' data or any
  acceptance test. A fresh `db:migrate` + `seed` against a clean database
  clears it.

## Investigated: platform_admin rows and all-clients visible on /settings/team

Reported live on the user's real Supabase project: logged in as
`bookkeeper@keepbooks.demo`, `/settings/team`'s roster listed the two
`platform_admin` accounts, and its "assign to clients" picker showed
all 5 of the firm's clients despite the same roster showing Bea's own
access as "Assigned clients only."

**Investigation**: added 5 new tests to `db/__tests__/team-roles-rls.test.ts`
that insert a `platform_admin` row (`firm_id NULL`) and a second,
independent firm + user, then query — through the real RLS-enforcing
`keepbooks_app` role, exactly like a request would — as a firm
Bookkeeper/Owner/Reviewer/Encoder/Viewer. All 5 **pass against the
existing, unmodified policies**:

- No firm role can select a `platform_admin` row directly or have one
  appear in a full `users` listing — `users_select`
  (`001_functions_triggers_rls.sql`) requires
  `firm_id = app_current_firm_id()`, which a `platform_admin` row's
  `NULL` firm_id can never satisfy (`NULL = anything` is never `TRUE`
  in SQL), and neither of the two platform_admin-specific SELECT
  policies (`006`, `007`) grants anything to a non-platform_admin
  session.
- No firm role can see a user row from a different firm — same
  `firm_id = app_current_firm_id()` check.
- `listClients()` (what the "assign to clients" picker actually calls)
  for an `'assigned'`-scope Bookkeeper only returns clients they're
  explicitly assigned to, and returns nothing at all for one with zero
  assignments — `app_accessible_client_ids()`
  (`009_team_roles_rls.sql`) already encodes exactly this, and an
  existing test already covered the zero-assignment case before this.

**So the policy logic itself is not the bug** — I could not reproduce
either symptom against the same code these tests exercise. I looked
for and rejected one database-level "hardening" that seemed appealing
at first (`ALTER TABLE ... FORCE ROW LEVEL SECURITY` on every
RLS-protected table, to guard against a connection that's the tables'
owner rather than a plain granted role): this app deliberately uses
the schema-owning role (via `MIGRATION_DATABASE_URL`) as an intentional
RLS-bypass mechanism for legitimate cross-tenant operations —
`db/authClient.ts` (login lookups, the platform-admin and team-member
"is this email already registered anywhere" checks, firm bootstrap),
`db/seed.ts`, every `scripts/*.ts` admin script, and every test file's
own fixture setup all depend on that owner connection NOT being
subject to RLS. `FORCE` would apply RLS to that role too, breaking all
of it. Confirmed locally that this local sandbox's owner role
(`keepbooks`) is actually a full Postgres superuser, which bypasses
`FORCE` entirely regardless — so `FORCE` wouldn't even have been
testable as "fixed" here, only silently break things the moment it
hit a project where the owner role ISN'T a superuser (exactly a real
Supabase project, where `postgres` is not a true superuser but
typically does own the tables `db:migrate` created).

**Most likely actual cause**: whatever role the deployed app's
`DATABASE_URL` connects as isn't the dedicated, RLS-enforcing
`keepbooks_app` role `db:migrate`'s `ensureAppRole()` creates and
prints a connection string for — e.g. `DATABASE_URL` accidentally set
to the same connection string as `MIGRATION_DATABASE_URL` (Supabase's
`postgres` user, which owns every table and — on real Supabase
projects — is not flagged a true superuser but does implicitly bypass
plain `ENABLE ROW LEVEL SECURITY` as the owner). That single
misconfiguration would explain both symptoms at once, with no policy
bug required: unfiltered `users` rows (platform_admin included) AND
unfiltered `clients` rows (every client, regardless of Bea's
`access_scope`) from the exact same underlying cause.

**Diagnostics to run against the real Supabase project** (`psql
"$DATABASE_URL"` — the app's actual runtime connection, not the
migration one):

```sql
-- 1. Which role is DATABASE_URL actually connecting as?
select current_user;
-- Must be keepbooks_app. If this prints "postgres" (or anything else),
-- that's the bug — fix DATABASE_URL, no code/policy change needed.

-- 2. Does that role have any RLS-bypassing attribute?
select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user;
-- Both must be false.

-- 3. Is RLS actually enabled on the tables in question?
select relname, relrowsecurity from pg_class where relname in ('users', 'clients');
-- Both must be true.

-- 4. Bea's actual state (answers "is she assigned to all 5"):
select id, email, role, access_scope from users where email = 'bookkeeper@keepbooks.demo';
select client_id from user_client_assignments
  where user_id = (select id from users where email = 'bookkeeper@keepbooks.demo');
-- db/seed.ts has never inserted any user_client_assignments row for
-- bookkeeper@keepbooks.demo — if access_scope is 'assigned' (matching
-- what the roster showed) and this returns zero rows, she should be
-- seeing NO clients under correct RLS, not 5, which would confirm
-- query #1 above is the thing to fix.
```

**Verified**: `tsc --noEmit` clean, `pnpm test` 181/181 (176 above +
5 new), `pnpm build` clean. No RLS policy or application code changed
by this investigation — only the 5 new tests, which pass against the
existing policies and serve as a standing regression guard for both
boundaries regardless of what the live-project diagnosis turns up.

### Follow-up: DATABASE_URL was missing locally, closing the loop

The user's `.env.local` had `MIGRATION_DATABASE_URL` but no
`DATABASE_URL` at all — yet `.env.preview-check` (a hosting-provider
generated file, not part of this repo) already showed a `DATABASE_URL`
value they never set themselves. `db/client.ts` already throws
immediately if `process.env.DATABASE_URL` is falsy — there is no
code-level fallback to any other connection anywhere in the app (only
place `DATABASE_URL`, unprefixed, is read at all). So a local
`pnpm dev` run with it genuinely absent should crash outright on the
first request touching the database, not silently show wrong-but-
plausible data.

Given that, and that a `DATABASE_URL` already existed somewhere the
user hadn't set it, the most likely explanation for the whole
platform_admin/all-clients symptom pair above is a hosting platform
auto-injecting its own `DATABASE_URL` (commonly done by a linked
Postgres/Supabase integration) independently of the project's own env
files or dashboard settings — and that auto-injected value being
Supabase's default `postgres` connection (table owner, bypasses plain
`ENABLE ROW LEVEL SECURITY`), not the dedicated `keepbooks_app` role
this app's own RLS design depends on. This can't be confirmed from
inside this sandbox — it requires checking the actual hosting
provider's environment variable settings and/or querying the deployed
app's real `DATABASE_URL` directly (`select current_user;`).

Three changes:

1. **`next.config.ts`** now throws if `DATABASE_URL` is unset, at
   config-evaluation time — before `next dev`/`next build`/`next start`
   do anything, not just lazily on the first request that happens to
   import `db/client.ts`. Verified live: `next build` with
   `DATABASE_URL` unset fails immediately with a clear error; with it
   set, the build succeeds unchanged. Deliberately scoped to
   `DATABASE_URL` only, not a general env validator — and deliberately
   NOT a fix for the actual live symptom (an auto-injected,
   wrong-but-present `DATABASE_URL` still passes this check; a presence
   check can only catch "missing," not "wrong role") — it exists so a
   genuinely missing `DATABASE_URL` (this environment's actual state)
   fails loudly instead of looking like a data bug.
2. **`scripts/reset-app-role-password.ts`** (new): `keepbooks_app`'s
   password is only ever printed once, at role-creation time, by
   `db:migrate`'s `ensureAppRole()` — a pre-existing role's password is
   deliberately left untouched (and thus unprintable) on every later
   run. Since the role already exists on the user's project from PR
   A's own testing, there was no way to recover the original password;
   this resets it via `MIGRATION_DATABASE_URL` (same privilege level
   `ensureAppRole()` already uses for `CREATE ROLE`) and prints the
   `DATABASE_URL` to set, built by copying `MIGRATION_DATABASE_URL`'s
   host/port/database/query-string and swapping in `keepbooks_app` +
   the new password — so pooler-specific settings (`sslmode`, pgbouncer
   params, etc.) carry over exactly rather than being retyped by hand.
   Not run live in this sandbox: altering a role's password was denied
   by the environment's own permission classifier as a secret-store
   write, even against this sandbox's own disposable local Postgres —
   verified by code review and `tsc` instead, mirroring
   `db/migrate.ts`'s own already-proven `ensureAppRole()` URL-
   construction logic closely enough that I'm confident in it, but this
   is the one piece of this follow-up the user should watch run for the
   first time.

**Verified**: `tsc --noEmit` clean, `pnpm build` clean (both with
`DATABASE_URL` set, matching this sandbox's own `.env.local`), and a
direct `next build` run with `DATABASE_URL` forced empty confirmed the
new check fails loudly as intended. `pnpm test` unaffected (181/181) —
neither change touches anything the test suite exercises.

**Bug found live, fixed same day**: `scripts/reset-app-role-password.ts`
printed a `DATABASE_URL` with username `keepbooks_app` — dropping
Supabase pooler connections' `.<project-ref>` username suffix entirely
(e.g. `MIGRATION_DATABASE_URL`'s `postgres.abcdefgh` should become
`keepbooks_app.abcdefgh`, not just `keepbooks_app`) — because the
pooler parses that suffix back out of the username to route the
connection to the right project at all; without it the connection
fails outright. `db/migrate.ts`'s `ensureAppRole()` had the exact same
bug in its own (structurally identical) URL-construction code, just
never yet hit live since it only fires the first time the role is
created fresh. Fixed both the same way: split the original
connection's username on its first `.`, keep everything from that dot
onward, and only swap the part before it. Verified directly (not just
by reading it) against both a pooler-style username
(`postgres.abcdefgh`) and a plain direct-connection username with no
dot — the fix preserves the suffix in the first case and is a no-op in
the second, matching what a non-pooled `MIGRATION_DATABASE_URL` needs.

## Inviting an email that already has a Supabase Auth identity but no firm

**The bug**: `createTeamMember()`'s original "already registered" branch
handled `inviteUserByEmail()` failing (which it always does for an
email that already has ANY Supabase Auth identity — brand new only)
by falling back to `listUsers()` to find the existing identity, then
just inserting the `public.users` row and returning `{ ok: true }` —
**no email was ever sent in that branch**. Reported live: inviting
`loyalcreatives@gmail.com` (which had signed in with Google once, with
no firm yet) as an Encoder silently attached the row and reported
success, with nothing actually delivered.

**The fix** — `lib/auth/create-team-member.ts` now distinguishes three
outcomes for an email that already has *some* identity, checked in
this order:

1. **Already a member of THIS firm** — refused with
   `"<email> is already a member of this firm (role: X)."`, nothing
   touched.
2. **Already belongs to a DIFFERENT firm** — refused with
   `"<email> already belongs to a different firm. It can't be added
   here."`, nothing touched. A `platform_admin` row (`firm_id` NULL)
   gets its own branch here too — never adoptable as a firm member,
   same generic "already registered" message as before.
3. **A Supabase Auth identity exists but no `public.users` row
   anywhere** (this case) — attach them to the firm using their
   *existing* auth id (no new Supabase Auth user created — reusing the
   same `listUsers()` lookup the old code already did, just acting on
   it correctly this time), then call
   `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser:
   false, ... } })` to actually send a magic-link sign-in email.
   `signInWithOtp` was chosen over `inviteUserByEmail` (which only
   works for brand-new identities and is what failed in the first
   place) and over `resetPasswordForEmail` (which works for any
   existing identity too, but is semantically a "reset your password"
   email — confusing for someone who already has working Google
   sign-in and isn't resetting anything). It doesn't touch their
   existing credentials; Google sign-in still works exactly as before
   afterward, the magic link is just one more way in for this email.
   Failure to send this courtesy email doesn't roll back the
   attachment (the part that actually matters already succeeded) —
   surfaced instead as a non-fatal `warning` in the result, rendered
   on the Team page in amber, distinct from a green success or a red
   error. Never silent either way, per the requested safety rules.

A genuinely brand-new email (no auth identity at all) is unaffected —
still goes through `inviteUserByEmail()` exactly as before.

**On the literal wording** ("You've been added to Firm X as an
Encoder"): this app has no email-sending infrastructure of its own —
`lib/email/send.ts` doesn't exist anymore; every transactional email
this app sends goes through a Supabase Auth email template
(Invite / Magic Link / Recovery), configured in the Supabase dashboard,
not in this codebase. `templateData` (`firm_name`, `role_label`,
`full_name`) is passed to both `inviteUserByEmail()` and
`signInWithOtp()` calls and is available to whichever template fires
as `{{ .Data.firm_name }}` / `{{ .Data.role_label }}` — but only if
that template has been customized to reference them; Supabase's
default templates don't. To get the exact requested wording, customize
the **Magic Link** template under Supabase Dashboard → Authentication →
Email Templates:

```
Subject: You've been added to {{ .Data.firm_name }}

Body:
<h2>You've been added to {{ .Data.firm_name }}</h2>
<p>You've been added as {{ .Data.role_label }}. Click below to sign in:</p>
<p><a href="{{ .ConfirmationURL }}">Sign in to Keep.Books</a></p>
```

Consider doing the same for the **Invite** template (same two
variables, plus `{{ .Data.full_name }}`) for the brand-new-email path,
for consistency. Until customized, both paths still send a real,
working sign-in link — just with Supabase's generic default copy.

### The "Create your firm" flow — investigated, two real gaps found

Reported: signing up with Google as `loyalcreatives@gmail.com` never
created a firm or a `public.users` row. Traced both
`app/auth/callback/route.ts` → `lib/auth/oauth-callback.ts` (routes a
firmless Google identity to `/onboarding/firm` — correct) and
`app/onboarding/firm/actions.ts` → `lib/auth/create-firm-for-user.ts`
(creates the firm + first user in one transaction — also correct) by
hand; neither has a bug that would silently swallow a firm creation.

**Most likely actual explanation for this specific email**: it was
very likely already attached to the tester's own firm by the invite
bug above (fixed in this same change) — a silent, no-email attach
followed by a genuine "sign up with Google" attempt would land the
person straight back into the firm they were already (silently)
attached to, rather than onboarding a new one, which looks exactly
like "signing up never created a firm" from the outside. Verifying
this needs looking at the actual live row, which this sandbox can't
do — see `scripts/inspect-user-by-email.ts` below.

**Two real, separate gaps found and fixed regardless**, both
matching the explicit ask to "let a half-finished signup resume":

1. `app/login/page.tsx` and `app/signup/page.tsx` both checked
   `getCurrentUser()` only — which returns `null` for a Google identity
   that authenticated but never finished onboarding (by design, since
   it has no profile row yet — see that function's own doc comment).
   That meant a person in exactly that pending state, landing back on
   `/login` or `/signup` (e.g. via the "Create your firm" / "Sign in"
   links, or a bookmark), saw a fresh, blank form with no
   acknowledgment they'd already started — not wrong exactly (every
   *other* protected page already correctly resumed them via
   `requireCurrentUser()`'s own pending check), but the two most
   likely re-entry points didn't. Both now also check
   `getPendingGoogleSignup()` and redirect to `/onboarding/firm`.
2. `lib/auth/signup.ts`'s email/password path: Supabase's `signUp()`
   returns the exact same "User already registered" error whether the
   email is fully onboarded elsewhere or only has a half-finished
   Google identity with no firm — and the generic message is a dead
   end for the second case (already flagged in this file's own code
   comment as "no way yet to resume rather than start over"). Now
   checks whether a `public.users` row actually exists for that email
   before deciding which message to show; if not, the error becomes
   "You've already started signing in with this email (e.g. with
   Google) but haven't finished setting up your firm. Sign in with
   that same method to pick up where you left off." instead of the
   unhelpful generic one.

**New read-only diagnostic**: `scripts/inspect-user-by-email.ts`
(`pnpm inspect-user -- <email>`) prints everything this app knows
about one email — its `public.users` row (if any) and its Supabase
Auth identity (if any) — side by side, with a plain-language diagnosis
of which state it's in. Makes no changes. Built because every mutation
script in this repo (`delete-test-signup.ts`,
`migrate-demo-users-to-supabase-auth.ts`) already assumes you know
which case you're in before running it, and this incident showed that
isn't always obvious from the outside.

**Tests**: `db/__tests__/create-team-member.test.ts` (new) covers the
three "already has some identity" branches directly against real
Postgres — no Supabase credentials needed, since all three return
before `createTeamMember()` ever calls the Supabase Admin API. The
fourth case (attach + `signInWithOtp`) isn't covered by an automated
test, the same way `lib/auth/invite-platform-admin.ts`'s own Supabase
Admin API calls aren't — this codebase tests DB-level RLS/data-layer
boundaries, not Supabase's own SDK behavior against a real project.

**What to run to apply these changes**:

```bash
# 1. See loyalcreatives@gmail.com's actual current state before retesting
pnpm inspect-user -- loyalcreatives@gmail.com
```

If that shows a `public.users` row already attached to your firm as
Encoder (the likely residue of the original bug) and you want to
re-test the full flow cleanly, remove just that row yourself (this
does NOT touch their Supabase Auth identity, so a subsequent Google
sign-in correctly resumes as "pending" per the fixes above):

```sql
delete from user_client_assignments where user_id = (select id from users where email = 'loyalcreatives@gmail.com');
delete from users where email = 'loyalcreatives@gmail.com';
```

No new SQL migration this round — `users_insert`/`uca_write`'s
policies already don't care whether an inserted row's id came from a
brand-new `inviteUserByEmail()` call or a reused existing identity, so
`pnpm db:migrate` has nothing new to apply. Just redeploy/restart with
the updated code, then re-run the invite from `/settings/team`.

**Verified**: `tsc --noEmit` clean, `pnpm test` 185/185 (181 above + 4
new), `pnpm build` clean.

## Team page: per-client assignment editing + deactivate/reactivate

**Scope note**: this goes beyond both PR A (role model + RLS) and what
PR B was originally scoped as (invites + team page) — it's PR C's
territory (per-client assignment UI) plus a lifecycle-management piece
(deactivate/reactivate) that was never in the original 4-PR split at
all. Landed on the same branch/PR #28 anyway, consistent with how
every prior request this session did — see the earlier note when the
Team page itself was first built. Worth renaming/redescribing PR #28
before merge; it now covers meaningfully more than "PR A."

**1. Clients column.** `listTeamMembers()` (`lib/data/team.ts`) now
also queries `user_client_assignments` (joined to `clients`) and groups
client names by member id. No extra filtering needed for "Bookkeepers
only see assignments for their own clients" — `uca_select`'s existing
RLS policy (`client_id IN app_accessible_client_ids()`) already scopes
which assignment *rows* are visible to the querying session, so a
Bookkeeper viewing the page sees every team member but only the
overlap between each member's assignments and the Bookkeeper's own
access; an Owner sees everything. Same mechanism the "assign to
clients" picker already relied on.

**2. Edit assignments.** `lib/auth/edit-team-member-assignments.ts`
(new) diffs the requested client list against the target's *current*
assignments (as visible to the editor, for the same RLS reason above)
and inserts/deletes only what changed — never a clear-and-replace,
which would silently drop a Bookkeeper-invisible assignment on a
client outside their own access. Owner's edit panel can also toggle
`access_scope` (all/assigned); Bookkeeper's cannot — the option isn't
in the form for one, and even a hand-crafted request would be rejected
by the new `users_bookkeeper_active_only` trigger below regardless.
No new RLS policy needed for the assignment writes themselves —
`uca_write` (010) was already `FOR ALL`, covering UPDATE/DELETE, not
just the INSERT it was written for.

**3. Deactivate/reactivate**, `db/sql/012_team_lifecycle_rls.sql` +
`lib/auth/set-team-member-active.ts`:
- `users_update` (previously Owner-only) now also lets a Bookkeeper
  UPDATE an Encoder's row, scoped the same way `uca_write` scopes
  Bookkeeper writes (the target must have an assignment to a client the
  Bookkeeper can access). A new `enforce_bookkeeper_users_active_only_update`
  trigger restricts that Bookkeeper path to the `active` column alone —
  mirrors `enforce_reviewer_status_only_update`'s column-diff pattern
  from PR A exactly.
- `enforce_no_self_deactivation`: nobody can flip their own `active` to
  `false`, unconditional on actor role (the Bookkeeper path can never
  reach an Owner's own row anyway, since it requires the target to be
  an Encoder — this only ever actually fires for an Owner).
- `enforce_last_owner_stays_active`: a `firm_admin` row being
  deactivated, or having its role changed away from `firm_admin`, while
  it's the firm's *only* active one, is rejected. Tested via a role-
  change vector, not deactivation — a lone Owner attempting to
  deactivate *themselves* is already blocked by the self-rule above
  before this one would ever fire, so the cleanest independent proof
  this trigger does its own job is a lone Owner trying to change their
  own role to `bookkeeper` instead (not currently reachable through the
  app's own UI, which has no role-change form at all, but reachable at
  the RLS layer directly, which is exactly what this rule guards
  regardless of what any particular UI currently exposes).
- Unposted-drafts warning: `setTeamMemberActive()` counts the target's
  `journal_entries` with `status = 'draft'` before deactivating and
  returns it as a non-fatal `warning`, not a blocking confirmation —
  the request said "warn," and deactivation still proceeds; drafts
  aren't touched (no edit/delete), just no longer editable by anyone
  signed in as that now-inactive person.
- "End active sessions... effective immediately": `getCurrentUser()`
  already refuses a `!active` row on every request (proven since PR
  A), so this is already true at the app layer regardless of anything
  below. Additionally, best-effort, `setTeamMemberActive()` asks
  Supabase Auth to ban the identity
  (`admin.updateUserById(id, { ban_duration: "876000h" })` — GoTrue has
  no dedicated "forever" value, this is the commonly-used ~100-year
  stand-in) so an already-issued session token is rejected immediately
  rather than merely on this app's next request. **Could not verify
  this call's exact behavior live** — no real Supabase project
  reachable from this environment — so a failure here is surfaced as a
  warning, never treated as the deactivation itself failing; the
  `active`-flag mechanism is the proven backstop either way. Please
  confirm live that an already-signed-in deactivated user is actually
  kicked out immediately, not just on their next navigation.

**4. Audit log.** Add and deactivate/reactivate are both `users`
INSERT/UPDATE — already covered by the `audit_users` trigger since PR
A, no change needed (and `describeAuditEntry()` already renders
"Account deactivated"/"Account reactivated" from an `active` before/
after diff — built earlier, unused until now). Edit (assignment
changes) had nothing logging it at all: `user_client_assignments` gets
its own `audit_row_change()` trigger for the first time, matching
every other RLS-protected table, plus a `"client assignment"` label in
`lib/audit-log-labels.ts`.

**Tests**: `db/__tests__/team-lifecycle-rls.test.ts` (new, 15 tests) —
a dedicated fixture set/file rather than appending to
`team-roles-rls.test.ts`, since this touches `users` UPDATE broadly
enough that sharing that file's heavily-reused `OWNER_ID`/
`BOOKKEEPER_ID` fixtures across ~40 unrelated tests risked one test's
deactivation leaking into another's assumptions. Covers: Bookkeeper
deactivate/reactivate scoped to their own Encoders (positive + 3
negative cases: wrong client, zero assignments, non-Encoder target),
Bookkeeper can't sneak another column change in alongside `active`,
Owner self-protection, the lone-Owner role-change case above, Owner
deactivating a *different* Owner (needs its own two-Owner firm
fixture, kept separate so it never risks leaving the shared fixture
firm without an active Owner), both `user_client_assignments`
INSERT/DELETE now producing audit rows, plus direct calls into
`editTeamMemberAssignments()`/`setTeamMemberActive()` for the
app-layer messages (Bookkeeper-can't-edit-non-Encoder, add+remove
diffed correctly, self-deactivation refused before touching the DB,
the unposted-drafts warning).

**Verified**: `tsc --noEmit` clean, `pnpm test` 200/200 (185 above +
15 new), `pnpm build` clean. UI not manually driven in a browser in
this environment (no way to run the dev server against a real
Supabase project here) — reviewed by hand against the same
`useActionState`/amber-warning conventions already established and
proven on this page's existing add-member form.

## Bug fix: Owner-invited Encoder with zero clients got "every client" access

**The report**: an Owner invited an Encoder without ticking any client
checkboxes, and the new Encoder showed up on the Team page with "Every
client" access — full firm-wide visibility, for a role whose entire
point is a narrow, assigned slice. Root cause in
`createTeamMember()`'s `accessScope` computation:
`role === "viewer" || clientIds.length > 0 ? "assigned" : "all"` only
special-cased Viewer. An Owner-invited Encoder or Reviewer with zero
clients ticked fell through to the `"all"` branch — the Bookkeeper's
own invite form already required at least one client for its
Encoders (`clientIds.length === 0` check, scoped to
`currentUser.role === "bookkeeper"`), but that requirement never
applied to an Owner's invite of the same role.

**The rule, as given**: Encoder, Reviewer, and Viewer must always be
`access_scope` `'assigned'`, never `'all'` — regardless of who's
inviting. Only Owner and Bookkeeper may default to `'all'`. Encoder
additionally requires at least one client picked at invite time
(matching the Bookkeeper form's existing requirement, now applied
uniformly instead of only when the inviter is a Bookkeeper); Reviewer
and Viewer may start at zero clients and be assigned later, since
neither needs to be immediately useful the moment it's created the
way Encoder's whole point does.

**`lib/auth/create-team-member.ts`**: the old
`if (currentUser.role === "bookkeeper") { ... }` block's
zero-clients-for-Encoder check is now unconditional on the inviter —
`if (role === "encoder" && clientIds.length === 0)` fires regardless
of who's inviting. `accessScope` is now
`const canDefaultToAll = role === "firm_admin" || role === "bookkeeper"; const accessScope = canDefaultToAll && clientIds.length === 0 ? "all" : "assigned";`
— only those two roles can ever land on `'all'`.

**Enforced at the database level, not just in application code**
(the actual ask — app-layer checks are a courtesy for a clean error
message, not the backstop): `db/sql/013_role_access_scope_check.sql`
adds `CHECK (NOT (role IN ('encoder', 'reviewer', 'viewer') AND access_scope = 'all'))`
on `users`. A CHECK constraint, not a trigger — this is a stateless
per-row invariant with no OLD/NEW column-diffing involved (unlike
`enforce_reviewer_status_only_update` and friends), and it needs to
apply universally, including to the owner/bypass Postgres connection
used for admin operations — the opposite of RLS, which is
intentionally role-scoped and bypassable by that same connection.
`platform_admin` and `client_user` are deliberately excluded:
`access_scope` isn't semantically meaningful for either (`platform_admin`
has no firm at all; `client_user`'s access is its own `client_id`
column, never `access_scope`/`user_client_assignments`), and neither
was named in "Owner and Bookkeeper only."

`ADD CONSTRAINT ... CHECK` validates every existing row by default, so
the migration backfills first: (1) any existing encoder/reviewer/viewer
row already sitting at `'all'` (from the bug above, wherever it's been
hit) is corrected to `'assigned'`; (2) `encoder@keepbooks.demo`
specifically — seeded with `'all'` deliberately, before this rule
existed — is granted both seeded demo clients explicitly first, so
fix #1 doesn't take it from "sees every demo client" to "sees nothing
at all" as a side effect, matching what
`scripts/seed-viewer-demo-user.ts` already did for the demo Viewer.

**A second, closely-related bug caught while auditing `db/seed.ts`
for the same issue**: the seeded `reviewer` row never set
`accessScope` explicitly at all, relying on the column's own default
(`'all'`) — which the new constraint now rejects outright. Since
`db/seed.ts` runs *after* all migrations (so 013's one-time backfill,
a migration-time-only UPDATE, never touches a row inserted later),
this would have made a fresh `pnpm db:migrate && pnpm seed` crash on
any new database. Fixed by setting `accessScope: "assigned"`
explicitly on both the `reviewer` and `encoder` seed inserts, with
matching `user_client_assignments` grants to both demo clients for
each (previously only the Viewer got this treatment) — every demo
account now has something to work with.

**Team page copy** (`app/(app)/settings/team/page.tsx`): the old text
— "Owner and Bookkeeper see every client by default unless you assign
specific ones" — was inaccurate for Owner specifically.
`app_accessible_client_ids()`'s `firm_admin` branch
(`db/sql/001_functions_triggers_rls.sql`) has no `access_scope`
condition at all: an Owner sees every client in the firm
unconditionally, regardless of what `access_scope`/assignments say on
their own row. Assigning an Owner specific clients would never
actually narrow their access — the old copy implied otherwise.
Rewritten to say Owner is always full access, a new Bookkeeper invite
defaults to every client unless scoped down, and Encoder/Reviewer/
Viewer are always limited to assigned clients (Encoder needing at
least one picked now). The add-member form's client-picker label had
the same bug in miniature — a single `isOwner`-only ternary claimed
"leave blank for access to every client" for every role Owner could
invite, which is now simply false for Encoder (rejected outright) and
misleading for Reviewer/Viewer (sees nothing, not everything). Made
role-aware: `"...leave blank for access to every client"` only for
Bookkeeper, `"required"` for Encoder, `"optional — they'll see
nothing until you assign at least one"` for Reviewer/Viewer.

**Test fixture ripple**: the new constraint immediately exposed every
place a test fixture relied on Encoder/Reviewer/Viewer being `'all'`
(often as a stand-in for "sees every client in the firm," since
`'all'` used to be the easy way to get that). Fixed in
`team-roles-rls.test.ts`, `team-lifecycle-rls.test.ts`, and
`create-team-member.test.ts`: switched those fixtures to `'assigned'`
with explicit `user_client_assignments` grants to every client they
previously saw implicitly, so downstream test assertions about "sees
both clients" keep holding without being rewritten; repointed the one
test that specifically demonstrates `'all'`-scope behavior
(`"'all' scope sees every client in the firm"`) from an Encoder
fixture to `BOOKKEEPER_ID`, the only non-Owner role left that can
actually prove it; and switched three `create-team-member.test.ts`
tests that used `role: "encoder", clientIds: []` purely to reach the
*email-already-exists* branch over to `role: "viewer"` instead, since
Encoder's new zero-clients rejection now fires before that check ever
runs and those tests were never about Encoder's client requirement in
the first place.

**Verified**: `pnpm db:migrate` applies 013 cleanly against a
database already carrying the pre-fix data (backfill + constraint,
no manual intervention needed). `tsc --noEmit` and `pnpm build` both
clean. `pnpm test`: all suites pass except two pre-existing failures
in `team-roles-rls.test.ts` (`journal_entries`/`sales_invoices`
Encoder-can't-see-another-encoder's-draft) that are unrelated to this
fix — traced directly to this sandbox's local Postgres having a stray
`journal_entries_select`/`sales_invoices_select` policy left over from
separately testing PR #29 (`claude/encoder-transaction-visibility`,
migration `013_encoder_read_all_client_entries.sql`) against the same
shared database earlier in this session; confirmed via
`pg_get_expr(polqual, ...)` that the live policy text lacks the
`app_current_role() != 'encoder' OR created_by = app_current_user_id()`
clause this branch's own `009_team_roles_rls.sql` defines, and
`_sql_migrations_applied` shows `013_encoder_read_all_client_entries.sql`
recorded as applied — a migration that does not exist anywhere in
this branch's `db/sql/`. Restoring the correct policy locally needs a
`DROP POLICY`/`CREATE POLICY` pair that this environment's safety
tooling declined to run automatically; a database that has only ever
run this branch's own migrations (any fresh `pnpm db:migrate`,
including yours) was never exposed to that stray migration and won't
show this failure.

## Encoder transaction visibility: read all entries on assigned clients

**New branch/PR, not #28**, as asked — `claude/encoder-transaction-visibility`,
originally branched from #28's tip since the role model, `access_scope`,
and the RLS scaffolding this depends on (`app_accessible_client_ids()`,
the Encoder role itself) only existed there at the time — `main` had
none of Team & Roles yet. Now that #28 has merged, this branch has
been rebased onto `main` directly, and its migration renumbered from
`013_encoder_read_all_client_entries.sql` to
`014_encoder_read_all_client_entries.sql` (013 was taken by #28's own
`013_role_access_scope_check.sql`, merged first).

**What an Encoder could see before this, asked directly**: only
entries *they personally created* — not another Encoder's drafts, not
the Bookkeeper's drafts, and, more surprisingly, not even a **posted**
entry created by someone else. 009's `journal_entries_select` policy
(and the identical pattern on `journal_lines` and all four document
tables) filtered by `created_by = app_current_user_id()`
unconditionally for the Encoder role, with no exception once an entry
posted. That's a stricter read scope than "can't approve/edit others'
work" (correct, and unchanged by this PR) — it was "can't even see
others' work exists," which is what actually created the duplicate-
encoding risk: nothing on screen would tell a second Encoder someone
already keyed the same transaction.

**Fix**: `db/sql/014_encoder_read_all_client_entries.sql` drops that
clause from all 8 SELECT policies (`journal_entries`, `journal_lines`,
`sales_invoices`, `purchases`, `cash_receipts`, `cash_receipt_lines`,
`cash_disbursements`, `cash_disbursement_lines`), leaving only the
`client_id IN app_accessible_client_ids()` check every other role's
SELECT already had — Encoder's read scope now matches
Bookkeeper/Reviewer/Viewer/Owner exactly. Every INSERT/UPDATE/DELETE
policy is untouched: Encoder can still only write their own draft,
proven by the same tests as before (now restated under this
migration's own describe block in `team-roles-rls.test.ts`, plus two
new ones: seeing a Bookkeeper's draft, and seeing — but not editing —
a posted entry from someone else).

**UI**: `listJournalEntries()`/`getJournalEntry()`
(`lib/data/journal.ts`) now also resolve each entry's creator name
(`enteredByName`, via a `users` lookup scoped by the caller's own
`users_select` visibility — same-firm, so this resolves for anyone's
entries, not just the viewer's own) — shown as a new "Entered by"
column on the transactions list and inline on the entry detail page.
Status was already shown on both (`StatusBadge` on the list,
capitalized text on the detail page) — nothing to add there.

**Duplicate warning** ("also consider adding"): scoped to the General
Journal creation path only — both `createDraftGeneralJournal()` (the
Encoder's own path) and `postGeneralJournal()` — not the four other
document-type creation flows, which each have their own separate forms
and would need their own separate wiring; flagged as a follow-up if
wanted, not built here. `findPossibleDuplicateGeneralJournalEntry()`
(`lib/data/journal.ts`) matches on client + date + reference number +
total debit amount, and — deliberately — only runs the check at all
when a reference number is actually given: without one, "same date +
amount" alone is far too common a coincidence to mean anything (two
unrelated cash entries on the same day for a round number), and would
just be noise. New route
`POST /api/clients/[id]/transactions/general-journal/check-duplicate`
is called by `GeneralJournalForm` *before* the real save/post request,
non-blocking — a match surfaces a `window.confirm()` naming the
existing entry's number/status/creator; declining aborts the submit,
confirming proceeds exactly as before. This is exactly the check that
needed the read-scope widening above to be useful at all: catching a
second Encoder (or the Bookkeeper) re-keying something already
entered requires being able to see across who entered what in the
first place.

**Tests**: `db/__tests__/duplicate-entry-detection.test.ts` (new, 5
tests) — match found, no match on differing reference/amount, and the
reference-number-required gate, using the real
`createDraftGeneralJournal()` write path rather than hand-inserted
fixture rows so the test exercises the same code the form actually
calls.

**Verified**: `tsc --noEmit` clean, `pnpm test` 209/209 (200 above + 4
in `team-roles-rls.test.ts`'s new describe block + 5 in the new
duplicate-detection file — one of the 4 restates an existing test
under the new migration's block rather than adding net-new coverage),
`pnpm build` clean (confirmed the new `check-duplicate` route is in
the build output). UI not manually driven in a browser in this
environment, same limitation as noted above.

## Draft Edit/Delete, Encoder navigation, same-account warning

New PR (`claude/draft-edit-encoder-nav`, branched from `main` after
#28 and #29 both merged), per the standing instruction to give each
new feature its own PR from here on. Four independent asks; taken in
order.

### 1. Edit/Delete for drafts

**No new RLS needed — verified the permission model was already
complete, then wrote tests proving it**, rather than assuming a gap
existed. `journal_entries_update`/`_delete` and `journal_lines_write`
(`009_team_roles_rls.sql`) already put no `created_by` condition on
`firm_admin`/`bookkeeper` at all — they can touch any draft, any
client they can access. Encoder is scoped to `created_by = self`.
Reviewer's `UPDATE` access exists at the RLS layer but
`enforce_reviewer_status_only_update()` restricts it to the
`status`/`posted_by`/`posted_at` columns only — post/approve, not
edit — so Reviewer correctly gets no Edit button at all. Nobody but
`firm_admin`/`bookkeeper`/the creating Encoder has a `journal_entries_
delete` policy branch, so Delete is exactly as scoped. "Posted entries
stay locked" was already unconditional-on-role, DB-level, and
untouched by this PR: `enforce_journal_entry_immutability()` /
`enforce_journal_line_immutability()` (`001_functions_triggers_rls.sql`)
reject any UPDATE/DELETE on a posted/reversed row outright, before RLS
role logic even matters.

- `lib/data/post-transaction.ts`: `updateDraftGeneralJournal()`
  (clear-and-replace on the entry's fields and lines — not a diff;
  unlike `userClientAssignments`' add/remove diffing, whoever can open
  this form already sees every one of this draft's own lines, so
  there's no invisible-row risk) and `deleteJournalEntry()` (a plain
  `DELETE`; lines cascade via their own FK, itself still RLS-checked
  per row — the existing "CAN edit and delete their own draft" test
  already proved this cascade works under RLS, not just under a
  schema-owner connection).
- `lib/data/journal.ts`: `EntryWithLines` gained a `createdBy` field
  (previously only `enteredByName`, the resolved display name) —
  needed server-side to decide whether *this* Encoder is the creator,
  without shipping every viewer's raw user id to the client for roles
  that don't need it.
- New routes, both `POST` (matching every other mutation in this app —
  see `lib/use-json-post.ts`'s own doc comment for why Route Handlers,
  not Server Actions, and why not PATCH/DELETE-as-HTTP-verb):
  `.../[entryId]/edit` (General Journal only — see below) and
  `.../[entryId]/delete` (any book). Both re-check role + draft status
  + creator-match themselves before ever calling the data layer, for a
  clean error message — RLS is the actual backstop regardless, proven
  by `edit-delete-draft.test.ts` calling the data-layer functions
  directly (no route, no role pre-check) and getting the exact same
  rejections.
- **Edit is General-Journal-only, Delete is not.** Edit reuses
  `GeneralJournalForm` (new `mode: "edit"` + `initialValues` props) —
  the only book with a real draft-*editing* form, since it's the only
  book with a real draft-*creation* form
  (`createDraftGeneralJournal`'s own doc comment: the four specialized
  document types have RLS support for an encoder-authored draft but no
  UI that ever produces one). A draft on any other book only exists
  through direct DB manipulation, so there's no form to reuse for it —
  Delete alone is enough to clean one up, and the entry detail page
  only shows Edit when `book === "GJ"`.
- Entry detail page: new `draft-actions.tsx` client component (Edit
  link + Delete button with a confirm), rendered only when the
  server-computed `canManageDraft` is true — the same three-part
  condition (`status === "draft"` AND (`firm_admin`/`bookkeeper` OR
  creator)) the API routes re-check, kept in one place in the page
  component rather than duplicated per-button.
- **Tests**: new `db/__tests__/edit-delete-draft.test.ts` (8 tests) —
  calls `updateDraftGeneralJournal()`/`deleteJournalEntry()` directly
  (own fixture firm, not the shared `team-roles-rls.test.ts` fixtures)
  to prove the actual exported functions behave correctly: creator
  edits own draft (fields + lines both replaced), `firm_admin` edits
  *someone else's* draft, an Encoder editing another Encoder's draft
  is rejected (a genuine `throw`, not a silent no-op — see below),
  same four shapes for delete, plus both functions rejecting outright
  against a posted entry. Also added to `team-roles-rls.test.ts`
  directly against `journal_entries`/`journal_lines`: Encoder-cannot-
  delete-another's-draft (silent no-op, matching the existing
  cannot-edit test's shape), Reviewer/Viewer-cannot-delete-a-draft-at-
  all, and — the one genuinely new permission boundary this PR's UI
  exercises for the first time — `firm_admin`/`bookkeeper` editing
  *and* deleting an Encoder's draft (every prior edit/delete test only
  ever proved a role managing its own entry).
- **One real surprise, caught by the tests**: an Encoder editing
  another Encoder's draft doesn't fail the same way for UPDATE and
  DELETE. `DELETE`/`UPDATE`'s `USING` clause excludes the row, so
  Postgres just affects 0 rows — silent, no error. But
  `updateDraftGeneralJournal()`'s line-replace does a `DELETE` (0 rows,
  silent) *then* an `INSERT` of the new lines — and `INSERT` has no
  "0 matching rows" fallback; `WITH CHECK` rejects the new row outright
  with a hard `new row violates row-level security policy` error. Both
  are correctly blocked, but one throws and one doesn't — the app-layer
  pre-check in the edit route means a real user never sees the raw
  Postgres error either way, but the test needed to expect a `throw`
  here specifically, not the no-op shape used everywhere else in this
  file.

### 2. Encoder navigation: Recent clients + a transactions picker

Both surfaced in `dashboard/page.tsx`'s own doc comment as a flagged,
deliberate follow-up ("Editing/deleting an existing draft has full RLS
support... but no UI yet" — now built above; and the page's title,
"My Drafts," predates `014_encoder_read_all_client_entries.sql`
widening what an Encoder can even see there).

- `lib/data/dashboard.ts`: `getRecentClientsForEncoder(userId, limit)`
  — up to 5 clients, ordered by `MAX(journal_entries.created_at)`,
  filtered to `created_by = userId` specifically (not just "clients
  visible to me," which after the read-scope widening above would
  include clients this Encoder has never personally entered anything
  for). Assigned-only falls out of RLS itself, not an extra filter
  here — `access_scope` is always `'assigned'` for this role
  (`013_role_access_scope_check.sql`), so `app_accessible_client_ids()`
  already excludes anything unassigned.
- `app/(app)/layout.tsx`: `SidebarShell` takes an optional
  `recentClients` prop, rendered as a small section below the nav
  items, only for the Encoder role (`AppLayout` fetches it
  conditionally). Every other role passes nothing and the section just
  doesn't render — no layout change for them.
- `encoder-transactions-picker.tsx` (new, mirrors the existing
  `encoder-client-picker.tsx`): a "View transactions — pick a
  client…" dropdown listing every one of `listClients()`'s results
  (already the full assigned set — no new query needed), landing on
  `/clients/[id]/transactions` instead of jumping straight to the
  add-entry form. Placed next to the existing "+ Add Entry" picker on
  the Encoder dashboard.
- Updated the two now-stale doc comments in `dashboard/page.tsx` in
  the process (the RLS claim and the "no UI yet" note) — left
  otherwise alone; renaming "My Drafts" or changing `listFirmDrafts`'
  filtering was not part of this ask and is its own follow-up if
  wanted.

### 3. Same-account debit/credit warning

`general-journal-form.tsx`: before submit, checks whether any account
code appears on a debit line AND a credit line within the *same*
entry — almost always a typo (wrong row's account picked, or two
lines meant to net against each other instead of standing alone) —
and confirms via `window.confirm()` before proceeding, same
non-blocking pattern as the existing duplicate-entry check added in
the prior PR. Runs client-side against component state (`rows`), no
network round-trip needed, checked before the (network-dependent)
duplicate check so a bad amount doesn't wait on a fetch first. Applies
to all three form modes (`post`/`draft`/`edit`) — it's a data-quality
check on the entry itself, not specific to how it's being saved.

### 4. Test draft cleanup

Not something this environment can do directly — the draft in
question (Lumina Retail & Trading Solutions, General Journal,
2026-01-27, "Sales invoice", ₱1,000.00, entered by Loyal) lives on the
user's real Supabase project, and this sandbox has no credentials for
it (`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` both empty
in `.env.local` here, consistent with every other PR's "no live
Supabase project reachable" note). Once this PR is deployed, the
safest path is the new Delete button itself — it goes through the
exact same RLS-backed path as any other deletion, scoped to whoever's
actually logged in. Exact steps given directly to the user in this
session's own reply, not restated here.

**Verified**: `tsc --noEmit` clean, `pnpm build` clean (all four new
routes present: `.../[entryId]/edit`, `.../[entryId]/delete`, and the
new `/clients/[id]/transactions/[entryId]/edit` page), `pnpm test`
224/224 (209 above + 8 new in `edit-delete-draft.test.ts` + 7 new
across `team-roles-rls.test.ts`'s new/extended describe blocks). UI
not manually driven in a browser in this environment — same
no-live-Supabase-project limitation as every prior PR in this
session.

## Follow-up: Recent Clients for every role, based on actual views — not just authored entries

Requested before testing this PR: the "Recent clients" section built
above only worked for Encoder, and only reflected entries that
Encoder *personally created* (`getRecentClientsForEncoder`, filtered
to `journal_entries.created_by`). Two problems with that as a
general-purpose feature: it's Encoder-only, and authorship is the
wrong signal even for Encoder — a Reviewer or Viewer never creates a
journal entry at all, so an authorship-based query would leave them
with an permanently-empty section no matter how much they actually
use the app.

**Real view tracking, not an activity proxy.** `journal_entries` has
no signal for "a Viewer opened this client's reports" — reading
doesn't write anything. So this needed an actual table:
`user_client_views` (new — `db/schema/firms.ts`, alongside
`user_client_assignments`, same per-user-per-client shape), one row
per `(user_id, client_id)` ever visited, upserted with a fresh
`last_viewed_at` on every view. Table creation is drizzle-kit's own
generated migration (`db/migrations/0008_dapper_gideon.sql`, via
`pnpm db:generate` — this app's established two-phase pattern: table
DDL from drizzle-kit, RLS/policies hand-authored separately); RLS is
`db/sql/015_user_client_views_rls.sql`.

**RLS is deliberately the simplest policy in this app so far** — one
`FOR ALL` policy, `USING (user_id = app_current_user_id())`, since
this table has no legitimate cross-user read case at all (unlike
almost everything else here, which is scoped by firm/client access
but still meant for multiple roles to see the same rows). `WITH
CHECK` additionally requires `client_id IN
(SELECT app_accessible_client_ids())` — belt-and-suspenders, since
`recordClientView()` only ever runs after `getClient()` already
confirmed access, but it costs nothing to also enforce it at the row
level rather than trusting the caller. No explicit `GRANT`: new
tables already inherit `keepbooks_app`'s privileges from 001's
`ALTER DEFAULT PRIVILEGES`, same as `002_password_reset.sql`'s table
needed none.

**Where the write happens**: `app/(app)/clients/[id]/layout.tsx` —
already the one place every page under a client passes through
(Accounts, Contacts, Transactions, Reports, the draft-entry form,
all of it), and already calls `getClient()` to confirm access before
rendering anything. `recordClientView(user.id, id)` runs right after
that resolves, for every role that reaches this layout (no role
branching — client_user recording their own one client is harmless,
just unused), wrapped in try/catch and never awaited into blocking
the actual page: this is sidebar metadata, not something any page's
correctness depends on, matching this same layout's own established
"never let a secondary concern break the primary render" posture
(see its doc comment on why it avoids `redirect()`/`notFound()`
already).

**`lib/data/clients.ts`**: `recordClientView()` (the upsert above)
and `getRecentClientsForUser()` — replaces `getRecentClientsForEncoder`
entirely (deleted from `lib/data/dashboard.ts`), ordered by
`user_client_views.last_viewed_at` descending, `INNER JOIN`ed against
`clients`. "Only show clients the user is allowed to access" falls
out of that join for free: `clients` is itself RLS-scoped by
`app_accessible_client_ids()`, so a view row for a client this
session can no longer reach (e.g. an assignment removed after the
view was recorded) just doesn't join — no separate filter needed,
and proven by a dedicated test rather than assumed (see below).

**`app/(app)/layout.tsx`**: `SidebarShell`'s `recentClients` prop is
now populated for every firm-staff role, not just Encoder —
`platform_admin` is the one exclusion (its dashboard's "clients" are
firms across the whole platform, not something this per-client-page
layout ever wraps, so there's nothing for the query to reflect). "For
roles that already have a Clients link, keep it and add Recent
clients below it" needed no code change at all: the section already
rendered below `navItems` in the same `<nav>`, and `staffNav()`
already gives every role but Encoder a Clients link — the two just
stack naturally once `recentClients` stops being conditioned on
`role === "encoder"`.

**Tests**: new `db/__tests__/user-client-views.test.ts` (8 tests) —
`recordClientView()` upserts in place rather than duplicating a row
on a second view; a user cannot record a view for a client they
can't access (`WITH CHECK` rejects it) while Owner can for any client
in the firm; direct RLS proof that one user's `SELECT` never returns
another's rows and that a user can't `INSERT` a view attributed to
someone else; `getRecentClientsForUser()` orders by recency (not
insertion order), respects `limit`, and — the one genuinely
load-bearing behavior proven rather than assumed — a view row for a
client whose assignment was since removed silently drops out of the
result instead of leaking a client the session can no longer access.

**Verified**: `pnpm db:generate` produced a clean single-table
migration; `pnpm db:migrate` applied both it and 015 without issue
against a database already carrying everything through PR #28/#29.
`tsc --noEmit` and `pnpm build` both clean. `pnpm test`: 232/232 (224
above + 8 new). UI not manually driven in a browser in this
environment, same limitation as every prior PR in this session.

## Follow-up: keepbooks_app couldn't write to user_client_views at all on the real project

Reported live after deploying the above: the sidebar's Recent Clients
section never appeared for any role, and `select * from
user_client_views` on the real Supabase project came back empty —
zero rows, ever, despite navigating clients repeatedly. This is a
straightforward grant gap, and a genuinely useful catch: it means the
implicit-grant assumption this app has been making since
`002_password_reset.sql` (new tables inherit `keepbooks_app`'s
privileges from `001_functions_triggers_rls.sql`'s `ALTER DEFAULT
PRIVILEGES`, no explicit `GRANT` needed) had never actually been
round-trip tested against a real Supabase project before now —
`user_client_views` is the first *new table* this app has shipped
that a real user's real traffic touched immediately after deploy. The
exact reason the implicit grant didn't apply here wasn't fully
isolated (a real Supabase project can have more than one Postgres
role in play across the dashboard SQL editor, a pooled connection,
and a migration script — `ALTER DEFAULT PRIVILEGES` only ever binds
to the one role that ran it, and confirming which role that actually
was on this specific project isn't something reachable from this
sandbox) — rather than keep chasing it, the fix is unconditional.

- `db/sql/016_user_client_views_grant.sql`: an explicit `GRANT
  SELECT, INSERT, UPDATE, DELETE ON user_client_views TO
  keepbooks_app`. New file, not an edit to 015 — 015 was already
  applied (and tracked in `_sql_migrations_applied`) on the real
  project by the time this was reported, so editing it in place would
  never have re-run there; `db:migrate`'s per-file tracking is exactly
  why a fix has to land as a new file (same reasoning as every other
  `_sql_migrations_applied`-tracked file in this app). Verified
  locally by deliberately `REVOKE`ing the grant, confirming the exact
  failure mode reproduces (`permission denied for table
  user_client_views`, Postgres code `42501`), then confirming the new
  migration file fixes it.
- Left `002_password_reset.sql`'s table alone — no live evidence it's
  actually broken, and it's an already-applied file everywhere, so
  editing it wouldn't help even if it were. Worth keeping in mind as
  the same theoretical gap if it's ever reported.

**Why this was invisible without the user going and querying the
table directly**: `recordClientView()`'s caller
(`app/(app)/clients/[id]/layout.tsx`) deliberately treats it as
best-effort — a `try/catch` around a metadata write that must never
turn a page that otherwise loaded fine into a 500. That's still the
right call (an Insert failing here is not the user's problem), but
the `catch` was only doing a bare `console.error(err)` — real
information, but sitting in a server log nobody was positioned to go
read. Per the request to log or surface rather than swallow: the
catch now logs a structured, greppable record — `code`/`message`/
`detail`/`hint` (the actual fields a postgres.js error carries, not
just `.message`) alongside the `userId`/`clientId` that failed —
still never rethrown, still never blocking the page, but now an
actual diagnosis if it happens again for any other reason.

**New diagnostic**: `scripts/inspect-user-client-views-access.ts`
(`pnpm inspect-user-client-views-access -- <email>`) — since this
sandbox has no credentials for the real Supabase project and can't
reproduce a live-project-only bug directly, this script lets the
person who *does* have those credentials do it themselves in one
command: reports the table's existence/RLS/policies/grants via
`MIGRATION_DATABASE_URL`, then attempts one real `INSERT` through
`DATABASE_URL` exactly the way `recordClientView()` does it (same
`set_config('app.current_user_id', ...)` call `withUserContext()`
uses), printing the exact Postgres error if it fails. Verified
locally both ways — passes cleanly against a correctly-granted table,
and correctly surfaces `42501 permission denied` when the grant is
deliberately revoked first.

**Verified**: the local repro above (revoke → reproduce → re-grant →
confirm clean) is the actual proof this fix works, not just that it
applies without SQL errors. `pnpm test` 232/232, `tsc --noEmit` and
`pnpm build` both clean.

## Follow-up: writes now work, reads still show nothing — still open

The 016 grant fix above resolved the write side: on the real project,
`user_client_views` now has real rows (confirmed directly by the
user for both an Owner and an Encoder, both against the same client).
The sidebar's Recent Clients section still doesn't render for either
role, even after a genuine hard refresh on `/dashboard`.

Extensive code review found no bug: `getRecentClientsForUser()`'s
query is proven correct by a dedicated passing test
(`db/__tests__/user-client-views.test.ts`) that calls the exact same
function against the exact same RLS policy; the `clients` table join
target has a long-proven-working SELECT grant (every other client-
data read in this app depends on it); `app/(app)/layout.tsx` awaits
the call correctly and isn't shadowed by any other layout; no route-
segment caching config (PPR, `fetchCache`, `revalidate`) is set
anywhere in this tree; `db/client.ts`'s connection already sets
`prepare: false` against exactly the pooler-staleness failure mode
this app has hit once before (see `db/migrate.ts`'s own comment on
the same issue). Every one of these was suspected and ruled out
directly, not assumed.

Since this sandbox has no credentials for the real project and can't
reproduce a live-only symptom directly, two things shipped to
narrow it down with the next real test instead of more theorizing:

- `app/(app)/layout.tsx`: the read is now wrapped the same way the
  write already was — logs the row count unconditionally, and logs
  full Postgres error detail if it throws (previously it wasn't even
  wrapped in `try`/`catch` at all, so a throw here would have failed
  the whole page rather than just the sidebar section — worth ruling
  out explicitly too, even though the reported symptom, a page that
  otherwise renders fine, argues against it already).
- `scripts/inspect-user-client-views-access.ts`: extended with a
  third check — a live `SELECT` through `DATABASE_URL` as
  `keepbooks_app`, running the sidebar's exact query (same
  `set_config()` pattern), compared directly against the row count
  `MIGRATION_DATABASE_URL` sees (ground truth, bypasses RLS). A
  mismatch between the two would be the smoking gun; verified
  locally that the script correctly reports both a real 0-row case
  and a real matching-row case. Needs `DATABASE_URL` locally to run,
  which the user doesn't currently have set — pointed them at their
  hosting provider's environment variables as the source (the
  deployed app is clearly already using it correctly for the write
  side, so it's known-good to copy).

**Verified**: `pnpm test` 232/232, `tsc --noEmit` and `pnpm build`
both clean. The diagnostic script's new step 3 confirmed correct
locally against both a populated and an empty table.

## Pre-launch: lock down `_sql_migrations_applied`

First item off the pre-launch checklist. `_sql_migrations_applied`
(`db/migrate.ts`) tracks which hand-authored SQL files have run — pure
migration-runner bookkeeping, never something the app's own runtime
queries have any legitimate reason to touch. It's created ad-hoc
inside `migrate.ts` (`create table if not exists`), not through
drizzle's schema, so unlike every real app table it was never covered
by any `db/sql/*.sql` file's own RLS setup at all.

Checked live before writing the fix, not assumed: `keepbooks_app` had
full `INSERT`/`SELECT`/`UPDATE`/`DELETE` on it (the same
default-privilege inheritance `user_client_views` turned out not to
actually provide reliably — see the grant-fix entries above), and RLS
was never enabled. `017_lock_down_migrations_tracking_table.sql`
closes both: `ENABLE ROW LEVEL SECURITY` with zero policies (same
pattern `002_password_reset.sql` already uses — no policy means no
role without `BYPASSRLS` sees or writes anything, `keepbooks_app`
included; the schema owner's own `migrate.ts` writes are unaffected,
since owning the table is `BYPASSRLS`-equivalent), plus an explicit
`REVOKE` on top rather than relying on RLS alone — belt-and-suspenders,
the same "explicit beats implicit" reasoning `016`'s own comment gives.

**Verified locally**: before the fix, `keepbooks_app` could
`SELECT * FROM _sql_migrations_applied` directly; after, that same
query returns `permission denied for table _sql_migrations_applied`,
while the schema-owner connection `db:migrate` itself uses still reads
all 17 tracked rows without issue. `pnpm test` 232/232, `tsc --noEmit`
and `pnpm build` both clean.

## Pre-launch: client delete → archive

Pre-launch checklist item: "change client delete to archive (keep BIR
records)". There was never a client delete anywhere in the app (no UI, no
API route, no data-layer function) — `clients_delete`
(`009_team_roles_rls.sql`) existed defensively, to make DELETE
Owner-only rather than silently denied-to-everyone-by-accident. This
closes that gap for real, in `db/sql/017_client_archive_owner_only.sql`:

1. **A genuinely new `archived` status**, distinct from the pre-existing
   but never-actually-used `inactive` (`db/schema/enums.ts`). "Archived"
   now means what "deleted" would otherwise have meant: this client's
   relationship with the firm has ended, but every past
   `journal_entries`/`audit_log` row referencing it stays exactly as
   readable and intact as before — `client_id` foreign keys are already
   `ON DELETE RESTRICT`, so a real DELETE could never have guaranteed
   that anyway.

2. **`clients_delete` dropped entirely.** No role's app connection can
   delete a client now, Owner included. The old Owner-only DELETE policy
   only existed to avoid an accidental "denied to everyone" default;
   now that archive is the real, intentional path, keeping a live
   DELETE grant around serves no purpose and is one more way BIR
   history could theoretically be lost.

3. **A new BEFORE UPDATE trigger**, `enforce_client_archive_owner_only()`,
   restricting `status` transitions into or out of `'archived'` to
   `firm_admin` only. `clients_update` (009) is intentionally broader
   than that — Bookkeeper can edit a client's ordinary fields too — so
   this couldn't be a blanket "status is Owner-only" rule; it only fires
   when a transition actually touches `'archived'` on either side,
   mirroring the exact value-diff trigger pattern
   `enforce_bookkeeper_users_active_only_update`
   (`012_team_lifecycle_rls.sql`) already established for narrowing a
   broader UPDATE policy for one specific case.

4. **`lib/auth/set-client-archived.ts`** mirrors the already-proven
   `setTeamMemberActive()` shape (role check up front for a clean error
   message, Zod input validation, `withUserContext` update, raw
   Postgres errors logged but not shown verbatim) — minus the
   Supabase-Auth-session-ban step, since a client isn't an auth
   identity. Wired up via a real Next.js Server Action
   (`app/(app)/clients/[id]/actions.ts` + `useActionState`, mirroring
   `team-roster.tsx`'s `DeactivateButton` pattern exactly) — confirmed
   safe here since, unlike some other mutations in this app, archiving
   never redirects.

5. **Scope decision, deliberate**: this does NOT block new
   transaction/journal-entry entry against an archived client. The ask
   was "keep BIR records survive," not "freeze all further activity on
   an archived client" — those are different features, and nothing in
   the pre-launch checklist asked for the second one. If that's wanted
   later, it's a separate, explicit change (most likely a new RLS check
   on the write-side policies for `journal_entries` and the four
   document tables), not an implicit side effect of this one.

Also fixed while touching the clients list page: the status badge
(`app/(app)/clients/page.tsx`) was unconditionally styled
emerald/green regardless of actual status — pre-existing, harmless
until "archived" needed to visually read as different from "active".
Now color-coded per status (`active` emerald, `onboarding` amber,
`inactive`/`archived` slate).

**Verified**: a dedicated test file,
`db/__tests__/client-archive-rls.test.ts`, proves at the real
`keepbooks_app` RLS-enforcing role: Owner can archive/reactivate;
Bookkeeper cannot (even though `clients_update` otherwise lets them
edit this client) but can still edit ordinary fields; Reviewer/
Encoder/Viewer can't reach `clients_update` at all; DELETE affects
zero rows for every role including Owner; a posted journal entry's
lines and the client's own `audit_log` UPDATE row both survive
archiving unchanged; and `setClientArchived()` itself refuses a
non-Owner with a friendly message before ever touching the DB. The
pre-existing `team-roles-rls.test.ts` "clients: delete stays
Owner-only" block was renamed and rewritten to assert the new
reality (DELETE refused for Owner too) rather than the old one.
`pnpm test` 242/242, `tsc --noEmit` and `pnpm build` both clean.

## Temporary: live DB connection/RLS diagnostic page

Closes the open question from "Investigated: platform_admin rows and
all-clients visible on /settings/team" above — that entry diagnosed
`DATABASE_URL` most likely connecting as Supabase's table-owning
`postgres` role instead of the dedicated `keepbooks_app` role, but
this sandbox has no live credentials to confirm it, and the diagnostic
SQL handed over then was never confirmed run. Rather than trust code
review a second time, `/settings/platform-admins/db-check`
(`platform_admin`-gated) runs that same diagnostic live, against the
deployment's own `DATABASE_URL` connection (not
`MIGRATION_DATABASE_URL`):
`current_user`, `rolsuper`, `rolbypassrls`, and whether RLS is actually
enabled on `clients`/`users`. Expected-healthy: `keepbooks_app`,
`false`, `false`, `true`, `true`.

**Deliberately temporary** — a raw role/RLS-bypass readout has no
reason to exist in a shipping app, platform_admin-gated or not. Both
`lib/data/db-connection-diagnostic.ts` and this page should be deleted
once confirmed live; each file's own header comment says so too, in
case this entry gets missed.

**Verified locally**: ran the exact query by hand against this
sandbox's local Postgres — returns `keepbooks_app` / `f` / `f` / `t` /
`t`, matching what `withUserContext`'s existing, already-proven
connection is known to be here. `tsc --noEmit`, `pnpm test` 242/242,
`pnpm build` all clean.

### Fix: crashed on the real deployment — `pg_class.relname` isn't schema-qualified

**Reported live**: 500 on `/settings/platform-admins/db-check`, Vercel
logs showing `more than one row returned by a subquery used as an
expression`.

**Root cause**: `(select relrowsecurity from pg_class where relname =
'users')` matches on bare table name, not `schema.table` — and a real
Supabase project has `auth.users` (Supabase's own identity table)
alongside this app's `public.users`. Both match `relname = 'users'`,
so the subquery returns 2 rows instead of the ≤1 a scalar subquery
requires, and Postgres throws. Never reproduced against this
sandbox's local Postgres before now because it has no `auth` schema at
all — confirmed by adding a throwaway `auth.users` table locally,
which reproduced the exact reported error, then removing it once the
fix was verified.

**Fix**: both `clients` and `users` lookups now resolve via
`to_regclass('public.clients')` / `to_regclass('public.users')` —
`to_regclass` takes a schema-qualified name and returns exactly one
OID (or `NULL` if the object doesn't exist), so it can never match
more than one relation regardless of what else in the database shares
the bare table name.

**Verified**: reproduced the crash locally (same technique as above:
added `auth.users`, ran the original unscoped query, got the identical
`more than one row` error), then confirmed the `to_regclass`-based
query returns the correct single row against that same simulated
collision. `tsc --noEmit`, `pnpm test` 242/242, `pnpm build` all
clean.

## Trial & Plan Limits, foundation: schema, getPlanLimits(), DB enforcement

Next phase after Team & Roles. This PR is the foundation layer only —
client/user count limits and per-client-assignment gating, enforced at
the database level, not just hidden in the UI. Two deliberately
separate follow-ups, not built here: (1) the day-8 trial-expiry flag
plus the actual downgrade action (auto-pick 3 clients to stay active,
deactivate excess staff, reuse the Team & Roles deactivate/reactivate
mechanism), and (2) platform admin's manual "extend trial" / "change
plan" controls. Both need this foundation to exist first.

**Two decisions confirmed with you before writing any code** (asked
directly, not assumed):
1. The day-8 transition is **flag + manual**, not automatic — no
   existing cron/scheduled-job infrastructure in this app at all (no
   `vercel.json`, nothing), so "automatic" would have meant either
   building that from scratch or (the actual plan for the next PR)
   reusing the same lazy-check-on-request pattern every other
   time-based feature here already uses (BIR deadlines widget,
   activity health) — just for a flag, not the full downgrade, until
   you've watched it run correctly a few times.
2. Existing firms (no trial-start date on record) get backfilled as a
   **fresh 7-day trial starting today**, not backdated to their own
   `createdAt` — nobody loses access the moment this ships.

**Schema** (`db/schema/firms.ts`): `plan` (`firmPlanEnum`: trial/free/
basic/premium/enterprise), `maxClients`, `maxUsers`,
`perClientAssignmentAllowed`, `trialEndsAt`, `trialExpiredFlaggedAt`.
Deliberately NOT a plan-name-keyed lookup table read at enforcement
time — the actual numbers live on the firm's own row, so
`getPlanLimits()` (`lib/billing/plan-limits.ts`) and
`018_plan_limits.sql`'s triggers check the *exact same values*, and
an `enterprise` firm's hand-set custom limits (no fixed tier — "no
self-serve signup needed yet") just work without a separate override
mechanism. `PLAN_DEFAULTS` only matters when *assigning* a firm to a
tier (new signup → trial; platform admin's future "change plan"
action), never at read/enforcement time.

**`lib/billing/plan-limits.ts`**: `PLAN_DEFAULTS` matching the agreed
structure exactly (free 3/1/no-assignment, trial 10/5/assignment,
basic 10/2/no-assignment, premium 30/10/assignment), `TRIAL_DURATION_
DAYS = 7`, `getPlanLimits(firm)` — a one-line passthrough reading the
firm row's own columns.

**`db/sql/018_plan_limits.sql`** — three triggers:
1. `enforce_client_plan_limit()` — BEFORE INSERT OR UPDATE ON clients.
   Counts rows with `status IN ('onboarding','active')` against
   `firms.max_clients`. The UPDATE half only re-fires when a row is
   newly entering that counted set (was archived/inactive, now
   onboarding/active) — an ordinary edit to an already-active client
   never re-triggers it. Nothing in the app transitions a client OUT
   of 'inactive' yet (see 017's own comment — that status has been
   unused since it was added), so this half has no real caller today;
   it exists now so the trial-expiry downgrade work has a proven
   backstop to build against, not a promise to add later.
2. `enforce_user_plan_limit()` — same shape, for `users`, counting
   `active = true AND role != 'client_user'`. `platform_admin`
   (`firm_id IS NULL`) and `client_user` (a client-portal login, not a
   firm staff seat — no client portal exists yet) never count.
   Reactivating a deactivated member re-checks the limit (the
   "already counted" skip only applies when `OLD.active` was already
   true) — exactly the gate a firm upgrading out of a downgrade needs:
   raise the limit first, then reactivate.
3. `enforce_per_client_assignment_allowed()` — BEFORE INSERT OR UPDATE
   ON users, but deliberately scoped to `role = 'bookkeeper'` only,
   not every role. Encoder/Reviewer/Viewer are already permanently
   `access_scope = 'assigned'`, enforced by
   `013_role_access_scope_check.sql`'s CHECK constraint — a rule that
   predates this feature and has nothing to do with plan tier.
   Bookkeeper is the only role where 'all' vs 'assigned' is a genuine,
   currently-optional choice (at invite time and via the team page's
   edit-assignments picker), so that's what "no per-client assignment"
   actually gates. Applying this check to every role instead would
   silently make Encoder/Reviewer/Viewer entirely uninvitable on
   Free/Basic (both `perClientAssignmentAllowed = false`) — removing
   three roles from two plans is a much bigger product decision than
   "no per-client assignment" was asked to make, so not assumed.

**Backfill**: `UPDATE firms SET trial_ends_at = now() + interval '7
days' WHERE trial_ends_at IS NULL` — column-level `DEFAULT`s already
cover `plan`/`maxClients`/`maxUsers`/`perClientAssignmentAllowed` for
existing rows (all default to trial-tier values), so only
`trial_ends_at` needed an explicit backfill.

**`lib/auth/create-firm-for-user.ts`**: new firm signups now insert
`plan: 'trial'`, `trialEndsAt: now + 7 days`, and
`...PLAN_DEFAULTS.trial` explicitly, rather than relying on column
defaults alone — the defaults exist for the migration's own backfill,
not as the single source of truth for new-signup behavior.

**Test fixture fallout**: three existing RLS test files
(`team-roles-rls.test.ts`, `team-lifecycle-rls.test.ts`,
`client-archive-rls.test.ts`) create more than 5 role fixtures per
firm and started failing against the trial-tier default (`max_users =
5`) the moment 018 applied — expected, since plan limits aren't what
those files test. Fixed by giving each of those specific test firms
generous (`enterprise`, 1000/1000) limits via `onConflictDoUpdate`
rather than `onConflictDoNothing` — a firm row left over from before
018 existed would otherwise keep its backfilled trial-tier defaults
forever across repeated local test runs.

**New tests**: `lib/__tests__/plan-limits.test.ts` (pure —
`PLAN_DEFAULTS` matches the agreed structure, `getPlanLimits()` reads
off the row rather than a lookup table) and
`db/__tests__/plan-limits-rls.test.ts` (against the real
schema-owning connection, like `acceptance.test.ts`'s immutability
tests — these are table triggers, not RLS policies, so they fire
regardless of which role is connected): Free/Basic/Premium/Enterprise
client and user limits enforced at the exact boundary; archived/
inactive clients don't count toward the limit; reactivating a client
or user re-checks the limit; an ordinary edit never re-triggers
either check; `platform_admin`/`client_user` never count as a seat;
Bookkeeper's `access_scope` gated by `perClientAssignmentAllowed`,
Encoder/Reviewer/Viewer unaffected regardless of plan; Enterprise's
custom (non-tier) numbers are what's actually enforced.

**Verified**: `pnpm test` 259/259 (242 existing + 17 new), run twice
to confirm no leaked fixture state. `tsc --noEmit` and `pnpm build`
both clean.

## Trial & Plan Limits, backend: day-8 flag, downgrade action, platform admin controls

Second layer on top of the plan-limits foundation. Backend-only —
deliberately no UI or Server Actions in this pass, so it can be tested
and reviewed in isolation before wiring up platform admin's dashboard
queue/buttons and the Owner-facing swap page (next PR).

**`lib/billing/flag-expired-trials.ts`** — `flagTrialExpiredIfNeeded(firmId)`,
called from `getCurrentUser()` on every authenticated request (the same
lazy, checked-on-request pattern the BIR deadlines widget and activity
health already use — no cron infrastructure exists in this app at all).
AWAITED, not fire-and-forget: Vercel's serverless functions can
terminate execution the moment a response is sent, so an un-awaited
promise here has no guarantee of ever completing — wrapped in try/catch
so a failure here never fails the actual request. Runs on `authDb`:
`firms` has no UPDATE policy for any firm-scoped role at all (only the
two `firms_select` policies exist), so this could never succeed through
the normal per-request connection.

**`db/sql/019_client_read_only_enforcement.sql`** — the second half of
"the rest become read-only with export still available." A new
`enforce_client_writable()` trigger, attached to all five transaction-
creating tables (`journal_entries`, `sales_invoices`, `purchases`,
`cash_receipts`, `cash_disbursements`), blocks INSERT/UPDATE for any
client whose status is `'inactive'`. Scoped to those five tables only —
structural edits (accounts, contacts, client_tax_types) aren't blocked,
since "new transaction entry" is what was asked for, not a total freeze.
Known, flagged-not-decided simplification: this also blocks recording a
reversal against an already-posted entry from a now-inactive client —
correcting historical books for a client you can't add new work for is
genuinely debatable, not resolved here either way.

**`lib/billing/downgrade-firm-to-free.ts`** — `downgradeFirmToFree(platformAdminId, firmId)`,
the actual manual action a platform admin triggers (next PR wires the
button). In one `authDb` transaction: picks the 3 most-recently-viewed
clients (across any user, via `user_client_views`, never-viewed sorting
last) to stay active/onboarding, sets the rest to `'inactive'`; moves
the firm to Free's plan/limits and clears the trial fields; deactivates
every non-Owner, non-client_user staff member; writes one explicit
`PLAN_DOWNGRADE` `audit_log` row (firms has no audit trigger of its own
— same reasoning `createFirmForUser`'s `SIGNUP` row already established).
Runs on `authDb`: `platform_admin` has no INSERT/UPDATE policy on
`clients` or `users` at all (both scoped to `app_current_firm_id()`,
always `NULL` for a platform_admin session) — a legitimate cross-tenant
operation, not a shortcut. Order within the transaction doesn't actually
matter for `018`'s triggers (every step here only ever *reduces* the
counted set), kept in the order the feature was described anyway.

**`lib/billing/swap-active-client.ts`** — `swapActiveClient(currentUser, input)`,
the Owner-facing side of "auto-pick, Owner can swap after" (confirmed
with you before building either half). Activating an `'inactive'`
client demotes whichever currently-active client has gone longest
without a view (never-viewed sorts first) — demote-then-activate in one
`withUserContext` transaction, so the firm never exceeds its plan's
client count even mid-transaction. Runs through the normal RLS-enforcing
connection, unlike every other file in `lib/billing/`: Owner already has
`UPDATE` on their own firm's clients via the existing `clients_update`
policy, so no bypass is needed or appropriate for an ordinary Owner
action.

**`lib/billing/set-firm-plan.ts`** / **`lib/billing/extend-firm-trial.ts`** —
platform admin's two manual controls, since billing isn't automated yet.
`setFirmPlan` deliberately does **not** force-shrink anything if the new
limits are below current usage — that's the specific, consequence-aware
job `downgradeFirmToFree` does; an ordinary plan change (mostly
upgrades, or correcting a mis-set plan) shouldn't silently deactivate a
paying customer's staff as a side effect. Enterprise requires explicit
`maxClients`/`maxUsers`/`perClientAssignmentAllowed` (Zod-validated) —
no fixed tier exists for it. Moving a firm onto `'trial'` (including
"give them another trial" after they'd moved off it) always starts a
fresh `TRIAL_DURATION_DAYS`-day clock from now, never carries over
whatever `trialEndsAt` happened to already be on the row.
`extendFirmTrial` refuses a non-trial firm outright (change its plan
instead), and extends from `max(trialEndsAt, now)`, not unconditionally
from `now()` — so extending an already-generous or not-yet-expired
trial is additive, never a reset backward.

Three new `audit_log` action labels (`lib/audit-log-labels.ts`):
`PLAN_DOWNGRADE`, `PLAN_CHANGE`, `TRIAL_EXTENDED`.

**New tests**: `db/__tests__/plan-limits-downgrade.test.ts` — the flag
function (fires only for an expired trial-plan firm, idempotent, never
fires early or for a non-trial firm); the read-only trigger (blocks a
new entry against an inactive client, allows one against active,
confirmed attached to all five tables via `pg_trigger`/`pg_proc`, not
just journal_entries); the full downgrade scenario (correct 3 clients
kept by recency, correct 2 made read-only, non-Owner staff deactivated,
Owner untouched, firm moved to Free's exact limits, attributable audit
row); the swap function (non-Owner refused, correct least-recently-
viewed client demoted, already-active client refused); `setFirmPlan`
(fixed tier via defaults, enterprise validation, fresh trial clock on
re-trial); `extendFirmTrial` (additive from the later of now/existing
end date, refuses non-trial firms). `pnpm test` 283/283 (259 existing +
21 new + 3 audit-label), run twice to confirm no leaked fixture state.
`tsc --noEmit` and `pnpm build` both clean — no new routes in this
backend-only pass.
