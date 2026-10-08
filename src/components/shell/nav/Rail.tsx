"use client";

import { PanelLeftClose, PanelLeftOpen, Pin, PinOff } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";
import { DirIcon } from "@/components/ui/DirIcon";
import { Tooltip } from "@/components/ui/Tooltip";
import { RAIL_WIDTH, type LayoutConfig } from "@/layout/config";
import type { RailMode } from "@/layout/presets";
import { useLayoutStore } from "@/layout/store";
import { cn } from "@/lib/cn";
import { useMedia } from "@/lib/useMedia";
import { Brand } from "./Brand";
import { useAppearanceItem, useEndSide, useNavGroups } from "./model";
import { NavLink, NavList, type NavListVariant } from "./NavList";

/**
 * The left navigation rail (tablet and desktop; phones use the drawer). One
 * component for every rail-based preset; `mode` comes from the preset.
 * Top: the logo with the collapse (or pin) button beside it — stacked under
 * the logo when the rail is narrow, so it's always reachable. Bottom: the
 * personal Appearance page. Logical properties throughout, so it sits on the
 * right in Arabic.
 */
export function Rail({
  mode,
  config,
  collapsed,
  showBrand,
  className,
}: {
  mode: Exclude<RailMode, "none">;
  config: LayoutConfig;
  collapsed: boolean;
  /** The brand sits in the rail when the rail starts at the top of the screen. */
  showBrand: boolean;
  className?: string;
}) {
  const t = useTranslations("navigation");
  const toggle = useLayoutStore((s) => s.toggleRail);
  const groups = useNavGroups();
  const tablet = useMedia("(min-width: 768px) and (max-width: 1023.98px)");
  const width = RAIL_WIDTH[config.sidebar.width];
  const labels = config.sidebar.labels;

  const base = "hidden shrink-0 flex-col border-e border-nav-line bg-nav text-nav-text md:flex";

  // ── Mini: narrow fixed rail, icon + small name (nothing to collapse) ──
  if (mode === "mini") {
    return (
      <aside className={cn(base, labels === "show" ? "w-[5.5rem]" : "w-16", className)} data-rail="mini">
        {showBrand && <Brand iconOnly className="h-16 shrink-0" />}
        <NavList groups={groups} variant="mini" labels={labels} />
        <RailFooter variant="mini" labels={labels} />
      </aside>
    );
  }

  const collapseButton = (narrow: boolean) =>
    tablet ? null : (
      <RailButton
        label={narrow ? t("expand") : t("collapse")}
        icon={<DirIcon icon={narrow ? PanelLeftOpen : PanelLeftClose} className="size-[18px]" strokeWidth={1.75} />}
        onClick={toggle}
      />
    );

  // ── Section (Hybrid): only the current module's pages ──
  if (mode === "section") {
    const group = groups.find((g) => g.active) ?? groups[0];
    if (!group) return null;
    const icons = tablet || collapsed;
    return (
      <aside className={cn(base, "transition-[width] duration-150", className)} style={{ width: icons ? 64 : width }} data-rail="section">
        <RailTop narrow={icons} button={collapseButton(icons)}>
          {!icons && (
            <span className="flex min-w-0 items-center gap-2">
              <group.icon className="size-4 shrink-0 text-accent" strokeWidth={2} />
              <span className="truncate text-sm font-semibold text-nav-strong">{t(`groups.${group.key}`)}</span>
            </span>
          )}
        </RailTop>
        <NavList groups={[group]} variant={icons ? "icons" : "full"} showTitles={false} />
        <RailFooter variant={icons ? "icons" : "full"} />
      </aside>
    );
  }

  // ── Hover (Compact): icon rail; mouse hover or keyboard focus expands it over the content; the pin keeps it open ──
  if (mode === "hover") {
    const pinned = !collapsed && !tablet;
    const pin = tablet ? null : (
      <RailButton
        label={pinned ? t("unpin") : t("pin")}
        pressed={pinned}
        icon={pinned ? <PinOff className="size-[18px]" strokeWidth={1.75} /> : <Pin className="size-[18px]" strokeWidth={1.75} />}
        onClick={toggle}
      />
    );
    if (pinned) {
      return (
        <aside className={cn(base, className)} style={{ width }} data-rail="hover">
          <RailTop narrow={false} button={pin}>{showBrand && <Brand />}</RailTop>
          <NavList groups={groups} variant="full" />
          <RailFooter variant="full" />
        </aside>
      );
    }
    // Open while hovered (mouse) or while a link inside has keyboard focus; clicks don't keep it open.
    // (Class names are written out in full so Tailwind can see them.)
    return (
      <aside className={cn("relative z-30 hidden w-16 shrink-0 md:block", className)} data-rail="hover">
        <div
          className={cn(
            "group/rail absolute inset-y-0 start-0 flex w-16 flex-col overflow-hidden border-e border-nav-line bg-nav text-nav-text transition-[width,box-shadow] duration-150",
            "[@media(hover:hover)]:hover:w-[var(--rail-open)] [@media(hover:hover)]:hover:shadow-panel has-[:focus-visible]:w-[var(--rail-open)] has-[:focus-visible]:shadow-panel",
          )}
          style={{ "--rail-open": `${width}px` } as CSSProperties}
        >
          {/* At rest: logo with the pin under it. Open: logo, name and pin in one row. */}
          <div className="[@media(hover:hover)]:group-hover/rail:hidden group-has-[:focus-visible]/rail:hidden">
            <RailTop narrow button={pin}>{showBrand && <Brand iconOnly />}</RailTop>
          </div>
          <div className="hidden [@media(hover:hover)]:group-hover/rail:block group-has-[:focus-visible]/rail:block">
            <RailTop narrow={false} button={pin}>{showBrand && <Brand />}</RailTop>
          </div>
          <NavList groups={groups} variant="icons" className="[@media(hover:hover)]:group-hover/rail:hidden group-has-[:focus-visible]/rail:hidden" />
          <NavList groups={groups} variant="full" className="hidden [@media(hover:hover)]:group-hover/rail:block group-has-[:focus-visible]/rail:block" />
          <div className="[@media(hover:hover)]:group-hover/rail:hidden group-has-[:focus-visible]/rail:hidden">
            <RailFooter variant="icons" />
          </div>
          <div className="hidden [@media(hover:hover)]:group-hover/rail:block group-has-[:focus-visible]/rail:block">
            <RailFooter variant="full" />
          </div>
        </div>
      </aside>
    );
  }

  // ── Full (Default): labelled sidebar that collapses to icons ──
  const icons = tablet || collapsed;
  return (
    <aside className={cn(base, "transition-[width] duration-150", className)} style={{ width: icons ? 64 : width }} data-rail="full">
      <RailTop narrow={icons} button={collapseButton(icons)}>{showBrand && <Brand iconOnly={icons} />}</RailTop>
      <NavList groups={groups} variant={icons ? "icons" : "full"} />
      <RailFooter variant={icons ? "icons" : "full"} />
    </aside>
  );
}

