import { describe, expect, it } from "vitest";
import { computePayslip, type PayslipInput } from "../payslip";
import { ANNUAL_WITHHOLDING_TAX_BRACKETS_2023 } from "../withholding-compensation";
import { centavos } from "../../money";

const SSS_FLAT_BRACKET = [
  { minSalaryCentavos: 0n, maxSalaryCentavos: null, employeeShareCentavos: centavos(900_00), employerShareCentavos: centavos(1_900_00), ecEmployerShareCentavos: centavos(30_00) },
];

function baseInput(overrides: Partial<PayslipInput> = {}): PayslipInput {
  return {
    payFrequency: "monthly",
    basicPayCentavos: centavos(20_000_00),
    overtimePayCentavos: 0n,
    otherTaxableEarningsCentavos: 0n,
    deMinimisCentavos: centavos(1_000_00),
    thirteenthMonthPayCentavos: 0n,
    isMinimumWageEarner: false,
    sssBrackets: SSS_FLAT_BRACKET,
    philhealth: { rateNumerator: 5n, rateDenominator: 100n, floorCentavos: centavos(10_000_00), ceilingCentavos: centavos(100_000_00) },
    pagibig: { employeeRateNumerator: 1n, employeeRateDenominator: 100n, employerRateNumerator: 2n, employerRateDenominator: 100n, capCentavos: centavos(10_000_00) },
    withholdingBrackets: ANNUAL_WITHHOLDING_TAX_BRACKETS_2023,
    ...overrides,
  };
}

describe("computePayslip", () => {
  it("computes a payslip below the withholding threshold", () => {
    const result = computePayslip(baseInput());
    // SSS 900 + PhilHealth (5% of 20,000 = 1,000, split 500) + Pag-IBIG (1% of 10,000 cap = 100) = 1,500 employee-side.
    expect(result.sssEmployeeCentavos).toBe(centavos(900_00));
    expect(result.philhealthEmployeeCentavos).toBe(centavos(500_00));
    expect(result.pagibigEmployeeCentavos).toBe(centavos(100_00));
    // Taxable = 20,000 - 1,500 = 18,500; annualized 222,000 is under the 250,000 exempt threshold.
    expect(result.grossTaxableIncomeCentavos).toBe(centavos(18_500_00));
    expect(result.withholdingTaxCentavos).toBe(0n);
    // Net = 20,000 + 1,000 de minimis - 1,500 contributions - 0 tax.
    expect(result.netPayCentavos).toBe(centavos(19_500_00));
  });

  it("computes a payslip above the withholding threshold", () => {
    const result = computePayslip(baseInput({ basicPayCentavos: centavos(35_000_00), deMinimisCentavos: 0n }));
    // PhilHealth 5% of 35,000 = 1,750 (875 EE); Pag-IBIG capped at 10,000 -> 100 EE; SSS flat 900 EE. Total 1,875.
    const employeeContributions = centavos(900_00) + centavos(875_00) + centavos(100_00);
    expect(result.sssEmployeeCentavos + result.philhealthEmployeeCentavos + result.pagibigEmployeeCentavos).toBe(employeeContributions);
    // Taxable = 35,000 - 1,875 = 33,125; annualized 397,500 -> bracket 15% over 250,000 = 22,125/yr -> 1,843.75/month.
    expect(result.grossTaxableIncomeCentavos).toBe(centavos(33_125_00));
    expect(result.withholdingTaxCentavos).toBe(centavos(1_843_75));
    expect(result.netPayCentavos).toBe(centavos(35_000_00) - employeeContributions - centavos(1_843_75));
  });

  it("bypasses withholding tax entirely for a minimum wage earner", () => {
    const result = computePayslip(baseInput({ basicPayCentavos: centavos(35_000_00), deMinimisCentavos: 0n, isMinimumWageEarner: true }));
    expect(result.withholdingTaxCentavos).toBe(0n);
    // Still owes SSS/PhilHealth/Pag-IBIG — MWE exemption is income-tax-only.
    expect(result.sssEmployeeCentavos).toBe(centavos(900_00));
  });

  it("computes a 13th-month-pay run: no statutory contributions, exemption up to ₱90,000", () => {
    const result = computePayslip(
      baseInput({
        basicPayCentavos: 0n,
        deMinimisCentavos: 0n,
        thirteenthMonthPayCentavos: centavos(120_000_00),
      })
    );
    expect(result.sssEmployeeCentavos).toBe(0n);
    expect(result.philhealthEmployeeCentavos).toBe(0n);
    expect(result.pagibigEmployeeCentavos).toBe(0n);
    // Only the 30,000 excess over the 90,000 ceiling is taxable; annualized 360,000 -> same bracket as the 30,000/month test -> 1,375 tax.
    expect(result.grossTaxableIncomeCentavos).toBe(centavos(30_000_00));
    expect(result.withholdingTaxCentavos).toBe(centavos(1_375_00));
    expect(result.netPayCentavos).toBe(centavos(120_000_00) - centavos(1_375_00));
  });
});
