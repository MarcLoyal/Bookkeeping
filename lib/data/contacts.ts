import "server-only";
import { asc, eq } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { contacts } from "@/db/schema";

export async function listContacts(userId: string, clientId: string) {
  return withUserContext(userId, (tx) =>
    tx.select().from(contacts).where(eq(contacts.clientId, clientId)).orderBy(asc(contacts.registeredName))
  );
}

export type NewContactInput = {
  clientId: string;
  type: "customer" | "supplier" | "both" | "employee";
  registeredName: string;
  tin?: string;
  address?: string;
  vatStatus?: "vat" | "non_vat" | "vat_exempt";
};

export async function createContact(userId: string, input: NewContactInput) {
  return withUserContext(userId, async (tx) => {
    // Id generated client-side, no .returning() — see DECISIONS.md
    // ("RLS + INSERT ... RETURNING doesn't mix").
    const id = crypto.randomUUID();
    await tx.insert(contacts).values({
      id,
      clientId: input.clientId,
      type: input.type,
      registeredName: input.registeredName,
      tin: input.tin || null,
      address: input.address || null,
      vatStatus: input.vatStatus || null,
    });
    return { id };
  });
}
