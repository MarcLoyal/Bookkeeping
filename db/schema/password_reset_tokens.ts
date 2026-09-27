import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./firms";

/**
 * Unused as of the Supabase Auth migration — password reset is now handled
 * entirely by Supabase (resetPasswordForEmail()/updateUser()), which
 * doesn't need an app-managed token table. Left in place rather than
 * dropped (no urgency, and dropping a table is the one kind of schema
 * change worth being conservative about) — see DECISIONS.md.
 *
 * RLS is enabled with NO policies (see db/sql migration) — deny-by-default
 * for every role except the schema owner.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_tokens_user_id_idx").on(t.userId)]
);
