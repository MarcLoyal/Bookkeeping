import { describe, expect, it } from "vitest";
import { parseRateFraction, pesosToCentavos } from "../../money";
import { buildPercentageTaxSummary } from "../percentage-tax";

describe("buildPercentageTaxSummary", () => {
  it("applies the rate from tax_rules (never a hardcoded literal)", () => {
    const { numerator, denominator } = parseRateFraction("0.01"); // as stored in tax_rules
    const summary = buildPercentageTaxSummary(pesosToCentavos("250000.00"), numerator, denominator);
    expect(summary.taxDueCentavos).toBe(pesosToCentavos("2500.00"));
  });

  it("rounds half-up exactly at a .5 centavo tie", () => {
    const { numerator, denominator } = parseRateFraction("0.01");
    // 0.50 pesos * 1% = 0.005 pesos = 0.5 centavos exactly -> rounds up to 1 centavo.
    const summary = buildPercentageTaxSummary(pesosToCentavos("0.50"), numerator, denominator);
    expect(summary.taxDueCentavos).toBe(1n);
  });
});
