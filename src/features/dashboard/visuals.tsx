"use client";

import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";

/** Tiny trend line for a stat tile. Time runs left-to-right in every locale. */
export function Sparkline({ values, color, className }: { values: number[]; color: string; className?: string }) {
  const w = 120;
  const h = 36;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)] as const);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg direction="ltr" viewBox={`0 0 ${w} ${h}`} className={cn("h-9 w-28 overflow-visible", className)} aria-hidden>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} fillOpacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={3.5} fill={color} stroke="#fff" strokeWidth={2} />}
    </svg>
  );
}

/**
 * Ring chart: part-to-whole for up to four segments, with a 2px surface gap
 * between segments. Children render in the centre.
 */
export function Ring({
  segments,
  size = 72,
  thickness = 8,
  children,
}: {
  segments: { value: number; color: string; label: string }[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const gap = visible.length > 1 ? 2.5 : 0;
  let offset = 0;
  return (
    <Tooltip content={segments.map((s) => `${s.label}: ${s.value}`).join(" · ")}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f5" strokeWidth={thickness} />
          {total > 0 &&
            visible.map((s) => {
              const len = (s.value / total) * c;
              const dash = Math.max(0, len - gap);
              const el = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
      </div>
    </Tooltip>
  );
}

/** One 100% strip showing shares, 2px surface gaps between segments. */
export function ShareStrip({ segments, className }: { segments: { key: string; value: number; color: string; label: string }[]; className?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className={cn("flex h-3 w-full gap-[2px] overflow-hidden rounded-full", className)}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <Tooltip key={s.key} content={`${s.label}: ${s.value}`}>
            <span className="h-full first:rounded-s-full last:rounded-e-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
          </Tooltip>
        ))}
    </div>
  );
}

/** Ranked lollipop row: hairline track, a stem and an end dot sized ≥ 8px. */
export function Lollipop({
  rank,
  label,
  hint,
  value,
  share,
  color,
}: {
  rank: number;
  label: ReactNode;
  hint?: ReactNode;
  value: ReactNode;
  share: number;
  color: string;
}) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,11rem)_1fr_auto] items-center gap-3">
      <span className="tabular text-xs font-semibold text-ink-3">{rank}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink">{label}</span>
        {hint && <span className="block truncate text-2xs text-ink-3">{hint}</span>}
      </span>
      <span className="relative h-2.5">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        <span className="absolute start-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full" style={{ width: `${share * 100}%`, background: color }} />
        <span
          className="absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full ring-2 ring-surface"
          style={{ insetInlineStart: `calc(${share * 100}% - 5px)`, background: color }}
        />
      </span>
      <span className="tabular rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-600/15 ring-inset">
        {value}
      </span>
    </li>
  );
}
