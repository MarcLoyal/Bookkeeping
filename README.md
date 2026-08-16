# Keep.Books

A Philippine bookkeeping-services SaaS platform. This build covers **Phase 0
(Foundation)** and **Phase 1 (Ledger + Books)** only, per SPEC.md — sign up,
manage clients with proven tenant isolation, encode a month of transactions,
and print a compliant loose-leaf General Ledger and a balanced Trial
Balance. Later phases (AI capture, tax engine/BIR forms, attachments,
year-end pack, client portal) are not built yet.

See **[DECISIONS.md](./DECISIONS.md)** for every assumption and deviation
from the spec made along the way — most notably: this sandbox has no real
Supabase project, so a local Postgres + a small JWT-cookie auth shim stand
in for Supabase Postgres + Supabase Auth. The data model, RLS policies, and
DB triggers are otherwise exactly what SPEC.md asks for.

## Non-negotiable engineering rules, and where they live

| Rule | Where |
|---|---|
| Money is never a float | `lib/money.ts` — `bigint` centavos, half-up rounding once at computation |
| Double-entry enforced at the DB level | `db/sql/001_functions_triggers_rls.sql` — `check_journal_entry_balance_on_post` / `check_journal_lines_balance` triggers |
| Posted entries are immutable; corrections via reversal | same file — `enforce_journal_entry_immutability` / `enforce_journal_line_immutability`; `lib/data/post-transaction.ts#reverseJournalEntry` |
| Every mutation is audit-logged | same file — `audit_row_change()` trigger, attached to every mutable table |
| Periods can be locked | same file — `enforce_period_lock` trigger; `periodLocks` table |
| Tax rates/thresholds live in `tax_rules`, never hardcoded | `db/schema/tax_rules.ts`, seeded by `db/seed.ts`; `lib/data/tax-rules.ts#getCurrentTaxRule` |
| Multi-tenant isolation via RLS | same SQL file, §7; proven by acceptance test #6 |
| AI extraction never posts directly | Phase 2, not built yet |
| Tax-return figures traceable to source transactions | Phase 3+, not built yet |

Pure, DB-free business logic lives in `lib/accounting/` (posting, reversal,
reports, loose-leaf pagination) — no framework or DB imports, unit-testable
in isolation.

## Getting started

Prerequisites: Node 20+, pnpm, a local Postgres 16 you can create two roles
and a database in.

```bash
pnpm install
cp .env.example .env.local   # then fill in DATABASE_URL / MIGRATION_DATABASE_URL / AUTH_SECRET
pnpm db:migrate               # drizzle-kit table migrations + hand-authored SQL (triggers/RLS)
pnpm seed                     # one firm, 3 users, 2 demo clients with ~120+ transactions each
pnpm dev
```

Demo logins (password `password123` for all): `admin@keepbooks.demo`
(firm_admin), `bookkeeper@keepbooks.demo`, `reviewer@keepbooks.demo`.

## Scripts

```bash
pnpm dev            # dev server
pnpm build           # production build
pnpm start           # production server (build first)
pnpm lint            # eslint
pnpm db:generate     # regenerate drizzle-kit migrations after a schema change
pnpm db:migrate      # apply table migrations, then db/sql/001_functions_triggers_rls.sql
pnpm seed            # idempotent — re-running is safe, early-exits if already seeded
pnpm test            # fast unit tests (Vitest) — no server, no browser required
pnpm test:e2e        # Playwright-backed acceptance test #10 (loose-leaf PDF) — needs the app server running
```

## Acceptance tests (spec §9)

`pnpm test` runs `db/__tests__/acceptance.test.ts` against a real local
Postgres (needs `pnpm db:migrate && pnpm seed` first) and covers acceptance
tests #1–#6, #9, and #12 — DB-level unbalanced-entry rejection, Trial
Balance/Balance Sheet correctness against the real ≥100-transaction seeded
dataset, posted-entry immutability + correctly-linked reversal, period-lock
rejection, RLS tenant isolation, the `0.12`/`12%`/`1.12` grep, and money
round-trip precision. Acceptance test #10 (loose-leaf GL PDF, 3-month range)
needs a running app server and lives in `e2e/loose-leaf-books.test.ts` —
`pnpm build && pnpm start` (or `pnpm dev`) in one terminal, `pnpm test:e2e`
in another. Tests #7, #8, #11 are Phase 2/3 (tax engine, AI extraction) and
not applicable yet — see DECISIONS.md.

## Deliverable walkthrough

**Phase 0**: log in → `/clients` → create a client → see it in the list.
Tenant isolation is proven automatically by acceptance test #6, not just
manually.

**Phase 1**: pick a client → *Chart of Accounts* / *Contacts* are pre-seeded
→ *Transactions* → *New* → encode a Sales Invoice / Purchase / Cash
Receipt / Cash Disbursement / General Journal entry → it posts atomically
(draft → balanced lines → gapless entry number → posted), all re-verified
by DB triggers regardless of what the app layer already checked → *Books*
tab for the loose-leaf General Journal / General Ledger / Cash Receipts /
Cash Disbursements / Sales Journal / Purchase Journal, each with a
*Download PDF* → *Reports* tab for Trial Balance / Income Statement /
Balance Sheet, printable the same way.
