import { describe, expect, it } from "vitest";
import {
  ANNUAL_WITHHOLDING_TAX_BRACKETS_2023,
  NoMatchingWithholdingBracketError,
  computeWithholdingTax,
} from "../withholding-compensation";
import { centavos } from "../../money";

describe("computeWithholdingTax", () => {
  it("is zero when annualized compensation falls within the exempt bracket", () => {
    // ₱20,000/month * 12 = ₱240,000/yr, under the ₱250,000 exempt threshold.
    const tax = computeWithholdingTax(centavos(20_000_00), "monthly", ANNUAL_WITHHOLDING_TAX_BRACKETS_2023);
    expect(tax).toBe(0n);
  });

  it("computes monthly withholding via the annualized method", () => {
    // ₱30,000/month * 12 = ₱360,000/yr -> bracket 2: 15% of excess over 250,000
    // = 15% * 110,000 = 16,500/yr -> /12 = 1,375.00/month exactly.
    const tax = computeWithholdingTax(centavos(30_000_00), "monthly", ANNUAL_WITHHOLDING_TAX_BRACKETS_2023);
    expect(tax).toBe(centavos(1_375_00));
  });

  it("computes semi-monthly withholding via the annualized method", () => {
    // ₱15,000/period * 24 = ₱360,000/yr -> same bracket as above -> annual tax
    // 16,500 / 24 periods = 687.50/period exactly.
    const tax = computeWithholdingTax(centavos(15_000_00), "semi_monthly", ANNUAL_WITHHOLDING_TAX_BRACKETS_2023);
    expect(tax).toBe(centavos(687_50));
  });

  it("computes tax in the top bracket", () => {
    // ₱1,000,000/month * 12 = ₱12,000,000/yr -> top bracket: base 2,202,500 +
    // 35% * (12,000,000 - 8,000,000) = 2,202,500 + 1,400,000 = 3,602,500/yr
    // -> /12 = 300,208.33 (rounds down from .3333).
    const tax = computeWithholdingTax(centavos(1_000_000_00), "monthly", ANNUAL_WITHHOLDING_TAX_BRACKETS_2023);
    expect(tax).toBe(centavos(300_208_33));
  });

  it("treats non-positive taxable compensation as zero tax without consulting brackets", () => {
    expect(computeWithholdingTax(0n, "monthly", [])).toBe(0n);
    expect(computeWithholdingTax(-centavos(100_00), "monthly", [])).toBe(0n);
  });

  it("throws if no bracket covers the annualized amount (misconfigured table)", () => {
    expect(() => computeWithholdingTax(centavos(1_00), "monthly", [])).toThrow(NoMatchingWithholdingBracketError);
  });
});
