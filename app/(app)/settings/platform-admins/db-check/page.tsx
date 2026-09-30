import { requirePlatformAdmin } from "@/lib/auth/current-user";
import { EXPECTED_ROLE, getDbConnectionDiagnostic, isDiagnosticHealthy } from "@/lib/data/db-connection-diagnostic";

/**
 * TEMPORARY diagnostic page — not linked from any nav. Confirms, with a
 * live query against this deployment's actual DATABASE_URL connection,
 * that the app is running as the restricted keepbooks_app role rather
 * than a table-owning role that would bypass RLS. See DECISIONS.md,
 * "Investigated: platform_admin rows and all-clients visible on
 * /settings/team" for why this needed a real answer, not just code
 * review. Delete this page and lib/data/db-connection-diagnostic.ts
 * once confirmed — platform_admin-gated or not, a raw role/RLS status
 * readout has no reason to stay in a shipping app.
 */
export default async function DbCheckPage() {
  const user = await requirePlatformAdmin();
  const d = await getDbConnectionDiagnostic(user.id);
  const healthy = isDiagnosticHealthy(d);

  const rows: { label: string; value: string; ok: boolean }[] = [
    { label: "current_user", value: d.currentUser, ok: d.currentUser === EXPECTED_ROLE },
    { label: "Is superuser", value: String(d.isSuperuser), ok: !d.isSuperuser },
    { label: "Bypasses RLS (rolbypassrls)", value: String(d.bypassesRls), ok: !d.bypassesRls },
    { label: "clients table has RLS enabled", value: String(d.clientsRlsEnabled), ok: d.clientsRlsEnabled },
    { label: "users table has RLS enabled", value: String(d.usersRlsEnabled), ok: d.usersRlsEnabled },
  ];

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold">DB connection check (temporary)</h2>
      <p className="mt-1 text-sm text-slate-500">
        Live query against this deployment&apos;s own <code>DATABASE_URL</code> connection — proves what role the
        app is actually running as, not just what it&apos;s configured to be. Remove this page once confirmed.
      </p>

      <div
        className={`mt-4 rounded-lg border p-4 text-sm font-semibold ${
          healthy ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
        }`}
      >
        {healthy ? "✓ Connection is correctly restricted — RLS is enforced." : "✗ Connection is NOT correctly restricted."}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="px-4 py-2 text-slate-600">{r.label}</td>
                <td className={`px-4 py-2 font-mono ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
