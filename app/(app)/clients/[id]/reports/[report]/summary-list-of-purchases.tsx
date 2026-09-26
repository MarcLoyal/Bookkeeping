import { formatCentavos } from "@/lib/money";
import { describeAtc } from "@/lib/tax/atc-codes";
import type { PurchaseListRow } from "@/lib/data/tax-reports";

/**
 * Summary of Purchases — a plain listing of every posted purchase for the
 * period, one row per transaction, for the bookkeeper to reference or copy
 * from. Includes purchases regardless of whether EWT was withheld (the
 * EWT-only subset is the separate Alphalist of Payees report). Not a BIR
 * form replica — plain-English column labels only.
 */
export function SummaryListOfPurchases({ rows }: { rows: PurchaseListRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      vatablePurchaseCentavos: acc.vatablePurchaseCentavos + r.vatablePurchaseCentavos,
      exemptPurchaseCentavos: acc.exemptPurchaseCentavos + r.exemptPurchaseCentavos,
      zeroRatedPurchaseCentavos: acc.zeroRatedPurchaseCentavos + r.zeroRatedPurchaseCentavos,
      inputVatCentavos: acc.inputVatCentavos + r.inputVatCentavos,
      ewtAmountCentavos: acc.ewtAmountCentavos + r.ewtAmountCentavos,
      totalCentavos: acc.totalCentavos + r.totalCentavos,
    }),
    {
      vatablePurchaseCentavos: 0n,
      exemptPurchaseCentavos: 0n,
      zeroRatedPurchaseCentavos: 0n,
      inputVatCentavos: 0n,
      ewtAmountCentavos: 0n,
      totalCentavos: 0n,
    }
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No posted purchases in this period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Supplier Invoice No.</th>
            <th className="px-3 py-2">Supplier</th>
            <th className="px-3 py-2">Supplier TIN</th>
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2 text-right">Vatable Purchases</th>
            <th className="px-3 py-2 text-right">Exempt Purchases</th>
            <th className="px-3 py-2 text-right">Zero-Rated Purchases</th>
            <th className="px-3 py-2 text-right">Input VAT</th>
            <th className="px-3 py-2">EWT Code</th>
            <th className="px-3 py-2 text-right">EWT Withheld</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2">{r.invoiceDate}</td>
              <td className="px-3 py-2 font-mono">{r.supplierInvoiceNo}</td>
              <td className="px-3 py-2">{r.contactName}</td>
              <td className="px-3 py-2 font-mono">
                {r.contactTin ?? <span className="italic text-amber-600">missing</span>}
              </td>
              <td className="px-3 py-2">{r.contactAddress ?? <span className="italic text-amber-600">missing</span>}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.vatablePurchaseCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.exemptPurchaseCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.zeroRatedPurchaseCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.inputVatCentavos)}</td>
              <td className="px-3 py-2 font-mono" title={describeAtc(r.ewtCode) ?? undefined}>
                {r.ewtCode ?? "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.ewtAmountCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.totalCentavos)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 font-semibold">
            <td className="px-3 py-2" colSpan={5}>
              Total ({rows.length} purchase{rows.length === 1 ? "" : "s"})
            </td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.vatablePurchaseCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.exemptPurchaseCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.zeroRatedPurchaseCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.inputVatCentavos)}</td>
            <td className="px-3 py-2"></td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.ewtAmountCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.totalCentavos)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
