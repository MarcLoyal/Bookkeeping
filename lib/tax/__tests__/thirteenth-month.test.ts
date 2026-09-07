import { describe, expect, it } from "vitest";
import { splitThirteenthMonthPay } from "../thirteenth-month";
import { centavos } from "../../money";

describe("splitThirteenthMonthPay", () => {
  it("is fully exempt under the ceiling", () => {
    expect(splitThirteenthMonthPay(centavos(50_000_00))).toEqual({
      exemptCentavos: centavos(50_000_00),
      taxableExcessCentavos: 0n,
    });
  });

  it("splits at exactly the ceiling", () => {
    expect(splitThirteenthMonthPay(centavos(90_000_00))).toEqual({
      exemptCentavos: centavos(90_000_00),
      taxableExcessCentavos: 0n,
    });
  });

  it("taxes the excess over the ceiling", () => {
    expect(splitThirteenthMonthPay(centavos(120_000_00))).toEqual({
      exemptCentavos: centavos(90_000_00),
      taxableExcessCentavos: centavos(30_000_00),
    });
  });

  it("is zero/zero for non-positive input", () => {
    expect(splitThirteenthMonthPay(0n)).toEqual({ exemptCentavos: 0n, taxableExcessCentavos: 0n });
  });
});
