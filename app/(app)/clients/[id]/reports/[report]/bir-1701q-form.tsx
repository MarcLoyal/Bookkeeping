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
 * A visual replica of BIR Form 1701Q (Quarterly Income Tax Return for
 * Individuals, Estates and Trusts, January 2018 ENCS) — field positions,
 * labels, and line numbers match the real form, sourced from the actual
 * form PDF supplied for this feature. Schedule I (graduated, itemized or
 * OSD) or Schedule II (8%) is filled per the client's incomeTaxRegime, both
 * computed CUMULATIVELY as the real form requires (this quarter's own
 * figures plus year-to-date-through-the-prior-quarter, from the same
 * Income Statement data this app already has — see quarterBoundsFor).
 * Q4 has no checkbox on the real form (that quarter is reconciled via the
 * Annual Return, not a separate 1701Q filing).
 *
 * This app tracks no spousal data at all, so column B (Spouse) throughout
 * is left blank with a note rather than filled — same policy as every
 * other untracked line.
 */
export function Bir1701QForm({
  client,
  quarterLabel,
  quarterNumber,
  from,
  to,
  thisQuarter,
  previousCumulative,
  ewtWithheldThisQuarter,
  ewtWithheldPreviousQuarters,
  graduatedBrackets,
  eightPercentRate,
  eightPercentThresholdCentavos,
}: {
  client: ClientInfo;
  quarterLabel: string;
  quarterNumber: 1 | 2 | 3;
  from: string;
  to: string;
  thisQuarter: IncomeStatement;
  previousCumulative: IncomeStatement | null;
  ewtWithheldThisQuarter: Centavos;
  ewtWithheldPreviousQuarters: Centavos;
  graduatedBrackets: WithholdingTaxBracket[];
  eightPercentRate: { numerator: bigint; denominator: bigint } | null;
  eightPercentThresholdCentavos: Centavos | null;
}) {
  const isEightPercent = client.incomeTaxRegime === "eight_percent";
  const isOsd = client.incomeTaxRegime === "graduated_osd";
  const isItemized = client.incomeTaxRegime === "graduated_itemized";
  const isSoleProp = client.taxpayerType === "sole_prop";
  const isProfessional = client.taxpayerType === "professional";

  const amt = (v: Centavos) => roundToWholePesos(v);

  // Schedule I (graduated) — Items 36-46.
  const salesCentavos = thisQuarter.revenueCentavos;
  const cosCentavos = isItemized ? thisQuarter.cogsCentavos : 0n; // "applicable only if availing Itemized Deductions" per the form
  const grossIncomeCentavos = salesCentavos - cosCentavos;
  const itemizedDeductionsCentavos = isItemized ? thisQuarter.operatingExpensesCentavos : 0n;
  const osdCentavos = isOsd ? computeOsd(salesCentavos) : 0n;
  const netIncomeThisQuarterCentavos = isOsd ? grossIncomeCentavos - osdCentavos : grossIncomeCentavos - itemizedDeductionsCentavos;
  const previousTaxableIncomeCentavos = previousCumulative
    ? previousCumulative.revenueCentavos -
      (isItemized ? previousCumulative.cogsCentavos : 0n) -
      (isOsd ? computeOsd(previousCumulative.revenueCentavos) : previousCumulative.operatingExpensesCentavos) +
      previousCumulative.otherIncomeCentavos
    : 0n;
  const nonOperatingIncomeThisQuarterCentavos = thisQuarter.otherIncomeCentavos;
  const totalTaxableIncomeToDateCentavos = sumCentavos([
    netIncomeThisQuarterCentavos,
    previousTaxableIncomeCentavos,
    nonOperatingIncomeThisQuarterCentavos,
  ]);
  const graduatedTaxDueCentavos = computeGraduatedIncomeTax(totalTaxableIncomeToDateCentavos, graduatedBrackets);
  const graduatedTaxDuePreviousCentavos = computeGraduatedIncomeTax(previousTaxableIncomeCentavos, graduatedBrackets);

  // Schedule II (8%) — Items 47-54.
  const totalIncomeThisQuarterCentavos = sumCentavos([thisQuarter.revenueCentavos, thisQuarter.otherIncomeCentavos]);
  const previousCumulativeTotalIncomeCentavos = previousCumulative
    ? sumCentavos([previousCumulative.revenueCentavos, previousCumulative.otherIncomeCentavos])
    : 0n;
  const cumulativeTotalIncomeCentavos = totalIncomeThisQuarterCentavos + previousCumulativeTotalIncomeCentavos;
  const eightPercentSummary =
    eightPercentRate && eightPercentThresholdCentavos !== null
      ? buildEightPercentSummary(cumulativeTotalIncomeCentavos, eightPercentThresholdCentavos, eightPercentRate.numerator, eightPercentRate.denominator)
      : null;
  const eightPercentSummaryPrevious =
    eightPercentRate && eightPercentThresholdCentavos !== null
      ? buildEightPercentSummary(previousCumulativeTotalIncomeCentavos, eightPercentThresholdCentavos, eightPercentRate.numerator, eightPercentRate.denominator)
      : null;

  const taxDueCentavos = isEightPercent ? (eightPercentSummary?.taxDueCentavos ?? null) : graduatedTaxDueCentavos;
  const taxDuePreviousCentavos = isEightPercent ? (eightPercentSummaryPrevious?.taxDueCentavos ?? 0n) : graduatedTaxDuePreviousCentavos;
  const totalCreditsCentavos = sumCentavos([taxDuePreviousCentavos, ewtWithheldPreviousQuarters, ewtWithheldThisQuarter]);
  const taxPayableCentavos = taxDueCentavos !== null ? taxDueCentavos - totalCreditsCentavos : null;

  return (
    <div className="mx-auto max-w-[850px] bg-white text-slate-900">
      <div className="bir-form-page border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="1701Q" revision="January 2018 (ENCS)" pageLabel="Page 1" title="Quarterly Income Tax Return for Individuals, Estates and Trusts" />
        <BirFormNote>
          Enter all required information in CAPITAL LETTERS using BLACK ink. Mark all applicable boxes with an “X”.
          Two copies must be filed with the BIR and one held by the Tax Filer.
        </BirFormNote>

        <BirLine no="1–2" label={<>For the Year <span className="font-mono">{from.slice(0, 4)}</span> — {quarterLabel} ({from} to {to})</>}>
          <span className="text-[10px] text-slate-500">{quarterNumber === 3 ? "Third" : quarterNumber === 2 ? "Second" : "First"}</span>
        </BirLine>

        <BirPartTitle>Part I – Background Information on Taxpayer/Filer</BirPartTitle>
        <BirLine no="5" label="Taxpayer Identification Number (TIN)">
          <TinBoxes tin={client.tin} />
        </BirLine>
        <BirLine no="6" label="RDO Code">
          <TextBoxes value={client.rdoCode} length={6} />
        </BirLine>
        <BirLine no="7" label={<>Taxpayer/Filer Type — {isSoleProp ? "Single Proprietor" : isProfessional ? "Professional" : "(not determinable from taxpayer type on file)"}</>}>
          <span />
        </BirLine>
        <BirLine
          no="8"
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
        <BirLine no="9" label="Taxpayer/Filer's Name">
          <TextBoxes value={client.registeredName} length={40} />
        </BirLine>
        <BirLine no="10" label="Registered Address">
          <TextBoxes value={client.address} length={40} />
        </BirLine>
        <BirLine
          no="16"
          label="Tax Rate / Method of Deduction"
          sub={isEightPercent ? "8% in lieu of Graduated Rates & Percentage Tax" : isOsd ? "Graduated Rates — Optional Standard Deduction (OSD)" : isItemized ? "Graduated Rates — Itemized Deduction" : "Not set"}
        >
          <span />
        </BirLine>

        <BirPartTitle>Part II – Background Information on Spouse</BirPartTitle>
        <BirFormNote>Not tracked by this app — leave blank and complete by hand if applicable.</BirFormNote>

        <BirPartTitle>Part III – Total Tax Payable</BirPartTitle>
        <BirLine no="26" label="Tax Due (From Part V, Schedule I-Item 46 OR Schedule II-Item 54)">
          <AmountBoxes value={taxDueCentavos !== null ? amt(taxDueCentavos) : null} />
        </BirLine>
        <BirLine no="27" label="Less: Tax Credits/Payments (From Part V, Schedule III-Item 62)">
          <AmountBoxes value={amt(totalCreditsCentavos)} />
        </BirLine>
        <BirLine no="28" label="Tax Payable/(Overpayment) (Item 26 Less Item 27)">
          <AmountBoxes value={taxPayableCentavos !== null ? amt(taxPayableCentavos) : null} />
        </BirLine>
        <BirLine no="29–31" label="Add: Penalties / Total & Aggregate Amount Payable" sub="Penalties aren't tracked by this app — compute by hand if filing late.">
          <AmountBoxes value={null} />
        </BirLine>
      </div>

      <div className="bir-form-page mt-6 border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="1701Q" revision="January 2018 (ENCS)" pageLabel="Page 2" title="Quarterly Income Tax Return for Individuals, Estates and Trusts" />
        <BirPartTitle>Part V – Computation of Tax Due — Schedule I (Graduated IT Rate)</BirPartTitle>
        {isEightPercent ? (
          <BirFormNote>This client is on the 8% rate — see Schedule II below instead.</BirFormNote>
        ) : (
          <>
            <BirLine no="36" label="Sales/Revenues/Receipts/Fees (net of returns, allowances and discounts)">
              <AmountBoxes value={amt(salesCentavos)} />
            </BirLine>
            <BirLine no="37" label="Less: Cost of Sales/Services (applicable only if availing Itemized Deductions)">
              <AmountBoxes value={amt(cosCentavos)} />
            </BirLine>
            <BirLine no="38" label="Gross Income/(Loss) from Operation (Item 36 Less Item 37)">
              <AmountBoxes value={amt(grossIncomeCentavos)} />
            </BirLine>
            <BirLine no="39" label="Less: Total Allowable Itemized Deductions">
              <AmountBoxes value={amt(itemizedDeductionsCentavos)} />
            </BirLine>
            <BirLine no="40" label="OR Optional Standard Deduction (OSD) (40% of Item 36)">
              <AmountBoxes value={amt(osdCentavos)} />
            </BirLine>
            <BirLine no="41" label="Net Income/(Loss) This Quarter">
              <AmountBoxes value={amt(netIncomeThisQuarterCentavos)} />
            </BirLine>
            <BirLine no="42" label="Add: Taxable Income/(Loss) Previous Quarter/s" sub={quarterNumber === 1 ? "None — this is the first quarter of the year." : "Computed from this app's own posted transactions, Jan 1 through the end of the prior quarter."}>
              <AmountBoxes value={amt(previousTaxableIncomeCentavos)} />
            </BirLine>
            <BirLine no="43" label="Non-Operating Income">
              <AmountBoxes value={amt(nonOperatingIncomeThisQuarterCentavos)} />
            </BirLine>
            <BirLine no="44" label="Amount Received/Share in Income by a Partner from GPP" sub="Not tracked by this app.">
              <AmountBoxes value={null} />
            </BirLine>
            <BirLine no="45" label="Total Taxable Income/(Loss) To Date (Sum of Items 41 to 44)">
              <AmountBoxes value={amt(totalTaxableIncomeToDateCentavos)} />
            </BirLine>
            <BirLine no="46" label="TAX DUE (Item 45 x Applicable Tax Rate) (To Part III, Item 26)">
              <AmountBoxes value={amt(graduatedTaxDueCentavos)} />
            </BirLine>
          </>
        )}

        <BirPartTitle>Schedule II (8% IT Rate)</BirPartTitle>
        {!isEightPercent ? (
          <BirFormNote>This client isn't on the 8% rate — see Schedule I above instead.</BirFormNote>
        ) : (
          <>
            <BirLine no="47" label="Sales/Revenues/Receipts/Fees (net of returns, allowances and discounts)">
              <AmountBoxes value={amt(thisQuarter.revenueCentavos)} />
            </BirLine>
            <BirLine no="48" label="Add: Non-Operating Income">
              <AmountBoxes value={amt(thisQuarter.otherIncomeCentavos)} />
            </BirLine>
            <BirLine no="49" label="Total Income for the Quarter (Sum of Items 47 and 48)">
              <AmountBoxes value={amt(totalIncomeThisQuarterCentavos)} />
            </BirLine>
            <BirLine no="50" label="Add: Total Taxable Income/(Loss) Previous Quarter" sub={quarterNumber === 1 ? "None — this is the first quarter of the year." : "Computed from this app's own posted transactions, Jan 1 through the end of the prior quarter."}>
              <AmountBoxes value={amt(previousCumulativeTotalIncomeCentavos)} />
            </BirLine>
            <BirLine no="51" label="Cumulative Taxable Income/(Loss) as of This Quarter (Sum of Items 49 and 50)">
              <AmountBoxes value={amt(cumulativeTotalIncomeCentavos)} />
            </BirLine>
            <BirLine no="52" label="Less: Allowable Reduction (₱250,000)">
              <AmountBoxes value={eightPercentThresholdCentavos !== null ? amt(eightPercentThresholdCentavos) : null} />
            </BirLine>
            <BirLine no="53" label="Taxable Income/(Loss) To Date (Item 51 Less Item 52)">
              <AmountBoxes value={eightPercentSummary ? amt(eightPercentSummary.taxableAmountCentavos) : null} />
            </BirLine>
            <BirLine no="54" label="TAX DUE (Item 53 x 8% Tax Rate) (To Part III, Item 26)">
              <AmountBoxes value={eightPercentSummary ? amt(eightPercentSummary.taxDueCentavos) : null} />
            </BirLine>
          </>
        )}

        <BirPartTitle>Schedule III – Tax Credits/Payments</BirPartTitle>
        <BirLine no="55" label="Prior Year's Excess Credits" sub="Not tracked by this app — no cross-year carryover field exists yet.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="56" label="Tax Payment/s for the Previous Quarter/s" sub={quarterNumber === 1 ? "None — this is the first quarter of the year." : "Computed as the tax that would have been due on the cumulative income through the prior quarter — assumes that amount was actually paid; verify against the prior quarter's actual filing."}>
          <AmountBoxes value={amt(taxDuePreviousCentavos)} />
        </BirLine>
        <BirLine no="57" label="Creditable Tax Withheld for the Previous Quarter/s" sub={quarterNumber === 1 ? "None — this is the first quarter of the year." : "Sum of EWT customers withheld on this client's posted sales invoices, Jan 1 through the end of the prior quarter."}>
          <AmountBoxes value={amt(ewtWithheldPreviousQuarters)} />
        </BirLine>
        <BirLine no="58" label="Creditable Tax Withheld per BIR Form No. 2307 for this Quarter" sub="Sum of EWT customers withheld on this client's posted sales invoices this quarter.">
          <AmountBoxes value={amt(ewtWithheldThisQuarter)} />
        </BirLine>
        <BirLine no="59–61" label="Amended Return / Foreign Tax Credits / Other" sub="Not tracked by this app.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="62" label="Total Tax Credits/Payments (To Part III, Item 27)">
          <AmountBoxes value={amt(totalCreditsCentavos)} />
        </BirLine>
        <BirLine no="63" label="Tax Payable/(Overpayment) (Item 46 or 54, Less Item 62) (To Part III, Item 28)">
          <AmountBoxes value={taxPayableCentavos !== null ? amt(taxPayableCentavos) : null} />
        </BirLine>

        <BirFormNote>
          Schedule IV (penalties) isn't reproduced here — this app doesn't track filing dates or compute
          surcharge/interest/compromise. Complete by hand before filing if late.
        </BirFormNote>
      </div>
    </div>
  );
}
