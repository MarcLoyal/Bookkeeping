import "server-only";
import { count, eq } from "drizzle-orm";
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
