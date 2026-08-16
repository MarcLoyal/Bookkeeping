import { describe, expect, it } from "vitest";
import {
  allocateCentavos,
  applyRate,
  centavos,
  formatCentavos,
  pesosToCentavos,
  roundHalfUp,
  sumCentavos,
} from "../money";

describe("pesosToCentavos", () => {
  it("parses plain decimals", () => {
    expect(pesosToCentavos("10.50")).toBe(1050n);
    expect(pesosToCentavos("0.01")).toBe(1n);
    expect(pesosToCentavos("100")).toBe(10000n);
  });

  it("parses comma-grouped values", () => {
    expect(pesosToCentavos("1,234,567.89")).toBe(123456789n);
  });

  it("handles negatives", () => {
    expect(pesosToCentavos("-12.50")).toBe(-1250n);
  });

  it("rounds half-up when given more than 2 decimal digits", () => {
    expect(pesosToCentavos("1.005")).toBe(101n);
    expect(pesosToCentavos("1.004")).toBe(100n);
    expect(pesosToCentavos("0.995")).toBe(100n);
  });

  it("rejects garbage input rather than silently coercing", () => {
    expect(() => pesosToCentavos("abc")).toThrow();
    expect(() => pesosToCentavos("")).toThrow();
  });
});

describe("formatCentavos", () => {
  it("formats with thousands separators and 2 decimals", () => {
    expect(formatCentavos(123456789n)).toBe("1,234,567.89");
    expect(formatCentavos(1n)).toBe("0.01");
    expect(formatCentavos(0n)).toBe("0.00");
  });

  it("formats negatives with a leading minus", () => {
    expect(formatCentavos(-1250n)).toBe("-12.50");
  });
});

describe("money round-trip (acceptance test #12)", () => {
  it("1,234,567.89 -> centavos -> sum of 1000 -> formatted, zero drift", () => {
    const one = pesosToCentavos("1,234,567.89");
    const thousand = new Array(1000).fill(one);
    const total = sumCentavos(thousand);
    expect(total).toBe(one * 1000n);
    expect(formatCentavos(total)).toBe("1,234,567,890.00");
  });
});

describe("roundHalfUp", () => {
  it("rounds .5 away from zero", () => {
    expect(roundHalfUp(5n, 2n)).toBe(3n); // 2.5 -> 3
    expect(roundHalfUp(-5n, 2n)).toBe(-3n);
    expect(roundHalfUp(4n, 2n)).toBe(2n); // 2.0 exact
  });
});

describe("applyRate", () => {
  it("computes VAT-like rates from a fraction, never a hardcoded float", () => {
    // 12% of 1,000.00
    const amount = centavos(100000);
    const vat = applyRate(amount, 12n, 100n);
    expect(vat).toBe(12000n); // 120.00
  });

  it("rounds half-up at the point of computation", () => {
    // 12% of 100.05 = 12.006 -> 12.01
    const amount = pesosToCentavos("100.05");
    const vat = applyRate(amount, 12n, 100n);
    expect(vat).toBe(1201n);
  });
});

describe("allocateCentavos", () => {
  it("splits a total proportionally without losing or inventing a centavo", () => {
    const parts = allocateCentavos(100n, [1n, 1n, 1n]);
    expect(sumCentavos(parts)).toBe(100n);
    expect(parts.sort((a, b) => Number(a - b))).toEqual([33n, 33n, 34n]);
  });

  it("handles a zero total", () => {
    expect(allocateCentavos(0n, [1n, 2n, 3n])).toEqual([0n, 0n, 0n]);
  });
});
