import { formatCentavos } from "@/lib/money";
import type { SalesInvoiceListRow } from "@/lib/data/tax-reports";

/**
 * Summary List of Sales — a plain listing of posted sales invoices for the
 * period, one row per invoice, for the bookkeeper to reference or copy
 * from. Not a BIR form replica (no authentic SLS specimen was supplied for
 * this feature) — plain-English column labels only.
 */
export function SummaryListOfSales({ rows }: { rows: SalesInvoiceListRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      vatableSalesCentavos: acc.vatableSalesCentavos + r.vatableSalesCentavos,
      zeroRatedSalesCentavos: acc.zeroRatedSalesCentavos + r.zeroRatedSalesCentavos,
      exemptSalesCentavos: acc.exemptSalesCentavos + r.exemptSalesCentavos,
      outputVatCentavos: acc.outputVatCentavos + r.outputVatCentavos,
      totalCentavos: acc.totalCentavos + r.totalCentavos,
    }),
    { vatableSalesCentavos: 0n, zeroRatedSalesCentavos: 0n, exemptSalesCentavos: 0n, outputVatCentavos: 0n, totalCentavos: 0n }
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No posted sales invoices in this period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Invoice No.</th>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Customer TIN</th>
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2 text-right">Vatable Sales</th>
            <th className="px-3 py-2 text-right">Zero-Rated Sales</th>
            <th className="px-3 py-2 text-right">Exempt Sales</th>
            <th className="px-3 py-2 text-right">Output VAT</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2">{r.invoiceDate}</td>
              <td className="px-3 py-2 font-mono">{r.invoiceNo}</td>
              <td className="px-3 py-2">{r.contactName}</td>
              <td className="px-3 py-2 font-mono">
                {r.contactTin ?? <span className="italic text-amber-600">missing</span>}
              </td>
              <td className="px-3 py-2">{r.contactAddress ?? <span className="italic text-amber-600">missing</span>}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.vatableSalesCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.zeroRatedSalesCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.exemptSalesCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.outputVatCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.totalCentavos)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 font-semibold">
            <td className="px-3 py-2" colSpan={5}>
              Total ({rows.length} invoice{rows.length === 1 ? "" : "s"})
            </td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.vatableSalesCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.zeroRatedSalesCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.exemptSalesCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.outputVatCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.totalCentavos)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
