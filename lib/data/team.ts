import "server-only";
import { asc, eq } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { clients, userClientAssignments, users } from "@/db/schema";

export type TeamMemberRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  accessScope: string;
  active: boolean;
  createdAt: Date;
  assignedClients: { id: string; name: string }[];
};

/**
 * RLS's users_select already scopes the member list to the caller's own
 * firm. The assignment rows are a second query rather than a join because
 * uca_select's own RLS scoping (client_id IN accessible clients) is what
 * makes "a Bookkeeper only sees assignments for their own clients"
 * happen automatically — a Bookkeeper viewing this page sees every team
 * member, but only the subset of each member's client assignments that
 * overlap with the Bookkeeper's own access; an Owner sees everything.
 */
export async function listTeamMembers(userId: string): Promise<TeamMemberRow[]> {
  return withUserContext(userId, async (tx) => {
    const members = await tx
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        accessScope: users.accessScope,
        active: users.active,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt));

    const assignments = await tx
      .select({ userId: userClientAssignments.userId, clientId: clients.id, clientName: clients.registeredName, clientTradeName: clients.tradeName })
      .from(userClientAssignments)
      .innerJoin(clients, eq(userClientAssignments.clientId, clients.id));

    const byUser = new Map<string, { id: string; name: string }[]>();
    for (const a of assignments) {
      const list = byUser.get(a.userId) ?? [];
      list.push({ id: a.clientId, name: a.clientTradeName || a.clientName });
      byUser.set(a.userId, list);
    }

    return members.map((m) => ({ ...m, assignedClients: byUser.get(m.id) ?? [] }));
  });
}
