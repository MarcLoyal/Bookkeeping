import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { accessScopeEnum, signupMethodEnum, userRoleEnum } from "./enums";
import { clients } from "./clients";

export const firms = pgTable("firms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    // No defaultRandom(): this id is always supplied explicitly, matching
    // the Supabase Auth user (auth.users.id) it's a profile row for — see
    // db/sql/004_supabase_auth.sql for the FK into the auth schema (Drizzle
    // doesn't model cross-schema tables, so that FK is hand-authored SQL,
    // not generated from here).
    id: uuid("id").primaryKey(),
    firmId: uuid("firm_id").references(() => firms.id, { onDelete: "cascade" }),
    // Set only for role = client_user: which single client this login belongs to.
    clientId: uuid("client_id").references((): any => clients.id, { onDelete: "cascade" }),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull(),
    active: boolean("active").notNull().default(true),
    // Default 'all' covers fresh inserts (new members going forward);
    // 009's migration explicitly backfills every pre-existing row to
    // 'assigned' — see enums.ts's accessScopeEnum doc comment for why.
    accessScope: accessScopeEnum("access_scope").notNull().default("all"),
    // Set once at account creation for a firm's owner (email/password
    // signup vs. Google) — see db/schema/enums.ts's signupMethodEnum doc
    // comment. NULL for every other kind of row.
    signupMethod: signupMethodEnum("signup_method"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_firm_id_idx").on(t.firmId), index("users_client_id_idx").on(t.clientId)]
);

// Scopes a bookkeeper/reviewer to specific clients (firm_admin bypasses this — sees all clients in their firm).
export const userClientAssignments = pgTable(
  "user_client_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references((): any => clients.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_client_assignments_user_client_idx").on(t.userId, t.clientId),
    index("user_client_assignments_client_id_idx").on(t.clientId),
  ]
);