/**
 * The rail's top area: the brand (or section title) with the rail's button
 * beside it. When the rail is narrow the button sits directly under the
 * logo, so it's reachable in both states.
 */
function RailTop({ narrow, button, children }: { narrow: boolean; button: ReactNode; children?: ReactNode }) {
  if (narrow) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1 pt-3 pb-1">
        {children && <div className="flex h-10 items-center justify-center">{children}</div>}
        {button}
      </div>
    );
  }
  return (
    <div className="flex h-16 shrink-0 items-center gap-2 ps-5 pe-3">
      <div className="min-w-0 flex-1">{children}</div>
      {button}
    </div>
  );
}

/** A small square icon button for the rail's top area (collapse / expand, pin). */
function RailButton({ label, icon, onClick, pressed }: { label: string; icon: ReactNode; onClick: () => void; pressed?: boolean }) {
  const side = useEndSide();
  return (
    <Tooltip content={label} side={side}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={pressed}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-nav-muted outline-none hover:bg-nav-hover hover:text-nav-strong focus-visible:ring-2 focus-visible:ring-accent"
      >
        {icon}
      </button>
    </Tooltip>
  );
}

/** Bottom of the rail: the personal Appearance page (same look as the other links). */
function RailFooter({ variant, labels }: { variant: NavListVariant; labels?: "show" | "tooltip" }) {
  const item = useAppearanceItem();
  return (
    <div className={cn("shrink-0 border-t border-nav-line", variant === "full" ? "p-3" : "p-2")} data-rail-footer>
      <NavLink item={item} variant={variant} labels={labels} />
    </div>
  );
}
