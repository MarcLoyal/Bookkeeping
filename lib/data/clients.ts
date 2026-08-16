import "server-only";
import { desc, eq } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { accounts, clients } from "@/db/schema";
import { PH_SME_CHART_OF_ACCOUNTS } from "@/lib/accounting/coa-template";
import { isUuid } from "@/lib/uuid";

export type ClientListRow = typeof clients.$inferSelect;

/** RLS on `clients` restricts this to whatever the session's user may access — no manual filtering needed. */
export async function listClients(userId: string) {
  return withUserContext(userId, (tx) => tx.select().from(clients).orderBy(desc(clients.createdAt)));
}

export async function getClient(userId: string, clientId: string) {
  if (!isUuid(clientId)) return null;
  return withUserContext(userId, async (tx) => {
    const [row] = await tx.select().from(clients).where(eq(clients.id, clientId)).limit(1);
    return row ?? null;
  });
}

export type NewClientInput = {
  firmId: string;
  registeredName: string;
  tradeName?: string;
  tin: string;
  rdoCode: string;
  taxpayerType: "individual" | "corporation" | "partnership" | "sole_prop" | "professional";
  vatStatus: "vat" | "non_vat" | "vat_exempt";
  incomeTaxRegime: "graduated_itemized" | "graduated_osd" | "eight_percent" | "rcit" | "mcit_applicable";
  address: string;
};

/** Creates the client and seeds it from the PH SME chart-of-accounts template (spec M1). */
export async function createClient(userId: string, input: NewClientInput) {
  return withUserContext(userId, async (tx) => {
    // Generate the id ourselves and skip `.returning()`: under the RLS-bound
    // app role, `INSERT ... RETURNING` re-checks the SELECT policy, whose
    // STABLE helper function evaluates against a snapshot that doesn't yet
    // include this command's own uncommitted insert — Postgres then reports
    // it as a WITH CHECK violation even though the row genuinely qualifies
    // (confirmed: the identical insert without RETURNING succeeds, and the
    // row is visible to a follow-up SELECT in the same transaction).
    const id = crypto.randomUUID();
    await tx.insert(clients).values({
      id,
      firmId: input.firmId,
      registeredName: input.registeredName,
      tradeName: input.tradeName || null,
      tin: input.tin,
      rdoCode: input.rdoCode,
      taxpayerType: input.taxpayerType,
      vatStatus: input.vatStatus,
      incomeTaxRegime: input.incomeTaxRegime,
      address: input.address,
      status: "active",
      onboardedAt: new Date(),
    });

    await tx.insert(accounts).values(
      PH_SME_CHART_OF_ACCOUNTS.map((a) => ({
        clientId: id,
        code: a.code,
        name: a.name,
        type: a.type,
        normalBalance: a.normalBalance,
        fsLineMapping: a.fsLineMapping,
      }))
    );

    return { id };
  });
}
