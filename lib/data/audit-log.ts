import "server-only";
import { desc, eq } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { auditLog, users } from "@/db/schema";

export type AuditLogRow = {
  id: string;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  tableName: string;
  recordId: string;
  reason: string | null;
  createdAt: Date;
};

/** Most recent mutations firm-wide (rule #4). RLS already scopes this to firm_admin/reviewer and to actors within the caller's own firm. */
export async function listRecentAuditLog(userId: string, limit = 200): Promise<AuditLogRow[]> {
  return withUserContext(userId, (tx) =>
    tx
      .select({
        id: auditLog.id,
        actorName: users.name,
        actorEmail: users.email,
        action: auditLog.action,
        tableName: auditLog.tableName,
        recordId: auditLog.recordId,
        reason: auditLog.reason,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .innerJoin(users, eq(auditLog.actorUserId, users.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
  );
}
