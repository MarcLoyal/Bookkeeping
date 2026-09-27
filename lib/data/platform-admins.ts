import "server-only";
import { asc, eq } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { users } from "@/db/schema";

export type PlatformAdminRow = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  createdAt: Date;
};

/** RLS-scoped via db/sql/006_platform_admin_rls.sql — a platform_admin sees only other platform_admin rows. */
export async function listPlatformAdmins(currentAdminId: string): Promise<PlatformAdminRow[]> {
  return withUserContext(currentAdminId, (tx) =>
    tx
      .select({ id: users.id, email: users.email, name: users.name, active: users.active, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.role, "platform_admin"))
      .orderBy(asc(users.createdAt))
  );
}
