import { AmountBoxes, TextBoxes, TinBoxes } from "@/components/bir/digit-boxes";
import { BirFormHeader, BirFormNote, BirLine, BirPartTitle } from "@/components/bir/form-header";
import { buildVatReturnSummary } from "@/lib/tax/vat-return";
import type { PurchaseTotals, SalesTotals } from "@/lib/data/tax-reports";

/**
 * A visual replica of BIR Form 2550Q (Quarterly VAT Return, April 2024 ENCS)
 * — field positions, labels, and line numbers match the real form, sourced
 * from the actual form PDF supplied for this feature. Only the lines this
 * app has real data for are filled in (Part I background info from the
 * client record; Part IV sales/purchases/output-input VAT from posted
 * transactions; Part II line 15, the one figure the fill-in lines roll up
 * to). Every other line — schedules 1–4, prior-quarter carryovers, capital
 * goods amortization, EWT withheld, advance VAT, penalties, payment
 * details — is intentionally left as blank boxes: this app doesn't track
 * that data, and filling them with an assumed zero would misrepresent an
 * unknown as a fact. This is a print/reference aid, not a filed document.
 */
export function Bir2550QForm({
  client,
  quarterLabel,
  from,
  to,
  sales,
  purchases,
}: {
  client: { registeredName: string; tin: string; rdoCode: string; address: string };
  quarterLabel: string;
  from: string;
  to: string;
  sales: SalesTotals;
  purchases: PurchaseTotals;
}) {
  const summary = buildVatReturnSummary({
    vatableSalesCentavos: sales.vatableSalesCentavos,
    zeroRatedSalesCentavos: sales.zeroRatedSalesCentavos,
    exemptSalesCentavos: sales.exemptSalesCentavos,
    outputVatCentavos: sales.outputVatCentavos,
    vatablePurchasesCentavos: purchases.vatablePurchasesCentavos,
    inputVatCentavos: purchases.inputVatCentavos,
  });

  return (
    <div className="mx-auto max-w-[850px] bg-white text-slate-900">
      <div className="bir-form-page border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="2550Q" revision="April 2024 (ENCS)" pageLabel="Page 1" title="Quarterly Value-Added Tax (VAT) Return" />
        <BirFormNote>
          Enter all required information in CAPITAL LETTERS using BLACK ink. Mark applicable boxes with an “X”. Two
          copies MUST be filed with the BIR and one held by the Taxpayer.
        </BirFormNote>

        <BirLine no="4" label={<>Return Period (MM/DD/YYYY) — From <span className="font-mono">{from}</span> To <span className="font-mono">{to}</span></>}>
          <span className="text-[10px] text-slate-500">{quarterLabel}</span>
        </BirLine>

        <BirPartTitle>Part I – Background Information</BirPartTitle>
        <BirLine no="7" label="Taxpayer Identification Number (TIN)">
          <TinBoxes tin={client.tin} />
        </BirLine>
        <BirLine no="8" label="RDO Code">
          <TextBoxes value={client.rdoCode} length={6} />
        </BirLine>
        <BirLine no="9" label="Taxpayer's Name (Last Name, First Name, Middle Name for Individual OR Registered Name for Non-Individual)">
          <TextBoxes value={client.registeredName} length={40} />
        </BirLine>
        <BirLine no="10" label="Registered Address">
          <TextBoxes value={client.address} length={40} />
        </BirLine>

        <BirPartTitle>Part II – Total Tax Payable</BirPartTitle>
        <BirLine no="15" label="Net VAT Payable/(Excess Input Tax) (From Part IV, Item 61)">
          <AmountBoxes value={summary.netVatCentavos} />
        </BirLine>
        <BirLine no="16" label="Creditable VAT Withheld (From Part V - Schedule 3, Column D)" sub="Not tracked by this app — enter manually from BIR Form 2307s received.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="17" label="Advance VAT Payments (From Part V - Schedule 4)" sub="Not tracked by this app.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="20" label="Total Tax Credits/Payment (Sum of Items 16 to 19)">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="21" label="Tax Still Payable/(Excess Credits) (Item 15 Less Item 20)">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="26" label="TOTAL AMOUNT PAYABLE/(Excess Credits) (Sum of Items 21 and 25)" sub="Penalties (22–25) and any tax credits above are not tracked by this app — complete by hand before filing.">
          <AmountBoxes value={null} />
        </BirLine>
      </div>

      <div className="bir-form-page mt-6 border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="2550Q" revision="April 2024 (ENCS)" pageLabel="Page 2" title="Quarterly Value-Added Tax (VAT) Return" />
        <BirPartTitle>Part IV – Details of VAT Computation</BirPartTitle>

        <BirLine no="31" label="VATable Sales — A. Sales for the Quarter (Exclusive of VAT) / B. Output Tax">
          <div className="flex flex-col items-end gap-1">
            <AmountBoxes value={sales.vatableSalesCentavos} />
            <AmountBoxes value={sales.outputVatCentavos} />
          </div>
        </BirLine>
        <BirLine no="32" label="Zero-Rated Sales">
          <AmountBoxes value={sales.zeroRatedSalesCentavos} />
        </BirLine>
        <BirLine no="33" label="Exempt Sales">
          <AmountBoxes value={sales.exemptSalesCentavos} />
        </BirLine>
        <BirLine no="34" label="Total Sales & Output Tax Due (Sum of Items 31A to 33A) / (Item 31B)">
          <div className="flex flex-col items-end gap-1">
            <AmountBoxes value={summary.totalSalesCentavos} />
            <AmountBoxes value={sales.outputVatCentavos} />
          </div>
        </BirLine>
        <BirLine no="37" label="Total Adjusted Output Tax Due" sub="Items 35/36 (uncollected-receivable adjustments) aren't tracked by this app.">
          <AmountBoxes value={sales.outputVatCentavos} />
        </BirLine>
        <BirLine no="38–43" label="Input Tax carried over, deferred on capital goods, transitional, presumptive, other" sub="Not tracked by this app — check your prior quarter's 2550Q and any capital-goods schedule by hand.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="44" label="Domestic Purchases — A. Purchases / B. Input Tax">
          <div className="flex flex-col items-end gap-1">
            <AmountBoxes value={purchases.vatablePurchasesCentavos} />
            <AmountBoxes value={purchases.inputVatCentavos} />
          </div>
        </BirLine>
        <BirLine no="45–49" label="Services by non-residents, importations, other purchase categories" sub="Not tracked by this app.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="60" label="Total Allowable Input Tax">
          <AmountBoxes value={purchases.inputVatCentavos} />
        </BirLine>
        <BirLine no="61" label="Net VAT Payable/(Excess Input Tax) (Item 37B Less Item 60B) (To Part II, Item 15)">
          <AmountBoxes value={summary.netVatCentavos} />
        </BirLine>

        <BirFormNote>
          Part V (Schedules 1–4: capital goods amortization, VAT-exempt sale input tax allocation, creditable VAT
          withheld, advance VAT payments) is not reproduced here — this app has no data for those schedules.
          Complete them by hand from your own records before filing.
        </BirFormNote>
      </div>
    </div>
  );
}
