import "server-only";
import { asc, eq } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { accounts } from "@/db/schema";

export async function listAccounts(userId: string, clientId: string) {
  return withUserContext(userId, (tx) =>
    tx.select().from(accounts).where(eq(accounts.clientId, clientId)).orderBy(asc(accounts.code))
  );
}
