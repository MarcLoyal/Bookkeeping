import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getFirmDashboardStats } from "@/lib/data/dashboard";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  if (user.role === "client_user") {
    if (!user.clientId) redirect("/login");
    redirect(`/clients/${user.clientId}`);
  }

  const { clients, draftCount } = await getFirmDashboardStats(user.id);
  const active = clients.filter((c) => c.status === "active").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Firm Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Active Clients</div>
          <div className="mt-1 text-2xl font-bold">{active}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Clients</div>
          <div className="mt-1 text-2xl font-bold">{clients.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Unposted Drafts</div>
          <div className="mt-1 text-2xl font-bold">{draftCount}</div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Recent Clients</h2>
          <Link href="/clients" className="text-sm text-slate-600 hover:underline">
            View all →
          </Link>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <tbody className="divide-y divide-slate-100">
              {clients.slice(0, 8).map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="font-medium text-slate-900 hover:underline">
                      {c.registeredName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.tin}</td>
                  <td className="px-4 py-3 capitalize text-slate-500">{c.status}</td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400">
                    No clients yet. <Link href="/clients/new" className="underline">Create one</Link>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
