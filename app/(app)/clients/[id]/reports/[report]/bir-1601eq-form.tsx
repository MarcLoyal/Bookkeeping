import { AmountBoxes, TextBoxes, TinBoxes } from "@/components/bir/digit-boxes";
import { BirFormHeader, BirFormNote, BirLine, BirPartTitle } from "@/components/bir/form-header";
import { describeAtc } from "@/lib/tax/atc-codes";
import { sumCentavos } from "@/lib/money";
import type { AtcScheduleRow } from "@/lib/data/withholding";

/**
 * A visual replica of BIR Form 1601-EQ (Quarterly Remittance Return of
 * Creditable Income Taxes Withheld [Expanded], January 2019 ENCS) — field
 * positions, labels, and line numbers match the real form, sourced from the
 * actual form PDF supplied for this feature. Part II's ATC schedule (Lines
 * 13-18) is filled from posted purchases with expanded withholding tax
 * flagged; the ATC code shown is whatever was entered on each purchase
 * (free text at posting time — this app doesn't validate it against the
 * schedule), with a description looked up from the form's own printed ATC
 * table when the code is recognized. Remittances/credits already paid
 * (Lines 20-25), penalties (27-31), and Part III payment details (32-35)
 * aren't tracked by this app and are left as blank boxes rather than
 * assumed zero. This is a print/reference aid, not a filed document.
 */
export function Bir1601EqForm({
  client,
  quarterLabel,
  from,
  to,
  schedule,
}: {
  client: { registeredName: string; tin: string; rdoCode: string; address: string };
  quarterLabel: string;
  from: string;
  to: string;
  schedule: AtcScheduleRow[];
}) {
  const totalTaxWithheldCentavos = sumCentavos(schedule.map((r) => r.taxWithheldCentavos));

  return (
    <div className="mx-auto max-w-[850px] bg-white text-slate-900">
      <div className="bir-form-page border border-slate-300 p-6 shadow-sm">
        <BirFormHeader
          formNo="1601-EQ"
          revision="January 2019 (ENCS)"
          pageLabel="Page 1"
          title="Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)"
        />
        <BirFormNote>
          Enter all required information in CAPITAL LETTERS using BLACK ink. Mark applicable boxes with an “X”. Two
          copies MUST be filed with the BIR and one held by the Taxpayer.
        </BirFormNote>

        <BirLine no="1" label={<>For the Quarter — <span className="font-mono">{from}</span> to <span className="font-mono">{to}</span></>}>
          <span className="text-[10px] text-slate-500">{quarterLabel}</span>
        </BirLine>

        <BirPartTitle>Part I – Background Information</BirPartTitle>
        <BirLine no="6" label="Taxpayer Identification Number (TIN)">
          <TinBoxes tin={client.tin} />
        </BirLine>
        <BirLine no="7" label="RDO Code">
          <TextBoxes value={client.rdoCode} length={6} />
        </BirLine>
        <BirLine no="8" label="Withholding Agent's Name (Last Name, First Name, Middle Name for Individual OR Registered Name for Non-Individual)">
          <TextBoxes value={client.registeredName} length={40} />
        </BirLine>
        <BirLine no="9" label="Registered Address">
          <TextBoxes value={client.address} length={40} />
        </BirLine>

        <BirPartTitle>Part II – Computation of Tax</BirPartTitle>
        <div className="grid grid-cols-[70px_1fr_1fr] gap-2 border-b border-slate-300 py-2 text-[10px] font-semibold">
          <div>ATC</div>
          <div className="text-right">Tax Base</div>
          <div className="text-right">Tax Withheld</div>
        </div>
        {schedule.length === 0 && (
          <p className="py-2 text-[10px] italic text-slate-500">
            No posted purchases with expanded withholding tax flagged for this period.
          </p>
        )}
        {schedule.map((row) => (
          <div key={row.atcCode || "uncoded"} className="grid grid-cols-[70px_1fr_1fr] items-start gap-2 border-b border-slate-200 py-2 text-[10px]">
            <div>
              <div className="font-mono">{row.atcCode || "(none)"}</div>
              {describeAtc(row.atcCode) && <div className="text-[9px] text-slate-500">{describeAtc(row.atcCode)}</div>}
            </div>
            <div className="flex justify-end">
              <AmountBoxes value={row.taxBaseCentavos} wholeDigits={10} />
            </div>
            <div className="flex justify-end">
              <AmountBoxes value={row.taxWithheldCentavos} wholeDigits={10} />
            </div>
          </div>
        ))}
        <BirLine no="19" label="Total Tax Withheld (Sum of Lines 13 to 18)">
          <AmountBoxes value={totalTaxWithheldCentavos} />
        </BirLine>
        <BirLine no="20–25" label="Less: Tax Remitted in Return Previously Filed, if this is an Amended Return / Other Credits" sub="Not tracked by this app.">
          <AmountBoxes value={null} />
        </BirLine>
        <BirLine no="26" label="Tax Still Due (Overremittance) (Line 19 Less Line 25)">
          <AmountBoxes value={totalTaxWithheldCentavos} />
        </BirLine>
        <BirLine no="27–31" label="Add: Penalties (Surcharge, Interest, Compromise) / Total Amount Still Due" sub="Not tracked by this app — compute by hand if filing late.">
          <AmountBoxes value={null} />
        </BirLine>
      </div>

      <div className="bir-form-page mt-6 border border-slate-300 p-6 shadow-sm">
        <BirFormHeader
          formNo="1601-EQ"
          revision="January 2019 (ENCS)"
          pageLabel="Page 2"
          title="Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)"
        />
        <BirPartTitle>Part III – Details of Payment</BirPartTitle>
        <BirLine no="32–35" label="Cash/Bank Debit Memo, Check, Tax Debit Memo, Others" sub="Not tracked by this app — complete by hand before filing.">
          <AmountBoxes value={null} />
        </BirLine>

        <BirFormNote>
          The full Schedule of Alphanumeric Tax Codes printed on the real form (professional fees, rentals,
          contractors, top-withholding-agent purchases of goods/services, and more) is not reproduced here; the ATC
          shown for each row above is whatever was entered when the purchase was posted. Verify each code against the
          real form before filing.
        </BirFormNote>
      </div>
    </div>
  );
}
