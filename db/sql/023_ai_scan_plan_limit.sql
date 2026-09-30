-- ============================================================================
-- 023_ai_scan_plan_limit.sql
--
-- Fair-use cap on AI receipt scans per calendar month, enforced the same
-- way client/user plan limits already are (018_plan_limits.sql): a real
-- column (firms.max_ai_scans_per_month), read by getPlanLimits(), checked
-- by a trigger — not just hidden in the UI. Deliberately not a customer-
-- facing pricing tier: it's a safety net against a bug or heavy misuse
-- running up unexpected Anthropic API cost, sized generously enough
-- (150/month on Basic, 500 on Premium/Trial — see PLAN_DEFAULTS) that no
-- normal bookkeeper should ever see it.
--
-- Counts source_documents rows, not a separate "scan log" table:
-- source_documents is only ever written by the AI receipt-capture flow
-- (createSourceDocument(), called from POST /api/clients/[id]/receipts/
-- extract) — one row per scan, already exactly the thing being capped.
--
-- BEFORE INSERT on source_documents, not on the Anthropic API call
-- itself: this fires (and can reject) before createSourceDocument()
-- returns, which is before the route ever calls extractReceiptData() —
-- the expensive call this cap exists to bound never happens once the
-- limit is hit. The one accepted side effect: the photo the browser
-- already uploaded to Storage before calling the route stays there,
-- unreferenced by any source_documents row, when a scan is rejected this
-- way. Storage cost is not what this cap protects against, so an
-- occasional orphaned image is an acceptable tradeoff, not a bug to
-- design around here.
--
-- No UPDATE case: source_documents rows are never updated after insert
-- (020_source_documents_rls.sql's own comment: "an uploaded image's row
-- is never edited in place in this app").
--
-- SECURITY DEFINER, matching app_accessible_client_ids()'s own reasoning
-- (001_functions_triggers_rls.sql): source_documents_select
-- (020_source_documents_rls.sql) scopes Encoder to their OWN uploads only
-- ("client_id IN accessible AND (role != 'encoder' OR uploaded_by =
-- self)") — without bypassing that, the count below would silently only
-- ever see an Encoder's own scans, undercounting the firm's true monthly
-- total the moment more than one person at a firm uses this feature. The
-- cap has to be firm-wide regardless of who's inserting.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_ai_scan_plan_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_firm_id uuid;
  v_max_scans integer;
  v_current_count integer;
BEGIN
  SELECT firm_id INTO v_firm_id FROM clients WHERE id = NEW.client_id;
  SELECT max_ai_scans_per_month INTO v_max_scans FROM firms WHERE id = v_firm_id;

  SELECT count(*) INTO v_current_count
  FROM source_documents sd
  JOIN clients c ON c.id = sd.client_id
  WHERE c.firm_id = v_firm_id AND sd.created_at >= date_trunc('month', now());

  IF v_current_count >= v_max_scans THEN
    RAISE EXCEPTION 'Monthly AI scan limit reached (% per month on this firm''s plan) — contact support to raise it.', v_max_scans;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER source_documents_enforce_ai_scan_plan_limit
BEFORE INSERT ON source_documents
FOR EACH ROW EXECUTE FUNCTION enforce_ai_scan_plan_limit();
