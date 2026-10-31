import Link from "next/link";
import {
  BookOpenCheck,
  Calculator,
  CalendarClock,
  Clock,
  FileText,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { TRIAL_OFFER } from "@/lib/marketing/pricing-config";
import { FAQ_ITEMS, HOME_FAQ_QUESTIONS, type FaqItem } from "@/lib/marketing/faq-content";
import { DashboardPreview } from "./dashboard-preview";

export const metadata = {
  title: "Keep.Books — Bookkeeping Software for Philippine Firms",
  description:
    "Keep.Books gives Philippine bookkeeping firms one place to manage every client's books, prepare BIR-ready reports, and keep your team on the same page. Start a 7-day free trial.",
};

type Feature = {
  icon: typeof BookOpenCheck;
  title: string;
  description: string;
  comingSoon?: boolean;
};

const FEATURES: Feature[] = [
  {
    icon: BookOpenCheck,
    title: "Print-ready loose-leaf books of accounts",
    description: "General journal, general ledger, and cash books formatted for printing and filing, generated straight from your entries.",
  },
  {
    icon: Calculator,
    title: "General ledger, trial balance & financial statements",
    description: "Trial Balance, Income Statement, and Balance Sheet, always current with what's been posted — no separate spreadsheet to maintain.",
  },
  {
    icon: FileText,
    title: "BIR reports",
    description: "VAT (2550Q), percentage tax (2551Q), withholding (1601-EQ, 2307), and income tax (1701A, 1701Q, 1702Q, 1702RT) — built from your books.",
  },
  {
    icon: ListChecks,
    title: "SLS/SLP and alphalists",
    description: "Summary List of Sales, Summary List of Purchases, and employee/payee alphalists, ready to file.",
  },
  {
    icon: LayoutDashboard,
    title: "Multi-client dashboard",
    description: "Every client you manage, in one dashboard — status, recent activity, and upcoming deadlines at a glance.",
  },
  {
    icon: ShieldCheck,
    title: "Team access levels and audit trail",
    description: "Owner, Bookkeeper, Reviewer, Encoder, and Viewer roles, each scoped to what they should see and do — with a full activity log.",
  },
  {
    icon: Sparkles,
    title: "AI receipt capture",
    description: "Snap or upload a receipt and have the details read automatically into a draft entry for review.",
    comingSoon: true,
  },
];

const PROBLEMS = [
  {
    title: "Manual recording",
    description: "Transactions get entered by hand into spreadsheets, with no single source of truth once a client's volume grows.",
  },
  {
    title: "Re-keying into tax returns",
    description: "The same figures get copied by hand from books into BIR forms — a second chance for a number to come out wrong.",
  },
  {
    title: "Deadline rush",
    description: "Without a shared view of what's due and what's done, filing deadlines turn into a scramble across every client at once.",
  },
];

const STEPS = [
  { step: "1", title: "Add your first client", description: "Set up a client's chart of accounts and opening balances in minutes." },
  { step: "2", title: "Encode transactions as you work", description: "Your team records sales, purchases, and journal entries as the day goes." },
  { step: "3", title: "Generate books, reports, and BIR forms", description: "Loose-leaf books, financial statements, and BIR reports, built from what's already posted." },
];

const BENEFITS = [
  "Hours saved on manual re-entry every month",
  "Fewer filing errors from hand-copied numbers",
  "Always audit-ready books, for every client",
  "One login across your whole client roster",
];

const homeFaqItems = HOME_FAQ_QUESTIONS.map((q) => FAQ_ITEMS.find((item) => item.question === q)).filter((item): item is FaqItem => !!item);

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="inline-block rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Now in Beta
            </span>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Every client&rsquo;s books and BIR reports, in one place.</h1>
            <p className="mt-5 text-lg text-slate-600">
              Keep.Books gives bookkeeping firms one place to manage every client&rsquo;s books, prepare BIR-ready reports, and keep your team on the same
              page — without re-typing numbers into three different systems.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-md bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                Start {TRIAL_OFFER.days}-day free trial
              </Link>
              <Link
                href="#how-it-works"
                className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-white"
              >
                See how it works
              </Link>
            </div>
          </div>
          <DashboardPreview />
        </div>
      </section>

      {/* The problem */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">The way most firms still work</h2>
          <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="font-semibold text-slate-900">{p.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Everything a bookkeeping practice needs</h2>
          <p className="mt-3 text-slate-600">
            See the full detail on the{" "}
            <Link href="/features" className="font-medium text-slate-900 hover:underline">
              Features page
            </Link>
            .
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`rounded-xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                f.comingSoon ? "border-dashed border-slate-300 bg-slate-50" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <f.icon className={`h-6 w-6 ${f.comingSoon ? "text-slate-400" : "text-slate-700"}`} aria-hidden="true" />
                {f.comingSoon && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Coming soon · Custom plan
                  </span>
                )}
              </div>
              <h3 className={`mt-3 font-semibold ${f.comingSoon ? "text-slate-500" : "text-slate-900"}`}>{f.title}</h3>
              <p className={`mt-1.5 text-sm ${f.comingSoon ? "text-slate-400" : "text-slate-600"}`}>{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">How it works</h2>
          <div className="mx-auto mt-10 grid max-w-4xl gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.step} className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{s.step}</div>
                <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          {BENEFITS.map((b) => (
            <div key={b} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
              <span className="text-sm font-medium text-slate-800">{b}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Who it&rsquo;s for</h2>
          <p className="mt-4 text-slate-600">
            Independent bookkeepers and small-to-mid bookkeeping or accounting firms managing multiple clients. Larger corporations or multi-branch
            operations that need limits sized to them are covered by the Custom plan.
          </p>
        </div>
      </section>

      {/* Security strip */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 rounded-xl border border-slate-200 bg-slate-900 p-8 text-center text-white sm:flex-row sm:text-left">
          <ShieldCheck className="h-10 w-10 shrink-0 text-emerald-400" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Every client&rsquo;s books are isolated at the database level</h2>
            <p className="mt-1 text-sm text-slate-300">
              Not just hidden in the app — enforced by the database itself, so a bug in our code can&rsquo;t leak one firm&rsquo;s data into another&rsquo;s.{" "}
              <Link href="/security" className="font-medium text-white underline underline-offset-2">
                Read the full detail
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Simple pricing, built for Philippine bookkeeping firms</h2>
          <p className="mt-3 text-slate-600">Basic, Premium, and Custom — sized by how many clients and team members your practice needs.</p>
          <Link href="/pricing" className="mt-6 inline-block rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            See full pricing
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Frequently asked questions</h2>
        <div className="mt-8 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {homeFaqItems.map((item) => (
            <details key={item.question} className="group p-5">
              <summary className="cursor-pointer list-none font-medium text-slate-900 marker:content-none">{item.question}</summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.answer}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/faq" className="font-medium text-slate-900 hover:underline">
            See the full FAQ
          </Link>
        </p>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <CalendarClock className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
            Try it free for {TRIAL_OFFER.days} days, with up to {TRIAL_OFFER.maxClients} clients included.
          </h2>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-md bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Start your free trial
          </Link>
        </div>
      </section>
    </div>
  );
}
