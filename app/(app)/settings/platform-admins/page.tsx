import { requirePlatformAdmin } from "@/lib/auth/current-user";
import { listPlatformAdmins } from "@/lib/data/platform-admins";
import { InviteAdminForm } from "./invite-form";

export default async function PlatformAdminsPage() {
  const user = await requirePlatformAdmin();
  const admins = await listPlatformAdmins(user.id);

  return (
    <div>
      <h2 className="text-lg font-semibold">Platform Admins</h2>
      <p className="mt-1 text-sm text-slate-500">
        Accounts with platform-wide access, not scoped to any one firm. Invited admins sign in with &quot;Continue
        with Google&quot; only — there&apos;s no password to set.
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <InviteAdminForm />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {admins.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-2">
                  {a.name}
                  {a.id === user.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{a.email}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      a.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {a.active ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{a.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
