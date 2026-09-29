import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { NewClientForm } from "./new-client-form";

export default async function NewClientPage() {
  const user = await requireCurrentUser();
  // Owner and Bookkeeper can create clients (RLS's clients_insert policy —
  // see db/sql/009_team_roles_rls.sql); every other role redirects, same
  // as requireFirmAdmin() used to do unconditionally before that role was
  // added to the allowlist.
  if (user.role !== "firm_admin" && user.role !== "bookkeeper") redirect("/dashboard");

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
