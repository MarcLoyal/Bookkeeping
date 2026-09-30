import { TRIAL_DURATION_DAYS } from "@/lib/billing/plan-limits";
import { REFERRAL_PROGRAM, TRIAL_OFFER } from "./pricing-config";

/**
 * Single source of truth for the public FAQ page's questions and answers
 * (app/(marketing)/faq/page.tsx). Kept as plain data, same reasoning as
 * pricing-config.ts, so a copy change never needs touching the page's
 * markup — and answers that quote a number (trial length, referral
 * discount) pull it from the same config the Pricing page uses, so the
 * two pages can't drift out of sync with each other.
 */

export type FaqItem = { question: string; answer: string };

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is my clients' financial data safe and confidential?",
    answer:
      "Yes. Every client's books are isolated from every other client's — and every other firm's — at the database level, not just hidden behind a screen in the app. This isolation is enforced by the database itself (a Postgres feature called Row-Level Security), so even a mistake in our application code can't accidentally show one firm's data to another.",
  },
  {
    question: "Who can see my files — can the Keep.Books admin/platform owner view my clients' data?",
    answer:
      "No. The Keep.Books platform team can see basic account information for billing and support purposes — your firm's name, which plan you're on, and who your account owner is. There is no access path, in the app or the database, for the platform team to view your clients' transactions, reports, or uploaded receipts and documents. That boundary is enforced by the database's own access rules, the same rules that keep your data separate from every other firm's.",
  },
  {
    question: "How is the database secured?",
    answer:
      "Keep.Books is built on a managed PostgreSQL database (via Supabase) that encrypts data both in transit and at rest. On top of that, every table that holds firm or client data has Row-Level Security policies that scope every query to the firm making it — a bookkeeper at Firm A simply cannot query Firm B's data, no matter what happens in the application layer above it. Sign-in is handled by Supabase Auth rather than a homegrown password system.",
  },
  {
    question: "What happens after my 7-day trial ends?",
    answer: `Nothing is deleted, and nothing breaks. Your trial gives you full access to every feature for ${TRIAL_DURATION_DAYS} days with up to ${TRIAL_OFFER.maxClients} clients. If it ends before you've chosen a paid plan, you'll see a notice in your dashboard and our team will help you pick the plan that fits. If a plan isn't chosen, your account moves to our Free tier — your most recently used clients stay fully active, older ones become read-only (viewable, but not editable) until you upgrade, and everything is preserved exactly as you left it.`,
  },
  {
    question: "What's the difference between Basic, Premium, and Enterprise?",
    answer: `The three plans scale with the size of your practice: how many clients you can manage and how many team members (seats) you can add. Premium also unlocks assigning specific bookkeepers to specific clients, useful once your team grows past a couple of people. Enterprise is built for large corporations and multi-branch firms that need limits sized specifically to them. See the Pricing page for the full breakdown.`,
  },
  {
    question: "Can I add team members (e.g. an encoder who only enters data vs. a viewer) to my account?",
    answer:
      "Yes. Every plan supports adding team members with different roles: a Bookkeeper who manages the books day-to-day, an Encoder who can only enter draft transactions (never post them), a Reviewer who checks work before it's posted, and a Viewer with read-only access — alongside you as the firm's Owner. You add and manage team members from Settings → Team, up to your plan's seat limit.",
  },
  {
    question: "How does the referral discount work?",
    answer: REFERRAL_PROGRAM.description,
  },
  {
    question: "Can I upgrade or downgrade my plan later?",
    answer:
      "Yes, anytime. Reach out to us when you're ready to change plans and we'll switch you over — upgrades take effect right away. A self-serve upgrade/downgrade option inside your dashboard is on our roadmap. Downgrading to a plan with lower client or seat limits may mean some clients or team members become read-only or paused until you're back within the new plan's limits, but nothing is ever deleted in the process.",
  },
];
