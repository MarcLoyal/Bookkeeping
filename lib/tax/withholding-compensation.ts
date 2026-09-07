import { applyRate, centavos, roundHalfUp, type Centavos } from "../money";

/**
 * Graduated withholding tax on compensation — Sec. 24(A)(2)(a) of the NIRC,
 * as amended by RA 10963 (TRAIN Law), rates effective January 1, 2023 (the
 * second-tranche schedule TRAIN itself wrote into the law, not a later
 * circular). One frequency-agnostic ANNUAL schedule: computeWithholdingTax
 * below annualizes a period's taxable compensation, looks up the bracket,
 * then de-annualizes the resulting tax — mathematically equivalent to BIR's
 * separate per-frequency withholding tables (RR 11-2018) without needing to
 * seed and maintain one table per pay frequency.
 *
 * Brackets omit personal/additional exemptions on purpose: TRAIN removed
 * them from Sec. 24(A) entirely. Withholding runs off gross taxable
 * compensation alone.
 */
export type WithholdingTaxBracket = {
  minAnnualCompensationCentavos: Centavos;
  /** null = top bracket, no upper bound. */
  maxAnnualCompensationCentavos: Centavos | null;
  baseTaxCentavos: Centavos;
  excessRateNumerator: bigint;
  excessRateDenominator: bigint;
};

export type PayFrequency = "monthly" | "semi_monthly";

export const PERIODS_PER_YEAR: Record<PayFrequency, bigint> = {
  monthly: 12n,
  semi_monthly: 24n,
};

export class NoMatchingWithholdingBracketError extends Error {
  constructor(annualizedCentavos: Centavos) {
    super(`No withholding tax bracket configured covers annualized compensation ${annualizedCentavos}. Verify withholding_tax_brackets has full, non-overlapping, gap-free coverage.`);
    this.name = "NoMatchingWithholdingBracketError";
  }
}

/**
 * Computes the withholding tax due for one pay period, given that period's
 * TAXABLE compensation (gross earnings less mandatory SSS/PhilHealth/
 * Pag-IBIG employee shares and de minimis benefits — see lib/tax/payslip.ts
 * for that exclusion; do not pass gross pay here). Minimum-wage-earner
 * exemption (full exemption under Sec. 24(A)(2)(a), attested per-employee)
 * is also the caller's responsibility to check before calling this.
 */
export function computeWithholdingTax(
  periodTaxableCompensationCentavos: Centavos,
  payFrequency: PayFrequency,
  brackets: WithholdingTaxBracket[]
): Centavos {
  if (periodTaxableCompensationCentavos <= 0n) return 0n;
  const periods = PERIODS_PER_YEAR[payFrequency];
  const annualized = periodTaxableCompensationCentavos * periods;
  const bracket = brackets.find(
    (b) =>
      annualized >= b.minAnnualCompensationCentavos &&
      (b.maxAnnualCompensationCentavos === null || annualized <= b.maxAnnualCompensationCentavos)
  );
  if (!bracket) throw new NoMatchingWithholdingBracketError(annualized);
  const excessCentavos = annualized - bracket.minAnnualCompensationCentavos;
  const excessTaxCentavos = applyRate(excessCentavos, bracket.excessRateNumerator, bracket.excessRateDenominator);
  const annualTaxCentavos = bracket.baseTaxCentavos + excessTaxCentavos;
  return roundHalfUp(annualTaxCentavos, periods);
}

/**
 * The annual schedule itself, for db/seed.ts. Unlike SSS (a frequently
 * revised circular schedule this app deliberately ships empty, see
 * DECISIONS.md), this is written into RA 10963 itself and has been stable
 * since Jan 1, 2023 — confident enough to seed, but still flagged
 * unverified (lastVerifiedAt left null) until a CPA confirms it, same as
 * every other seeded rate in this codebase.
 */
function pesos(amount: number): Centavos {
  return centavos(amount * 100);
}

export const ANNUAL_WITHHOLDING_TAX_BRACKETS_2023: WithholdingTaxBracket[] = [
  { minAnnualCompensationCentavos: pesos(0), maxAnnualCompensationCentavos: pesos(250_000), baseTaxCentavos: pesos(0), excessRateNumerator: 0n, excessRateDenominator: 100n },
  { minAnnualCompensationCentavos: pesos(250_000), maxAnnualCompensationCentavos: pesos(400_000), baseTaxCentavos: pesos(0), excessRateNumerator: 15n, excessRateDenominator: 100n },
  { minAnnualCompensationCentavos: pesos(400_000), maxAnnualCompensationCentavos: pesos(800_000), baseTaxCentavos: pesos(22_500), excessRateNumerator: 20n, excessRateDenominator: 100n },
  { minAnnualCompensationCentavos: pesos(800_000), maxAnnualCompensationCentavos: pesos(2_000_000), baseTaxCentavos: pesos(102_500), excessRateNumerator: 25n, excessRateDenominator: 100n },
  { minAnnualCompensationCentavos: pesos(2_000_000), maxAnnualCompensationCentavos: pesos(8_000_000), baseTaxCentavos: pesos(402_500), excessRateNumerator: 30n, excessRateDenominator: 100n },
  { minAnnualCompensationCentavos: pesos(8_000_000), maxAnnualCompensationCentavos: null, baseTaxCentavos: pesos(2_202_500), excessRateNumerator: 35n, excessRateDenominator: 100n },
];
