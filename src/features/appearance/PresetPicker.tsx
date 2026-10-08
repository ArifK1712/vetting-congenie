"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, type KeyboardEvent } from "react";
import type { LayoutPresetId } from "@/layout/config";
import { LAYOUT_PRESETS, PRESET_ORDER, type LayoutPreset } from "@/layout/presets";
import { cn } from "@/lib/cn";

/**
 * The preset cards (radiogroup). Driven by the preset registry: a preset added
 * to LAYOUT_PRESETS / PRESET_ORDER appears here with its own thumbnail.
 * Arrow keys follow reading direction, so they work the same way in Arabic.
 */
export function PresetPicker({ value, current, onChange }: { value: LayoutPresetId; current: LayoutPresetId; onChange: (id: LayoutPresetId) => void }) {
  const t = useTranslations("appearance");
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const i = PRESET_ORDER.indexOf(value);
    const n = PRESET_ORDER.length;
    const forward = e.key === "ArrowDown" || e.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const next = e.key === "Home" ? PRESET_ORDER[0] : e.key === "End" ? PRESET_ORDER[n - 1] : PRESET_ORDER[(i + (forward ? 1 : n - 1)) % n];
    onChange(next);
    ref.current?.querySelector<HTMLElement>(`[data-preset="${next}"]`)?.focus();
  };

  return (
    <div ref={ref} role="radiogroup" aria-label={t("presetsLabel")} onKeyDown={onKey} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-presets>
      {PRESET_ORDER.map((id) => {
        const preset = LAYOUT_PRESETS[id];
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-preset={id}
            onClick={() => onChange(id)}
            className={cn(
              "group relative flex flex-col gap-3 rounded-xl bg-surface p-3 text-start transition-[box-shadow,background-color] outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
              selected ? "shadow-card ring-2 ring-accent" : "shadow-xs ring-1 ring-line hover:ring-line-strong",
            )}
          >
            <PresetThumb preset={preset} selected={selected} />
            <span className="flex items-start gap-2.5 px-0.5 pb-0.5">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-ink">{t(`presets.${id}.name`)}</span>
                  {id === current && (
                    <span className="inline-flex h-5 items-center rounded-full bg-positive-soft px-2 text-2xs font-semibold text-positive">{t("current")}</span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{t(`presets.${id}.description`)}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-colors",
                  selected ? "bg-accent text-on-accent" : "ring-1 ring-line-strong ring-inset",
                )}
              >
                {selected && <Check className="size-3" strokeWidth={3} />}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A small schematic of a preset, drawn from its `nav` and `rail` fields. Mirrors in RTL (flex + logical properties). */
export function PresetThumb({ preset, selected }: { preset: LayoutPreset; selected?: boolean }) {
  const brandInRail = preset.nav === "side";
  const rail = <ThumbRail mode={preset.rail} />;
  const header = (
    <span className="flex h-3.5 shrink-0 items-center gap-[3%] border-b border-line bg-surface px-[3%]">
      {!brandInRail && <span className="size-1.5 shrink-0 rounded-sm bg-accent" />}
      <span className="h-1 w-1/4 rounded-full bg-subtle ring-1 ring-line" />
      <span className="ms-auto size-1.5 rounded-full bg-accent-soft ring-1 ring-accent/30" />
    </span>
  );
  const topRow =
    preset.nav === "top" || preset.nav === "hybrid" ? (
      <span className="flex h-3 shrink-0 items-end gap-[4%] border-b border-line bg-surface px-[3%]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("flex h-full w-[12%] items-center border-b", i === 0 ? "border-accent" : "border-transparent")}>
            <span className={cn("h-0.5 w-full rounded-full", i === 0 ? "bg-accent" : "bg-ink-3/40")} />
          </span>
        ))}
      </span>
    ) : null;

  return (
    <span
      aria-hidden
      data-thumb={preset.id}
      className={cn("flex aspect-[2/1] w-full overflow-hidden rounded-lg ring-1 transition-colors", selected ? "bg-accent-soft/40 ring-accent/30" : "bg-canvas ring-line")}
    >
      {brandInRail ? (
        <>
          {rail}
          <span className="flex min-w-0 flex-1 flex-col">
            {header}
            <ThumbContent />
          </span>
        </>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col">
          {header}
          {topRow}
          <span className="flex min-h-0 flex-1">
            {preset.rail !== "none" && rail}
            <ThumbContent />
          </span>
        </span>
      )}
    </span>
  );
}

function ThumbRail({ mode }: { mode: LayoutPreset["rail"] }) {
  if (mode === "none") return null;
  const bars = (n: number, icons: boolean) =>
    Array.from({ length: n }, (_, i) => (
      <span key={i} className="flex items-center gap-[10%]">
        <span className={cn("size-1 shrink-0 rounded-[2px]", i === 1 ? "bg-accent" : "bg-nav-muted/60")} />
        {!icons && <span className={cn("h-0.5 flex-1 rounded-full", i === 1 ? "bg-accent" : "bg-nav-muted/40")} />}
      </span>
    ));
  if (mode === "full" || mode === "section") {
    return (
      <span className={cn("flex h-full shrink-0 flex-col gap-1.5 border-e border-nav-line bg-nav px-[2.5%] py-2", mode === "full" ? "w-[24%]" : "w-[20%]")}>
        {mode === "full" ? <span className="mb-0.5 size-1.5 rounded-sm bg-accent" /> : <span className="mb-0.5 h-0.5 w-1/2 rounded-full bg-accent" />}
        {bars(mode === "full" ? 6 : 3, false)}
      </span>
    );
  }
  if (mode === "mini") {
    return (
      <span className="flex h-full w-[11%] shrink-0 flex-col items-center gap-2 border-e border-nav-line bg-nav py-2">
        <span className="size-1.5 rounded-sm bg-accent" />
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="flex flex-col items-center gap-0.5">
            <span className={cn("size-1 rounded-[2px]", i === 1 ? "bg-accent" : "bg-nav-muted/60")} />
            <span className={cn("h-px w-2.5 rounded-full", i === 1 ? "bg-accent" : "bg-nav-muted/40")} />
          </span>
        ))}
      </span>
    );
  }
  // hover: icon rail with a flyout over the content
  return (
    <span className="relative h-full w-[8%] shrink-0">
      <span className="flex h-full flex-col items-center gap-1.5 border-e border-nav-line bg-nav py-2">
        <span className="mb-0.5 size-1.5 rounded-sm bg-accent" />
        {bars(6, true)}
      </span>
      <span className="absolute top-6 bottom-3 start-full z-10 flex w-[260%] flex-col gap-1.5 rounded-e-md bg-nav px-[25%] py-1.5 opacity-90 shadow-pop ring-1 ring-accent/30">
        {bars(4, false)}
      </span>
    </span>
  );
}

function ThumbContent() {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-[6%] p-[5%]">
      <span className="h-1 w-1/3 rounded-full bg-ink/60" />
      <span className="grid grid-cols-3 gap-[5%]">
        <span className="h-3 rounded-sm bg-accent-soft ring-1 ring-accent/20" />
        <span className="h-3 rounded-sm bg-info-soft ring-1 ring-info/20" />
        <span className="h-3 rounded-sm bg-positive-soft ring-1 ring-positive/20" />
      </span>
      <span className="flex flex-1 flex-col justify-evenly rounded-sm bg-surface px-[4%] ring-1 ring-line">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-0.5 rounded-full bg-ink-3/30" style={{ width: `${85 - i * 18}%` }} />
        ))}
      </span>
    </span>
  );
}
