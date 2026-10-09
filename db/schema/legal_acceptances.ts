import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./firms";

// One row per acceptance event — append-only, never updated, same
// immutability reasoning as audit_log (db/schema/audit_log.ts): a record
// of "who accepted which version, when" is only trustworthy if it can't
// be edited after the fact. A user re-accepting a later version (because
// the checked-out version constants in lib/legal/versions.ts bumped)
// just inserts a new row; the most recent row per user is the current
// acceptance state.
export const legalAcceptances = pgTable(
  "legal_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    termsVersion: text("terms_version").notNull(),
    privacyVersion: text("privacy_version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("legal_acceptances_user_id_idx").on(t.userId)]
);
