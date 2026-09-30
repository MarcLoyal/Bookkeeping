-- ============================================================================
-- Keep.Books — Supabase Storage RLS for the `receipts` bucket.
--
-- The `storage` schema only exists on a real Supabase-hosted Postgres —
-- this sandbox's local Postgres has none (same situation, same guard, as
-- 004_supabase_auth.sql's auth.users FK). Skipped locally; only takes
-- effect against a real Supabase project. UNTESTABLE IN THIS SANDBOX —
-- first real exercise of this file is against the actual Supabase
-- project, not this migration run.
--
-- Manual step this file does NOT do (Storage buckets aren't created via
-- SQL): create a bucket named exactly `receipts` in the Supabase
-- dashboard (Storage → New bucket), private (not public), before any
-- upload code can work. A reasonable file-size limit (e.g. 10 MB) and
-- allowed MIME types (image/jpeg, image/png, image/webp) can be set
-- there too, as a first line of defense before the app's own checks.
--
-- Object path convention: every object's key is `{clientId}/{source_
-- documents.id}.{ext}` — no bucket name in the key (that's the bucket
-- itself), so storage.foldername(name) reliably returns the owning
-- client's id as its first element for every policy below.
--
-- Why this can't reuse app_current_role()/app_accessible_client_ids()
-- (db/sql/001_functions_triggers_rls.sql, 009_team_roles_rls.sql):
-- those read app.current_user_id, a session-local Postgres variable set
-- by db/client.ts#withUserContext on THIS APP's own connection. A
-- Storage API request (supabase-js .storage.from().upload()/createSigned
-- Url()) is a separate connection through Supabase's Storage service,
-- which authenticates via the request's JWT and exposes auth.uid() —
-- never app.current_user_id, which is simply never set there. So these
-- policies re-derive the same access rules directly against auth.uid(),
-- duplicating (not reusing) app_accessible_client_ids()'s logic. If that
-- function's access rules ever change, these policies need the same
-- change made twice — a real, accepted maintenance cost of Storage RLS
-- living outside this app's own request path.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN

    EXECUTE $sql$
      CREATE POLICY receipts_select ON storage.objects FOR SELECT
      USING (
        bucket_id = 'receipts'
        AND EXISTS (
          SELECT 1
          FROM public.users u
          JOIN public.clients c ON c.id = (storage.foldername(name))[1]::uuid
          WHERE u.id = auth.uid()
            AND u.active
            AND (
              (u.role = 'firm_admin' AND c.firm_id = u.firm_id)
              OR (
                u.role IN ('bookkeeper', 'reviewer', 'viewer')
                AND c.firm_id = u.firm_id
                AND (
                  u.access_scope = 'all'
                  OR EXISTS (SELECT 1 FROM public.user_client_assignments a WHERE a.user_id = u.id AND a.client_id = c.id)
                )
              )
              -- encoder: same per-client scoping as everyone else, PLUS
              -- restricted to their own upload — matches
              -- source_documents_select's identical "own uploads only"
              -- rule for this role (020_source_documents_rls.sql).
              -- `owner` is Supabase Storage's own built-in column, set to
              -- the uploader's auth.uid() automatically — no extra lookup
              -- needed to enforce this half of the check.
              OR (
                u.role = 'encoder'
                AND c.firm_id = u.firm_id
                AND (
                  u.access_scope = 'all'
                  OR EXISTS (SELECT 1 FROM public.user_client_assignments a WHERE a.user_id = u.id AND a.client_id = c.id)
                )
                AND owner = auth.uid()
              )
            )
        )
      );
    $sql$;

    EXECUTE $sql$
      CREATE POLICY receipts_insert ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'receipts'
        AND EXISTS (
          SELECT 1
          FROM public.users u
          JOIN public.clients c ON c.id = (storage.foldername(name))[1]::uuid
          WHERE u.id = auth.uid()
            AND u.active
            AND (
              (u.role = 'firm_admin' AND c.firm_id = u.firm_id)
              OR (
                u.role IN ('bookkeeper', 'encoder')
                AND c.firm_id = u.firm_id
                AND (
                  u.access_scope = 'all'
                  OR EXISTS (SELECT 1 FROM public.user_client_assignments a WHERE a.user_id = u.id AND a.client_id = c.id)
                )
              )
            )
        )
      );
    $sql$;

  END IF;
END $$;
