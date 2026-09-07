import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { contacts, employees, payrollRuns, payslips, sssContributionBrackets, withholdingTaxBrackets } from "@/db/schema";
import { parseRateFraction, pesosToCentavos, type Centavos } from "@/lib/money";
import { getCurrentTaxRule } from "./tax-rules";
import { postPayrollRun as postPayrollRunEntry, type PayrollPayslipInput } from "./post-transaction";
import { computePayslip } from "@/lib/tax/payslip";
import type { SssContributionBracket } from "@/lib/tax/statutory-contributions";
import type { PayFrequency, WithholdingTaxBracket } from "@/lib/tax/withholding-compensation";

export async function listEmployees(userId: string, clientId: string) {
  return withUserContext(userId, (tx) =>
    tx
      .select({
        id: employees.id,
        clientId: employees.clientId,
        contactId: employees.contactId,
        registeredName: contacts.registeredName,
        tin: contacts.tin,
        employeeNo: employees.employeeNo,
        position: employees.position,
        payFrequency: employees.payFrequency,
        basicPayCentavos: employees.basicPayCentavos,
        isMinimumWageEarner: employees.isMinimumWageEarner,
        dateHired: employees.dateHired,
        dateSeparated: employees.dateSeparated,
      })
      .from(employees)
      .innerJoin(contacts, eq(employees.contactId, contacts.id))
      .where(eq(employees.clientId, clientId))
      .orderBy(asc(contacts.registeredName))
  );
}

export async function getEmployee(userId: string, clientId: string, employeeId: string) {
  return withUserContext(userId, async (tx) => {
    const [row] = await tx
      .select({
        id: employees.id,
        clientId: employees.clientId,
        contactId: employees.contactId,
        registeredName: contacts.registeredName,
        tin: contacts.tin,
        address: contacts.address,
        employeeNo: employees.employeeNo,
        sssNo: employees.sssNo,
        philhealthNo: employees.philhealthNo,
        pagibigNo: employees.pagibigNo,
        position: employees.position,
        payFrequency: employees.payFrequency,
        basicPayCentavos: employees.basicPayCentavos,
        isMinimumWageEarner: employees.isMinimumWageEarner,
        dateHired: employees.dateHired,
        dateSeparated: employees.dateSeparated,
      })
      .from(employees)
      .innerJoin(contacts, eq(employees.contactId, contacts.id))
      .where(and(eq(employees.clientId, clientId), eq(employees.id, employeeId)));
    return row ?? null;
  });
}

export type NewEmployeeInput = {
  clientId: string;
  registeredName: string;
  tin?: string;
  address?: string;
  employeeNo?: string;
  sssNo?: string;
  philhealthNo?: string;
  pagibigNo?: string;
  position?: string;
  payFrequency: "monthly" | "semi_monthly";
  basicPayCentavos: Centavos;
  isMinimumWageEarner: boolean;
  dateHired: string;
};

/** Creates the identity contact (type 'employee') and the payroll-specific employees row together — see db/schema/payroll.ts for why they're split. */
export async function createEmployee(userId: string, input: NewEmployeeInput) {
  return withUserContext(userId, async (tx) => {
    const contactId = crypto.randomUUID();
    await tx.insert(contacts).values({
      id: contactId,
      clientId: input.clientId,
      type: "employee",
      registeredName: input.registeredName,
      tin: input.tin || null,
      address: input.address || null,
    });

    const employeeId = crypto.randomUUID();
    await tx.insert(employees).values({
      id: employeeId,
      clientId: input.clientId,
      contactId,
      employeeNo: input.employeeNo || null,
      sssNo: input.sssNo || null,
      philhealthNo: input.philhealthNo || null,
      pagibigNo: input.pagibigNo || null,
      position: input.position || null,
      payFrequency: input.payFrequency,
      basicPayCentavos: input.basicPayCentavos,
      isMinimumWageEarner: input.isMinimumWageEarner ? "yes" : "no",
      dateHired: input.dateHired,
    });

    return { id: employeeId };
  });
}

