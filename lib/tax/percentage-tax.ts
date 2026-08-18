import { applyRate, type Centavos } from "../money";

/**
 * A computation aid for the quarterly percentage tax return (2551Q) — for
 * non-VAT clients NOT on the 8% income tax option. NOT a replica of the
 * form, NOT filed by this app.
 */
export type PercentageTaxSummary = {
  grossReceiptsCentavos: Centavos;
  rateNumerator: bigint;
  rateDenominator: bigint;
  taxDueCentavos: Centavos;
};

export function buildPercentageTaxSummary(
  grossReceiptsCentavos: Centavos,
  rateNumerator: bigint,
  rateDenominator: bigint
): PercentageTaxSummary {
  const taxDueCentavos = applyRate(grossReceiptsCentavos, rateNumerator, rateDenominator);
  return { grossReceiptsCentavos, rateNumerator, rateDenominator, taxDueCentavos };
}
