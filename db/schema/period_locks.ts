import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { users } from "./firms";

export const periodLocks = pgTable(
  "period_locks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    lockedBy: uuid("locked_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
    unlockedBy: uuid("unlocked_by").references(() => users.id, { onDelete: "set null" }),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
    unlockReason: text("unlock_reason"),
  },
  (t) => [
    index("period_locks_client_id_idx").on(t.clientId),
    index("period_locks_client_range_idx").on(t.clientId, t.periodStart, t.periodEnd),
  ]
);
