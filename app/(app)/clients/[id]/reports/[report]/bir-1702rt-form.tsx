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
  dateOperationsCommenced: string | null;
};

type Rate = { numerator: bigint; denominator: bigint } | null;

/**
 * A visual replica of BIR Form 1702-RT (Annual Income Tax Return for
 * Corporations, Partnerships and Other Non-Individual Taxpayers Subject
 * Only to REGULAR Income Tax Rate, January 2018 ENCS) — field positions,
 * labels, and line numbers match the actual form PDF supplied for this
 * feature.
 *
 * Several schedules are genuine feature gaps, not just simplifications —
 * disclosed on the form itself rather than guessed at: NOLCO (Schedule
 * III/IIIA, a multi-year loss-carryforward this app has no history table
 * for), the MCIT excess-carryforward across the 3 succeeding years
 * (Schedule IV, same reason), and the 17-category itemized-deduction
 * breakdown (Schedule I) — this app's chart of accounts has one aggregate
 * Operating Expenses figure, not BIR's specific categories. Schedule V
 * (book-vs-tax reconciliation) is skipped because this app already treats
 * book net income as taxable income directly, with no separate adjustment
 * schedule — the same simplification confirmed for the payroll/individual
 * income tax forms.
 */
export function Bir1702RtForm({
  client,
  year,
  fullYear,
  first9Months,
  ewtFullYear,
  ewtFirst9Months,
  rcitRate,
  mcitRate,
}: {
  client: ClientInfo;
  year: string;
  fullYear: IncomeStatement;
  first9Months: IncomeStatement;
  ewtFullYear: Centavos;
  ewtFirst9Months: Centavos;
  rcitRate: Rate;
  mcitRate: Rate;
}) {
  const isOsd = client.incomeTaxRegime === "graduated_osd";
  const amt = (v: Centavos) => roundToWholePesos(v);
  const mcitApplicable = client.dateOperationsCommenced !== null && Number(year) - Number(client.dateOperationsCommenced.slice(0, 4)) >= 3;

  function scheduleFor(is: IncomeStatement) {
    const salesCentavos = is.revenueCentavos;
    const cosCentavos = is.cogsCentavos;
    const grossIncomeFromOpsCentavos = salesCentavos - cosCentavos;
    const otherIncomeCentavos = is.otherIncomeCentavos;
    const totalTaxableIncomeCentavos = grossIncomeFromOpsCentavos + otherIncomeCentavos; // "Total Taxable Income" per the form's own Item 33 label, before deductions
    const deductionsCentavos = isOsd ? computeOsd(totalTaxableIncomeCentavos) : is.operatingExpensesCentavos;
    const netTaxableIncomeCentavos = totalTaxableIncomeCentavos - deductionsCentavos;
    return { salesCentavos, cosCentavos, grossIncomeFromOpsCentavos, otherIncomeCentavos, totalTaxableIncomeCentavos, deductionsCentavos, netTaxableIncomeCentavos };
  }

  const full = scheduleFor(fullYear);
  const rcitDueCentavos = rcitRate ? applyRate(full.netTaxableIncomeCentavos > 0n ? full.netTaxableIncomeCentavos : 0n, rcitRate.numerator, rcitRate.denominator) : null;
  const mcitDueCentavos = mcitApplicable && mcitRate ? computeMcit(full.totalTaxableIncomeCentavos, mcitRate.numerator, mcitRate.denominator) : null;
  const taxDueCentavos = rcitDueCentavos !== null ? higherOfRcitOrMcit(rcitDueCentavos, mcitDueCentavos) : null;
  const usedMcit = mcitDueCentavos !== null && rcitDueCentavos !== null && mcitDueCentavos > rcitDueCentavos;

  // Items 45-46: what the first 3 quarters' 1702Q filings would have paid,
  // routed to whichever basis (MCIT or regular) was higher for that
  // cumulative period — same "assumes it was paid" derivation as 1701A.
  const q3 = scheduleFor(first9Months);
  const q3RcitDueCentavos = rcitRate ? applyRate(q3.netTaxableIncomeCentavos > 0n ? q3.netTaxableIncomeCentavos : 0n, rcitRate.numerator, rcitRate.denominator) : 0n;
  const q3McitDueCentavos = mcitApplicable && mcitRate ? computeMcit(q3.totalTaxableIncomeCentavos, mcitRate.numerator, mcitRate.denominator) : 0n;
  const first3QuartersMcitCentavos = q3McitDueCentavos > q3RcitDueCentavos ? q3McitDueCentavos : 0n;
  const first3QuartersRcitCentavos = q3McitDueCentavos > q3RcitDueCentavos ? 0n : q3RcitDueCentavos;
  const ewtQ4Centavos = ewtFullYear - ewtFirst9Months;

  const totalCreditsCentavos = sumCentavos([first3QuartersMcitCentavos, first3QuartersRcitCentavos, ewtFirst9Months, ewtQ4Centavos]);
  const netTaxPayableCentavos = taxDueCentavos !== null ? taxDueCentavos - totalCreditsCentavos : null;

  return (
    <div className="mx-auto max-w-[850px] bg-white text-slate-900">
      <div className="bir-form-page border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="1702-RT" revision="January 2018 (ENCS)" pageLabel="Page 1" title="Annual Income Tax Return — Corporation, Partnership and Other Non-Individual Taxpayer Subject Only to Regular Income Tax Rate" />
        <BirFormNote>
          Enter all required information in CAPITAL LETTERS. Mark applicable boxes with an “X”. Two copies MUST be
          filed with the BIR and one held by the taxpayer.
        </BirFormNote>

        <BirLine no="1–2" label={<>For the Year Ended <span className="font-mono">{year}</span></>}>
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
        <BirLine no="10" label="Date of Incorporation/Organization" sub="Set on the client's Overview tab — drives the MCIT 4th-taxable-year gate.">
          <TextBoxes value={client.dateOperationsCommenced} length={10} />
        </BirLine>
        <BirLine no="13" label="Method of Deductions" sub={isOsd ? "Optional Standard Deduction (OSD) — 40% of Gross Income" : "Itemized Deductions"}>
          <span />
        </BirLine>
        {!mcitApplicable && (
          <BirFormNote>
            MCIT comparison not applied — either "Operations Commenced" isn't set on this client (see Overview tab),
            or fewer than 3 full taxable years have elapsed since (Sec. 27(E), NIRC as amended by RA 11534).
          </BirFormNote>
        )}

        <BirPartTitle>Part II – Total Tax Payable</BirPartTitle>
        <BirLine no="14" label="Tax Due (From Part IV, Item 43)">
          <AmountBoxes value={taxDueCentavos !== null ? amt(taxDueCentavos) : null} />
        </BirLine>
        <BirLine no="15" label="Less: Total Tax Credits/Payments (From Part IV, Item 55)">
          <AmountBoxes value={amt(totalCreditsCentavos)} />
        </BirLine>
        <BirLine no="16" label="Net Tax Payable/(Overpayment) (Item 14 Less Item 15)">
          <AmountBoxes value={netTaxPayableCentavos !== null ? amt(netTaxPayableCentavos) : null} />
        </BirLine>
        <BirLine no="17–21" label="Add: Penalties / Total Amount Payable" sub="Penalties aren't tracked by this app — compute by hand if filing late.">
          <AmountBoxes value={null} />
        </BirLine>
      </div>

      <div className="bir-form-page mt-6 border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="1702-RT" revision="January 2018 (ENCS)" pageLabel="Page 2" title="Annual Income Tax Return — Corporation, Partnership and Other Non-Individual Taxpayer Subject Only to Regular Income Tax Rate" />
        <BirPartTitle>Part IV – Computation of Tax</BirPartTitle>
        <BirLine no="27" label="Sales/Receipts/Revenues/Fees">
          <AmountBoxes value={amt(full.salesCentavos)} />
        </BirLine>
        <BirLine no="28" label="Less: Sales Returns, Allowances and Discounts" sub="Not tracked as a separate figure — netted into Item 27.">
          <AmountBoxes value={amt(0n)} />
        </BirLine>
        <BirLine no="29" label="Net Sales/Receipts/Revenues/Fees (Item 27 Less Item 28)">
          <AmountBoxes value={amt(full.salesCentavos)} />
        </BirLine>
        <BirLine no="30" label="Less: Cost of Sales/Services">
          <AmountBoxes value={amt(full.cosCentavos)} />
        </BirLine>
        <BirLine no="31" label="Gross Income from Operation (Item 29 Less Item 30)">
          <AmountBoxes value={amt(full.grossIncomeFromOpsCentavos)} />
        </BirLine>
        <BirLine no="32" label="Add: Other Taxable Income Not Subjected to Final Tax">
          <AmountBoxes value={amt(full.otherIncomeCentavos)} />
        </BirLine>
        <BirLine no="33" label="Total Taxable Income (Sum of Items 31 and 32)">
          <AmountBoxes value={amt(full.totalTaxableIncomeCentavos)} />
        </BirLine>
        <BirLine no="34" label="Ordinary Allowable Itemized Deductions" sub={isOsd ? "N/A — this client uses OSD." : "This app's aggregate Operating Expenses; not broken into the form's 17-category schedule (see Schedule I)."}>
          <AmountBoxes value={isOsd ? amt(0n) : amt(full.deductionsCentavos)} />
        </BirLine>
        <BirLine no="35" label="Special Allowable Itemized Deductions" sub="Not tracked by this app.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="36" label="NOLCO" sub="Not tracked by this app — no multi-year net-operating-loss history exists yet.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="37" label="Total Deductions (Sum of Items 34 to 36)">
          <AmountBoxes value={isOsd ? amt(0n) : amt(full.deductionsCentavos)} />
        </BirLine>
        <BirLine no="38" label="OR Optional Standard Deduction (OSD) (40% of Item 33)">
          <AmountBoxes value={isOsd ? amt(full.deductionsCentavos) : amt(0n)} />
        </BirLine>
        <BirLine no="39" label="Net Taxable Income/(Loss)">
          <AmountBoxes value={amt(full.netTaxableIncomeCentavos)} />
        </BirLine>
        <BirLine no="40" label="Applicable Income Tax Rate" sub={rcitRate ? undefined : "Not set — add rcit_rate in Settings → Tax Rules."}>
          <span className="font-mono text-[10px]">{rcitRate ? `${(Number(rcitRate.numerator) / Number(rcitRate.denominator)) * 100}%` : "—"}</span>
        </BirLine>
        <BirLine no="41" label="Income Tax Due other than MCIT (Item 39 x Item 40)">
          <AmountBoxes value={rcitDueCentavos !== null ? amt(rcitDueCentavos) : null} />
        </BirLine>
        <BirLine no="42" label="MCIT Due (2% of Item 33)">
          <AmountBoxes value={mcitDueCentavos !== null ? amt(mcitDueCentavos) : null} />
        </BirLine>
        <BirLine no="43" label="Tax Due (Higher of Item 41 or Item 42) (To Part II, Item 14)" sub={usedMcit ? "MCIT applies this year — it exceeds the regular rate tax due." : undefined}>
          <AmountBoxes value={taxDueCentavos !== null ? amt(taxDueCentavos) : null} />
        </BirLine>

        <BirLine no="44" label="Prior Year's Excess Credits other than MCIT" sub="Not tracked by this app.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="45" label="Income Tax Payment under MCIT from Previous Quarter/s" sub="Computed as what the first 3 quarters' 1702Q filings would have paid under MCIT, if that basis was higher then — assumes that amount was actually paid.">
          <AmountBoxes value={amt(first3QuartersMcitCentavos)} />
        </BirLine>
        <BirLine no="46" label="Income Tax Payment under Regular/Normal Rate from Previous Quarter/s">
          <AmountBoxes value={amt(first3QuartersRcitCentavos)} />
        </BirLine>
        <BirLine no="47" label="Excess MCIT Applied this Current Taxable Year" sub="Not tracked by this app — no multi-year MCIT carryforward history exists yet (Schedule IV).">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="48" label="Creditable Tax Withheld from Previous Quarter/s per BIR Form No. 2307" sub="Sum of EWT customers withheld on posted sales invoices, Jan 1 through Sep 30.">
          <AmountBoxes value={amt(ewtFirst9Months)} />
        </BirLine>
        <BirLine no="49" label="Creditable Tax Withheld per BIR Form No. 2307 for the 4th Quarter" sub="Sum of EWT customers withheld on posted sales invoices, Oct 1 through Dec 31.">
          <AmountBoxes value={amt(ewtQ4Centavos)} />
        </BirLine>
        <BirLine no="50–54" label="Foreign Tax Credits / Amended Return / Special / Other" sub="Not tracked by this app.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="55" label="Total Tax Credits/Payments (To Part II, Item 15)">
          <AmountBoxes value={amt(totalCreditsCentavos)} />
        </BirLine>
        <BirLine no="56" label="Net Tax Payable/(Overpayment) (Item 43 Less Item 55) (To Part II, Item 16)">
          <AmountBoxes value={netTaxPayableCentavos !== null ? amt(netTaxPayableCentavos) : null} />
        </BirLine>

        <BirPartTitle>Part V – Tax Relief Availment</BirPartTitle>
        <BirFormNote>Not reproduced here — PEZA/special-law relief isn't tracked by this app (out of scope).</BirFormNote>
      </div>

      <div className="bir-form-page mt-6 border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="1702-RT" revision="January 2018 (ENCS)" pageLabel="Page 3" title="Annual Income Tax Return — Corporation, Partnership and Other Non-Individual Taxpayer Subject Only to Regular Income Tax Rate" />
        <BirPartTitle>Part VI – Schedules</BirPartTitle>
        <BirLine no="Sch. I, 18" label="Total Ordinary Allowable Itemized Deductions (To Part IV, Item 34)" sub="This app's aggregate Operating Expenses — the 17 individual categories (amortization, bad debts, depreciation, salaries, etc.) aren't broken out; complete Items 1–17 by hand from your own records if the breakdown is needed.">
          <AmountBoxes value={isOsd ? null : amt(full.deductionsCentavos)} />
        </BirLine>
        <BirFormNote>
          Schedule II (Special Allowable Itemized Deductions), Schedule III/IIIA (NOLCO), and Schedule IV (MCIT
          excess carryforward) aren't reproduced here — genuine gaps, not simplifications: this app has no
          multi-year loss or MCIT-history tracking yet, and no special/PEZA-deduction tracking. Schedule V
          (book-vs-tax reconciliation) is skipped because this app already treats book net income as taxable income
          directly, with no separate adjustment schedule.
        </BirFormNote>
      </div>
    </div>
  );
}