/** SSS's bracket schedule as of `asOfDate` — this app ships it empty; the bookkeeper maintains it (see DECISIONS.md). */
export async function getActiveSssBrackets(userId: string, asOfDate: string): Promise<SssContributionBracket[]> {
  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select()
      .from(sssContributionBrackets)
      .where(
        and(
          lte(sssContributionBrackets.effectiveFrom, asOfDate),
          or(isNull(sssContributionBrackets.effectiveTo), gte(sssContributionBrackets.effectiveTo, asOfDate))
        )
      )
      .orderBy(asc(sssContributionBrackets.minSalaryCentavos));
    return rows.map((r) => ({
      minSalaryCentavos: r.minSalaryCentavos,
      maxSalaryCentavos: r.maxSalaryCentavos,
      employeeShareCentavos: r.employeeShareCentavos,
      employerShareCentavos: r.employerShareCentavos,
      ecEmployerShareCentavos: r.ecEmployerShareCentavos,
    }));
  });
}

/** Every sss_contribution_brackets row, for the admin listing — mirrors listTaxRules. */
export async function listSssBrackets(userId: string) {
  return withUserContext(userId, (tx) =>
    tx.select().from(sssContributionBrackets).orderBy(asc(sssContributionBrackets.effectiveFrom), asc(sssContributionBrackets.minSalaryCentavos))
  );
}

export type NewSssBracketInput = {
  minSalaryCentavos: Centavos;
  maxSalaryCentavos: Centavos | null;
  employeeShareCentavos: Centavos;
  employerShareCentavos: Centavos;
  ecEmployerShareCentavos: Centavos;
  effectiveFrom: string;
  notes?: string;
};

/** Adds a new SSS bracket row — firm_admin only (enforced by the caller/page). Never edits/deletes an existing row, same reasoning as createTaxRule. */
export async function createSssBracket(userId: string, input: NewSssBracketInput) {
  return withUserContext(userId, async (tx) => {
    await tx.insert(sssContributionBrackets).values({
      minSalaryCentavos: input.minSalaryCentavos,
      maxSalaryCentavos: input.maxSalaryCentavos,
      employeeShareCentavos: input.employeeShareCentavos,
      employerShareCentavos: input.employerShareCentavos,
      ecEmployerShareCentavos: input.ecEmployerShareCentavos,
      effectiveFrom: input.effectiveFrom,
      notes: input.notes || "",
    });
  });
}

/** The annual graduated withholding tax schedule as of `asOfDate` (seeded — see lib/tax/withholding-compensation.ts). */
export async function getActiveWithholdingBrackets(userId: string, asOfDate: string): Promise<WithholdingTaxBracket[]> {
  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select()
      .from(withholdingTaxBrackets)
      .where(
        and(
          lte(withholdingTaxBrackets.effectiveFrom, asOfDate),
          or(isNull(withholdingTaxBrackets.effectiveTo), gte(withholdingTaxBrackets.effectiveTo, asOfDate))
        )
      )
      .orderBy(asc(withholdingTaxBrackets.minAnnualCompensationCentavos));
    return rows.map((r) => {
      const { numerator, denominator } = parseRateFraction(r.excessRate);
      return {
        minAnnualCompensationCentavos: r.minAnnualCompensationCentavos,
        maxAnnualCompensationCentavos: r.maxAnnualCompensationCentavos,
        baseTaxCentavos: r.baseTaxCentavos,
        excessRateNumerator: numerator,
        excessRateDenominator: denominator,
      };
    });
  });
}

export class MissingStatutoryRateError extends Error {
  constructor(key: string) {
    super(`Tax Rules is missing "${key}" as of this pay date — set it in Settings → Tax Rules before running payroll.`);
    this.name = "MissingStatutoryRateError";
  }
}

async function requireTaxRule(userId: string, key: string, asOfDate: string): Promise<string> {
  const value = await getCurrentTaxRule(userId, key, asOfDate);
  if (value === null) throw new MissingStatutoryRateError(key);
  return value;
}

