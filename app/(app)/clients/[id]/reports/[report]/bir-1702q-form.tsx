import { AmountBoxes, TextBoxes, TinBoxes } from "@/components/bir/digit-boxes";
import { BirFormHeader, BirFormNote, BirLine, BirPartTitle } from "@/components/bir/form-header";
import { computeMcit, higherOfRcitOrMcit } from "@/lib/tax/corporate-income-tax";
import { computeOsd, roundToWholePesos } from "@/lib/tax/individual-income-tax";
import type { IncomeStatement } from "@/lib/accounting/reports";
import { sumCentavos, applyRate, type Centavos } from "@/lib/money";

type ClientInfo = {
  registeredName: string;
  tin: string;
  rdoCode: string;
  address: string;
  incomeTaxRegime: string;
};

type Rate = { numerator: bigint; denominator: bigint } | null;

/**
 * A visual replica of BIR Form 1702Q (Quarterly Income Tax Return for
 * Corporations, Partnerships and Other Non-Individual Taxpayers, January
 * 2018 ENCS) — field positions, labels, and line numbers match the actual
 * form PDF supplied for this feature. Schedule 2 (Regular/Normal Rate) is
 * computed cumulatively per Sec. 74 NIRC, same methodology as 1701Q.
 * Schedule 1 (Exempt/Special rate income) is left entirely blank — this
 * app doesn't track PEZA/special-law classifications (out of scope, per
 * the user's "No on PEZA/BOI" answer).
 */
