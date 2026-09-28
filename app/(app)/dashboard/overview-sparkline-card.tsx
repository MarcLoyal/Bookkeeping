"use client";

import { useState } from "react";

// Muted (de-emphasis) line per the dataviz skill's stat-tile trend contract
// — "12-point sparkline in the de-emphasis hue, current period in the
// accent" — with only the latest point picked out in the card's own accent.
const TREND_MUTED = "#c3c2b7";

function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function OverviewSparklineCard({
  label,
  data,
  accent,
}: {
  label: string;
  data: { weekStart: string; value: number }[];
  accent: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const latest = data.at(-1)?.value ?? 0;
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const width = 280;
  const height = 56;
  const pad = 4;

  const points = data.map((d, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * (width - pad * 2) + pad : width / 2;
    const y = max === min ? height / 2 : height - pad - ((d.value - min) / (max - min)) * (height - pad * 2);
    return { x, y, ...d };
  });
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points.at(-1)?.x ?? 0} ${height} L ${points[0]?.x ?? 0} ${height} Z`;

  const shown = activeIndex ?? points.length - 1;
  const active = data[shown];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</h3>
        {active && <span className="text-xs text-slate-500">Week of {shortDate(active.weekStart)}</span>}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{formatCompact(latest)}</div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`${label} over the last ${data.length} weeks, currently ${latest}`}
      >
        <path d={areaPath} fill={accent} opacity={0.1} />
        <path d={linePath} fill="none" stroke={TREND_MUTED} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g
            key={p.weekStart}
            tabIndex={0}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            onFocus={() => setActiveIndex(i)}
            onBlur={() => setActiveIndex(null)}
            className="cursor-default outline-none"
          >
            <circle cx={p.x} cy={p.y} r={8} fill="transparent" />
            {(i === points.length - 1 || activeIndex === i) && (
              <circle cx={p.x} cy={p.y} r={4} fill={accent} stroke="#fff" strokeWidth={2}>
                <title>
                  Week of {shortDate(p.weekStart)}: {p.value}
                </title>
              </circle>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
