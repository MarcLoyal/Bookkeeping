import { sumCentavos, type Centavos } from "../money";

/**
 * A computation aid summarizing the figures a VAT-registered client needs to
 * manually enter into BIR's quarterly VAT return (2550Q) — NOT a replica of
 * the form itself and NOT something this app files. Labels are plain
 * English, not guessed BIR line numbers (see DECISIONS.md).
 */
export type VatReturnInputs = {
  vatableSalesCentavos: Centavos;
  zeroRatedSalesCentavos: Centavos;
  exemptSalesCentavos: Centavos;
  outputVatCentavos: Centavos;
  vatablePurchasesCentavos: Centavos;
  inputVatCentavos: Centavos;
};

export type VatReturnSummary = VatReturnInputs & {
  totalSalesCentavos: Centavos;
  /** Positive = VAT payable this period. Negative = excess input VAT, normally carried over to the next period. */
  netVatCentavos: Centavos;
};

export function buildVatReturnSummary(inputs: VatReturnInputs): VatReturnSummary {
  const totalSalesCentavos = sumCentavos([
    inputs.vatableSalesCentavos,
    inputs.zeroRatedSalesCentavos,
    inputs.exemptSalesCentavos,
  ]);
  const netVatCentavos = inputs.outputVatCentavos - inputs.inputVatCentavos;
  return { ...inputs, totalSalesCentavos, netVatCentavos };
}
