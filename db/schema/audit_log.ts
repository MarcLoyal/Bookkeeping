import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./firms";

// Every mutation is logged here (non-negotiable rule #4). Populated primarily
// by a DB trigger (see db/sql/001_functions_triggers_rls.sql) so logging
// cannot be bypassed by forgetting to call an app-level helper.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // INSERT | UPDATE | DELETE | custom action name
    tableName: text("table_name").notNull(),
    recordId: text("record_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_table_record_idx").on(t.tableName, t.recordId),
    index("audit_log_actor_idx").on(t.actorUserId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ]
);
