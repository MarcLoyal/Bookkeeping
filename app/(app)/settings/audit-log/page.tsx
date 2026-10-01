import { requireFirmAdmin } from "@/lib/auth/current-user";

// SECURITY HOTFIX, do not revert without the cross-firm audit_log leak
// confirmed fixed and verified (see DECISIONS.md): listRecentAuditLog()
// was reported leaking another firm's sign-ins/failed sign-ins/account
// creation events. This page previously called it with no row limit
// (up to 200 rows, more exposed than the dashboard's 8-row preview) and
// is reachable directly from the sidebar nav, not just via the
// dashboard panel — both had to come down together for this stopgap to
// actually stop the exposure. requireFirmAdmin() is kept: no reason to
// loosen who can even land on this page while the data itself is held
// back.
export default async function AuditLogPage() {
  await requireFirmAdmin();

  return (
    <div>
      <h2 className="text-lg font-semibold">Audit Log</h2>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <p className="px-4 py-10 text-center text-sm text-slate-500">
          Temporarily unavailable while we investigate an issue with this page. No action needed on your part.
        </p>
      </div>
    </div>
  );
}
