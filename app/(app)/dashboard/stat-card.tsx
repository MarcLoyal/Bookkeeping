import type { LucideIcon } from "lucide-react";
import type { PeriodStat } from "@/lib/data/platform-dashboard";

// Dataviz skill's status hues (references/palette.md) — "up"/"down" here
// always maps to good/bad since every metric on this dashboard (firms,
// users, signups) is more-is-better.
const DELTA_UP = "#006300";
const DELTA_DOWN = "#d03b3b";
const DELTA_FLAT = "#898781";

function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function formatDelta({ current, previous }: PeriodStat): { text: string; symbol: string; color: string } {
  if (previous === 0) {
    if (current === 0) return { text: "0%", symbol: "–", color: DELTA_FLAT };
    return { text: "New", symbol: "▲", color: DELTA_UP };
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  if (pct === 0) return { text: "0%", symbol: "–", color: DELTA_FLAT };
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, symbol: pct > 0 ? "▲" : "▼", color: pct > 0 ? DELTA_UP : DELTA_DOWN };
}

export function StatCard({
  label,
  stat,
  icon: Icon,
  accent,
  deltaCaption,
}: {
  label: string;
  stat: PeriodStat;
  icon: LucideIcon;
  accent: string;
  deltaCaption: string;
}) {
  const delta = formatDelta(stat);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</div>
          <div className="text-2xl font-bold text-slate-900">{formatCompact(stat.current)}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <span className="font-semibold" style={{ color: delta.color }}>
          {delta.symbol} {delta.text}
        </span>
        <span className="text-slate-400">{deltaCaption}</span>
      </div>
    </div>
  );
}
