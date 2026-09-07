import { requireStaffUser } from "@/lib/auth/current-user";
import { listEmployees } from "@/lib/data/payroll";
import { NewPayrollRunForm } from "./new-payroll-run-form";

export default async function NewPayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffUser();
  const { id } = await params;
  const employees = await listEmployees(user.id, id);

  return (
    <div>
      <h2 className="text-lg font-semibold">New Payroll Run</h2>
      <p className="mt-1 text-sm text-slate-500">
        Select the employees to include and any per-period extras. Statutory contributions and withholding tax are
        computed automatically from Settings → Tax Rules.
      </p>
      <div className="mt-4">
        <NewPayrollRunForm
          clientId={id}
          employees={employees.map((e) => ({ id: e.id, registeredName: e.registeredName, payFrequency: e.payFrequency }))}
        />
      </div>
    </div>
  );
}
