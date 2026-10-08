"use client";

import { Bell, ChevronDown, MousePointer2, Pin, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LayoutConfig } from "@/layout/config";
import { LAYOUT_PRESETS, type RailMode } from "@/layout/presets";
import { cn } from "@/lib/cn";
import { LogoMark } from "@/components/shell/nav/Brand";
import type { NavGroup, NavItem } from "@/components/shell/nav/model";

/**
 * A miniature of the whole admin workspace for a layout draft: the rail of
 * the preset's kind, its width and starting state, labels, top navigation,
 * content width, spacing, density, borders and shadows — with the person's
 * real navigation (names, icons, permissions). Built with flex and logical
 * properties, so in Arabic it mirrors like the real shell (rail on the right).
 */

/** Half the real rail widths (224 / 256 / 288 px). */
const RAIL_PX: Record<LayoutConfig["sidebar"]["width"], number> = { narrow: 112, regular: 128, wide: 144 };
const ICON_RAIL = 34;

/**
 * Border and shadow intensities, drawn from the base tokens (not --c-line /
 * --shadow-*, which already follow the *saved* setting on <html>).
 */
const BORDER: Record<LayoutConfig["surface"]["borders"], string> = {
  subtle: "ring-[color-mix(in_oklab,var(--c-line-base)_55%,var(--c-surface))]",
  standard: "ring-[var(--c-line-base)]",
  strong: "ring-[color-mix(in_oklab,var(--c-line-base)_70%,var(--c-ink-3))]",
};
const SHADOW: Record<LayoutConfig["surface"]["shadows"], string> = {
  flat: "shadow-none",
  soft: "shadow-[0_1px_2px_rgb(4_7_66/0.05),0_1px_3px_rgb(4_7_66/0.06)] dark:shadow-[0_1px_2px_rgb(0_0_0/0.3),0_1px_3px_rgb(0_0_0/0.25)]",
  raised: "shadow-[0_1px_2px_rgb(4_7_66/0.06),0_6px_14px_-3px_rgb(4_7_66/0.2)] dark:shadow-[0_1px_2px_rgb(0_0_0/0.4),0_6px_16px_-4px_rgb(0_0_0/0.6)]",
};
const PAD: Record<LayoutConfig["content"]["spacing"], string> = { tight: "p-2", normal: "p-3.5", relaxed: "p-5" };

export function LayoutPreview({ config, groups, label }: { config: LayoutConfig; groups: NavGroup[]; label: string }) {
  const preset = LAYOUT_PRESETS[config.preset];
  const brandInRail = preset.nav === "side" && config.sidebar.sticky;
  const rail = preset.rail === "none" ? null : <PreviewRail mode={preset.rail} config={config} groups={groups} brand={brandInRail} />;
  const header = <PreviewHeader brand={!brandInRail} sticky={config.header.sticky} />;
  const topNav = preset.nav === "top" || preset.nav === "hybrid" ? <PreviewTopNav groups={groups} tabs={preset.nav === "hybrid"} labels={config.sidebar.labels} /> : null;
  const content = <PreviewContent config={config} />;

  return (
    <figure
      role="img"
      aria-label={label}
      data-preview={config.preset}
      data-preview-rail={preset.rail}
      data-preview-collapsed={config.sidebar.defaultState === "collapsed" ? "" : undefined}
      className="overflow-hidden rounded-xl bg-subtle shadow-card ring-1 ring-line"
    >
      {/* Browser frame */}
      <div className="flex h-7 items-center gap-1.5 border-b border-line bg-surface px-3" aria-hidden>
        <span className="size-2 rounded-full bg-danger-dot" />
        <span className="size-2 rounded-full bg-attention-dot" />
        <span className="size-2 rounded-full bg-positive" />
        <span className="mx-auto h-3.5 w-2/5 rounded-full bg-subtle ring-1 ring-line" />
      </div>
      <div className="flex h-[300px] text-[9px] leading-tight sm:h-[340px] xl:h-[360px]" aria-hidden>
        {brandInRail ? (
          <>
            {rail}
            <div className="flex min-w-0 flex-1 flex-col">
              {header}
              {content}
            </div>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            {header}
            {topNav}
            <div className="flex min-h-0 flex-1">
              {rail}
              {content}
            </div>
          </div>
        )}
      </div>
    </figure>
  );
}

function Logo({ name }: { name?: boolean }) {
  const tApp = useTranslations("app");
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <LogoMark className="size-4" />
      {name && <span className="truncate text-[10px] font-bold tracking-tight">{tApp("name")}</span>}
    </span>
  );
}

