import { AmountBoxes, TextBoxes, TinBoxes } from "@/components/bir/digit-boxes";
import { BirFormHeader, BirFormNote, BirLine, BirPartTitle } from "@/components/bir/form-header";
import { computeGraduatedIncomeTax, computeOsd, roundToWholePesos } from "@/lib/tax/individual-income-tax";
import { buildEightPercentSummary } from "@/lib/tax/eight-percent";
import type { WithholdingTaxBracket } from "@/lib/tax/withholding-compensation";
import type { IncomeStatement } from "@/lib/accounting/reports";
import { sumCentavos, type Centavos } from "@/lib/money";

type ClientInfo = {
  registeredName: string;
  tin: string;
  rdoCode: string;
  address: string;
  taxpayerType: string;
  incomeTaxRegime: string;
};

/**
 * A visual replica of BIR Form 1701A (Annual Income Tax Return for
 * Individuals Earning Income PURELY from Business/Profession, January
 * 2018) — field positions, labels, and line numbers match the real form,
 * sourced from the actual form PDF supplied for this feature.
 *
 * 1701A itself only covers OSD or 8% filers ("PURELY from Business/
 * Profession" — no itemized-deduction option, no compensation-income
 * section at all). A client on graduated_itemized, or a mixed-income
 * earner with compensation from elsewhere, needs the full BIR Form 1701
 * instead — not built (not one of the 8 forms in the original Phase 3
 * scope). The report page only renders this component for OSD/8% clients;
 * itemized clients see a note instead.
 *
 * This app tracks no spousal data at all, so Part V and column B
 * throughout are left blank with a note.
 */
