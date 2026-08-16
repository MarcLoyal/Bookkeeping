import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listClients } from "@/lib/data/clients";

const VAT_LABELS: Record<string, string> = { vat: "VAT", non_vat: "Non-VAT", vat_exempt: "VAT-Exempt" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireCurrentUser();
  if (user.role === "client_user") redirect(`/clients/${user.clientId}`);

  const { q } = await searchParams;
  const allClients = await listClients(user.id);
  const filtered = q
    ? allClients.filter(
        (c) =>
          c.registeredName.toLowerCase().includes(q.toLowerCase()) ||
          c.tradeName?.toLowerCase().includes(q.toLowerCase()) ||
          c.tin.includes(q)
      )
    : allClients;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
        {user.role === "firm_admin" && (
          <Link
            href="/clients/new"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            + New Client
          </Link>
        )}
      </div>

      <form className="mt-4" action="/clients">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by name or TIN..."
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Registered Name</th>
              <th className="px-4 py-3">TIN</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">VAT Status</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/clients/${c.id}`} className="font-medium text-slate-900 hover:underline">
                    {c.registeredName}
                  </Link>
                  {c.tradeName && <div className="text-xs text-slate-500">{c.tradeName}</div>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.tin}</td>
                <td className="px-4 py-3 capitalize text-slate-600">{c.taxpayerType.replace("_", " ")}</td>
                <td className="px-4 py-3 text-slate-600">{VAT_LABELS[c.vatStatus]}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 capitalize">
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No clients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
