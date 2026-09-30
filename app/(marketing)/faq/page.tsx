import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { FAQ_ITEMS } from "@/lib/marketing/faq-content";

export const metadata = {
  title: "FAQ — Keep.Books",
  description: "Answers to common questions about Keep.Books' security, plans, and team features.",
};

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Frequently asked questions</h1>
        <p className="mt-4 text-base text-slate-600">Everything bookkeeping firms usually ask before getting started with Keep.Books.</p>
      </div>

      <div className="mt-10 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
        {FAQ_ITEMS.map((item) => (
          <details key={item.question} className="group px-6 py-4 open:pb-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-2 text-sm font-semibold text-slate-900 marker:content-none">
              {item.question}
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.answer}</p>
          </details>
        ))}
      </div>

      <p className="mx-auto mt-10 max-w-xl text-center text-sm text-slate-500">
        Still have questions?{" "}
        <Link href="/pricing" className="font-medium text-slate-900 hover:underline">
          Check our Pricing page
        </Link>{" "}
        or{" "}
        <Link href="/signup" className="font-medium text-slate-900 hover:underline">
          start a free trial
        </Link>{" "}
        to see for yourself.
      </p>
    </div>
  );
}
