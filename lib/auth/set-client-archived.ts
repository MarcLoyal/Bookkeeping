import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withUserContext } from "@/db/client";
import { clients } from "@/db/schema";
import type { CurrentUser } from "./current-user";

export const setClientArchivedSchema = z.object({
  clientId: z.string().uuid(),
  archived: z.boolean(),
});

export type SetClientArchivedResult = { ok: true } | { ok: false; error: string };

/**
 * Archives or reactivates a client — never deletes. There is no client
 * DELETE path anywhere in this app (db/sql/017_client_archive_owner_only.sql
 * dropped the last RLS policy that could have allowed one); every past
 * journal_entries/audit_log row referencing this client keeps working
 * exactly as before, which BIR record retention requires.
 *
 * Owner-only, enforced twice: the check here (for a clean error message)
 * and, as the real backstop, 017's enforce_client_archive_owner_only()
 * trigger, which rejects any other role's attempt to move `status` into
 * or out of 'archived' regardless of what this function does.
 *
 * Deliberately does not block new transaction/journal entry against an
 * archived client — "change delete to archive" asked that BIR history
 * survive, not that an archived client's books be frozen. See
 * DECISIONS.md.
 */
export async function setClientArchived(currentUser: CurrentUser, input: unknown): Promise<SetClientArchivedResult> {
  if (currentUser.role !== "firm_admin") {
    return { ok: false, error: "Only an Owner can archive or reactivate a client." };
  }

  const parsed = setClientArchivedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { clientId, archived } = parsed.data;

  try {
    await withUserContext(currentUser.id, (tx) =>
      tx
        .update(clients)
        .set({ status: archived ? "archived" : "active" })
        .where(eq(clients.id, clientId))
    );
  } catch (err) {
    console.error(`Client ${archived ? "archive" : "reactivate"}: DB update failed:`, err);
    return { ok: false, error: archived ? "Could not archive this client." : "Could not reactivate this client." };
  }

  return { ok: true };
}
