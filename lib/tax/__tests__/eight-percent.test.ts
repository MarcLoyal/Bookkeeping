import { describe, expect, it } from "vitest";
import { parseRateFraction, pesosToCentavos } from "../../money";
import { buildEightPercentSummary } from "../eight-percent";

describe("buildEightPercentSummary", () => {
  const { numerator, denominator } = parseRateFraction("0.08");
  const threshold = pesosToCentavos("250000.00");

  it("applies 8% only to receipts in excess of the threshold", () => {
    const summary = buildEightPercentSummary(pesosToCentavos("400000.00"), threshold, numerator, denominator);
    expect(summary.taxableAmountCentavos).toBe(pesosToCentavos("150000.00"));
    expect(summary.taxDueCentavos).toBe(pesosToCentavos("12000.00"));
  });

  it("owes nothing when receipts are at or below the threshold", () => {
    const atThreshold = buildEightPercentSummary(threshold, threshold, numerator, denominator);
    expect(atThreshold.taxableAmountCentavos).toBe(0n);
    expect(atThreshold.taxDueCentavos).toBe(0n);

    const belowThreshold = buildEightPercentSummary(pesosToCentavos("100000.00"), threshold, numerator, denominator);
    expect(belowThreshold.taxDueCentavos).toBe(0n);
  });
});
