import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getPayrollRunWithPayslips } from "@/lib/data/payroll";
import { formatCentavos } from "@/lib/money";

const RUN_TYPE_LABELS: Record<string, string> = {
  regular: "Regular",
  thirteenth_month: "13th Month Pay",
};

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const user = await requireCurrentUser();
  const { id, runId } = await params;
  const data = await getPayrollRunWithPayslips(user.id, id, runId);
  if (!data) notFound();
  const { run, payslips } = data;

  const totals = payslips.reduce(
    (acc, p) => ({
      basicPay: acc.basicPay + p.basicPayCentavos,
      grossTaxableIncome: acc.grossTaxableIncome + p.grossTaxableIncomeCentavos,
      sssEmployee: acc.sssEmployee + p.sssEmployeeCentavos,
      sssEmployer: acc.sssEmployer + p.sssEmployerCentavos,
      philhealthEmployee: acc.philhealthEmployee + p.philhealthEmployeeCentavos,
      philhealthEmployer: acc.philhealthEmployer + p.philhealthEmployerCentavos,
      pagibigEmployee: acc.pagibigEmployee + p.pagibigEmployeeCentavos,
      pagibigEmployer: acc.pagibigEmployer + p.pagibigEmployerCentavos,
      withholdingTax: acc.withholdingTax + p.withholdingTaxCentavos,
      netPay: acc.netPay + p.netPayCentavos,
    }),
    {
      basicPay: 0n,
      grossTaxableIncome: 0n,
      sssEmployee: 0n,
      sssEmployer: 0n,
      philhealthEmployee: 0n,
      philhealthEmployer: 0n,
      pagibigEmployee: 0n,
      pagibigEmployer: 0n,
      withholdingTax: 0n,
      netPay: 0n,
    }
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            Payroll Run — {run.periodStart} to {run.periodEnd}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {RUN_TYPE_LABELS[run.runType] ?? run.runType} · Pay date {run.payDate}
          </p>
        </div>
        {run.journalEntryId && (
          <Link href={`/clients/${id}/books/GJ`} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100">
            View General Journal
          </Link>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2 text-right">Basic Pay</th>
              <th className="px-3 py-2 text-right">Taxable Income</th>
              <th className="px-3 py-2 text-right">SSS (EE/ER)</th>
              <th className="px-3 py-2 text-right">PhilHealth (EE/ER)</th>
              <th className="px-3 py-2 text-right">Pag-IBIG (EE/ER)</th>
              <th className="px-3 py-2 text-right">Withholding Tax</th>
              <th className="px-3 py-2 text-right">Net Pay</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payslips.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-900">{p.registeredName}</td>
                <td className="px-3 py-2 text-right font-mono">{formatCentavos(p.basicPayCentavos)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatCentavos(p.grossTaxableIncomeCentavos)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {formatCentavos(p.sssEmployeeCentavos)} / {formatCentavos(p.sssEmployerCentavos)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {formatCentavos(p.philhealthEmployeeCentavos)} / {formatCentavos(p.philhealthEmployerCentavos)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {formatCentavos(p.pagibigEmployeeCentavos)} / {formatCentavos(p.pagibigEmployerCentavos)}
                </td>
                <td className="px-3 py-2 text-right font-mono">{formatCentavos(p.withholdingTaxCentavos)}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold">{formatCentavos(p.netPayCentavos)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            <tr>
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.basicPay)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.grossTaxableIncome)}</td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {formatCentavos(totals.sssEmployee)} / {formatCentavos(totals.sssEmployer)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {formatCentavos(totals.philhealthEmployee)} / {formatCentavos(totals.philhealthEmployer)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {formatCentavos(totals.pagibigEmployee)} / {formatCentavos(totals.pagibigEmployer)}
              </td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.withholdingTax)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCentavos(totals.netPay)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Net pay above is accrued to Salaries Payable, not yet disbursed — record the actual payout as a Cash
        Disbursement against that account when paid.
      </p>
    </div>
  );
}
