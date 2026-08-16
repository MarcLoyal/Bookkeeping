import { requireFirmAdmin } from "@/lib/auth/current-user";
import { NewClientForm } from "./new-client-form";

export default async function NewClientPage() {
  await requireFirmAdmin();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">New Client</h1>
      <p className="mt-1 text-sm text-slate-500">Onboard a new taxpayer client for this firm.</p>
      <div className="mt-6">
        <NewClientForm />
      </div>
    </div>
  );
}
