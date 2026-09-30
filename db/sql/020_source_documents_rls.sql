-- ============================================================================
-- Keep.Books — source_documents RLS.
--
-- Mirrors journal_entries' current (009_team_roles_rls.sql) shape exactly,
-- since a source_documents row is an upload that precedes and is later
-- referenced by a journal_entries row (uploaded first, entry created from
-- the AI extraction result second) — the same three roles that can create
-- a draft journal entry (firm_admin, bookkeeper, encoder) are the ones
-- that can upload here, and encoder is scoped to their own uploads only,
-- same as encoder is scoped to their own drafts.
--
-- No UPDATE policy: an uploaded image's row is never edited in place in
-- this app (no feature replaces a receipt's bytes/mime type after upload —
-- a corrected receipt is a fresh upload, not an edit) — deliberately
-- omitted rather than given a policy no code will ever exercise.
--
-- No DELETE policy yet either: nothing in this pass (schema/RLS
-- foundation only, no UI) needs to delete an uploaded document. Left for
-- whichever later PR actually builds a "remove this attachment" action,
-- once real usage says what its rules should be (same reasoning
-- journal_entries' own insert/update/delete split in 009 only appeared
-- once Team & Roles actually needed it, not upfront).
-- ============================================================================

ALTER TABLE source_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY source_documents_select ON source_documents FOR SELECT
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (app_current_role() != 'encoder' OR uploaded_by = app_current_user_id())
  );

CREATE POLICY source_documents_insert ON source_documents FOR INSERT
  WITH CHECK (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper')
      OR (app_current_role() = 'encoder' AND uploaded_by = app_current_user_id())
    )
  );