export function Bir1701AForm({
  client,
  year,
  fullYear,
  first9Months,
  ewtFullYear,
  ewtFirst9Months,
  graduatedBrackets,
  eightPercentRate,
  eightPercentThresholdCentavos,
}: {
  client: ClientInfo;
  year: string;
  fullYear: IncomeStatement;
  first9Months: IncomeStatement;
  ewtFullYear: Centavos;
  ewtFirst9Months: Centavos;
  graduatedBrackets: WithholdingTaxBracket[];
  eightPercentRate: { numerator: bigint; denominator: bigint } | null;
  eightPercentThresholdCentavos: Centavos | null;
}) {
  const isEightPercent = client.incomeTaxRegime === "eight_percent";
  const isOsd = client.incomeTaxRegime === "graduated_osd";
  const isSoleProp = client.taxpayerType === "sole_prop";
  const isProfessional = client.taxpayerType === "professional";

  const amt = (v: Centavos) => roundToWholePesos(v);

  // Part IV.A — OSD (Items 36-46). Same non-COGS-subtraction rule as
  // 1701Q's OSD schedule: OSD is meant to cover cost of sales too, so
  // Item 38 (Net Sales) is never reduced by cogs first.
  const salesCentavos = fullYear.revenueCentavos;
  const osdCentavos = computeOsd(salesCentavos);
  const netIncomeCentavos = salesCentavos - osdCentavos;
  const otherIncomeCentavos = fullYear.otherIncomeCentavos;
  const totalTaxableIncomeCentavos = netIncomeCentavos + otherIncomeCentavos;
  const graduatedTaxDueCentavos = computeGraduatedIncomeTax(totalTaxableIncomeCentavos, graduatedBrackets);

  // Part IV.B — 8% (Items 47-56), full-year, no cumulative step needed.
  const totalIncomeCentavos = sumCentavos([fullYear.revenueCentavos, fullYear.otherIncomeCentavos]);
  const eightPercentSummary =
    eightPercentRate && eightPercentThresholdCentavos !== null
      ? buildEightPercentSummary(totalIncomeCentavos, eightPercentThresholdCentavos, eightPercentRate.numerator, eightPercentRate.denominator)
      : null;

  const taxDueCentavos = isEightPercent ? (eightPercentSummary?.taxDueCentavos ?? null) : isOsd ? graduatedTaxDueCentavos : null;

  // Part IV.C — Item 58: what the first 3 quarters' tax would have been,
  // computed the same "assumes it was paid" way as 1701Q's Item 56.
  const first9MonthsTaxableIncomeCentavos = isEightPercent
    ? sumCentavos([first9Months.revenueCentavos, first9Months.otherIncomeCentavos])
    : first9Months.revenueCentavos - computeOsd(first9Months.revenueCentavos) + first9Months.otherIncomeCentavos;
  const first3QuartersTaxCentavos = isEightPercent
    ? eightPercentRate && eightPercentThresholdCentavos !== null
      ? buildEightPercentSummary(first9MonthsTaxableIncomeCentavos, eightPercentThresholdCentavos, eightPercentRate.numerator, eightPercentRate.denominator).taxDueCentavos
      : 0n
    : computeGraduatedIncomeTax(first9MonthsTaxableIncomeCentavos, graduatedBrackets);
  const ewtQ4Centavos = ewtFullYear - ewtFirst9Months;

  const totalCreditsCentavos = sumCentavos([first3QuartersTaxCentavos, ewtFirst9Months, ewtQ4Centavos]);
  const netTaxPayableCentavos = taxDueCentavos !== null ? taxDueCentavos - totalCreditsCentavos : null;

  return (
    <div className="mx-auto max-w-[850px] bg-white text-slate-900">
      <div className="bir-form-page border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="1701A" revision="January 2018" pageLabel="Page 1" title="Annual Income Tax Return — Individuals Earning Income Purely from Business/Profession" />
        <BirFormNote>
          Enter all required information in CAPITAL LETTERS using BLACK ink. Mark applicable boxes with an “X”. Two
          copies must be filed with the BIR and one held by the Tax Filer. Covers OSD-graduated and 8% filers only —
          not itemized deduction, and not mixed-income earners with compensation from elsewhere (see note below).
        </BirFormNote>

        <BirLine no="1" label={<>For the Year <span className="font-mono">{year}</span></>}>
          <span />
        </BirLine>

        <BirPartTitle>Part I – Background Information on Taxpayer/Filer</BirPartTitle>
        <BirLine no="4" label="Taxpayer Identification Number (TIN)">
          <TinBoxes tin={client.tin} />
        </BirLine>
        <BirLine no="5" label="RDO Code">
          <TextBoxes value={client.rdoCode} length={6} />
        </BirLine>
        <BirLine no="6" label={<>Taxpayer Type — {isSoleProp ? "Single Proprietor" : isProfessional ? "Professional" : "(not determinable from taxpayer type on file)"}</>}>
          <span />
        </BirLine>
        <BirLine
          no="7"
          label="Alphanumeric Tax Code (ATC)"
          sub={
            isSoleProp
              ? isEightPercent
                ? "II015 Business Income - 8% IT Rate"
                : "II012 Business Income - Graduated IT Rates"
              : isProfessional
                ? isEightPercent
                  ? "II017 Income from Profession - 8% IT Rate"
                  : "II014 Income from Profession - Graduated IT Rates"
                : "Not determinable — taxpayer type on file isn't Single Proprietor or Professional."
          }
        >
          <span />
        </BirLine>
        <BirLine no="8" label="Taxpayer's Name">
          <TextBoxes value={client.registeredName} length={40} />
        </BirLine>
        <BirLine no="9" label="Registered Address">
          <TextBoxes value={client.address} length={40} />
        </BirLine>
        <BirLine no="19" label="Tax Rate" sub={isEightPercent ? "8% in lieu of Graduated Rates & Percentage Tax" : "Graduated rates with OSD as method of deduction"}>
          <span />
        </BirLine>

        <BirPartTitle>Part II – Total Tax Payable</BirPartTitle>
        <BirLine no="20" label="Tax Due (From Part IV.A Item 46 OR Part IV.B Item 56)">
          <AmountBoxes value={taxDueCentavos !== null ? amt(taxDueCentavos) : null} />
        </BirLine>
        <BirLine no="21" label="Less: Total Tax Credits/Payments (From Part IV.C Item 64)">
          <AmountBoxes value={amt(totalCreditsCentavos)} />
        </BirLine>
        <BirLine no="22" label="Net Tax Payable/(Overpayment) (Item 20 Less Item 21)">
          <AmountBoxes value={netTaxPayableCentavos !== null ? amt(netTaxPayableCentavos) : null} />
        </BirLine>
        <BirLine no="23–30" label="2nd Installment / Penalties / Total & Aggregate Amount Payable" sub="Installment election and penalties aren't tracked by this app — complete by hand before filing.">
          <AmountBoxes value={null} />
        </BirLine>
      </div>

      <div className="bir-form-page mt-6 border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="1701A" revision="January 2018" pageLabel="Page 2" title="Annual Income Tax Return — Individuals Earning Income Purely from Business/Profession" />
        <BirPartTitle>Part IV.A – For Graduated Income Tax Rates (OSD)</BirPartTitle>
        {isEightPercent ? (
          <BirFormNote>This client is on the 8% rate — see Part IV.B below instead.</BirFormNote>
        ) : (
          <>
            <BirLine no="36" label="Sales/Revenues/Receipts/Fees">
              <AmountBoxes value={amt(salesCentavos)} />
            </BirLine>
            <BirLine no="37" label="Less: Sales Returns, Allowances and Discounts" sub="Not tracked as a separate figure — netted into Item 36.">
              <AmountBoxes value={amt(0n)} />
            </BirLine>
            <BirLine no="38" label="Net Sales/Revenues/Receipts/Fees (Item 36 Less Item 37)">
              <AmountBoxes value={amt(salesCentavos)} />
            </BirLine>
            <BirLine no="39" label="Less: Allowable Deduction — OSD (40% of Item 38)">
              <AmountBoxes value={amt(osdCentavos)} />
            </BirLine>
            <BirLine no="40" label="Net Income (Item 38 Less Item 39)">
              <AmountBoxes value={amt(netIncomeCentavos)} />
            </BirLine>
            <BirLine no="41–42" label="Add: Other Non-Operating Income">
              <AmountBoxes value={amt(otherIncomeCentavos)} />
            </BirLine>
            <BirLine no="43" label="Amount Received/Share in Income by a Partner from GPP" sub="Not tracked by this app.">
              <AmountBoxes value={null} />
            </BirLine>
            <BirLine no="44" label="Total Other Income (Sum of Items 41 to 43)">
              <AmountBoxes value={amt(otherIncomeCentavos)} />
            </BirLine>
            <BirLine no="45" label="Total Taxable Income (Sum of Items 40 and 44)">
              <AmountBoxes value={amt(totalTaxableIncomeCentavos)} />
            </BirLine>
            <BirLine no="46" label="TAX DUE (Item 45 x Applicable Tax Rate) (To Part II – Item 20)">
              <AmountBoxes value={amt(graduatedTaxDueCentavos)} />
            </BirLine>
          </>
        )}

        <BirPartTitle>Part IV.B – For 8% Income Tax Rate</BirPartTitle>
        {!isEightPercent ? (
          <BirFormNote>This client isn't on the 8% rate — see Part IV.A above instead.</BirFormNote>
        ) : (
          <>
            <BirLine no="47" label="Sales/Revenues/Receipts/Fees">
              <AmountBoxes value={amt(fullYear.revenueCentavos)} />
            </BirLine>
            <BirLine no="48" label="Less: Sales Returns, Allowances and Discounts" sub="Not tracked as a separate figure — netted into Item 47.">
              <AmountBoxes value={amt(0n)} />
            </BirLine>
            <BirLine no="49" label="Net Sales/Revenues/Receipts/Fees (Item 47 Less Item 48)">
              <AmountBoxes value={amt(fullYear.revenueCentavos)} />
            </BirLine>
            <BirLine no="50–51" label="Add: Other Non-Operating Income">
              <AmountBoxes value={amt(fullYear.otherIncomeCentavos)} />
            </BirLine>
            <BirLine no="52" label="Total Other Non-Operating Income (Sum of Items 50 and 51)">
              <AmountBoxes value={amt(fullYear.otherIncomeCentavos)} />
            </BirLine>
            <BirLine no="53" label="Total Taxable Income (Sum of Items 49 and 52)">
              <AmountBoxes value={amt(totalIncomeCentavos)} />
            </BirLine>
            <BirLine no="54" label="Less: Allowable Reduction (₱250,000)">
              <AmountBoxes value={eightPercentThresholdCentavos !== null ? amt(eightPercentThresholdCentavos) : null} />
            </BirLine>
            <BirLine no="55" label="Taxable Income/(Loss) (Item 53 Less Item 54)">
              <AmountBoxes value={eightPercentSummary ? amt(eightPercentSummary.taxableAmountCentavos) : null} />
            </BirLine>
            <BirLine no="56" label="TAX DUE (Item 55 x 8% Income Tax Rate) (To Part II - Item 20)">
              <AmountBoxes value={eightPercentSummary ? amt(eightPercentSummary.taxDueCentavos) : null} />
            </BirLine>
          </>
        )}

        <BirPartTitle>Part IV.C – Tax Credits/Payments</BirPartTitle>
        <BirLine no="57" label="Prior Year's Excess Credits" sub="Not tracked by this app — no cross-year carryover field exists yet.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="58" label="Tax Payments for the First Three (3) Quarters" sub="Computed as the tax that would have been due on cumulative income through Q3 — assumes each quarter was actually paid; verify against the actual 1701Q filings.">
          <AmountBoxes value={amt(first3QuartersTaxCentavos)} />
        </BirLine>
        <BirLine no="59" label="Creditable Tax Withheld for the First Three (3) Quarters" sub="Sum of EWT customers withheld on posted sales invoices, Jan 1 through Sep 30.">
          <AmountBoxes value={amt(ewtFirst9Months)} />
        </BirLine>
        <BirLine no="60" label="Creditable Tax Withheld per BIR Form No. 2307 for the 4th Quarter" sub="Sum of EWT customers withheld on posted sales invoices, Oct 1 through Dec 31.">
          <AmountBoxes value={amt(ewtQ4Centavos)} />
        </BirLine>
        <BirLine no="61–63" label="Amended Return / Foreign Tax Credits / Other" sub="Not tracked by this app.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="64" label="Total Tax Credits/Payments (To Item 21)">
          <AmountBoxes value={amt(totalCreditsCentavos)} />
        </BirLine>
        <BirLine no="65" label="Net Tax Payable/(Overpayment) (Item 46 OR 56 Less Item 64) (To Part II - Item 22)">
          <AmountBoxes value={netTaxPayableCentavos !== null ? amt(netTaxPayableCentavos) : null} />
        </BirLine>

        <BirFormNote>
          Part V (Background Information on Spouse) isn't reproduced here — this app tracks no spousal data.
          Complete by hand if a joint filing applies.
        </BirFormNote>
      </div>
    </div>
  );
}
