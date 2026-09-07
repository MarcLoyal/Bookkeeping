import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listPayrollRuns } from "@/lib/data/payroll";

const RUN_TYPE_LABELS: Record<string, string> = {
  regular: "Regular",
  thirteenth_month: "13th Month Pay",
};

export default async function PayrollPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const runs = await listPayrollRuns(user.id, id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Payroll</h2>
          <p className="mt-1 text-sm text-slate-500">{runs.length} payroll runs.</p>
        </div>
        {user.role !== "client_user" && (
          <Link
            href={`/clients/${id}/payroll/new`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            + New Payroll Run
          </Link>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Pay Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/clients/${id}/payroll/${r.id}`} className="font-medium text-slate-900 hover:underline">
                    {r.periodStart} to {r.periodEnd}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.payDate}</td>
                <td className="px-4 py-3 text-slate-600">{RUN_TYPE_LABELS[r.runType] ?? r.runType}</td>
                <td className="px-4 py-3">
                  {r.journalEntryId ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Posted</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Draft</span>
                  )}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No payroll runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
