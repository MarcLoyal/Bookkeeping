import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasAcceptedCurrentLegalTerms } from "@/lib/data/legal-acceptances";
import { AcceptTermsForm } from "./accept-terms-form";

// Deliberately calls getCurrentUser(), not requireCurrentUser() — the
// latter redirects here for anyone who hasn't accepted the current
// version, which would infinite-loop if this page used it too.
export default async function AcceptTermsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Direct navigation here after already accepting (e.g. a bookmark, or
  // a second tab) has nothing left to do.
  if (await hasAcceptedCurrentLegalTerms(user.id)) redirect("/dashboard");

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(15,23,42,0.09),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]"
      />
      <div className="relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-900/5">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            K
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">We've updated our terms</h1>
          <p className="mt-1 text-sm text-slate-500">Signed in as {user.email} — please review and accept to continue.</p>
        </div>
        <AcceptTermsForm />
      </div>
    </div>
  );
}
