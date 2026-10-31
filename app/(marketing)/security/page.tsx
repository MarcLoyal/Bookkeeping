import Link from "next/link";
import { Database, Eye, FileClock, Lock, Users } from "lucide-react";

export const metadata = {
  title: "Security & Privacy — Keep.Books",
  description: "How Keep.Books isolates each firm's data, who can access it, and what's recorded in the audit trail.",
};

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Lock;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Icon className="h-6 w-6 text-slate-700" aria-hidden="true" />
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      </div>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Security & Privacy</h1>
        <p className="mt-4 text-slate-600">
          How client data is isolated, who can access it, and what&rsquo;s recorded along the way. For the legal detail, see our{" "}
          <Link href="/privacy" className="font-medium text-slate-900 hover:underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="font-medium text-slate-900 hover:underline">
            Terms of Service
          </Link>
          .
        </p>
      </div>

      <div className="mt-10 space-y-6">
        <Section icon={Database} title="Tenant isolation">
          <p>
            Every client&rsquo;s books are isolated from every other client&rsquo;s — and every other firm&rsquo;s — at the database level, not just
            hidden behind a screen in the app. This is enforced by the database itself through row-level security policies tied to the firm and user
            making each request.
          </p>
          <p>Because the isolation is enforced by the database, not application code alone, a mistake in our application code can&rsquo;t accidentally show one firm&rsquo;s data to another.</p>
        </Section>

        <Section icon={Lock} title="Encryption">
          <p>
            Connections to Keep.Books are encrypted in transit. Keep.Books is built on a managed PostgreSQL database that encrypts data at rest, and sign-in
            is handled by a dedicated authentication provider rather than a homegrown password system.
          </p>
        </Section>

        <Section icon={Users} title="Access levels">
          <p>Every account has one role, each scoped to what it should actually see and do: Owner, Bookkeeper, Reviewer, Encoder, and Viewer.</p>
          <p>
            An Encoder, for example, can enter draft transactions but can&rsquo;t post them and has no access to reports or dashboard totals. A Viewer has
            read-only access to the clients they&rsquo;re assigned to, with no ability to change anything. See the{" "}
            <Link href="/features" className="font-medium text-slate-900 hover:underline">
              Features page
            </Link>{" "}
            for the full breakdown of what each role can do.
          </p>
        </Section>

        <Section icon={FileClock} title="Audit trail">
          <p>
            Every change to a client&rsquo;s records — creating or editing a transaction, posting an entry, a role change — is captured in an activity
            log: who made it, what changed, and when. This log cannot be bypassed from within the application, and is visible to a firm&rsquo;s Owner and
            Reviewers for their own firm only.
          </p>
        </Section>

        <Section icon={Eye} title="Who can see your client files">
          <p>
            Your firm&rsquo;s own staff see exactly what their role allows, nothing more. The Keep.Books platform team can see basic account information
            for billing and support purposes — your firm&rsquo;s name, which plan you&rsquo;re on, and who your account owner is.
          </p>
          <p>
            There is no access path, in the app or the database, for the platform team to view your clients&rsquo; transactions, reports, or uploaded
            receipts and documents. That boundary is enforced by the same database-level isolation described above, not just an internal policy.
          </p>
        </Section>
      </div>

      <div className="mt-10 text-center text-sm text-slate-500">
        More questions? See our{" "}
        <Link href="/faq" className="font-medium text-slate-900 hover:underline">
          FAQ
        </Link>{" "}
        or{" "}
        <Link href="/contact" className="font-medium text-slate-900 hover:underline">
          contact us
        </Link>
        .
      </div>
    </div>
  );
}
