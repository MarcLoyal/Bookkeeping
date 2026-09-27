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

## Known non-blocking follow-ups

- Next.js 16 deprecates `middleware.ts` in favor of `proxy.ts`; the build
  logs a deprecation warning. Not yet migrated — functionally identical for
  now, tracked as a cheap follow-up.
- Local Postgres accumulates some harmless test-residue clients from ad hoc
  manual QA during development ("Smoke Test Co." and similar) — cosmetic
  clutter in `/clients`, doesn't affect the two demo clients' data or any
  acceptance test. A fresh `db:migrate` + `seed` against a clean database
  clears it.
