import "server-only";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { firms, users } from "@/db/schema";

export type PeriodStat = { current: number; previous: number };

export type PlatformStats = {
  totalFirms: PeriodStat;
  totalActiveUsers: PeriodStat;
  newFirmsThisWeek: PeriodStat;
  newFirmsThisMonth: PeriodStat;
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

// ISO week start (Monday) — deliberately NOT the same convention as
// startOfWeek() above (which rolls back to Sunday, fine for a "this week"
// label but wrong here): this has to match Postgres's date_trunc('week',
// ...), which is always ISO/Monday-based, so the JS-generated bucket list
// below lines up with the SQL grouping instead of silently mismatching it.
function mondayOfWeek(d: Date): Date {
  const date = new Date(d);
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

export async function getPlatformStats(currentAdminId: string): Promise<PlatformStats> {
  return withUserContext(currentAdminId, async (tx) => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);
    const monthStart = startOfMonth(now);
    const prevMonthStart = new Date(monthStart);
    prevMonthStart.setUTCMonth(prevMonthStart.getUTCMonth() - 1);

    const [{ count: totalFirms }] = await tx.select({ count: sql<number>`count(*)::int` }).from(firms);
    const [{ count: totalFirmsPrevWeek }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(firms)
      .where(lt(firms.createdAt, weekStart));

    // "Previous period" for active users is an approximation, not a stored
    // snapshot: this app has no historical time series for account status.
    // platform_active_users_before(cutoff) counts *currently* active users
    // that already existed before cutoff — a reasonable proxy given active
    // flips rarely (deactivation isn't a routine weekly event), but not an
    // exact "active users as of that date" figure. See 008_platform_dashboard_deltas.sql.
    const [{ value: totalActiveUsers }] = (await tx.execute(
      sql`select platform_total_active_users() as value`
    )) as unknown as { value: number }[];
    const [{ value: totalActiveUsersPrevWeek }] = (await tx.execute(
      sql`select platform_active_users_before(${weekStart.toISOString()}) as value`
    )) as unknown as { value: number }[];

    const [{ count: newFirmsThisWeek }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(firms)
      .where(gte(firms.createdAt, weekStart));
    const [{ count: newFirmsPrevWeek }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(firms)
      .where(and(gte(firms.createdAt, prevWeekStart), lt(firms.createdAt, weekStart)));

    const [{ count: newFirmsThisMonth }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(firms)
      .where(gte(firms.createdAt, monthStart));
    const [{ count: newFirmsPrevMonth }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(firms)
      .where(and(gte(firms.createdAt, prevMonthStart), lt(firms.createdAt, monthStart)));

    const owners = await tx.select({ signupMethod: users.signupMethod }).from(users).where(eq(users.role, "firm_admin"));
    const breakdown = new Map<string, number>();
    for (const { signupMethod } of owners) {
      const key = signupMethod ?? "unknown";
      breakdown.set(key, (breakdown.get(key) ?? 0) + 1);
    }

    return {
      totalFirms: { current: totalFirms, previous: totalFirmsPrevWeek },
      totalActiveUsers: { current: totalActiveUsers, previous: totalActiveUsersPrevWeek },
      newFirmsThisWeek: { current: newFirmsThisWeek, previous: newFirmsPrevWeek },
      newFirmsThisMonth: { current: newFirmsThisMonth, previous: newFirmsPrevMonth },
      signupMethodBreakdown: Array.from(breakdown, ([method, count]) => ({ method, count })),
    };
  });
}

export type WeeklySignups = { weekStart: string; count: number };

/** Weekly firm-signup counts for the last `weeks` ISO weeks (Monday-start), oldest first — zero-filled for weeks with no signups. */
export async function getFirmSignupsByWeek(currentAdminId: string, weeks = 10): Promise<WeeklySignups[]> {
  return withUserContext(currentAdminId, async (tx) => {
    const now = new Date();
    const earliestWeek = mondayOfWeek(now);
    earliestWeek.setUTCDate(earliestWeek.getUTCDate() - (weeks - 1) * 7);

    const rows = (await tx.execute(sql`
      select date_trunc('week', created_at)::date as week_start, count(*)::int as count
      from firms
      where created_at >= ${earliestWeek.toISOString()}
      group by week_start
    `)) as unknown as { week_start: string; count: number }[];

    const byWeek = new Map(rows.map((r) => [r.week_start, r.count]));

    const buckets: WeeklySignups[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = mondayOfWeek(now);
      weekStart.setUTCDate(weekStart.getUTCDate() - i * 7);
      const key = weekStart.toISOString().slice(0, 10);
      buckets.push({ weekStart: key, count: byWeek.get(key) ?? 0 });
    }
    return buckets;
  });
}

export type CumulativeFirms = { weekStart: string; total: number };

/**
 * Running total of firms as of the end of each of the last `weeks` ISO
 * weeks (i.e. cumulative signups, not new signups — see
 * getFirmSignupsByWeek for the weekly deltas this is the running sum of).
 * One COUNT per week rather than a window function: mirrors this file's
 * existing preference for the simpler, more obviously-correct form over a
 * denser single query (see listFirmsForDashboard's owner-per-firm comment)
 * — this only ever runs for a small, fixed number of weeks.
 */
export async function getCumulativeFirmsByWeek(currentAdminId: string, weeks = 10): Promise<CumulativeFirms[]> {
  return withUserContext(currentAdminId, async (tx) => {
    const now = new Date();
    const buckets: CumulativeFirms[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const weekEnd = mondayOfWeek(now);
      weekEnd.setUTCDate(weekEnd.getUTCDate() - i * 7 + 7);
      const cutoff = weekEnd < now ? weekEnd : now;
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(firms)
        .where(lt(firms.createdAt, cutoff));
      const weekStart = mondayOfWeek(now);
      weekStart.setUTCDate(weekStart.getUTCDate() - i * 7);
      buckets.push({ weekStart: weekStart.toISOString().slice(0, 10), total: count });
    }
    return buckets;
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
