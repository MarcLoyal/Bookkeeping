import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "firm_admin",
  "bookkeeper",
  "reviewer",
  "client_user",
  // Sits above every firm — not scoped to one. users.firm_id is NULL for
  // this role (see db/schema/firms.ts). Created only via
  // scripts/create-platform-admin.ts, never through self-serve signup.
  "platform_admin",
  // Added for Team & Roles (Phase 1): drafts only, own drafts only, no
  // reports/dashboard/balances/exports — see db/sql/009_team_roles_rls.sql.
  "encoder",
  // Added alongside encoder: read-only across whatever it's scoped to
  // (reports/dashboard), no create/edit/export.
  "viewer",
]);

// A staff member's default client visibility. 'all' = every client in the
// firm (subject to role — see app_accessible_client_ids() in
// db/sql/009_team_roles_rls.sql); 'assigned' = only clients explicitly
// granted via user_client_assignments, even if that's currently none.
// Deliberately NOT inferred from "has any assignment rows" — that would
// silently widen access the moment someone's last assignment is removed,
// or a plan downgrade takes away the ability to manage assignments. Every
// firm_admin/bookkeeper/reviewer row that predates this column is
// backfilled to 'assigned' by 009's migration, preserving exactly the
// access they already had (assignment was mandatory before this column
// existed) — new members default to 'all' going forward (set in
// application code at invite-acceptance time, not by this column
// default, which only covers rows inserted without specifying it, e.g.
// dev seed scripts) — EXCEPT Viewer, which always defaults to
// 'assigned' even with zero clients picked (see
// lib/auth/create-team-member.ts): a read-only role has no business
// defaulting to every client in the firm just because it can't write
// anything.
export const accessScopeEnum = pgEnum("access_scope", ["all", "assigned"]);

export const taxpayerTypeEnum = pgEnum("taxpayer_type", [
  "individual",
  "corporation",
  "partnership",
  "sole_prop",
  "professional",
]);

export const vatStatusEnum = pgEnum("vat_status", ["vat", "non_vat", "vat_exempt"]);

export const incomeTaxRegimeEnum = pgEnum("income_tax_regime", [
  "graduated_itemized",
  "graduated_osd",
  "eight_percent",
  "rcit",
  "mcit_applicable",
]);

export const accountingMethodEnum = pgEnum("accounting_method", ["accrual", "cash"]);

export const booksTypeEnum = pgEnum("books_type", ["manual", "loose_leaf", "cas"]);

export const clientStatusEnum = pgEnum("client_status", ["onboarding", "active", "inactive"]);

export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
]);

export const normalBalanceEnum = pgEnum("normal_balance", ["debit", "credit"]);

export const journalBookEnum = pgEnum("journal_book", ["GJ", "CRB", "CDB", "SJ", "PJ"]);

export const entryStatusEnum = pgEnum("entry_status", ["draft", "posted", "reversed"]);

export const contactTypeEnum = pgEnum("contact_type", [
  "customer",
  "supplier",
  "both",
  "employee",
]);

export const invoiceTypeEnum = pgEnum("invoice_type", ["invoice", "official_receipt"]);

export const salesStatusEnum = pgEnum("sales_status", [
  "billed",
  "collected",
  "partially_collected",
  "uncollected",
]);

export const purchaseClassificationEnum = pgEnum("purchase_classification", [
  "capital_goods",
  "goods_other_than_capital",
  "services",
  "domestic_purchase_not_qualified",
  "importation",
]);

export const filingFrequencyEnum = pgEnum("filing_frequency", ["monthly", "quarterly", "annual"]);

// Daily/weekly rates need attendance/timekeeping data this app doesn't
// track (no-work-no-pay would otherwise silently compute wrong amounts) —
// deliberately not offered, see DECISIONS.md "Payroll subsystem".
export const payFrequencyEnum = pgEnum("pay_frequency", ["monthly", "semi_monthly"]);

// "regular" = an ordinary period's payroll. "thirteenth_month" = the
// year-end mandatory 13th month pay run (PD 851), computed and taxed
// differently from a regular period — see lib/tax/payslip.ts.
export const payrollRunTypeEnum = pgEnum("payroll_run_type", ["regular", "thirteenth_month"]);

// How a firm's owner (its first firm_admin) actually signed up — set once
// at account creation (lib/auth/signup.ts / app/onboarding/firm/actions.ts)
// and never changed. NULL for rows that predate this column (demo seed
// data, platform admins) or aren't a firm's owner at all.
export const signupMethodEnum = pgEnum("signup_method", ["email", "google"]);
