import Link from "next/link";
import { Mail, MessageCircleQuestion } from "lucide-react";

export const metadata = {
  title: "Contact — Keep.Books",
  description: "Get in touch with Keep.Books for support or a Custom plan inquiry.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Contact</h1>
        <p className="mt-4 text-slate-600">We&rsquo;re a small team — reach out and you&rsquo;ll hear back from a real person.</p>
      </div>

      <div className="mt-10 space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-slate-700" aria-hidden="true" />
            <h2 className="text-lg font-bold text-slate-900">Support</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Questions about your account, billing, or anything not working as expected — email{" "}
            <a href="mailto:mrcabanador@gmail.com" className="font-medium text-slate-900 hover:underline">
              mrcabanador@gmail.com
            </a>
            .
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <MessageCircleQuestion className="h-6 w-6 text-slate-700" aria-hidden="true" />
            <h2 className="text-lg font-bold text-slate-900">Custom plan inquiries</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Managing a large corporation or a multi-branch operation that needs client and seat limits sized to you? Email{" "}
            <a href="mailto:mrcabanador@gmail.com" className="font-medium text-slate-900 hover:underline">
              mrcabanador@gmail.com
            </a>{" "}
            and we&rsquo;ll follow up to scope a plan with you.
          </p>
        </div>
      </div>

      <p className="mt-10 text-center text-sm text-slate-500">
        Looking for answers first? Check our{" "}
        <Link href="/faq" className="font-medium text-slate-900 hover:underline">
          FAQ
        </Link>
        .
      </p>
    </div>
  );
}