function PreviewHeader({ brand, sticky }: { brand: boolean; sticky: boolean }) {
  return (
    <div className={cn("flex h-8 shrink-0 items-center gap-2 border-b border-line bg-surface px-2.5 text-ink", !sticky && "border-dashed")}>
      {brand && <Logo name />}
      <span className="flex h-4 w-2/5 max-w-36 min-w-0 items-center gap-1 rounded-md bg-subtle px-1.5 text-ink-3 ring-1 ring-line">
        <Search className="size-2.5 shrink-0" />
        <span className="h-1 w-1/2 rounded-full bg-ink-3/30" />
      </span>
      <span className="ms-auto flex items-center gap-2">
        {sticky && <Pin className="size-2.5 text-ink-3" />}
        <Bell className="size-3 text-ink-3" />
        <span className="size-4 rounded-full bg-accent-soft ring-1 ring-accent/30" />
      </span>
    </div>
  );
}

function PreviewTopNav({ groups, tabs, labels }: { groups: NavGroup[]; tabs: boolean; labels: "show" | "tooltip" }) {
  const t = useTranslations("navigation");
  const active = groups.find((g) => g.active)?.key ?? groups[0]?.key;
  return (
    <div className="flex h-6 shrink-0 items-stretch gap-0.5 overflow-hidden border-b border-line bg-surface px-1.5">
      {groups.map((g) => {
        const on = g.key === active;
        return (
          <span key={g.key} className={cn("relative flex shrink-0 items-center gap-1 px-1.5", on ? "font-semibold text-accent-text" : "text-nav-text")}>
            <g.icon className={cn("size-2.5", on ? "text-accent" : "text-nav-muted")} strokeWidth={2} />
            {labels === "show" && <span className="whitespace-nowrap">{t(`groups.${g.key}`)}</span>}
            {!tabs && <ChevronDown className="size-2 text-nav-muted" />}
            {on && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent" />}
          </span>
        );
      })}
    </div>
  );
}

function PreviewRail({ mode, config, groups, brand }: { mode: Exclude<RailMode, "none">; config: LayoutConfig; groups: NavGroup[]; brand: boolean }) {
  const t = useTranslations("navigation");
  const width = RAIL_PX[config.sidebar.width];
  const collapsed = config.sidebar.defaultState === "collapsed";
  const activeKey = groups.flatMap((g) => g.items).find((i) => i.active)?.key ?? groups[0]?.items[0]?.key;
  const base = "flex h-full shrink-0 flex-col overflow-hidden border-e border-nav-line bg-nav text-nav-text";
  const brandRow = (full: boolean) =>
    brand && <div className={cn("flex h-8 shrink-0 items-center text-nav-strong", full ? "px-2.5" : "justify-center")}>{<Logo name={full} />}</div>;

  if (mode === "mini") {
    const show = config.sidebar.labels === "show";
    return (
      <div className={base} style={{ width: show ? 46 : ICON_RAIL }} data-preview-part="rail-mini">
        {brandRow(false)}
        <div className="flex flex-col items-center gap-1 px-1 pt-1.5">
          {groups.flatMap((g) => g.items).map((i) => (
            <span key={i.key} className={cn("flex w-full flex-col items-center gap-0.5 rounded-md py-1", i.key === activeKey && "bg-nav-active text-nav-strong")}>
              <i.icon className={cn("size-3", i.key === activeKey ? "text-accent" : "text-nav-muted")} strokeWidth={1.75} />
              {show && <span className="w-full truncate text-center text-[6.5px]">{t(i.key)}</span>}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (mode === "section") {
    const group = groups.find((g) => g.active) ?? groups[0];
    if (!group) return null;
    if (collapsed) {
      return (
        <div className={base} style={{ width: ICON_RAIL }} data-preview-part="rail-section">
          <Items items={group.items} activeKey={activeKey} icons />
        </div>
      );
    }
    return (
      <div className={base} style={{ width }} data-preview-part="rail-section">
        <div className="flex items-center gap-1 px-2.5 pt-2.5 pb-1">
          <group.icon className="size-2.5 text-accent" strokeWidth={2} />
          <span className="truncate font-semibold text-nav-strong">{t(`groups.${group.key}`)}</span>
        </div>
        <Items items={group.items} activeKey={activeKey} />
      </div>
    );
  }

  if (mode === "hover") {
    return (
      <div className="relative z-10 h-full shrink-0" style={{ width: ICON_RAIL }} data-preview-part="rail-hover">
        <div className={base}>
          {brandRow(false)}
          {groups.map((g, gi) => (
            <div key={g.key}>
              {gi > 0 && <div className="mx-2 my-1 h-px bg-nav-line" />}
              <Items items={g.items} activeKey={activeKey} icons />
            </div>
          ))}
        </div>
        {/* Opens over the content on hover */}
        <div
          className="absolute top-10 start-[calc(100%-4px)] flex flex-col overflow-hidden rounded-e-lg bg-nav pb-1 text-nav-text shadow-pop ring-1 ring-accent/30"
          style={{ width: width - ICON_RAIL + 20 }}
        >
          <span className="flex items-center gap-1 px-2.5 pt-2 pb-0.5 text-[7px] font-semibold tracking-wider text-nav-muted uppercase">
            <MousePointer2 className="size-2.5 text-accent" />
            {t(`groups.${groups[0]?.key ?? "operate"}`)}
          </span>
          <Items items={groups[0]?.items ?? []} activeKey={activeKey} />
        </div>
      </div>
    );
  }

  // full
  if (collapsed) {
    return (
      <div className={base} style={{ width: ICON_RAIL }} data-preview-part="rail-full">
        {brandRow(false)}
        {groups.map((g, gi) => (
          <div key={g.key}>
            {gi > 0 && <div className="mx-2 my-1 h-px bg-nav-line" />}
            <Items items={g.items} activeKey={activeKey} icons />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={base} style={{ width }} data-preview-part="rail-full">
      {brandRow(true)}
      <div className="pt-1">
        {groups.map((g) => (
          <div key={g.key} className="mb-1.5">
            <p className="truncate px-2.5 pb-0.5 text-[6.5px] font-semibold tracking-wider text-nav-muted uppercase">{t(`groups.${g.key}`)}</p>
            <Items items={g.items} activeKey={activeKey} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Items({ items, activeKey, icons }: { items: NavItem[]; activeKey?: string; icons?: boolean }) {
  const t = useTranslations("navigation");
  return (
    <ul className={cn("flex flex-col gap-px", icons ? "items-center px-1 py-0.5" : "px-1.5")}>
      {items.map((i) => {
        const on = i.key === activeKey;
        return (
          <li
            key={i.key}
            className={cn("flex items-center gap-1.5 rounded-[5px]", icons ? "size-5 justify-center" : "h-[18px] px-1.5", on ? "bg-nav-active font-semibold text-nav-strong" : "")}
          >
            <i.icon className={cn("size-2.5 shrink-0", on ? "text-accent" : "text-nav-muted")} strokeWidth={2} />
            {!icons && <span className="truncate">{t(i.key)}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function PreviewContent({ config }: { config: LayoutConfig }) {
  const compact = config.density === "compact";
  const card = cn("rounded-md bg-surface ring-1", BORDER[config.surface.borders], SHADOW[config.surface.shadows]);
  const tiles = [
    { tone: "bg-accent-soft", bar: "bg-accent" },
    { tone: "bg-info-soft", bar: "bg-info" },
    { tone: "bg-positive-soft", bar: "bg-positive" },
  ];
  const pills = ["bg-attention-soft", "bg-positive-soft", "bg-info-soft", "bg-danger-soft", "bg-accent-soft", "bg-positive-soft", "bg-info-soft"];
  const rows = compact ? 7 : 5;
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas" data-preview-part="content">
      <div className={cn("flex h-full flex-col", PAD[config.content.spacing], compact ? "gap-1.5" : "gap-2.5", config.content.width === "constrained" && "mx-auto max-w-[78%]")}>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="h-2 w-20 rounded-full bg-ink/70" />
            <div className="h-1 w-28 max-w-full rounded-full bg-ink-3/40" />
          </div>
          <div className="h-3.5 w-10 shrink-0 rounded bg-accent" />
        </div>
        <div className={cn("grid grid-cols-3", compact ? "gap-1.5" : "gap-2")}>
          {tiles.map((x, i) => (
            <div key={i} className={cn(card, compact ? "p-1.5" : "p-2")}>
              <div className={cn("mb-1 size-3 rounded", x.tone)} />
              <div className={cn("h-1.5 w-1/2 rounded-full", x.bar)} />
            </div>
          ))}
        </div>
        <div className={cn(card, "min-h-0 flex-1 overflow-hidden")}>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className={cn("flex items-center gap-1.5 border-b border-line px-2 last:border-0", compact ? "h-4" : "h-6")}>
              <span className="size-2 shrink-0 rounded-full bg-ink-3/25" />
              <span className="h-1 rounded-full bg-ink-3/35" style={{ width: `${48 - ((i * 13) % 22)}%` }} />
              <span className={cn("ms-auto h-2 w-6 shrink-0 rounded-full", pills[i % pills.length])} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
