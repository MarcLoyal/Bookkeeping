import "server-only";
import { asc, count, eq, sql } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { clients, journalEntries } from "@/db/schema";

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

/** Most recent journal_entries.createdAt per client this user can access — the "how recently was this client worked on" signal behind each client's activity badge. Clients with no entries yet just don't appear in the map. */
export async function getClientLastActivity(userId: string): Promise<Map<string, Date>> {
  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({ clientId: journalEntries.clientId, lastActivity: sql<Date>`max(${journalEntries.createdAt})` })
      .from(journalEntries)
      .groupBy(journalEntries.clientId);
    return new Map(rows.map((r) => [r.clientId, r.lastActivity]));
  });
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
