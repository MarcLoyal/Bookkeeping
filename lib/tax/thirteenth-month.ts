import { type Centavos } from "../money";

/**
 * 13th month pay is mandatory for rank-and-file employees (PD 851) and is
 * exempt from income tax up to ₱90,000 — combined with other benefits —
 * under Sec. 32(B)(7)(e) of the NIRC as amended by RA 10963 (TRAIN). This
 * app only tracks 13th month pay itself against that ceiling, not other
 * bonus/benefit types paid during the year (this app has no "other
 * benefits" bucket) — a disclosed simplification, see DECISIONS.md.
 */
export const THIRTEENTH_MONTH_EXEMPTION_CEILING_CENTAVOS: Centavos = 90_000_00n;

export type ThirteenthMonthSplit = {
  exemptCentavos: Centavos;
  taxableExcessCentavos: Centavos;
};

export function splitThirteenthMonthPay(
  thirteenthMonthPayCentavos: Centavos,
  exemptionCeilingCentavos: Centavos = THIRTEENTH_MONTH_EXEMPTION_CEILING_CENTAVOS
): ThirteenthMonthSplit {
  if (thirteenthMonthPayCentavos <= 0n) return { exemptCentavos: 0n, taxableExcessCentavos: 0n };
  const exemptCentavos = thirteenthMonthPayCentavos < exemptionCeilingCentavos ? thirteenthMonthPayCentavos : exemptionCeilingCentavos;
  const taxableExcessCentavos = thirteenthMonthPayCentavos - exemptCentavos;
  return { exemptCentavos, taxableExcessCentavos };
}
