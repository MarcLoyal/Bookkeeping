import { requireStaffUser } from "@/lib/auth/current-user";
import { NewEmployeeForm } from "./new-employee-form";

export default async function NewEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffUser();
  const { id } = await params;

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold">New Employee</h2>
      <p className="mt-1 text-sm text-slate-500">Add a staff member to run payroll for.</p>
      <div className="mt-4">
        <NewEmployeeForm clientId={id} />
      </div>
    </div>
  );
}
