import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listEmployees } from "@/lib/data/payroll";
import { formatCentavos } from "@/lib/money";

const PAY_FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  semi_monthly: "Semi-Monthly",
};

export default async function EmployeesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const employees = await listEmployees(user.id, id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Employees</h2>
          <p className="mt-1 text-sm text-slate-500">{employees.length} employees on payroll.</p>
        </div>
        {user.role !== "client_user" && (
          <Link
            href={`/clients/${id}/employees/new`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            + Add Employee
          </Link>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Pay Frequency</th>
              <th className="px-4 py-3 text-right">Basic Pay</th>
              <th className="px-4 py-3">MWE</th>
              <th className="px-4 py-3">Date Hired</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{e.registeredName}</td>
                <td className="px-4 py-3 text-slate-600">{e.position ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{PAY_FREQUENCY_LABELS[e.payFrequency] ?? e.payFrequency}</td>
                <td className="px-4 py-3 text-right font-mono">{formatCentavos(e.basicPayCentavos)}</td>
                <td className="px-4 py-3 text-slate-600">{e.isMinimumWageEarner === "yes" ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-slate-600">{e.dateHired}</td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
