import "server-only";
import { asc, eq, gte, sql } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { firms, users } from "@/db/schema";

export type PlatformStats = {
  totalFirms: number;
  totalActiveUsers: number;
  newFirmsThisWeek: number;
  newFirmsThisMonth: number;
  signupMethodBreakdown: { method: string; count: number }[];
};

export type FirmDashboardRow = {
  id: string;
  name: string;
  createdAt: Date;
  ownerName: string | null;
  ownerEmail: string | null;
  signupMethod: "email" | "google" | null;
  clientCount: number;
  lastActiveAt: Date | null;
};

function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

function startOfMonth(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(1);
  return d;
}

export async function getPlatformStats(currentAdminId: string): Promise<PlatformStats> {
  return withUserContext(currentAdminId, async (tx) => {
    const now = new Date();

    const [{ count: totalFirms }] = await tx.select({ count: sql<number>`count(*)::int` }).from(firms);

    const [{ value: totalActiveUsers }] = (await tx.execute(
      sql`select platform_total_active_users() as value`
    )) as unknown as { value: number }[];

    const [{ count: newFirmsThisWeek }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(firms)
      .where(gte(firms.createdAt, startOfWeek(now)));

    const [{ count: newFirmsThisMonth }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(firms)
      .where(gte(firms.createdAt, startOfMonth(now)));

    const owners = await tx.select({ signupMethod: users.signupMethod }).from(users).where(eq(users.role, "firm_admin"));
    const breakdown = new Map<string, number>();
    for (const { signupMethod } of owners) {
      const key = signupMethod ?? "unknown";
      breakdown.set(key, (breakdown.get(key) ?? 0) + 1);
    }

    return {
      totalFirms,
      totalActiveUsers,
      newFirmsThisWeek,
      newFirmsThisMonth,
      signupMethodBreakdown: Array.from(breakdown, ([method, count]) => ({ method, count })),
    };
  });
}

/**
 * One row per firm: name, its owner (the earliest-created firm_admin —
 * a firm can have more than one via in-app staff invites, this picks the
 * one that actually signed the firm up), client count, and last-active
 * (most recent LOGIN by anyone at that firm). Client counts and
 * last-active come from db/sql/007_platform_admin_dashboard.sql's
 * SECURITY DEFINER functions, not raw row access — see that file's doc
 * comment for why.
 */
export async function listFirmsForDashboard(currentAdminId: string): Promise<FirmDashboardRow[]> {
  return withUserContext(currentAdminId, async (tx) => {
    const [firmRows, ownerRows, clientCountRows, lastActiveRows] = await Promise.all([
      tx.select({ id: firms.id, name: firms.name, createdAt: firms.createdAt }).from(firms).orderBy(asc(firms.createdAt)),
      tx
        .select({ firmId: users.firmId, name: users.name, email: users.email, signupMethod: users.signupMethod, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.role, "firm_admin")),
      tx.execute(sql`select firm_id, client_count from platform_client_counts()`) as unknown as Promise<
        { firm_id: string; client_count: number }[]
      >,
      tx.execute(sql`select firm_id, last_active_at from platform_firms_last_active()`) as unknown as Promise<
        { firm_id: string; last_active_at: Date }[]
      >,
    ]);

    // Earliest firm_admin per firm — done in JS rather than a SQL DISTINCT
    // ON: the number of firms here is small, and this keeps the query
    // portable without depending on a specific Drizzle version's support
    // for that clause. Revisit if this ever needs to scale past a query
    // that's comfortable to run in full.
    const ownerByFirm = new Map<string, (typeof ownerRows)[number]>();
    for (const owner of ownerRows) {
      if (!owner.firmId) continue;
      const existing = ownerByFirm.get(owner.firmId);
      if (!existing || owner.createdAt < existing.createdAt) ownerByFirm.set(owner.firmId, owner);
    }

    const clientCountByFirm = new Map(clientCountRows.map((r) => [r.firm_id, r.client_count]));
    const lastActiveByFirm = new Map(lastActiveRows.map((r) => [r.firm_id, r.last_active_at]));

    return firmRows.map((firm) => {
      const owner = ownerByFirm.get(firm.id);
      return {
        id: firm.id,
        name: firm.name,
        createdAt: firm.createdAt,
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        signupMethod: (owner?.signupMethod as "email" | "google" | null) ?? null,
        clientCount: clientCountByFirm.get(firm.id) ?? 0,
        lastActiveAt: lastActiveByFirm.get(firm.id) ?? null,
      };
    });
  });
}
