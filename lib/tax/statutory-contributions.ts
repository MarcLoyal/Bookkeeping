import { applyRate, type Centavos } from "../money";

/**
 * SSS's own published schedule (RA 11199, Social Security Act of 2018,
 * rates set by SSS circular) is a flat peso amount per salary bracket, not
 * a percentage — this app doesn't seed it (frequently revised, no verified
 * source available here; see DECISIONS.md), so `brackets` always comes from
 * `sss_contribution_brackets`, maintained by the bookkeeper.
 */
export type SssContributionBracket = {
  minSalaryCentavos: Centavos;
  maxSalaryCentavos: Centavos | null;
  employeeShareCentavos: Centavos;
  employerShareCentavos: Centavos;
  ecEmployerShareCentavos: Centavos;
};

export type SssContribution = {
  employeeCentavos: Centavos;
  employerCentavos: Centavos; // includes the Employees' Compensation add-on
};

export class NoMatchingSssBracketError extends Error {
  constructor(salaryCentavos: Centavos) {
    super(`No SSS contribution bracket configured covers salary ${salaryCentavos}. Verify sss_contribution_brackets has full, non-overlapping, gap-free coverage.`);
    this.name = "NoMatchingSssBracketError";
  }
}

export function computeSssContribution(basicPayCentavos: Centavos, brackets: SssContributionBracket[]): SssContribution {
  if (basicPayCentavos <= 0n) return { employeeCentavos: 0n, employerCentavos: 0n };
  const bracket = brackets.find(
    (b) => basicPayCentavos >= b.minSalaryCentavos && (b.maxSalaryCentavos === null || basicPayCentavos <= b.maxSalaryCentavos)
  );
  if (!bracket) throw new NoMatchingSssBracketError(basicPayCentavos);
  return {
    employeeCentavos: bracket.employeeShareCentavos,
    employerCentavos: bracket.employerShareCentavos + bracket.ecEmployerShareCentavos,
  };
}

/**
 * PhilHealth premium (RA 11223, Universal Health Care Act) is a flat rate of
 * monthly basic salary within a floor/ceiling, split 50/50 between employee
 * and employer by law (Sec. 10, RA 11223 IRR) — the split itself isn't a
 * fluctuating rate, so it's fixed here rather than stored as data; the
 * premium rate and floor/ceiling ARE data (tax_rules keys
 * philhealth_rate/philhealth_salary_floor/philhealth_salary_ceiling),
 * maintained by the bookkeeper.
 */
export function computePhilhealthContribution(
  basicPayCentavos: Centavos,
  rateNumerator: bigint,
  rateDenominator: bigint,
  floorCentavos: Centavos,
  ceilingCentavos: Centavos
): { employeeCentavos: Centavos; employerCentavos: Centavos } {
  if (basicPayCentavos <= 0n) return { employeeCentavos: 0n, employerCentavos: 0n };
  const base = basicPayCentavos < floorCentavos ? floorCentavos : basicPayCentavos > ceilingCentavos ? ceilingCentavos : basicPayCentavos;
  const totalPremiumCentavos = applyRate(base, rateNumerator, rateDenominator);
  const employeeCentavos = totalPremiumCentavos / 2n;
  const employerCentavos = totalPremiumCentavos - employeeCentavos; // employer absorbs any odd centavo
  return { employeeCentavos, employerCentavos };
}

/**
 * Pag-IBIG / HDMF (RA 9679, Home Development Mutual Fund Law of 2009) —
 * employee and employer rates are set separately (unlike PhilHealth's fixed
 * 50/50 split) and both apply to salary capped at `capCentavos`; rates and
 * cap are tax_rules keys (pagibig_rate_ee/pagibig_rate_er/pagibig_salary_cap),
 * maintained by the bookkeeper.
 */
export function computePagibigContribution(
  basicPayCentavos: Centavos,
  employeeRateNumerator: bigint,
  employeeRateDenominator: bigint,
  employerRateNumerator: bigint,
  employerRateDenominator: bigint,
  capCentavos: Centavos
): { employeeCentavos: Centavos; employerCentavos: Centavos } {
  if (basicPayCentavos <= 0n) return { employeeCentavos: 0n, employerCentavos: 0n };
  const base = basicPayCentavos > capCentavos ? capCentavos : basicPayCentavos;
  return {
    employeeCentavos: applyRate(base, employeeRateNumerator, employeeRateDenominator),
    employerCentavos: applyRate(base, employerRateNumerator, employerRateDenominator),
  };
}
