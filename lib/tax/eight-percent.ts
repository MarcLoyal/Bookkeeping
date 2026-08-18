import { applyRate, type Centavos } from "../money";

/**
 * A computation aid for the 8% income tax option (in lieu of percentage tax
 * + graduated income tax), feeding the quarterly income tax return (1701Q).
 * NOT a replica of the form, NOT filed by this app.
 *
 * SIMPLIFIED (explicitly, per DECISIONS.md): the real 8% option is computed
 * against CUMULATIVE year-to-date gross sales/receipts — the ₱250,000
 * threshold is annual and gets consumed progressively across quarters, so a
 * later quarter can owe tax on its full receipts even if small, once earlier
 * quarters already used up the threshold. This function instead applies the
 * threshold and rate to EACH PERIOD IN ISOLATION (no memory of prior
 * quarters), which understates tax due in any quarter after the one where
 * cumulative receipts first cross ₱250,000. Every screen that renders this
 * is labeled "simplified" for that reason — do not treat it as a final
 * figure without checking cumulative year-to-date receipts by hand.
 */
export type EightPercentSummary = {
  grossReceiptsCentavos: Centavos;
  thresholdCentavos: Centavos;
  rateNumerator: bigint;
  rateDenominator: bigint;
  taxableAmountCentavos: Centavos;
  taxDueCentavos: Centavos;
};

export function buildEightPercentSummary(
  grossReceiptsCentavos: Centavos,
  thresholdCentavos: Centavos,
  rateNumerator: bigint,
  rateDenominator: bigint
): EightPercentSummary {
  const taxableAmountCentavos =
    grossReceiptsCentavos > thresholdCentavos ? grossReceiptsCentavos - thresholdCentavos : 0n;
  const taxDueCentavos = applyRate(taxableAmountCentavos, rateNumerator, rateDenominator);
  return {
    grossReceiptsCentavos,
    thresholdCentavos,
    rateNumerator,
    rateDenominator,
    taxableAmountCentavos,
    taxDueCentavos,
  };
}
