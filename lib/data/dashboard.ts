import "server-only";
import { asc, count, desc, eq, lte, sql } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { clients, journalEntries } from "@/db/schema";
import { activityHealthFor } from "@/lib/activity-health";
import type { PeriodStat } from "@/app/(app)/dashboard/stat-card";

export async function getFirmDashboardStats(userId: string) {
  return withUserContext(userId, async (tx) => {
    const clientRows = await tx.select().from(clients);
    const [{ value: draftCount }] = await tx
      .select({ value: count() })
      .from(journalEntries)
      .where(eq(journalEntries.status, "draft"));

    return { clients: clientRows, draftCount };
  });
}

/**
 * Most recent journal_entries.createdAt per client this user can access —
 * the "how recently was this client worked on" signal behind each client's
 * activity badge. Clients with no entries yet just don't appear in the map.
 *
 * `asOf`, when given, answers "what would this map have looked like as of
 * that date" (entries after it excluded) — used by
 * getClientAttentionStat() below to evaluate activity health at a past
 * reference point, not just now.
 */
export async function getClientLastActivity(userId: string, asOf?: Date): Promise<Map<string, Date>> {
  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({ clientId: journalEntries.clientId, lastActivity: sql<Date>`max(${journalEntries.createdAt})` })
      .from(journalEntries)
      .where(asOf ? lte(journalEntries.createdAt, asOf) : undefined)
      .groupBy(journalEntries.clientId);
    return new Map(rows.map((r) => [r.clientId, r.lastActivity]));
  });
}

/**
 * "Clients Needing Attention" dashboard stat: how many currently-active
 * clients are NOT in "active" activity health (i.e. quiet, dormant, or
 * never) — same threshold `activityHealthFor` already uses for each
 * client's individual badge, just counted.
 *
 * Takes `activeClientIds` and `lastActivityNow` as params rather than
 * fetching them itself — the dashboard page already has both (from
 * `getFirmDashboardStats`'s client rows and its own
 * `getClientLastActivity(userId)` call for the activity badges), so
 * re-fetching here would just be a second identical round trip for data
 * the caller already has. Only issues the one genuinely new query: last
 * activity as of 7 days ago.
 *
 * The `previous` side evaluates the same fixed set of today's active
 * clients against their activity health 7 days ago (same clients, same
 * thresholds, different reference date and a `lastActivity` map built with
 * `asOf` 7 days ago) — not a separate query for "which clients were active
 * 7 days ago," since client status isn't tracked historically. A client
 * onboarded within the last week reads as "never active" as of 7 days ago,
 * which is simply true (no work had been logged for them yet) rather than
 * a distortion.
 */
export async function getClientAttentionStat(
  userId: string,
  activeClientIds: string[],
  lastActivityNow: Map<string, Date>
): Promise<PeriodStat> {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

  const lastActivityWeekAgo = await getClientLastActivity(userId, weekAgo);

  const countNeedingAttention = (lastActivity: Map<string, Date>, asOf: Date) =>
    activeClientIds.filter((id) => activityHealthFor(lastActivity.get(id) ?? null, asOf) !== "active").length;

  return {
    current: countNeedingAttention(lastActivityNow, now),
    previous: countNeedingAttention(lastActivityWeekAgo, weekAgo),
  };
}

export type RecentClientRow = { id: string; name: string };

/**
 * Up to `limit` clients this Encoder has personally entered something for,
 * most recent first — the sidebar's "Recent clients" shortcut. Filtered to
 * `created_by = userId` specifically, not just "clients I can see": RLS's
 * journal_entries_select now shows an Encoder every entry on a client they
 * can access (014_encoder_read_all_client_entries.sql), so without this
 * filter "recent" would mean "recently active on this client at all,"
 * which could surface a client this Encoder has never actually touched.
 * Assigned-only falls out of RLS itself — access_scope is always
 * 'assigned' for this role (013_role_access_scope_check.sql), so
 * app_accessible_client_ids() already excludes anything not assigned.
 */
export async function getRecentClientsForEncoder(userId: string, limit = 5): Promise<RecentClientRow[]> {
  return withUserContext(userId, (tx) =>
    tx
      .select({
        id: journalEntries.clientId,
        name: clients.registeredName,
        lastActivity: sql<Date>`max(${journalEntries.createdAt})`.as("last_activity"),
      })
      .from(journalEntries)
      .innerJoin(clients, eq(journalEntries.clientId, clients.id))
      .where(eq(journalEntries.createdBy, userId))
      .groupBy(journalEntries.clientId, clients.registeredName)
      .orderBy(desc(sql`max(${journalEntries.createdAt})`))
      .limit(limit)
  );
}

export type FirmDraftRow = {
  id: string;
  clientId: string;
  clientName: string;
  book: "GJ" | "CRB" | "CDB" | "SJ" | "PJ";
  entryDate: string;
  description: string;
  referenceNo: string | null;
  createdAt: Date;
};

/** Every unposted draft entry across every client this user can access, oldest first -- the firm-wide queue behind the "Unposted Drafts" dashboard card. */
export async function listFirmDrafts(userId: string): Promise<FirmDraftRow[]> {
  return withUserContext(userId, (tx) =>
    tx
      .select({
        id: journalEntries.id,
        clientId: journalEntries.clientId,
        clientName: clients.registeredName,
        book: journalEntries.book,
        entryDate: journalEntries.entryDate,
        description: journalEntries.description,
        referenceNo: journalEntries.referenceNo,
        createdAt: journalEntries.createdAt,
      })
      .from(journalEntries)
      .innerJoin(clients, eq(journalEntries.clientId, clients.id))
      .where(eq(journalEntries.status, "draft"))
      .orderBy(asc(journalEntries.createdAt))
  );
}
