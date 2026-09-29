import { requireTeamManageAccess } from "@/lib/auth/current-user";
import { listClients } from "@/lib/data/clients";
import { listTeamMembers } from "@/lib/data/team";
import { AddTeamMemberForm } from "./add-team-member-form";
import { TeamRoster } from "./team-roster";

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
          ? "Invite team members and set their role. As Owner, you always see every client. A new Bookkeeper sees every client by default too, unless you assign specific ones — Encoder, Reviewer, and Viewer are always limited to the clients you assign (Encoder needs at least one picked now)."
          : "Add Encoder accounts and assign them to your own clients. Only an Owner can add other roles."}
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <AddTeamMemberForm isOwner={isOwner} clients={clients} />
      </div>

      <TeamRoster members={members} currentUserId={user.id} isOwner={isOwner} allClients={clients} />
    </div>
  );
}
