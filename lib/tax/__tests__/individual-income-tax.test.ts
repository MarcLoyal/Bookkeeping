import { describe, expect, it } from "vitest";
import { computeGraduatedIncomeTax, computeOsd, roundToWholePesos } from "../individual-income-tax";
import { ANNUAL_WITHHOLDING_TAX_BRACKETS_2023 } from "../withholding-compensation";
import { centavos } from "../../money";

describe("computeGraduatedIncomeTax", () => {
  it("is zero within the exempt bracket", () => {
    expect(computeGraduatedIncomeTax(centavos(200_000_00), ANNUAL_WITHHOLDING_TAX_BRACKETS_2023)).toBe(0n);
  });

  it("computes tax directly on a full-year taxable income, no annualizing", () => {
    // ₱600,000 -> bracket 400k-800k: 22,500 + 20% of (600,000-400,000) = 22,500 + 40,000 = 62,500.
    expect(computeGraduatedIncomeTax(centavos(600_000_00), ANNUAL_WITHHOLDING_TAX_BRACKETS_2023)).toBe(centavos(62_500_00));
  });

  it("is zero for non-positive taxable income", () => {
    expect(computeGraduatedIncomeTax(0n, ANNUAL_WITHHOLDING_TAX_BRACKETS_2023)).toBe(0n);
    expect(computeGraduatedIncomeTax(-centavos(1_00), ANNUAL_WITHHOLDING_TAX_BRACKETS_2023)).toBe(0n);
  });
});

describe("computeOsd", () => {
  it("is 40% of gross sales", () => {
    expect(computeOsd(centavos(1_000_000_00))).toBe(centavos(400_000_00));
  });

  it("is zero for non-positive sales", () => {
    expect(computeOsd(0n)).toBe(0n);
  });
});

describe("roundToWholePesos", () => {
  it("drops 49 centavos or less", () => {
    expect(roundToWholePesos(centavos(123_49))).toBe(centavos(123_00));
  });

  it("rounds up 50 centavos or more", () => {
    expect(roundToWholePesos(centavos(123_50))).toBe(centavos(124_00));
  });

  it("leaves an already-whole amount unchanged", () => {
    expect(roundToWholePesos(centavos(123_00))).toBe(centavos(123_00));
  });

  it("rounds a negative amount symmetrically", () => {
    expect(roundToWholePesos(-centavos(123_50))).toBe(-centavos(124_00));
  });
});
