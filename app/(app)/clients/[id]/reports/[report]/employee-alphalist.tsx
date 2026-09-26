import { formatCentavos } from "@/lib/money";
import type { EmployeeCompensationSummaryRow } from "@/lib/data/payroll";

/**
 * Alphalist of Employees — each employee's compensation and withholding
 * tax for the period, summed from every posted payroll run in range. Each
 * component is reported as stored on the payslip (basic pay, overtime,
 * other taxable earnings, de minimis, 13th month pay, gross taxable
 * income, statutory deductions, withholding tax, net pay) rather than a
 * derived "non-taxable compensation" total, since the exempt portion of
 * 13th month pay isn't separately tracked. Not a BIR form replica.
 */
export function EmployeeAlphalist({ rows }: { rows: EmployeeCompensationSummaryRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      basicPayCentavos: acc.basicPayCentavos + r.basicPayCentavos,
      overtimePayCentavos: acc.overtimePayCentavos + r.overtimePayCentavos,
      otherTaxableEarningsCentavos: acc.otherTaxableEarningsCentavos + r.otherTaxableEarningsCentavos,
      deMinimisCentavos: acc.deMinimisCentavos + r.deMinimisCentavos,
      thirteenthMonthPayCentavos: acc.thirteenthMonthPayCentavos + r.thirteenthMonthPayCentavos,
      grossTaxableIncomeCentavos: acc.grossTaxableIncomeCentavos + r.grossTaxableIncomeCentavos,
      sssEmployeeCentavos: acc.sssEmployeeCentavos + r.sssEmployeeCentavos,
      philhealthEmployeeCentavos: acc.philhealthEmployeeCentavos + r.philhealthEmployeeCentavos,
      pagibigEmployeeCentavos: acc.pagibigEmployeeCentavos + r.pagibigEmployeeCentavos,
      withholdingTaxCentavos: acc.withholdingTaxCentavos + r.withholdingTaxCentavos,
      netPayCentavos: acc.netPayCentavos + r.netPayCentavos,
    }),
    {
      basicPayCentavos: 0n,
      overtimePayCentavos: 0n,
      otherTaxableEarningsCentavos: 0n,
      deMinimisCentavos: 0n,
      thirteenthMonthPayCentavos: 0n,
      grossTaxableIncomeCentavos: 0n,
      sssEmployeeCentavos: 0n,
      philhealthEmployeeCentavos: 0n,
      pagibigEmployeeCentavos: 0n,
      withholdingTaxCentavos: 0n,
      netPayCentavos: 0n,
    }
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        No posted payroll runs for this client in this period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Employee</th>
            <th className="px-3 py-2">TIN</th>
            <th className="px-3 py-2">Position</th>
            <th className="px-3 py-2">Date Hired</th>
            <th className="px-3 py-2">Date Separated</th>
            <th className="px-3 py-2 text-right">Basic Pay</th>
            <th className="px-3 py-2 text-right">Overtime</th>
            <th className="px-3 py-2 text-right">Other Taxable Earnings</th>
            <th className="px-3 py-2 text-right">De Minimis</th>
            <th className="px-3 py-2 text-right">13th Month Pay</th>
            <th className="px-3 py-2 text-right">Gross Taxable Income</th>
            <th className="px-3 py-2 text-right">SSS</th>
            <th className="px-3 py-2 text-right">PhilHealth</th>
            <th className="px-3 py-2 text-right">Pag-IBIG</th>
            <th className="px-3 py-2 text-right">Withholding Tax</th>
            <th className="px-3 py-2 text-right">Net Pay</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.employeeId}>
              <td className="px-3 py-2">{r.registeredName}</td>
              <td className="px-3 py-2 font-mono">
                {r.tin ?? <span className="italic text-amber-600">missing</span>}
              </td>
              <td className="px-3 py-2">{r.position ?? "—"}</td>
              <td className="px-3 py-2">{r.dateHired}</td>
              <td className="px-3 py-2">{r.dateSeparated ?? "—"}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.basicPayCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.overtimePayCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.otherTaxableEarningsCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.deMinimisCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.thirteenthMonthPayCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.grossTaxableIncomeCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.sssEmployeeCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.philhealthEmployeeCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.pagibigEmployeeCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.withholdingTaxCentavos)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(r.netPayCentavos)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 font-semibold">
            <td className="px-3 py-2" colSpan={5}>
              Total ({rows.length} employee{rows.length === 1 ? "" : "s"})
            </td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.basicPayCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.overtimePayCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.otherTaxableEarningsCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.deMinimisCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.thirteenthMonthPayCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.grossTaxableIncomeCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.sssEmployeeCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.philhealthEmployeeCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.pagibigEmployeeCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.withholdingTaxCentavos)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.netPayCentavos)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
