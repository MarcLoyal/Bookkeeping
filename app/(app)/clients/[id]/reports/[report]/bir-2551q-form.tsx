import { AmountBoxes, TextBoxes, TinBoxes } from "@/components/bir/digit-boxes";
import { BirFormHeader, BirFormNote, BirLine, BirPartTitle } from "@/components/bir/form-header";
import type { PercentageTaxSummary } from "@/lib/tax/percentage-tax";

/**
 * A visual replica of BIR Form 2551Q (Quarterly Percentage Tax Return,
 * January 2018 ENCS) — field positions, labels, and line numbers match the
 * real form, sourced from the actual form PDF supplied for this feature.
 * As with the 2550Q replica, only lines this app has real data for are
 * filled in: Part I background info from the client record, and Schedule 1
 * row 1 / Part II line 14 from the percentage-tax computation. The
 * Alphanumeric Tax Code (Table 1 on page 2 of the real form) depends on
 * which of ~20 business categories the client falls under — this app
 * doesn't track that classification, so the ATC box is left blank rather
 * than guessed. Tax credits, penalties, and payment details are likewise
 * left blank. This is a print/reference aid, not a filed document.
 */
export function Bir2551QForm({
  client,
  quarterLabel,
  from,
  to,
  summary,
}: {
  client: { registeredName: string; tin: string; rdoCode: string; address: string };
  quarterLabel: string;
  from: string;
  to: string;
  summary: PercentageTaxSummary;
}) {
  const ratePercent = summary.rateDenominator === 0n ? "" : `${(Number(summary.rateNumerator) / Number(summary.rateDenominator)) * 100}%`;

  return (
    <div className="mx-auto max-w-[850px] bg-white text-slate-900">
      <div className="bir-form-page border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="2551Q" revision="January 2018 (ENCS)" pageLabel="Page 1" title="Quarterly Percentage Tax Return" />
        <BirFormNote>
          Enter all required information in CAPITAL LETTERS using BLACK ink. Mark applicable boxes with an “X”. Two
          copies MUST be filed with the BIR and one held by the Taxpayer.
        </BirFormNote>

        <BirLine no="3" label={<>Quarter — <span className="font-mono">{from}</span> to <span className="font-mono">{to}</span></>}>
          <span className="text-[10px] text-slate-500">{quarterLabel}</span>
        </BirLine>

        <BirPartTitle>Part I – Background Information</BirPartTitle>
        <BirLine no="6" label="Taxpayer Identification Number (TIN)">
          <TinBoxes tin={client.tin} />
        </BirLine>
        <BirLine no="7" label="RDO Code">
          <TextBoxes value={client.rdoCode} length={6} />
        </BirLine>
        <BirLine no="8" label="Taxpayer's Name (Last Name, First Name, Middle Name for Individual OR Registered Name for Non-Individual)">
          <TextBoxes value={client.registeredName} length={40} />
        </BirLine>
        <BirLine no="9" label="Registered Address">
          <TextBoxes value={client.address} length={40} />
        </BirLine>

        <BirPartTitle>Part II – Total Tax Payable</BirPartTitle>
        <BirLine no="14" label="Total Tax Due (From Schedule 1 Item 7)">
          <AmountBoxes value={summary.taxDueCentavos} />
        </BirLine>
        <BirLine no="15" label="Creditable Percentage Tax Withheld per BIR Form No. 2307" sub="Not tracked by this app — enter manually from BIR Form 2307s received.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="18" label="Total Tax Credits/Payments (Sum of Items 15 to 17)">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="19" label="Tax Still Payable/(Overpayment) (Item 14 Less Item 18)">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="24" label="TOTAL AMOUNT PAYABLE/(Overpayment) (Sum of Items 19 and 23)" sub="Penalties (20–23) and tax credits above are not tracked by this app — complete by hand before filing.">
          <AmountBoxes value={null} />
        </BirLine>
      </div>

      <div className="bir-form-page mt-6 border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="2551Q" revision="January 2018 (ENCS)" pageLabel="Page 2" title="Quarterly Percentage Tax Return" />
        <BirPartTitle>Schedule 1 – Computation of Tax</BirPartTitle>

        <div className="grid grid-cols-[80px_1fr_60px_1fr] gap-2 border-b border-slate-300 py-2 text-[10px] font-semibold">
          <div>ATC</div>
          <div>Taxable Amount</div>
          <div>Tax Rate</div>
          <div>Tax Due</div>
        </div>
        <div className="grid grid-cols-[80px_1fr_60px_1fr] items-center gap-2 border-b border-slate-300 py-2 text-[10px]">
          <div className="text-slate-400">1 — (specify ATC from Table 1 on the real form; not tracked here)</div>
          <div>
            <AmountBoxes value={summary.grossReceiptsCentavos} wholeDigits={10} />
          </div>
          <div>{ratePercent || "—"}</div>
          <div>
            <AmountBoxes value={summary.taxDueCentavos} wholeDigits={10} />
          </div>
        </div>
        <BirLine no="7" label="Total Tax Due (Sum of Items 1 to 6) (To Part II Item 14)">
          <AmountBoxes value={summary.taxDueCentavos} />
        </BirLine>

        <BirFormNote>
          Table 1 (Alphanumeric Tax Code reference — ~20 categories covering VAT-exempt persons under Sec. 116,
          carriers, franchises, financial intermediaries, insurance, amusement places, etc.) is not reproduced here;
          confirm which ATC applies to this client against the real form before filing.
        </BirFormNote>
      </div>
    </div>
  );
}
