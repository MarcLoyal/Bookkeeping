import { requireTeamManageAccess } from "@/lib/auth/current-user";
import { listClients } from "@/lib/data/clients";
import { listTeamMembers } from "@/lib/data/team";
import { AddTeamMemberForm } from "./add-team-member-form";

const ROLE_LABELS: Record<string, string> = {
  firm_admin: "Owner",
  bookkeeper: "Bookkeeper",
  reviewer: "Reviewer",
  encoder: "Encoder",
  viewer: "Viewer",
  client_user: "Client",
};

export default async function TeamPage() {
  const user = await requireTeamManageAccess();
  const isOwner = user.role === "firm_admin";
  const [members, clientRows] = await Promise.all([listTeamMembers(user.id), listClients(user.id)]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.tradeName || c.registeredName }));

  return (
    <div>
      <h2 className="text-lg font-semibold">Team</h2>
      <p className="mt-1 text-sm text-slate-500">
        {isOwner
          ? "Invite team members and set their role. Owner and Bookkeeper see every client by default unless you assign specific ones."
          : "Add Encoder accounts and assign them to your own clients. Only an Owner can add other roles."}
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <AddTeamMemberForm isOwner={isOwner} clients={clients} />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Access</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2">
                  {m.name}
                  {m.id === user.id && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                </td>
                <td className="px-4 py-2 text-slate-600">{m.email}</td>
                <td className="px-4 py-2">{ROLE_LABELS[m.role] ?? m.role}</td>
                <td className="px-4 py-2 text-slate-600">{m.accessScope === "all" ? "Every client" : "Assigned clients only"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      m.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {m.active ? "Active" : "Deactivated"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
