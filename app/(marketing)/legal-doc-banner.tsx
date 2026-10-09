/** Shared by /privacy and /terms — both are drafts until a lawyer has reviewed them. */
export function LegalDocBanner({ version, lastUpdated }: { version: string; lastUpdated: string }) {
  return (
    <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">Draft — pending legal review.</p>
      <p className="mt-0.5 text-amber-800">
        This page has not yet been reviewed or approved by a lawyer and is not yet in legal effect. Version {version} · Last updated {lastUpdated}.
      </p>
    </div>
  );
}
