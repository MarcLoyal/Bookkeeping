import "server-only";
import { withUserContext } from "@/db/client";
import { sourceDocuments } from "@/db/schema";

export type NewSourceDocumentInput = {
  /**
   * Client-generated (crypto.randomUUID() in the browser, see
   * ReceiptCaptureForm), not left to defaultRandom(): the browser needs
   * this id *before* this function ever runs, to build the Storage
   * upload path (`{clientId}/{id}.{ext}`, the convention
   * db/sql/021_receipts_storage_rls.sql's policies depend on) — the
   * upload happens first, this insert second, using the same id.
   */
  id: string;
  clientId: string;
  storagePath: string;
  mimeType: string;
};

/**
 * Runs through the normal RLS-enforcing connection, not authDb: the
 * uploader already has legitimate INSERT access under
 * source_documents_insert (020_source_documents_rls.sql) —
 * firm_admin/bookkeeper unconditionally, encoder scoped to their own
 * upload (enforced there by `uploaded_by = app_current_user_id()`, not
 * re-checked here). No bypass needed or appropriate for this ordinary
 * user action, same reasoning swapActiveClient() gives for using
 * withUserContext instead of authDb.
 */
export async function createSourceDocument(userId: string, input: NewSourceDocumentInput): Promise<void> {
  await withUserContext(userId, (tx) =>
    tx.insert(sourceDocuments).values({
      id: input.id,
      clientId: input.clientId,
      storagePath: input.storagePath,
      mimeType: input.mimeType,
      uploadedBy: userId,
    })
  );
}
