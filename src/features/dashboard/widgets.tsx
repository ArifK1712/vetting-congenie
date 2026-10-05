"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { TONE, type Tone } from "@/design/tones";
import { cn } from "@/lib/cn";

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-xl bg-surface p-5 shadow-card ring-1 ring-line", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  hintTone = "muted",
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: string;
  hint: string;
  hintTone?: "muted" | "attention" | "positive";
}) {
  return (
    <div className="rounded-xl bg-surface p-5 shadow-card ring-1 ring-line">
      <div className="flex items-center gap-2.5">
        <span className={cn("inline-flex size-8 items-center justify-center rounded-lg", TONE[tone].chip)}>
          <Icon className="size-4" strokeWidth={2.25} />
        </span>
        <span className="text-xs font-semibold text-ink-2">{label}</span>
      </div>
      <p className="mt-3 text-[30px] leading-none font-bold tracking-tight text-ink">{value}</p>
      <p
        className={cn(
          "mt-2 text-xs font-medium",
          hintTone === "attention" && "text-amber-700",
          hintTone === "positive" && "text-emerald-700",
          hintTone === "muted" && "text-ink-3",
        )}
      >
        {hint}
      </p>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-xs text-ink-2">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export interface Segment {
  key: string;
  value: number;
  color: string;
  label: string;
}

/**
 * Horizontal bar list in plain HTML: logical properties make it grow from the
 * start edge in both LTR and RTL. Stacked segments are separated by a 2px
 * surface gap; the data end is rounded, the baseline square.
 */
export function BarList({
  rows,
  max,
  format,
  onSelect,
}: {
  rows: { key: string; label: ReactNode; hint?: ReactNode; segments: Segment[] }[];
  max?: number;
  format: (n: number) => string;
  onSelect?: (key: string) => void;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0)));
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const total = row.segments.reduce((s, x) => s + x.value, 0);
        const content = (
          <>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-ink">
                {row.label}
                {row.hint && <span className="ms-1.5 text-xs text-ink-3">{row.hint}</span>}
              </span>
              <span className="tabular shrink-0 text-sm font-semibold text-ink">{format(total)}</span>
            </div>
            <Tooltip content={row.segments.map((s) => `${s.label}: ${format(s.value)}`).join(" · ")}>
              <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-e-[4px] bg-hover">
                {row.segments
                  .filter((s) => s.value > 0)
                  .map((s, i, arr) => (
                    <span
                      key={s.key}
                      className={cn("h-full", i === arr.length - 1 && "rounded-e-[4px]")}
                      style={{ width: `${(s.value / top) * 100}%`, background: s.color }}
                    />
                  ))}
              </div>
            </Tooltip>
          </>
        );
        return (
          <li key={row.key}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(row.key)}
                className="-mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-start transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-ink-3">{children}</p>;
}
