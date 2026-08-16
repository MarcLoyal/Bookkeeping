import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { entryStatusEnum, journalBookEnum } from "./enums";
import { clients } from "./clients";
import { users } from "./firms";
import { accounts } from "./accounts";
import { contacts } from "./contacts";

// Per-client gapless sequence generator for journal_entries.entry_no, incremented
// atomically at posting time (see lib/accounting/posting.ts). Never derived from
// row count or a DB-wide serial — those are not gapless per client.
export const clientCounters = pgTable(
  "client_counters",
  {
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    counterName: text("counter_name").notNull(), // e.g. "journal_entry_no"
    nextValue: integer("next_value").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.clientId, t.counterName] })]
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    entryNo: integer("entry_no"), // assigned atomically at posting time; null while draft
    entryDate: date("entry_date").notNull(),
    book: journalBookEnum("book").notNull(),
    referenceNo: text("reference_no"),
    description: text("description").notNull(),
    // FK to source_documents deferred to Phase 2 (table not built yet in this phase).
    sourceDocumentId: uuid("source_document_id"),
    status: entryStatusEnum("status").notNull().default("draft"),
    postedBy: uuid("posted_by").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    reversalOfEntryId: uuid("reversal_of_entry_id").references((): any => journalEntries.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("journal_entries_client_id_idx").on(t.clientId),
    index("journal_entries_client_date_idx").on(t.clientId, t.entryDate),
    index("journal_entries_status_idx").on(t.status),
    index("journal_entries_book_idx").on(t.clientId, t.book),
    uniqueIndex("journal_entries_client_entry_no_idx").on(t.clientId, t.entryNo),
  ]
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    lineNo: smallint("line_no").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    debitCentavos: bigint("debit_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    creditCentavos: bigint("credit_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    memo: text("memo"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    taxCode: text("tax_code"),
  },
  (t) => [
    index("journal_lines_entry_id_idx").on(t.entryId),
    index("journal_lines_account_id_idx").on(t.accountId),
    check("journal_lines_nonnegative_chk", sql`${t.debitCentavos} >= 0 AND ${t.creditCentavos} >= 0`),
    check(
      "journal_lines_one_sided_chk",
      sql`(${t.debitCentavos} = 0 OR ${t.creditCentavos} = 0)`
    ),
    check(
      "journal_lines_nonzero_chk",
      sql`(${t.debitCentavos} > 0 OR ${t.creditCentavos} > 0)`
    ),
  ]
);
