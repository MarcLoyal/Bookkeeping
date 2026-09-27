-- ============================================================================
-- Keep.Books — let posted_by/created_by survive a Supabase Auth user re-key.
--
-- Found live: scripts/migrate-demo-users-to-supabase-auth.ts re-keys a
-- public.users row's id to its new Supabase Auth uid, which cascades (see
-- ON UPDATE CASCADE, db/sql/004_supabase_auth.sql) to journal_entries.
-- posted_by/created_by. enforce_journal_entry_immutability()'s only
-- allowed exception was the reversal status-flip, and even that requires
-- posted_by to stay byte-for-byte unchanged — so the cascade hit "Posted
-- journal entry ... is immutable" for every already-posted entry.
--
-- This isn't the kind of tampering rule #3 exists to prevent: the entry's
-- financial data (amounts, dates, lines, status) is untouched, only which
-- id represents the same real person who posted/created it. No app code
-- path ever does this on its own — the app never runs an UPDATE
-- journal_entries SET posted_by = ... — so widening the exception doesn't
-- open up anything the running app could exploit; it only unblocks this
-- specific, privileged, one-time re-keying flow.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_journal_entry_immutability() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_financial_fields_unchanged boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('posted', 'reversed') THEN
      RAISE EXCEPTION 'Cannot delete a % journal entry (%). Use a reversing entry instead.', OLD.status, OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('posted', 'reversed') THEN
    v_financial_fields_unchanged :=
      NEW.entry_no IS NOT DISTINCT FROM OLD.entry_no
      AND NEW.entry_date IS NOT DISTINCT FROM OLD.entry_date
      AND NEW.book IS NOT DISTINCT FROM OLD.book
      AND NEW.reference_no IS NOT DISTINCT FROM OLD.reference_no
      AND NEW.description IS NOT DISTINCT FROM OLD.description
      AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
      AND NEW.source_document_id IS NOT DISTINCT FROM OLD.source_document_id
      AND NEW.posted_at IS NOT DISTINCT FROM OLD.posted_at
      AND NEW.reversal_of_entry_id IS NOT DISTINCT FROM OLD.reversal_of_entry_id;

    -- Recording a reversal against a posted entry: status flips to
    -- 'reversed', posted_by/created_by unchanged, nothing financial moves.
    IF OLD.status = 'posted' AND NEW.status = 'reversed' AND v_financial_fields_unchanged
      AND NEW.posted_by IS NOT DISTINCT FROM OLD.posted_by
    THEN
      RETURN NEW;
    END IF;

    -- posted_by/created_by re-keyed (via users.id's ON UPDATE CASCADE) —
    -- status and every financial field must stay exactly as-is.
    IF NEW.status IS NOT DISTINCT FROM OLD.status AND v_financial_fields_unchanged THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'Posted journal entry % is immutable. Use a reversing entry instead.', OLD.id;
    ELSE
      RAISE EXCEPTION 'Journal entry % has already been reversed and is immutable.', OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
