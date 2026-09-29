import "server-only";
import { asc } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { users } from "@/db/schema";

export type TeamMemberRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  accessScope: string;
  active: boolean;
  createdAt: Date;
};

/** RLS's users_select already scopes this to the caller's own firm. */
export async function listTeamMembers(userId: string): Promise<TeamMemberRow[]> {
  return withUserContext(userId, (tx) =>
    tx
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
      .orderBy(asc(users.createdAt))
  );
}