export type PhilhealthPagibigRates = {
  philhealth: { rateNumerator: bigint; rateDenominator: bigint; floorCentavos: Centavos; ceilingCentavos: Centavos };
  pagibig: {
    employeeRateNumerator: bigint;
    employeeRateDenominator: bigint;
    employerRateNumerator: bigint;
    employerRateDenominator: bigint;
    capCentavos: Centavos;
  };
};

/** PhilHealth and Pag-IBIG fit the existing tax_rules key/value table as flat rates + floor/ceiling — no bracket table needed. Ships empty; the bookkeeper maintains these keys (see DECISIONS.md). Throws rather than silently computing a zero deduction if anything is missing. */
export async function getPhilhealthPagibigRates(userId: string, asOfDate: string): Promise<PhilhealthPagibigRates> {
  const [philhealthRate, philhealthFloor, philhealthCeiling, pagibigRateEe, pagibigRateEr, pagibigCap] = await Promise.all([
    requireTaxRule(userId, "philhealth_rate", asOfDate),
    requireTaxRule(userId, "philhealth_salary_floor", asOfDate),
    requireTaxRule(userId, "philhealth_salary_ceiling", asOfDate),
    requireTaxRule(userId, "pagibig_rate_ee", asOfDate),
    requireTaxRule(userId, "pagibig_rate_er", asOfDate),
    requireTaxRule(userId, "pagibig_salary_cap", asOfDate),
  ]);
  const philhealthRateFraction = parseRateFraction(philhealthRate);
  const pagibigEeFraction = parseRateFraction(pagibigRateEe);
  const pagibigErFraction = parseRateFraction(pagibigRateEr);
  return {
    philhealth: {
      rateNumerator: philhealthRateFraction.numerator,
      rateDenominator: philhealthRateFraction.denominator,
      floorCentavos: pesosStringToCentavosBigint(philhealthFloor),
      ceilingCentavos: pesosStringToCentavosBigint(philhealthCeiling),
    },
    pagibig: {
      employeeRateNumerator: pagibigEeFraction.numerator,
      employeeRateDenominator: pagibigEeFraction.denominator,
      employerRateNumerator: pagibigErFraction.numerator,
      employerRateDenominator: pagibigErFraction.denominator,
      capCentavos: pesosStringToCentavosBigint(pagibigCap),
    },
  };
}

// tax_rules.value is a plain decimal string (pesos, same convention as
// eight_percent_threshold_annual) for floor/ceiling/cap keys — parsed via
// pesosToCentavos, not parseRateFraction (that's for rates only).
function pesosStringToCentavosBigint(value: string): Centavos {
  return pesosToCentavos(value);
}

export type PayrollRunEntryInput = {
  employeeId: string;
  overtimePayCentavos?: Centavos;
  otherTaxableEarningsCentavos?: Centavos;
  deMinimisCentavos?: Centavos;
  /** thirteenth_month runs only — the computed 1/12-of-the-year's-basic-pay amount for this employee. */
  thirteenthMonthPayCentavos?: Centavos;
};

export type CreatePayrollRunInput = {
  clientId: string;
  runType: "regular" | "thirteenth_month";
  periodStart: string;
  periodEnd: string;
  payDate: string;
  entries: PayrollRunEntryInput[];
};

/**
 * Computes every employee's payslip (lib/tax/payslip.ts) using the
 * statutory tables/rates in effect as of payDate, then posts the run as one
 * aggregated journal entry (lib/data/post-transaction.ts postPayrollRun).
 * A 13th-month run zeroes out ordinary earnings (no basic pay, OT, or
 * statutory contributions that run — see db/schema/payroll.ts) regardless
 * of what the employee's regular basicPayCentavos is.
 */
