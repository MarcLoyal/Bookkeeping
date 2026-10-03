import "server-only";
import { desc, eq } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { describeAuditEntry } from "@/lib/audit-log-labels";

export type AuditLogRow = {
  id: string;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  tableName: string;
  recordId: string;
  reason: string | null;
  createdAt: Date;
  description: string;
};

/**
 * Most recent mutations firm-wide (rule #4).
 *
 * Takes `firmId` and filters on it explicitly — not RLS alone. RLS (via
 * withUserContext) still enforces the same firm_admin/reviewer-and-
 * own-firm boundary and stays on as defense in depth, but this query no
 * longer *depends* on RLS being the only thing standing between one
 * firm's audit_log rows and another's. This specific function previously
 * took only `userId`, relied solely on RLS, and leaked cross-firm data
 * in production for exactly that reason (the app was briefly connecting
 * through a role that doesn't enforce RLS — see DECISIONS.md's "Hotfix:
 * Recent Activity / Audit Log taken offline" and the restore entry that
 * added this parameter). A real, redundant predicate here means a repeat
 * of that specific failure mode (wrong DB role/connection) can't
 * reproduce the same leak through this function again — the query
 * itself would still return nothing for another firm even if RLS were
 * silently bypassed.
 *
 * Selects before/after only to derive `description` server-side (e.g. role
 * changes) — never returned as raw JSON, since `users` rows include
 * password_hash and this data layer's job is to keep that from ever
 * reaching a client component.
 */
export async function listRecentAuditLog(userId: string, firmId: string, limit = 200): Promise<AuditLogRow[]> {
  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({
        id: auditLog.id,
        actorName: users.name,
        actorEmail: users.email,
        action: auditLog.action,
        tableName: auditLog.tableName,
        recordId: auditLog.recordId,
        reason: auditLog.reason,
        createdAt: auditLog.createdAt,
        before: auditLog.before,
        after: auditLog.after,
      })
      .from(auditLog)
      .innerJoin(users, eq(auditLog.actorUserId, users.id))
      .where(eq(users.firmId, firmId))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);

    return rows.map(({ before, after, ...rest }) => ({
      ...rest,
      description: describeAuditEntry({
        action: rest.action,
        tableName: rest.tableName,
        before: before as Record<string, unknown> | null,
        after: after as Record<string, unknown> | null,
        reason: rest.reason,
      }),
    }));
  });
}
