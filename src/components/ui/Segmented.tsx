"use client";

import type { LucideIcon } from "lucide-react";
import { useId, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  icon?: LucideIcon;
  /** Background, text and ring classes for the selected segment (default: white). */
  selectedClass?: string;
}

/**
 * Single choice shown as joined segments (radiogroup). ←/→ follow reading
 * direction, so they work the same way in Arabic.
 */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  disabled,
  className,
}: {
  label: string;
  options: SegmentOption<V>[];
  value: V;
  onChange: (v: V) => void;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const forward = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (forward ? 1 : options.length - 1)) % options.length];
    onChange(next.value);
    ref.current?.querySelector<HTMLElement>(`#${CSS.escape(`${id}-${next.value}`)}`)?.focus();
  };
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      className={cn("inline-flex shrink-0 rounded-lg bg-hover p-0.5 ring-1 ring-line ring-inset", className)}
    >
      {options.map((o) => {
        const selected = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            id={`${id}-${o.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed",
              size === "sm" ? "h-6 px-2 text-xs" : "h-8 px-3 text-sm",
              selected ? cn("shadow-xs ring-1", o.selectedClass ?? "bg-surface text-ink ring-line") : "text-ink-3 hover:text-ink",
            )}
          >
            {Icon && <Icon className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.25} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
