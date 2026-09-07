import { AmountBoxes, TextBoxes, TinBoxes } from "@/components/bir/digit-boxes";
import { BirFormHeader, BirFormNote, BirLine, BirPartTitle } from "@/components/bir/form-header";
import { describeAtc } from "@/lib/tax/atc-codes";
import { formatCentavos, type Centavos } from "@/lib/money";
import type { WithholdingCertificate } from "@/lib/data/withholding";

/** Part III on the real form is a plain ruled table (unlike Part I/II's per-digit boxed fields), so amounts here are formatted text, right-aligned, rather than boxed digits — boxing five amount columns side by side doesn't fit this page width. */
function Amount({ value }: { value: Centavos }) {
  return <span className="font-mono">{formatCentavos(value)}</span>;
}

/**
 * A visual replica of BIR Form 2307 (Certificate of Creditable Tax Withheld
 * at Source, January 2018 ENCS) — field positions, labels, and line numbers
 * match the real form, sourced from the actual form PDF supplied for this
 * feature. Part I (Payee) is the supplier/contact this certificate is being
 * issued to; Part II (Payor) is this client, the withholding agent. Part
 * III's income-payment table (Section A on the real form) is filled per ATC
 * code from posted purchases with expanded withholding tax flagged; Section
 * B (money payments subject to business-tax withholding, a different tax
 * category) isn't tracked by this app and is omitted rather than shown as
 * zero. Signature/accreditation lines are left blank — this is a
 * print/reference aid, not a signed, filed document.
 */
export function Bir2307Certificate({
  payee,
  payor,
  from,
  to,
}: {
  payee: WithholdingCertificate;
  payor: { registeredName: string; tin: string; address: string };
  from: string;
  to: string;
}) {
  return (
    <div className="mx-auto max-w-[850px] bg-white text-slate-900">
      <div className="bir-form-page border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="2307" revision="January 2018 (ENCS)" pageLabel="Page 1" title="Certificate of Creditable Tax Withheld at Source" />
        <BirFormNote>Fill in all applicable spaces. Mark all appropriate boxes with an “X”.</BirFormNote>

        <BirLine no="1" label={<>For the Period — From <span className="font-mono">{from}</span> To <span className="font-mono">{to}</span></>}>
          <></>
        </BirLine>

        <BirPartTitle>Part I – Payee Information</BirPartTitle>
        <BirLine no="2" label="Taxpayer Identification Number (TIN)">
          <TinBoxes tin={payee.contactTin} />
        </BirLine>
        <BirLine no="3" label="Payee's Name (Last Name, First Name, Middle Name for Individual OR Registered Name for Non-Individual)">
          <TextBoxes value={payee.contactName} length={40} />
        </BirLine>
        <BirLine no="4" label="Registered Address">
          <TextBoxes value={payee.contactAddress} length={40} />
        </BirLine>

        <BirPartTitle>Part II – Payor Information</BirPartTitle>
        <BirLine no="6" label="Taxpayer Identification Number (TIN)">
          <TinBoxes tin={payor.tin} />
        </BirLine>
        <BirLine no="7" label="Payor's Name (Last Name, First Name, Middle Name for Individual OR Registered Name for Non-Individual)">
          <TextBoxes value={payor.registeredName} length={40} />
        </BirLine>
        <BirLine no="8" label="Registered Address">
          <TextBoxes value={payor.address} length={40} />
        </BirLine>
      </div>

      <div className="bir-form-page mt-6 border border-slate-300 p-6 shadow-sm">
        <BirFormHeader formNo="2307" revision="January 2018 (ENCS)" pageLabel="Page 2" title="Certificate of Creditable Tax Withheld at Source" />
        <BirPartTitle>Part III – Details of Monthly Income Payments and Taxes Withheld</BirPartTitle>

        <table className="w-full border-collapse text-[9px]">
          <thead>
            <tr className="border-b border-slate-300 font-semibold">
              <th className="py-2 text-left">Income Payments Subject to Expanded Withholding Tax</th>
              <th className="py-2 text-left">ATC</th>
              <th className="py-2 text-right">1st Month</th>
              <th className="py-2 text-right">2nd Month</th>
              <th className="py-2 text-right">3rd Month</th>
              <th className="py-2 text-right">Total</th>
              <th className="py-2 text-right">Tax Withheld</th>
            </tr>
          </thead>
          <tbody>
            {payee.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-2 italic text-slate-500">
                  No posted purchases with expanded withholding tax flagged for this contact in this period.
                </td>
              </tr>
            )}
            {payee.rows.map((row) => {
              const [m1, m2, m3] = monthsOf(from);
              return (
                <tr key={row.atcCode || "uncoded"} className="border-b border-slate-200">
                  <td className="py-2 pr-2">{describeAtc(row.atcCode) ?? <span className="text-slate-400">Not classified against the ATC schedule</span>}</td>
                  <td className="py-2 pr-2 font-mono">{row.atcCode || "—"}</td>
                  <td className="py-2 text-right"><Amount value={row.monthlyIncomePaymentCentavos.get(m1) ?? 0n} /></td>
                  <td className="py-2 text-right"><Amount value={row.monthlyIncomePaymentCentavos.get(m2) ?? 0n} /></td>
                  <td className="py-2 text-right"><Amount value={row.monthlyIncomePaymentCentavos.get(m3) ?? 0n} /></td>
                  <td className="py-2 text-right"><Amount value={row.totalIncomePaymentCentavos} /></td>
                  <td className="py-2 text-right"><Amount value={row.totalTaxWithheldCentavos} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <BirLine no="Total" label="Total Tax Withheld for the Quarter">
          <AmountBoxes value={payee.grandTotalTaxWithheldCentavos} />
        </BirLine>

        <BirFormNote>
          Section B on the real form (money payments subject to withholding of business tax, a separate tax
          category from expanded withholding tax) isn't tracked by this app and is omitted here. Signature,
          accreditation, and issue/expiry date fields are left blank — this is a print/reference aid, not a signed,
          filed document.
        </BirFormNote>
      </div>
    </div>
  );
}

/** The three calendar months (1-12) that make up the quarter beginning at `from`. Purely a display grouping — the underlying data is bucketed by actual invoice month, so a `from`/`to` range spanning something other than one calendar quarter will still show correctly labeled months, just not literally "1st/2nd/3rd of the quarter" if the range itself isn't a quarter. */
function monthsOf(from: string): [number, number, number] {
  const startMonth = Number(from.slice(5, 7));
  const quarterStart = Math.floor((startMonth - 1) / 3) * 3 + 1;
  return [quarterStart, quarterStart + 1, quarterStart + 2];
}