export async function createPayrollRun(userId: string, input: CreatePayrollRunInput): Promise<{ runId: string; entryId: string }> {
  const employeeIds = input.entries.map((e) => e.employeeId);
  const [employeeRows, sssBrackets, withholdingBrackets, rates] = await Promise.all([
    withUserContext(userId, (tx) =>
      tx
        .select({ id: employees.id, payFrequency: employees.payFrequency, basicPayCentavos: employees.basicPayCentavos, isMinimumWageEarner: employees.isMinimumWageEarner })
        .from(employees)
        .where(and(eq(employees.clientId, input.clientId), inArray(employees.id, employeeIds)))
    ),
    getActiveSssBrackets(userId, input.payDate),
    getActiveWithholdingBrackets(userId, input.payDate),
    getPhilhealthPagibigRates(userId, input.payDate),
  ]);

  const employeeById = new Map(employeeRows.map((e) => [e.id, e]));

  const payrollPayslips: PayrollPayslipInput[] = input.entries.map((entry) => {
    const employee = employeeById.get(entry.employeeId);
    if (!employee) throw new Error(`Employee ${entry.employeeId} not found for this client`);

    const isThirteenthMonth = input.runType === "thirteenth_month";
    const result = computePayslip({
      payFrequency: employee.payFrequency as PayFrequency,
      basicPayCentavos: isThirteenthMonth ? 0n : employee.basicPayCentavos,
      overtimePayCentavos: isThirteenthMonth ? 0n : entry.overtimePayCentavos ?? 0n,
      otherTaxableEarningsCentavos: isThirteenthMonth ? 0n : entry.otherTaxableEarningsCentavos ?? 0n,
      deMinimisCentavos: isThirteenthMonth ? 0n : entry.deMinimisCentavos ?? 0n,
      thirteenthMonthPayCentavos: isThirteenthMonth ? entry.thirteenthMonthPayCentavos ?? 0n : 0n,
      isMinimumWageEarner: employee.isMinimumWageEarner === "yes",
      sssBrackets,
      philhealth: rates.philhealth,
      pagibig: rates.pagibig,
      withholdingBrackets,
    });

    return { employeeId: entry.employeeId, ...result };
  });

  return postPayrollRunEntry(userId, {
    clientId: input.clientId,
    runType: input.runType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    payDate: input.payDate,
    payslips: payrollPayslips,
  });
}

export async function listPayrollRuns(userId: string, clientId: string) {
  return withUserContext(userId, (tx) =>
    tx.select().from(payrollRuns).where(eq(payrollRuns.clientId, clientId)).orderBy(asc(payrollRuns.payDate))
  );
}

export async function getPayrollRunWithPayslips(userId: string, clientId: string, runId: string) {
  return withUserContext(userId, async (tx) => {
    const [run] = await tx.select().from(payrollRuns).where(and(eq(payrollRuns.clientId, clientId), eq(payrollRuns.id, runId)));
    if (!run) return null;
    const rows = await tx
      .select({
        id: payslips.id,
        employeeId: payslips.employeeId,
        registeredName: contacts.registeredName,
        basicPayCentavos: payslips.basicPayCentavos,
        overtimePayCentavos: payslips.overtimePayCentavos,
        otherTaxableEarningsCentavos: payslips.otherTaxableEarningsCentavos,
        deMinimisCentavos: payslips.deMinimisCentavos,
        thirteenthMonthPayCentavos: payslips.thirteenthMonthPayCentavos,
        grossTaxableIncomeCentavos: payslips.grossTaxableIncomeCentavos,
        sssEmployeeCentavos: payslips.sssEmployeeCentavos,
        sssEmployerCentavos: payslips.sssEmployerCentavos,
        philhealthEmployeeCentavos: payslips.philhealthEmployeeCentavos,
        philhealthEmployerCentavos: payslips.philhealthEmployerCentavos,
        pagibigEmployeeCentavos: payslips.pagibigEmployeeCentavos,
        pagibigEmployerCentavos: payslips.pagibigEmployerCentavos,
        withholdingTaxCentavos: payslips.withholdingTaxCentavos,
        netPayCentavos: payslips.netPayCentavos,
      })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .innerJoin(contacts, eq(employees.contactId, contacts.id))
      .where(eq(payslips.payrollRunId, runId))
      .orderBy(asc(contacts.registeredName));
    return { run, payslips: rows };
  });
}
