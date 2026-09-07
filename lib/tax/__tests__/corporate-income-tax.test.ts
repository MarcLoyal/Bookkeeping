import { describe, expect, it } from "vitest";
import { computeMcit, higherOfRcitOrMcit, isMcitApplicable } from "../corporate-income-tax";
import { centavos } from "../../money";

describe("computeMcit", () => {
  it("is 2% of gross income", () => {
    expect(computeMcit(centavos(1_000_000_00), 2n, 100n)).toBe(centavos(20_000_00));
  });

  it("is zero for non-positive gross income", () => {
    expect(computeMcit(0n, 2n, 100n)).toBe(0n);
    expect(computeMcit(-centavos(1_00), 2n, 100n)).toBe(0n);
  });
});

describe("isMcitApplicable", () => {
  it("is false with no commencement date on file", () => {
    expect(isMcitApplicable(null, "2026-01-01")).toBe(false);
  });

  it("is false for the first three taxable years", () => {
    expect(isMcitApplicable("2024-06-01", "2024-12-31")).toBe(false); // year 1
    expect(isMcitApplicable("2024-06-01", "2025-12-31")).toBe(false); // year 2
    expect(isMcitApplicable("2024-06-01", "2026-12-31")).toBe(false); // year 3
  });

  it("is true beginning the 4th taxable year", () => {
    expect(isMcitApplicable("2024-06-01", "2027-01-01")).toBe(true); // year 4
    expect(isMcitApplicable("2024-06-01", "2030-01-01")).toBe(true);
  });
});

describe("higherOfRcitOrMcit", () => {
  it("returns RCIT when MCIT isn't applicable", () => {
    expect(higherOfRcitOrMcit(centavos(100_00), null)).toBe(centavos(100_00));
  });

  it("returns whichever is higher when MCIT applies", () => {
    expect(higherOfRcitOrMcit(centavos(100_00), centavos(150_00))).toBe(centavos(150_00));
    expect(higherOfRcitOrMcit(centavos(150_00), centavos(100_00))).toBe(centavos(150_00));
  });
});
