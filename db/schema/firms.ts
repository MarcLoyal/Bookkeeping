import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { userRoleEnum } from "./enums";
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
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id").references(() => firms.id, { onDelete: "cascade" }),
    // Set only for role = client_user: which single client this login belongs to.
    clientId: uuid("client_id").references((): any => clients.id, { onDelete: "cascade" }),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull(),
    // Dev auth shim only — see DECISIONS.md. Production swaps this for Supabase Auth.
    passwordHash: text("password_hash").notNull(),
    // Embedded as a JWT claim at login; bumped on password reset so every
    // session token issued before the reset stops verifying (stateless JWTs
    // have no server-side revocation otherwise — see lib/auth/session.ts).
    tokenVersion: integer("token_version").notNull().default(0),
    active: boolean("active").notNull().default(true),
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
      .references(() => users.id, { onDelete: "cascade" }),
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
