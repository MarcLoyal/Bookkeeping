import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// Shared by every dashboard's stat row (platform admin, firm/bookkeeper) —
// a current value plus whatever "previous period" comparison makes sense
// for that metric. Lives here, not in a role-specific data module, since
// both dashboards' data layers need to produce it.
export type PeriodStat = { current: number; previous: number };

// Dataviz skill's status hues (references/palette.md) — "up"/"down" here
// always maps to good/bad since every metric on this dashboard (firms,
// users, signups) is more-is-better.
const DELTA_UP = "#006300";
const DELTA_DOWN = "#d03b3b";
const DELTA_FLAT = "#898781";

function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/**
 * `goodDirection` says which way is good for THIS metric — most dashboard
 * metrics are more-is-better ("up"), but a few (Clients Needing Attention)
 * are more-is-worse ("down"). The symbol (▲/▼) always reflects the actual
 * direction of change; only the color follows whether that direction is
 * good or bad for this particular metric.
 */
function formatDelta({ current, previous }: PeriodStat, goodDirection: "up" | "down"): { text: string; symbol: string; color: string } {
  if (previous === 0) {
    if (current === 0) return { text: "0%", symbol: "–", color: DELTA_FLAT };
    return { text: "New", symbol: "▲", color: goodDirection === "up" ? DELTA_UP : DELTA_DOWN };
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  if (pct === 0) return { text: "0%", symbol: "–", color: DELTA_FLAT };
  const increased = pct > 0;
  const isGood = increased ? goodDirection === "up" : goodDirection === "down";
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, symbol: increased ? "▲" : "▼", color: isGood ? DELTA_UP : DELTA_DOWN };
}

/**
 * `stat` is either a `PeriodStat` (shows a real vs-previous-period delta,
 * with `deltaCaption` naming the period — "vs last week") or a plain
 * `number` for a metric with no meaningful/computable prior-period
 * comparison, where `caption` can carry a static line instead ("Next 30
 * days") — never both at once. `href`, when given, makes the whole card a
 * link (matching the pre-restyle firm dashboard's clickable stat cards);
 * omit it for a static card (every platform-admin card today).
 *
 * `goodDirection` (default "up"): whether a rising value is good news for
 * this metric — false for a handful of metrics where more is worse (e.g.
 * Clients Needing Attention), so the delta color reflects good/bad rather
 * than always coloring "up" green.
 *
 * `warnWhenPositive`: when true and the current value is > 0, the whole
 * card switches to an amber warning treatment — restores the pre-restyle
 * Unposted Drafts card's "this needs eyes on it" visual cue, which a plain
 * icon-badge accent color doesn't convey on its own.
 */
export function StatCard({
  label,
  stat,
  icon: Icon,
  accent,
  deltaCaption,
  caption,
  href,
  goodDirection = "up",
  warnWhenPositive = false,
}: {
  label: string;
  stat: PeriodStat | number;
  icon: LucideIcon;
  accent: string;
  deltaCaption?: string;
  caption?: string;
  href?: string;
  goodDirection?: "up" | "down";
  warnWhenPositive?: boolean;
}) {
  const current = typeof stat === "number" ? stat : stat.current;
  const delta = typeof stat === "number" ? null : formatDelta(stat, goodDirection);
  const warn = warnWhenPositive && current > 0;

  const inner = (
    <>
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className={`text-xs font-medium uppercase tracking-wide ${warn ? "text-amber-700" : "text-slate-600"}`}>{label}</div>
          <div className={`text-2xl font-bold ${warn ? "text-amber-900" : "text-slate-900"}`}>{formatCompact(current)}</div>
        </div>
      </div>
      {(delta || caption) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          {delta ? (
            <>
              <span className="font-semibold" style={{ color: delta.color }}>
                {delta.symbol} {delta.text}
              </span>
              {deltaCaption && <span className="text-slate-400">{deltaCaption}</span>}
            </>
          ) : (
            <span className={warn ? "text-amber-700" : "text-slate-400"}>{caption}</span>
          )}
        </div>
      )}
    </>
  );

  const cardClass = warn
    ? "rounded-lg border border-amber-300 bg-amber-50 p-4"
    : "rounded-lg border border-slate-200 bg-white p-4";
  const linkClass = `block ${cardClass} transition ${warn ? "hover:border-amber-400" : "hover:border-slate-300"} hover:shadow-sm`;

  if (href) {
    return (
      <Link href={href} className={linkClass}>
        {inner}
      </Link>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}
