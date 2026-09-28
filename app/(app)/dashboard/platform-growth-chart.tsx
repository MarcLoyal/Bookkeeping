"use client";

import { useState } from "react";

// Sequential blue, step 450 — dataviz skill's validated single-hue default
// for magnitude encoding (references/palette.md). This app has no dark
// mode anywhere, so there's no dark-surface variant to add here either.
const BAR_FILL = "#2a78d6";

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function PlatformGrowthChart({ data }: { data: { weekStart: string; count: number }[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const max = Math.max(1, ...data.map((d) => d.count));
  const width = 640;
  const height = 140;
  const barGap = 6;
  const barWidth = data.length > 0 ? width / data.length - barGap : 0;
  const chartHeight = 100; // leaves room for axis labels below

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-600">New Firm Signups (last {data.length} weeks)</h3>
        {activeIndex !== null && (
          <span className="text-xs text-slate-500">
            Week of {shortDate(data[activeIndex].weekStart)}: <span className="font-semibold text-slate-700">{data[activeIndex].count}</span>
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="New firm signups per week, last few weeks">
        <line x1={0} y1={chartHeight} x2={width} y2={chartHeight} stroke="#e1e0d9" strokeWidth={1} />
        {data.map((d, i) => {
          const barHeight = (d.count / max) * (chartHeight - 8);
          const x = i * (barWidth + barGap);
          const y = chartHeight - barHeight;
          return (
            <g
              key={d.weekStart}
              tabIndex={0}
              role="img"
              aria-label={`Week of ${shortDate(d.weekStart)}: ${d.count} new firm${d.count === 1 ? "" : "s"}`}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(i)}
              onBlur={() => setActiveIndex(null)}
              className="cursor-default outline-none"
            >
              <rect
                x={x}
                y={y}
                width={Math.max(barWidth, 1)}
                height={Math.max(barHeight, barHeight > 0 ? 2 : 0)}
                rx={3}
                fill={BAR_FILL}
                opacity={activeIndex === null || activeIndex === i ? 1 : 0.55}
              >
                <title>
                  Week of {shortDate(d.weekStart)}: {d.count} new firm{d.count === 1 ? "" : "s"}
                </title>
              </rect>
              <text x={x + barWidth / 2} y={height - 4} textAnchor="middle" fontSize={10} fill="#898781">
                {shortDate(d.weekStart)}
              </text>
            </g>
          );
        })}
      </svg>
      {data.every((d) => d.count === 0) && <p className="mt-1 text-xs text-slate-400">No signups in this window yet.</p>}
    </div>
  );
}
