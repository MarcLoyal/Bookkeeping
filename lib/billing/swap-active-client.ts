import "server-only";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withUserContext } from "@/db/client";
import { clients } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current-user";

export const swapActiveClientSchema = z.object({
  activateClientId: z.string().uuid(),
});

export type SwapActiveClientResult = { ok: true; deactivatedClientName: string | null } | { ok: false; error: string };

/**
 * The Owner-facing side of "auto-pick, Owner can swap after" — see
 * downgrade-firm-to-free.ts, which does the initial auto-pick. Makes
 * `activateClientId` (currently 'inactive' — over the plan's client
 * limit) active again by demoting whichever currently-active client has
 * gone longest without being viewed (or was never viewed at all), so the
 * firm stays at exactly its plan's client count throughout — never over
 * it, even mid-transaction: the demote UPDATE runs first, then the
 * activate UPDATE, both inside one withUserContext transaction.
 *
 * Runs through the normal RLS-enforcing connection, unlike the platform-
 * admin-only functions in this directory: Owner already has UPDATE
 * access to their own firm's clients via the existing clients_update
 * policy, so no RLS-bypass is needed or appropriate here — this is an
 * ordinary Owner action, not a cross-tenant one.
 */
export async function swapActiveClient(currentUser: CurrentUser, input: unknown): Promise<SwapActiveClientResult> {
  if (currentUser.role !== "firm_admin") {
    return { ok: false, error: "Only an Owner can change which clients are active." };
  }
  if (!currentUser.firmId) {
    return { ok: false, error: "No firm on this account." };
  }

  const parsed = swapActiveClientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { activateClientId } = parsed.data;
  const firmId = currentUser.firmId;

  try {
    return await withUserContext(currentUser.id, async (tx) => {
      const [target] = await tx.select().from(clients).where(eq(clients.id, activateClientId));
      if (!target || target.firmId !== firmId) {
        return { ok: false as const, error: "Client not found." };
      }
      if (target.status !== "inactive") {
        return { ok: false as const, error: "This client is already active." };
      }

      // Least-recently-viewed active client (never-viewed sorts first,
      // via NULLS FIRST ascending) — the one to demote to make room.
      const [toDemote] = (await tx.execute(sql`
        select c.id, c.registered_name as name
        from clients c
        left join user_client_views v on v.client_id = c.id
        where c.firm_id = ${firmId} and c.status in ('onboarding', 'active') and c.id != ${activateClientId}
        group by c.id, c.registered_name
        order by max(v.last_viewed_at) asc nulls first, c.created_at asc
        limit 1
      `)) as unknown as { id: string; name: string }[];

      if (toDemote) {
        await tx.update(clients).set({ status: "inactive" }).where(eq(clients.id, toDemote.id));
      }
      await tx.update(clients).set({ status: "active" }).where(eq(clients.id, activateClientId));

      return { ok: true as const, deactivatedClientName: toDemote?.name ?? null };
    });
  } catch (err) {
    console.error(`swapActiveClient(${activateClientId}): DB update failed:`, err);
    return { ok: false, error: "Could not activate this client — your plan's client limit may already be full." };
  }
}
