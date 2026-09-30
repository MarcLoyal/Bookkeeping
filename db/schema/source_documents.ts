import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { users } from "./firms";

/**
 * A single uploaded image (currently: one receipt/invoice photo) backing a
 * journal entry — see journal.ts's journalEntries.sourceDocumentId, whose
 * comment has said "FK to source_documents deferred to Phase 2" since
 * Phase 0/1. This is that table, finally built for AI receipt capture.
 *
 * `storagePath` is relative to the fixed `receipts` Supabase Storage
 * bucket (not stored per-row — one bucket for the whole app), in the form
 * `{clientId}/{this row's id}.{ext}` — that convention is what lets
 * db/sql/021_receipts_storage_rls.sql's storage.objects policies derive
 * the owning client from the object path alone, without a second lookup.
 *
 * `clientId` is denormalized here (also reachable via the journal entry
 * that references this row) so this table's own RLS can scope by client
 * directly, the same way every other client-scoped table in this schema
 * does — no join through journal_entries needed, and this row can exist
 * before any journal entry does (uploaded first, entry created from the
 * extraction result second).
 */
export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("source_documents_client_id_idx").on(t.clientId)]
);
