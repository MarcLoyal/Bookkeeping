import { date, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Tax rates, thresholds, and rule parameters as DATA — never a hardcoded
 * literal in application code (non-negotiable rule #6). `value` is stored as
 * an exact decimal (numeric), read as a string and converted to an exact
 * bigint fraction before touching any centavos amount (see lib/money.ts
 * applyRate). Seeded values require CPA verification before real use —
 * surfaced via lastVerifiedAt/lastVerifiedBy in the admin UI.
 */
export const taxRules = pgTable("tax_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(), // e.g. "vat_rate", "percentage_tax_rate", "ewt_professional_fees_rate"
  value: numeric("value", { precision: 20, scale: 8 }).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  notes: text("notes").notNull().default(""),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  lastVerifiedBy: text("last_verified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
