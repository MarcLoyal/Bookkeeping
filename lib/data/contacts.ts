import "server-only";
import { asc, eq } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { contacts } from "@/db/schema";

export async function listContacts(userId: string, clientId: string) {
  return withUserContext(userId, (tx) =>
    tx.select().from(contacts).where(eq(contacts.clientId, clientId)).orderBy(asc(contacts.registeredName))
  );
}
