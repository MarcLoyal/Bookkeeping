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
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_id_auth_users_id_fk
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
