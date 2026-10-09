import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { accessScopeEnum, firmPlanEnum, signupMethodEnum, userRoleEnum } from "./enums";
import { clients } from "./clients";

export const firms = pgTable("firms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  settings: jsonb("settings").notNull().default({}),
  // plan/maxClients/maxUsers/perClientAssignmentAllowed are the actual
  // source of truth enforced by db/sql/018_plan_limits.sql's triggers —
  // getPlanLimits() (lib/billing/plan-limits.ts) just reads them off this
  // row. Never derive limits from `plan` alone at read time: enterprise
  // firms have no fixed numbers (set by hand per firm), and keeping the
  // enforced values on the row means the DB trigger and the app read
  // the exact same numbers, not two copies of a free/basic/premium table.
  plan: firmPlanEnum("plan").notNull().default("trial"),
  maxClients: integer("max_clients").notNull().default(10),
  maxUsers: integer("max_users").notNull().default(5),
  perClientAssignmentAllowed: boolean("per_client_assignment_allowed").notNull().default(true),
  // Only meaningful while plan = 'trial'. NULL for every other plan.
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  // Historical marker only — set once, the first time a lazy check
  // (getCurrentUser(), see lib/auth/current-user.ts) notices trialEndsAt
  // has passed while still on the trial plan. NOT what determines
  // whether a firm shows in the platform admin dashboard's expired-trial
  // queue (listExpiredTrialFirms(), lib/data/platform-billing.ts reads
  // trialEndsAt directly for that) — a firm that never logs back in
  // after its trial ends would never trip this flag at all, which is
  // exactly the case the queue most needs to catch. Kept around as a
  // "when did we first notice" record and cleared (set back to NULL)
  // whenever a platform admin changes the firm's plan away from
  // 'trial', so a later trial (if ever re-granted) starts clean.
  trialExpiredFlaggedAt: timestamp("trial_expired_flagged_at", { withTimezone: true }),
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

// One row per (user, client) ever visited, upserted on every page load
// under /clients/[id] (see app/(app)/clients/[id]/layout.tsx) — the
// "recently viewed or worked on" signal behind the sidebar's Recent
// Clients section, for every role, not just whichever roles happen to
// author journal entries.
export const userClientViews = pgTable(
  "user_client_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references((): any => clients.id, { onDelete: "cascade" }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_client_views_user_client_idx").on(t.userId, t.clientId),
    index("user_client_views_client_id_idx").on(t.clientId),
  ]
);
