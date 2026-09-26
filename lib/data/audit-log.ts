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
 * Most recent mutations firm-wide (rule #4). RLS already scopes this to
 * firm_admin/reviewer and to actors within the caller's own firm.
 *
 * Selects before/after only to derive `description` server-side (e.g. role
 * changes) — never returned as raw JSON, since `users` rows include
 * password_hash and this data layer's job is to keep that from ever
 * reaching a client component.
 */
export async function listRecentAuditLog(userId: string, limit = 200): Promise<AuditLogRow[]> {
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
