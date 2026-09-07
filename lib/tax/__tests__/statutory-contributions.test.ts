import { describe, expect, it } from "vitest";
import {
  NoMatchingSssBracketError,
  computePagibigContribution,
  computePhilhealthContribution,
  computeSssContribution,
} from "../statutory-contributions";
import { centavos } from "../../money";

const SSS_BRACKETS = [
  { minSalaryCentavos: centavos(0), maxSalaryCentavos: centavos(10_000_00), employeeShareCentavos: centavos(450_00), employerShareCentavos: centavos(950_00), ecEmployerShareCentavos: centavos(10_00) },
  { minSalaryCentavos: centavos(10_000_00), maxSalaryCentavos: null, employeeShareCentavos: centavos(900_00), employerShareCentavos: centavos(1_900_00), ecEmployerShareCentavos: centavos(30_00) },
];

describe("computeSssContribution", () => {
  it("looks up the matching bracket", () => {
    expect(computeSssContribution(centavos(8_000_00), SSS_BRACKETS)).toEqual({
      employeeCentavos: centavos(450_00),
      employerCentavos: centavos(960_00), // employer share + EC add-on
    });
  });

  it("uses the top open-ended bracket", () => {
    expect(computeSssContribution(centavos(50_000_00), SSS_BRACKETS)).toEqual({
      employeeCentavos: centavos(900_00),
      employerCentavos: centavos(1_930_00),
    });
  });

  it("is zero for non-positive salary", () => {
    expect(computeSssContribution(0n, SSS_BRACKETS)).toEqual({ employeeCentavos: 0n, employerCentavos: 0n });
  });

  it("throws when no bracket covers the salary (misconfigured table)", () => {
    expect(() => computeSssContribution(centavos(5_000_00), [])).toThrow(NoMatchingSssBracketError);
  });
});

describe("computePhilhealthContribution", () => {
  it("splits the premium 50/50 on a mid-range salary", () => {
    // 5% of 20,000 = 1,000; split 500/500.
    const result = computePhilhealthContribution(centavos(20_000_00), 5n, 100n, centavos(10_000_00), centavos(100_000_00));
    expect(result).toEqual({ employeeCentavos: centavos(500_00), employerCentavos: centavos(500_00) });
  });

  it("floors salary below the minimum base", () => {
    const result = computePhilhealthContribution(centavos(5_000_00), 5n, 100n, centavos(10_000_00), centavos(100_000_00));
    // 5% of the 10,000 floor = 500, split 250/250.
    expect(result).toEqual({ employeeCentavos: centavos(250_00), employerCentavos: centavos(250_00) });
  });

  it("caps salary above the ceiling", () => {
    const result = computePhilhealthContribution(centavos(200_000_00), 5n, 100n, centavos(10_000_00), centavos(100_000_00));
    // 5% of the 100,000 ceiling = 5,000, split 2,500/2,500.
    expect(result).toEqual({ employeeCentavos: centavos(2_500_00), employerCentavos: centavos(2_500_00) });
  });

  it("gives the employer any odd centavo from an uneven split", () => {
    // 5% of 20,001 = 1,000.05 -> rounds to 1,000.05? applyRate rounds half-up first: 1000.05 -> centavos 100005 (odd). employee floor = 50002, employer = 50003.
    const result = computePhilhealthContribution(centavos(20_001_00), 5n, 100n, centavos(10_000_00), centavos(100_000_00));
    expect(result.employeeCentavos + result.employerCentavos).toBe(centavos(100_005));
    expect(result.employerCentavos).toBeGreaterThanOrEqual(result.employeeCentavos);
  });
});

describe("computePagibigContribution", () => {
  it("applies separate employee/employer rates up to the cap", () => {
    // 1% EE / 2% ER of the 5,000 cap, on a 6,000 salary (capped).
    const result = computePagibigContribution(centavos(6_000_00), 1n, 100n, 2n, 100n, centavos(5_000_00));
    expect(result).toEqual({ employeeCentavos: centavos(50_00), employerCentavos: centavos(100_00) });
  });

  it("is zero for non-positive salary", () => {
    expect(computePagibigContribution(0n, 1n, 100n, 2n, 100n, centavos(5_000_00))).toEqual({
      employeeCentavos: 0n,
      employerCentavos: 0n,
    });
  });
});
