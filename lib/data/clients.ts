import "server-only";
import { desc, eq } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { accounts, clients, userClientViews } from "@/db/schema";
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

/**
 * Upserts this (user, client) pair's last-viewed timestamp — called from
 * app/(app)/clients/[id]/layout.tsx on every page load under a client, for
 * every role. Best-effort by design: the caller wraps this so a failure
 * here (or slow write) never blocks rendering the actual page — it's
 * sidebar-navigation metadata, not something any page's correctness
 * depends on.
 */
export async function recordClientView(userId: string, clientId: string): Promise<void> {
  await withUserContext(userId, (tx) =>
    tx
      .insert(userClientViews)
      .values({ userId, clientId })
      .onConflictDoUpdate({
        target: [userClientViews.userId, userClientViews.clientId],
        set: { lastViewedAt: new Date() },
      })
  );
}

export type RecentClientRow = { id: string; name: string };

/**
 * Up to `limit` clients this user has recently viewed or worked on — any
 * page under that client counts (see recordClientView(), called from
 * app/(app)/clients/[id]/layout.tsx), not just entries they personally
 * authored. That's deliberate: a Reviewer or Viewer never creates a
 * journal entry at all, so an authorship-based signal would leave them
 * with an empty "Recent clients" section no matter how much they actually
 * use the app. "Only clients the user is allowed to access" falls out of
 * the INNER JOIN against `clients` (itself RLS-scoped by
 * app_accessible_client_ids()) — a view row for a client this session can
 * no longer see (e.g. an assignment since removed) just won't join and
 * silently drops out, no separate filter needed.
 */
export async function getRecentClientsForUser(userId: string, limit = 5): Promise<RecentClientRow[]> {
  return withUserContext(userId, (tx) =>
    tx
      .select({ id: clients.id, name: clients.registeredName })
      .from(userClientViews)
      .innerJoin(clients, eq(userClientViews.clientId, clients.id))
      .orderBy(desc(userClientViews.lastViewedAt))
      .limit(limit)
  );
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
  dateOperationsCommenced?: string;
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
      dateOperationsCommenced: input.dateOperationsCommenced || null,
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

/**
 * There's no general client-edit feature yet — this is deliberately
 * narrow: just the one field MCIT's 4th-taxable-year gate needs (see
 * db/schema/clients.ts), settable after onboarding since it wasn't
 * captured (or wasn't yet relevant) for clients created before this
 * existed.
 */
export async function updateDateOperationsCommenced(userId: string, clientId: string, dateOperationsCommenced: string) {
  return withUserContext(userId, async (tx) => {
    await tx.update(clients).set({ dateOperationsCommenced }).where(eq(clients.id, clientId));
  });
}
