import { sumCentavos, type Centavos } from "../money";
import { computePagibigContribution, computePhilhealthContribution, computeSssContribution, type SssContributionBracket } from "./statutory-contributions";
import { computeWithholdingTax, type PayFrequency, type WithholdingTaxBracket } from "./withholding-compensation";
import { splitThirteenthMonthPay } from "./thirteenth-month";

export type PayslipInput = {
  payFrequency: PayFrequency;
  basicPayCentavos: Centavos;
  overtimePayCentavos: Centavos;
  otherTaxableEarningsCentavos: Centavos;
  /** Trusted to the caller as already within the per-benefit-type ceiling; excluded from taxable income entirely, never validated against a ceiling table here. */
  deMinimisCentavos: Centavos;
  /** Nonzero only on a runType='thirteenth_month' payroll run. */
  thirteenthMonthPayCentavos: Centavos;
  /** Bookkeeper-attested (employees.isMinimumWageEarner) — bypasses withholding tax entirely per Sec. 24(A)(2)(a); does not affect SSS/PhilHealth/Pag-IBIG, which MWEs still owe like any employee. */
  isMinimumWageEarner: boolean;
  sssBrackets: SssContributionBracket[];
  philhealth: { rateNumerator: bigint; rateDenominator: bigint; floorCentavos: Centavos; ceilingCentavos: Centavos };
  pagibig: {
    employeeRateNumerator: bigint;
    employeeRateDenominator: bigint;
    employerRateNumerator: bigint;
    employerRateDenominator: bigint;
    capCentavos: Centavos;
  };
  withholdingBrackets: WithholdingTaxBracket[];
};

export type PayslipResult = {
  basicPayCentavos: Centavos;
  overtimePayCentavos: Centavos;
  otherTaxableEarningsCentavos: Centavos;
  deMinimisCentavos: Centavos;
  thirteenthMonthPayCentavos: Centavos;
  /** Taxable compensation after excluding mandatory employee-side contributions (Sec. 32(B)(7)(f)) and de minimis/13th-month exemptions — the base withholding tax is actually computed on. */
  grossTaxableIncomeCentavos: Centavos;
  sssEmployeeCentavos: Centavos;
  sssEmployerCentavos: Centavos;
  philhealthEmployeeCentavos: Centavos;
  philhealthEmployerCentavos: Centavos;
  pagibigEmployeeCentavos: Centavos;
  pagibigEmployerCentavos: Centavos;
  withholdingTaxCentavos: Centavos;
  netPayCentavos: Centavos;
};

/**
 * Combines the statutory contribution, 13th-month-exemption, and
 * withholding-tax modules into one payslip. Order matters: mandatory
 * SSS/PhilHealth/Pag-IBIG employee shares and de minimis benefits are
 * excluded from taxable compensation entirely (Sec. 32(B)(7)(f) and Sec.
 * 32(B)(7)(e) NIRC as amended), not deducted after tax.
 */
export function computePayslip(input: PayslipInput): PayslipResult {
  const ordinaryGrossCentavos = sumCentavos([input.basicPayCentavos, input.overtimePayCentavos, input.otherTaxableEarningsCentavos]);

  const sss = computeSssContribution(input.basicPayCentavos, input.sssBrackets);
  const philhealth = computePhilhealthContribution(
    input.basicPayCentavos,
    input.philhealth.rateNumerator,
    input.philhealth.rateDenominator,
    input.philhealth.floorCentavos,
    input.philhealth.ceilingCentavos
  );
  const pagibig = computePagibigContribution(
    input.basicPayCentavos,
    input.pagibig.employeeRateNumerator,
    input.pagibig.employeeRateDenominator,
    input.pagibig.employerRateNumerator,
    input.pagibig.employerRateDenominator,
    input.pagibig.capCentavos
  );
  const employeeContributionsCentavos = sumCentavos([sss.employeeCentavos, philhealth.employeeCentavos, pagibig.employeeCentavos]);

  const { exemptCentavos: thirteenthMonthExemptCentavos, taxableExcessCentavos: thirteenthMonthTaxableCentavos } = splitThirteenthMonthPay(
    input.thirteenthMonthPayCentavos
  );

  const taxableCompensationCentavos = ordinaryGrossCentavos + thirteenthMonthTaxableCentavos - employeeContributionsCentavos;
  const grossTaxableIncomeCentavos = taxableCompensationCentavos > 0n ? taxableCompensationCentavos : 0n;

  const withholdingTaxCentavos = input.isMinimumWageEarner
    ? 0n
    : computeWithholdingTax(grossTaxableIncomeCentavos, input.payFrequency, input.withholdingBrackets);

  const netPayCentavos = sumCentavos([
    ordinaryGrossCentavos,
    input.deMinimisCentavos,
    thirteenthMonthExemptCentavos,
    thirteenthMonthTaxableCentavos,
    -employeeContributionsCentavos,
    -withholdingTaxCentavos,
  ]);

  return {
    basicPayCentavos: input.basicPayCentavos,
    overtimePayCentavos: input.overtimePayCentavos,
    otherTaxableEarningsCentavos: input.otherTaxableEarningsCentavos,
    deMinimisCentavos: input.deMinimisCentavos,
    thirteenthMonthPayCentavos: input.thirteenthMonthPayCentavos,
    grossTaxableIncomeCentavos,
    sssEmployeeCentavos: sss.employeeCentavos,
    sssEmployerCentavos: sss.employerCentavos,
    philhealthEmployeeCentavos: philhealth.employeeCentavos,
    philhealthEmployerCentavos: philhealth.employerCentavos,
    pagibigEmployeeCentavos: pagibig.employeeCentavos,
    pagibigEmployerCentavos: pagibig.employerCentavos,
    withholdingTaxCentavos,
    netPayCentavos,
  };
}