export function Bir1702QForm({
  client,
  quarterLabel,
  quarterNumber,
  from,
  to,
  thisQuarter,
  previousCumulative,
  quarterlyGrossIncomes,
  ewtWithheldThisQuarter,
  ewtWithheldPreviousQuarters,
  rcitRate,
  mcitRate,
  mcitApplicable,
}: {
  client: ClientInfo;
  quarterLabel: string;
  quarterNumber: 1 | 2 | 3;
  from: string;
  to: string;
  thisQuarter: IncomeStatement;
  previousCumulative: IncomeStatement | null;
  quarterlyGrossIncomes: { quarterNumber: number; grossIncomeCentavos: Centavos }[];
  ewtWithheldThisQuarter: Centavos;
  ewtWithheldPreviousQuarters: Centavos;
  rcitRate: Rate;
  mcitRate: Rate;
  mcitApplicable: boolean;
}) {
  const isOsd = client.incomeTaxRegime === "graduated_osd";
  const amt = (v: Centavos) => roundToWholePesos(v);

  function scheduleFor(is: IncomeStatement) {
    const salesCentavos = is.revenueCentavos;
    const cosCentavos = is.cogsCentavos; // always subtracted for corporations, itemized or OSD alike
    const grossIncomeFromOpsCentavos = salesCentavos - cosCentavos;
    const otherIncomeCentavos = is.otherIncomeCentavos;
    const totalGrossIncomeCentavos = grossIncomeFromOpsCentavos + otherIncomeCentavos;
    const deductionsCentavos = isOsd ? computeOsd(totalGrossIncomeCentavos) : is.operatingExpensesCentavos;
    const taxableIncomeCentavos = totalGrossIncomeCentavos - deductionsCentavos;
    return { salesCentavos, cosCentavos, grossIncomeFromOpsCentavos, otherIncomeCentavos, totalGrossIncomeCentavos, deductionsCentavos, taxableIncomeCentavos };
  }

  const thisSchedule = scheduleFor(thisQuarter);
  const previousTaxableIncomeCentavos = previousCumulative ? scheduleFor(previousCumulative).taxableIncomeCentavos : 0n;
  const totalTaxableIncomeToDateCentavos = thisSchedule.taxableIncomeCentavos + previousTaxableIncomeCentavos;

  const rcitDueCentavos = rcitRate ? applyRate(totalTaxableIncomeToDateCentavos > 0n ? totalTaxableIncomeToDateCentavos : 0n, rcitRate.numerator, rcitRate.denominator) : null;

  const totalMcitGrossIncomeCentavos = sumCentavos(quarterlyGrossIncomes.map((q) => q.grossIncomeCentavos));
  const mcitDueCentavos = mcitApplicable && mcitRate ? computeMcit(totalMcitGrossIncomeCentavos, mcitRate.numerator, mcitRate.denominator) : null;

  const taxDueCentavos = rcitDueCentavos !== null ? higherOfRcitOrMcit(rcitDueCentavos, mcitDueCentavos) : null;
  const usedMcit = mcitDueCentavos !== null && rcitDueCentavos !== null && mcitDueCentavos > rcitDueCentavos;

  // Schedule 4 credits: the single previous-cumulative tax figure is routed
  // to whichever line (RCIT or MCIT payments) matches the SAME quarter's
  // higher-of comparison — a simplification disclosed on the form itself:
  // it doesn't decompose which INDIVIDUAL prior quarter used which basis.
  const previousRcitDueCentavos = rcitRate ? applyRate(previousTaxableIncomeCentavos > 0n ? previousTaxableIncomeCentavos : 0n, rcitRate.numerator, rcitRate.denominator) : 0n;
  const previousMcitGrossIncomeCentavos = sumCentavos(quarterlyGrossIncomes.filter((q) => q.quarterNumber < quarterNumber).map((q) => q.grossIncomeCentavos));
  const previousMcitDueCentavos = mcitApplicable && mcitRate ? computeMcit(previousMcitGrossIncomeCentavos, mcitRate.numerator, mcitRate.denominator) : 0n;
  const previousTaxPaymentRcitCentavos = previousMcitDueCentavos > previousRcitDueCentavos ? 0n : previousRcitDueCentavos;
  const previousTaxPaymentMcitCentavos = previousMcitDueCentavos > previousRcitDueCentavos ? previousMcitDueCentavos : 0n;

  const totalCreditsCentavos = sumCentavos([previousTaxPaymentRcitCentavos, previousTaxPaymentMcitCentavos, ewtWithheldPreviousQuarters, ewtWithheldThisQuarter]);
  const netTaxPayableCentavos = taxDueCentavos !== null ? taxDueCentavos - totalCreditsCentavos : null;

  return (
    <div className="mx-auto max-w-[850px] bg-white text-slate-900">
      <div className="bir-form-page border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="1702Q" revision="January 2018 (ENCS)" pageLabel="Page 1" title="Quarterly Income Tax Return for Corporations, Partnerships and Other Non-Individual Taxpayers" />
        <BirFormNote>
          Enter all required information in CAPITAL LETTERS. Mark applicable boxes with an “X”. Two copies MUST be
          filed with the BIR and one held by the taxpayer.
        </BirFormNote>

        <BirLine no="1–3" label={<>For the Year <span className="font-mono">{from.slice(0, 4)}</span> — {quarterLabel} ({from} to {to})</>}>
          <span />
        </BirLine>

        <BirPartTitle>Part I – Background Information</BirPartTitle>
        <BirLine no="6" label="Taxpayer Identification Number (TIN)">
          <TinBoxes tin={client.tin} />
        </BirLine>
        <BirLine no="7" label="RDO Code">
          <TextBoxes value={client.rdoCode} length={6} />
        </BirLine>
        <BirLine no="8" label="Registered Name">
          <TextBoxes value={client.registeredName} length={40} />
        </BirLine>
        <BirLine no="9" label="Registered Address">
          <TextBoxes value={client.address} length={40} />
        </BirLine>
        <BirLine no="12" label="Method of Deductions" sub={isOsd ? "Optional Standard Deduction (OSD) — 40% of Gross Income" : "Itemized Deductions"}>
          <span />
        </BirLine>
        {!mcitApplicable && (
          <BirFormNote>
            MCIT comparison not applied this quarter — either "Operations Commenced" isn't set on this client (see
            Overview tab), or fewer than 3 full taxable years have elapsed since (Sec. 27(E), NIRC as amended by RA
            11534).
          </BirFormNote>
        )}

        <BirPartTitle>Part II – Total Tax Payable</BirPartTitle>
        <BirLine no="14" label="Income Tax Due — Regular/Normal Rate (From Part IV, Schedule 2, Item 13)">
          <AmountBoxes value={taxDueCentavos !== null ? amt(taxDueCentavos) : null} />
        </BirLine>
        <BirLine no="15" label="Less: Unexpired Excess of Prior Year's MCIT over Regular Rate" sub="Not tracked by this app — no multi-year MCIT carryforward history exists yet.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="16" label="Balance/Income Tax Still Due — Regular/Normal Rate (Item 14 Less Item 15)">
          <AmountBoxes value={taxDueCentavos !== null ? amt(taxDueCentavos) : null} />
        </BirLine>
        <BirLine no="17" label="Add: Income Tax Due — Special Rate (From Part IV, Schedule 1, Item 13)" sub="Schedule 1 (Exempt/Special) isn't tracked by this app — see note below.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="18" label="Aggregate Income Tax Due (Sum of Items 16 and 17)">
          <AmountBoxes value={taxDueCentavos !== null ? amt(taxDueCentavos) : null} />
        </BirLine>
        <BirLine no="19" label="Less: Total Tax Credits/Payments (From Part IV, Schedule 4, Item 7)">
          <AmountBoxes value={amt(totalCreditsCentavos)} />
        </BirLine>
        <BirLine no="20" label="Net Tax Payable/(Overpayment) (Item 18 Less Item 19)">
          <AmountBoxes value={netTaxPayableCentavos !== null ? amt(netTaxPayableCentavos) : null} />
        </BirLine>
        <BirLine no="21–25" label="Add: Penalties / Total Amount Payable" sub="Penalties aren't tracked by this app — compute by hand if filing late.">
          <AmountBoxes value={null} />
        </BirLine>
      </div>

      <div className="bir-form-page mt-6 border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="1702Q" revision="January 2018 (ENCS)" pageLabel="Page 2" title="Quarterly Income Tax Return for Corporations, Partnerships and Other Non-Individual Taxpayers" />

        <BirPartTitle>Part IV – Schedule 1 (Exempt / Special Rate)</BirPartTitle>
        <BirFormNote>
          Not reproduced here — this app doesn't track PEZA/special-law or exempt-activity classifications. Complete
          by hand if applicable.
        </BirFormNote>

        <BirPartTitle>Schedule 2 – Regular/Normal Rate</BirPartTitle>
        <BirLine no="1" label="Sales/Receipts/Revenues/Fees">
          <AmountBoxes value={amt(thisSchedule.salesCentavos)} />
        </BirLine>
        <BirLine no="2" label="Less: Cost of Sales/Services">
          <AmountBoxes value={amt(thisSchedule.cosCentavos)} />
        </BirLine>
        <BirLine no="3" label="Gross Income from Operation (Item 1 Less Item 2)">
          <AmountBoxes value={amt(thisSchedule.grossIncomeFromOpsCentavos)} />
        </BirLine>
        <BirLine no="4" label="Add: Non-Operating and Other Taxable Income">
          <AmountBoxes value={amt(thisSchedule.otherIncomeCentavos)} />
        </BirLine>
        <BirLine no="5" label="Total Gross Income (Sum of Items 3 and 4)">
          <AmountBoxes value={amt(thisSchedule.totalGrossIncomeCentavos)} />
        </BirLine>
        <BirLine no="6" label="Less: Deductions" sub={isOsd ? "OSD — 40% of Item 5" : "Itemized — this app's aggregate Operating Expenses; not broken into the form's per-category schedule."}>
          <AmountBoxes value={amt(thisSchedule.deductionsCentavos)} />
        </BirLine>
        <BirLine no="7" label="Taxable Income This Quarter (Item 5 Less Item 6)">
          <AmountBoxes value={amt(thisSchedule.taxableIncomeCentavos)} />
        </BirLine>
        <BirLine no="8" label="Add: Taxable Income Previous Quarter/s" sub={quarterNumber === 1 ? "None — this is the first quarter of the year." : "Computed from this app's own posted transactions, Jan 1 through the end of the prior quarter."}>
          <AmountBoxes value={amt(previousTaxableIncomeCentavos)} />
        </BirLine>
        <BirLine no="9" label="Total Taxable Income to Date (Sum of Items 7 and 8)">
          <AmountBoxes value={amt(totalTaxableIncomeToDateCentavos)} />
        </BirLine>
        <BirLine no="10" label="Applicable Income Tax Rate (except MCIT)" sub={rcitRate ? undefined : "Not set — add rcit_rate in Settings → Tax Rules."}>
          <span className="font-mono text-[10px]">{rcitRate ? `${(Number(rcitRate.numerator) / Number(rcitRate.denominator)) * 100}%` : "—"}</span>
        </BirLine>
        <BirLine no="11" label="Income Tax Due Other than MCIT (Item 9 x Item 10)">
          <AmountBoxes value={rcitDueCentavos !== null ? amt(rcitDueCentavos) : null} />
        </BirLine>
        <BirLine no="12" label="Minimum Corporate Income Tax (MCIT) (From Schedule 3, Item 6)">
          <AmountBoxes value={mcitDueCentavos !== null ? amt(mcitDueCentavos) : null} />
        </BirLine>
        <BirLine no="13" label="Income Tax Due (Higher of Item 11 or Item 12) (To Part II, Item 14)" sub={usedMcit ? "MCIT applies this quarter — it exceeds the regular rate tax due." : undefined}>
          <AmountBoxes value={taxDueCentavos !== null ? amt(taxDueCentavos) : null} />
        </BirLine>

        <BirPartTitle>Schedule 3 – Computation of MCIT for the Quarter/s</BirPartTitle>
        {[1, 2, 3].map((n) => (
          <BirLine key={n} no={String(n)} label={`Gross Income Regular/Normal Rate — ${n === 1 ? "1st" : n === 2 ? "2nd" : "3rd"} Quarter`}>
            <AmountBoxes value={quarterlyGrossIncomes.find((q) => q.quarterNumber === n) ? amt(quarterlyGrossIncomes.find((q) => q.quarterNumber === n)!.grossIncomeCentavos) : null} />
          </BirLine>
        ))}
        <BirLine no="4" label="Total Gross Income (Sum of Items 1 to 3)">
          <AmountBoxes value={amt(totalMcitGrossIncomeCentavos)} />
        </BirLine>
        <BirLine no="5" label="MCIT Rate" sub={mcitRate ? undefined : "Not set — add mcit_rate in Settings → Tax Rules."}>
          <span className="font-mono text-[10px]">{mcitRate ? `${(Number(mcitRate.numerator) / Number(mcitRate.denominator)) * 100}%` : "—"}</span>
        </BirLine>
        <BirLine no="6" label="Minimum Corporate Income Tax (To Schedule 2, Item 12)">
          <AmountBoxes value={mcitDueCentavos !== null ? amt(mcitDueCentavos) : null} />
        </BirLine>

        <BirPartTitle>Schedule 4 – Tax Credits/Payments</BirPartTitle>
        <BirLine no="1" label="Prior Year's Excess Credits" sub="Not tracked by this app — no cross-year carryover field exists yet.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="2" label="Tax Payment/s for the Previous Quarter/s Other than MCIT" sub={quarterNumber === 1 ? "None — this is the first quarter of the year." : "Computed as what would have been due on cumulative income through the prior quarter, whichever basis (regular or MCIT) was higher then — assumes that amount was actually paid."}>
          <AmountBoxes value={amt(previousTaxPaymentRcitCentavos)} />
        </BirLine>
        <BirLine no="3" label="MCIT Payment/s for the Previous Quarter/s">
          <AmountBoxes value={amt(previousTaxPaymentMcitCentavos)} />
        </BirLine>
        <BirLine no="4" label="Creditable Tax Withheld for the Previous Quarter/s" sub="Sum of EWT customers withheld on this client's posted sales invoices, Jan 1 through the end of the prior quarter.">
          <AmountBoxes value={amt(ewtWithheldPreviousQuarters)} />
        </BirLine>
        <BirLine no="5" label="Creditable Tax Withheld per BIR Form No. 2307 for this Quarter" sub="Sum of EWT customers withheld on this client's posted sales invoices this quarter.">
          <AmountBoxes value={amt(ewtWithheldThisQuarter)} />
        </BirLine>
        <BirLine no="6" label="Tax Paid in Return Previously Filed, if Amended" sub="Not tracked by this app.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="7" label="Total Tax Credits/Payments (To Part II, Item 19)">
          <AmountBoxes value={amt(totalCreditsCentavos)} />
        </BirLine>
      </div>
    </div>
  );
}
