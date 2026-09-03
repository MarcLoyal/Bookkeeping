import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./firms";

/**
 * RLS is enabled with NO policies (see db/sql migration) — deny-by-default
 * for every role except the schema owner. Only lib/auth/password-reset.ts,
 * via db/authClient.ts's RLS-bypassing connection, ever touches this table —
 * the same pattern login.ts already uses to look up a user before a session
 * exists. The app's normal RLS-bound role has zero access, on purpose.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_tokens_user_id_idx").on(t.userId)]
);
