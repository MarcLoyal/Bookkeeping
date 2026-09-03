import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getFirmDashboardStats } from "@/lib/data/dashboard";
import { listRecentAuditLog } from "@/lib/data/audit-log";
import { QuickPostPicker } from "./quick-post-picker";

const VAT_LABELS: Record<string, string> = { vat: "VAT", non_vat: "Non-VAT", vat_exempt: "VAT-Exempt" };

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  if (user.role === "client_user") {
    if (!user.clientId) redirect("/login");
    redirect(`/clients/${user.clientId}`);
  }

  const { clients, draftCount } = await getFirmDashboardStats(user.id);
  const active = clients.filter((c) => c.status === "active").length;
  const recentActivity = user.role === "firm_admin" ? await listRecentAuditLog(user.id, 8) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Firm Dashboard</h1>
        {user.role === "firm_admin" && (
          <div className="flex items-center gap-2">
            <QuickPostPicker clients={clients.map((c) => ({ id: c.id, registeredName: c.registeredName }))} />
            <Link
              href="/clients/new"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              + Add Client
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/clients?status=active" className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Active Clients</div>
          <div className="mt-1 text-2xl font-bold">{active}</div>
        </Link>
        <Link href="/clients" className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Total Clients</div>
          <div className="mt-1 text-2xl font-bold">{clients.length}</div>
        </Link>
        <Link
          href="/drafts"
          className={`rounded-lg border p-4 transition hover:shadow-sm ${
            draftCount > 0 ? "border-amber-300 bg-amber-50 hover:border-amber-400" : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className={`text-xs font-medium uppercase tracking-wide ${draftCount > 0 ? "text-amber-700" : "text-slate-600"}`}>
            Unposted Drafts
          </div>
          <div className={`mt-1 text-2xl font-bold ${draftCount > 0 ? "text-amber-900" : ""}`}>{draftCount}</div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
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
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-700">
                          {c.taxpayerType.replace("_", " ")}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          {VAT_LABELS[c.vatStatus]}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.tin}</td>
                    <td className="px-4 py-3 capitalize text-slate-700">{c.status}</td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500">
                      No clients yet. <Link href="/clients/new" className="underline">Create one</Link>.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {user.role === "firm_admin" && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
              <Link href="/settings/audit-log" className="text-sm text-slate-600 hover:underline">
                View all →
              </Link>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-100">
                {recentActivity.map((a) => (
                  <li key={a.id} className="px-4 py-3 text-sm">
                    <div className="text-slate-900">
                      <span className="font-medium capitalize">{a.action.toLowerCase()}</span>{" "}
                      <span className="text-slate-700">{a.tableName.replace(/_/g, " ")}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600">
                      {a.actorName} · {a.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                    </div>
                  </li>
                ))}
                {recentActivity.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-slate-500">No activity logged yet.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
