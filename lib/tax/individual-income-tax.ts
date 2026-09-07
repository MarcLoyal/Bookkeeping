import { applyRate, type Centavos } from "../money";
import type { WithholdingTaxBracket } from "./withholding-compensation";

/**
 * Graduated income tax for individuals (1701Q/1701A) — Sec. 24(A)(2)(a) of
 * the NIRC, as amended by RA 10963 (TRAIN Law), rates effective January 1,
 * 2023. Cross-checked against the actual 1701A/1701Q form PDFs' own printed
 * "Table 2" rate schedule, which matches exactly.
 *
 * Reuses `withholding_tax_brackets` — the SAME annual schedule the
 * compensation-withholding engine already seeds (lib/tax/
 * withholding-compensation.ts) — since it's the identical Sec. 24(A)(2)(a)
 * table, just applied directly here rather than annualized/de-annualized
 * from a shorter pay period: `taxableIncomeCentavos` passed in is already
 * the full-year (1701A) or cumulative-year-to-date (1701Q) figure, so no
 * conversion step is needed.
 */
export function computeGraduatedIncomeTax(taxableIncomeCentavos: Centavos, brackets: WithholdingTaxBracket[]): Centavos {
  if (taxableIncomeCentavos <= 0n) return 0n;
  const bracket = brackets.find(
    (b) =>
      taxableIncomeCentavos >= b.minAnnualCompensationCentavos &&
      (b.maxAnnualCompensationCentavos === null || taxableIncomeCentavos <= b.maxAnnualCompensationCentavos)
  );
  if (!bracket) return 0n; // caller's responsibility to ensure full bracket coverage; matches computeWithholdingTax's contract but degrades safely for a report-only figure rather than throwing mid-render
  const excessCentavos = taxableIncomeCentavos - bracket.minAnnualCompensationCentavos;
  const excessTaxCentavos = applyRate(excessCentavos, bracket.excessRateNumerator, bracket.excessRateDenominator);
  return bracket.baseTaxCentavos + excessTaxCentavos;
}

/**
 * Optional Standard Deduction — Sec. 34(L), NIRC as amended by RA 9504: 40%
 * of gross sales/receipts/fees (not of gross income after cost of sales —
 * the 1701Q/1701A forms both compute it as 40% of the Sales/Revenues line,
 * then separately subtract Cost of Sales/Services on top, per their own
 * printed formulas).
 */
export function computeOsd(salesCentavos: Centavos): Centavos {
  if (salesCentavos <= 0n) return 0n;
  return applyRate(salesCentavos, 40n, 100n);
}

/**
 * BIR Form 1701Q/1701A instruction: "DO NOT enter Centavos; 49 Centavos or
 * Less drop down; 50 or more round up" — i.e. round to the nearest whole
 * peso, half-up. Display-only: underlying computation stays exact in
 * centavos throughout this module and everywhere else in the app: only the
 * two form-replica components round at the point of rendering an amount box.
 */
export function roundToWholePesos(value: Centavos): Centavos {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const wholePesos = (abs + 50n) / 100n; // integer division; +50 centavos rounds half-up to the nearest peso
  const rounded = wholePesos * 100n;
  return negative ? -rounded : rounded;
}
