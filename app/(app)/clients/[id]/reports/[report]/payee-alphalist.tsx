import { formatCentavos } from "@/lib/money";
import { describeAtc } from "@/lib/tax/atc-codes";
import type { PayeeWithholdingRow } from "@/lib/data/withholding";

/**
 * Monthly Alphalist of Payees (MAP) — every payee this client withheld
 * expanded withholding tax from in the period, one row per payee per
 * nature-of-income (ATC code). Lists every withheld transaction with no
 * BIR inclusion threshold applied — the bookkeeper applies the official
 * rules themselves before submission. Not a BIR form replica.
 */
export function PayeeAlphalist({ rows }: { rows: PayeeWithholdingRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      taxBaseCentavos: acc.taxBaseCentavos + r.taxBaseCentavos,
      taxWithheldCentavos: acc.taxWithheldCentavos + r.taxWithheldCentavos,
    }),
    { taxBaseCentavos: 0n, taxWithheldCentavos: 0n }
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No withheld payments to payees in this period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Payee</th>
            <th className="px-3 py-2">TIN</th>
            <th className="px-3 py-2">Address</th>
            <th className="px-3 py-2">Nature of Income (ATC)</th>
            <th className="px-3 py-2 text-right">Income Payment</th>
            <th className="px-3 py-2 text-right">Tax Withheld</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2">{r.contactName}</td>
              <td className="px-3 py-2 font-mono">
                {r.contactTin ?? <span className="italic text-amber-600">missing</span>}
              </td>
              <td className="px-3 py-2">{r.contactAddress ?? <span className="italic text-amber-600">missing</span>}</td>
              <td className="px-3 py-2">
                {r.atcCode ? (
                  <>
                    <span className="font-mono">{r.atcCode}</span>
                    {describeAtc(r.atcCode) && <span className="text-slate-500"> — {describeAtc(r.atcCode)}</span>}
                  </>
                ) : (
                  <span className="italic text-amber-600">no ATC code entered</span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.taxBaseCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.taxWithheldCentavos)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 font-semibold">
            <td className="px-3 py-2" colSpan={4}>
              Total ({rows.length} row{rows.length === 1 ? "" : "s"})
            </td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.taxBaseCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.taxWithheldCentavos)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
