import { bigint, date, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { payFrequencyEnum, payrollRunTypeEnum } from "./enums";
import { clients } from "./clients";
import { contacts } from "./contacts";
import { journalEntries } from "./journal";

/**
 * Payroll-specific attributes for a contact of type 'employee'. Identity
 * (name/TIN/address) stays on `contacts`, matching how purchases/sales
 * reference a contact rather than duplicating its fields — this just adds
 * what only an employee has.
 *
 * No tax-exemption/dependents field: TRAIN (RA 10963) removed personal and
 * additional exemptions from Sec. 24(A) — today's withholding tax runs off
 * gross taxable compensation alone, not filing status.
 */
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    contactId: uuid("contact_id")
      .notNull()
      .unique()
      .references(() => contacts.id, { onDelete: "restrict" }),
    employeeNo: text("employee_no"),
    sssNo: text("sss_no"),
    philhealthNo: text("philhealth_no"),
    pagibigNo: text("pagibig_no"),
    position: text("position"),
    payFrequency: payFrequencyEnum("pay_frequency").notNull(),
    // The amount paid per regular payslip at payFrequency — not an annual or
    // monthly-equivalent rate needing conversion.
    basicPayCentavos: bigint("basic_pay_centavos", { mode: "bigint" }).notNull(),
    // Bookkeeper-attested: this app has no source for current regional
    // minimum wage orders, so MWE status (full income-tax exemption under
    // Sec. 24(A)(2)(a)) is a manual flag, not computed from a wage table.
    isMinimumWageEarner: text("is_minimum_wage_earner").notNull().default("no"), // "yes" | "no" — see purchases.ewtApplicable for why text over boolean here
    dateHired: date("date_hired").notNull(),
    dateSeparated: date("date_separated"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("employees_client_id_idx").on(t.clientId)]
);

/**
 * One payroll run per client per period (regular) or per year (13th month).
 * Mirrors sales_invoices/purchases: journalEntryId null = not yet posted;
 * once set, the run and its payslips are immutable (correction = reverse
 * the linked journal entry and record a new run — db/sql/003_payroll.sql).
 */
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    runType: payrollRunTypeEnum("run_type").notNull().default("regular"),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    payDate: date("pay_date").notNull(),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payroll_runs_client_id_idx").on(t.clientId)]
);

/**
 * One payslip per employee per run. Every computed figure is snapshotted at
 * run time (same reasoning as sales_invoices freezing its own VAT figures)
 * so a later change to an employee's rate or the statutory tables never
 * retroactively alters a historical payslip.
 */
export const payslips = pgTable(
  "payslips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    basicPayCentavos: bigint("basic_pay_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    overtimePayCentavos: bigint("overtime_pay_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    otherTaxableEarningsCentavos: bigint("other_taxable_earnings_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    // Trusted to the bookkeeper as already within the per-benefit-type RR
    // 11-2018/RMC ceilings — this app doesn't enforce those ceilings itself.
    deMinimisCentavos: bigint("de_minimis_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    // 13th-month-pay runs only (runType = 'thirteenth_month'). Exempt up to
    // ₱90,000 combined with de minimis under Sec. 32(B)(7)(e) as amended by
    // RA 10963 — see lib/tax/payslip.ts for the split.
    thirteenthMonthPayCentavos: bigint("thirteenth_month_pay_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    grossTaxableIncomeCentavos: bigint("gross_taxable_income_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    sssEmployeeCentavos: bigint("sss_employee_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    sssEmployerCentavos: bigint("sss_employer_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    philhealthEmployeeCentavos: bigint("philhealth_employee_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    philhealthEmployerCentavos: bigint("philhealth_employer_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    pagibigEmployeeCentavos: bigint("pagibig_employee_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    pagibigEmployerCentavos: bigint("pagibig_employer_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    withholdingTaxCentavos: bigint("withholding_tax_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    netPayCentavos: bigint("net_pay_centavos", { mode: "bigint" }).notNull().default(sql`0`),
  },
  (t) => [
    index("payslips_payroll_run_id_idx").on(t.payrollRunId),
    index("payslips_employee_id_idx").on(t.employeeId),
  ]
);

/**
 * SSS's own published schedule is a flat peso amount per salary bracket
 * (not a clean percentage), so — unlike PhilHealth/Pag-IBIG, which fit the
 * existing tax_rules key/value table as a flat rate + floor/ceiling — it
 * needs its own bracket table. Global reference data (not client-specific),
 * same effective-dating and CPA-verification-surfacing shape as tax_rules.
 * Ships empty: the bookkeeper maintains it, this app doesn't seed SSS's
 * frequently-revised schedule from memory (same reasoning as RDO codes).
 */
export const sssContributionBrackets = pgTable("sss_contribution_brackets", {
  id: uuid("id").primaryKey().defaultRandom(),
  minSalaryCentavos: bigint("min_salary_centavos", { mode: "bigint" }).notNull(),
  maxSalaryCentavos: bigint("max_salary_centavos", { mode: "bigint" }), // null = top bracket, no upper bound
  employeeShareCentavos: bigint("employee_share_centavos", { mode: "bigint" }).notNull(),
  employerShareCentavos: bigint("employer_share_centavos", { mode: "bigint" }).notNull(),
  ecEmployerShareCentavos: bigint("ec_employer_share_centavos", { mode: "bigint" }).notNull().default(sql`0`), // Employees' Compensation, ER-only, bundled into SSS's own schedule
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  notes: text("notes").notNull().default(""),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  lastVerifiedBy: text("last_verified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The annual graduated withholding tax schedule on compensation (Sec.
 * 24(A)(2)(a), NIRC as amended by RA 10963/TRAIN, rates effective Jan 1,
 * 2023) — a law-embedded schedule, not a revisable circular, so (unlike SSS)
 * this app DOES seed it (see db/seed.ts), flagged unverified until a CPA
 * confirms it. One frequency-agnostic table: lib/tax/withholding-
 * compensation.ts annualizes a period's pay, looks up the bracket, then
 * de-annualizes the tax — mathematically equivalent to BIR's separate
 * per-frequency tables (RR 11-2018) without seeding one per frequency.
 */
export const withholdingTaxBrackets = pgTable("withholding_tax_brackets", {
  id: uuid("id").primaryKey().defaultRandom(),
  minAnnualCompensationCentavos: bigint("min_annual_compensation_centavos", { mode: "bigint" }).notNull(),
  maxAnnualCompensationCentavos: bigint("max_annual_compensation_centavos", { mode: "bigint" }), // null = top bracket
  baseTaxCentavos: bigint("base_tax_centavos", { mode: "bigint" }).notNull(),
  excessRate: numeric("excess_rate", { precision: 20, scale: 8 }).notNull(), // exact decimal, parsed via parseRateFraction before touching centavos — never a float
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  notes: text("notes").notNull().default(""),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  lastVerifiedBy: text("last_verified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
