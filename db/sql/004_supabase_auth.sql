-- ============================================================================
-- Keep.Books — Supabase Auth migration: anchor public.users to auth.users.
--
-- public.users.id is now always supplied explicitly (see db/schema/firms.ts —
-- .defaultRandom() was removed) and is meant to equal the corresponding
-- Supabase Auth user's auth.users.id. This adds the actual FK enforcing
-- that, so deleting a Supabase Auth user cleanly cascades to their profile
-- row (and everything that cascades from there).
--
-- The auth schema only exists on a real Supabase-hosted Postgres — this
-- sandbox's local Postgres has no auth.users table at all, and never will
-- (there's no local Supabase Auth service to back it). So this FK is added
-- conditionally: present in production, silently skipped locally. Nothing
-- else in this app depends on the FK actually existing — it's an integrity
-- backstop, not something application logic reads — so skipping it locally
-- doesn't change how anything behaves or tests, only how strictly a
-- Supabase Auth user deletion is enforced to cascade at the DB level.
--
-- Added NOT VALID: on any database with pre-existing public.users rows
-- from before this migration (i.e. every real environment — the demo
-- firm's 3 users existed under the old auth system), those rows' ids
-- don't have a matching auth.users row yet — that only happens once
-- scripts/migrate-demo-users-to-supabase-auth.ts re-keys them. A plain
-- ADD CONSTRAINT validates every existing row immediately and fails on
-- exactly that (confirmed live: "Key (id)=(...) is not present in table
-- 'users'" against a real Supabase project). NOT VALID adds the
-- constraint without checking existing rows — enforced for every new
-- insert/update from this point on — and that script's own final step
-- (VALIDATE CONSTRAINT) confirms it holds for the whole table once the
-- legacy rows are re-keyed.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_id_auth_users_id_fk
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;
