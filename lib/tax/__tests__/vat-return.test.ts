import { describe, expect, it } from "vitest";
import { pesosToCentavos } from "../../money";
import { buildVatReturnSummary } from "../vat-return";

describe("buildVatReturnSummary", () => {
  it("nets output VAT against input VAT to a payable amount", () => {
    const summary = buildVatReturnSummary({
      vatableSalesCentavos: pesosToCentavos("100000.00"),
      zeroRatedSalesCentavos: pesosToCentavos("10000.00"),
      exemptSalesCentavos: pesosToCentavos("5000.00"),
      outputVatCentavos: pesosToCentavos("12000.00"),
      vatablePurchasesCentavos: pesosToCentavos("40000.00"),
      inputVatCentavos: pesosToCentavos("4800.00"),
    });
    expect(summary.totalSalesCentavos).toBe(pesosToCentavos("115000.00"));
    expect(summary.netVatCentavos).toBe(pesosToCentavos("7200.00"));
  });

  it("goes negative (excess input VAT) when input exceeds output", () => {
    const summary = buildVatReturnSummary({
      vatableSalesCentavos: pesosToCentavos("10000.00"),
      zeroRatedSalesCentavos: 0n,
      exemptSalesCentavos: 0n,
      outputVatCentavos: pesosToCentavos("1200.00"),
      vatablePurchasesCentavos: pesosToCentavos("50000.00"),
      inputVatCentavos: pesosToCentavos("6000.00"),
    });
    expect(summary.netVatCentavos).toBe(pesosToCentavos("-4800.00"));
  });
});
