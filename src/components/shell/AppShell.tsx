"use client";

import { usePathname } from "next/navigation";
import { Suspense, useLayoutEffect, type CSSProperties, type ReactNode } from "react";
import { RAIL_WIDTH, type LayoutConfig } from "@/layout/config";
import type { RailMode } from "@/layout/presets";
import { useLayout, useLayoutLoader } from "@/layout/store";
import { NavProgress } from "@/lib/navProgress";
import { StoreGate } from "@/store/StoreGate";
import { Header } from "./Header";
import { LayoutPreviewBar } from "./LayoutPreviewBar";
import { MobileNav } from "./nav/MobileNav";
import { useNavGroups } from "./nav/model";
import { Rail } from "./nav/Rail";
import { TopNav } from "./nav/TopNav";
import { PendingPage, skeletonFor } from "./PendingPage";

/**
 * The one application shell. The layout configuration (Settings → Appearance)
 * decides where navigation goes, what stays fixed while scrolling, and how
 * wide and dense the content is. Pages are never told: they render into
 * <main> and use the PAGE spacing, which follows the config via CSS variables.
 *
 * With a sticky header and a sticky (or no) rail — every preset's default —
 * only <main> scrolls, as before, so full-height pages and sticky save bars
 * behave exactly as they always have.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <NavProgress />
      <StoreGate fallback={<ShellSkeleton />}>
        <Shell>{children}</Shell>
      </StoreGate>
    </>
  );
}

/** Density, spacing, content width and border/shadow intensity as attributes on <html> (styles in globals.css). */
function useLayoutAttributes(config: LayoutConfig) {
  useLayoutEffect(() => {
    const d = document.documentElement.dataset;
    d.density = config.density;
    d.spacing = config.content.spacing;
    d.content = config.content.width;
    d.borders = config.surface.borders;
    d.shadows = config.surface.shadows;
  }, [config]);
}

function Shell({ children }: { children: ReactNode }) {
  useLayoutLoader();
  const { config, preset, railCollapsed } = useLayout();
  useLayoutAttributes(config);
  const groups = useNavGroups();

  const hasRail = preset.rail !== "none";
  const railSticky = !hasRail || config.sidebar.sticky;
  const headerSticky = config.header.sticky;
  // The brand sits in the rail when a side rail runs the full height from the top; otherwise in the header.
  const brandInRail = preset.nav === "side" && railSticky;

  const rail = hasRail ? (
    <Rail mode={preset.rail as Exclude<RailMode, "none">} config={config} collapsed={railCollapsed} showBrand={brandInRail} />
  ) : null;
  const nav =
    preset.nav === "top" ? (
      <TopNav groups={groups} variant="menus" labels={config.sidebar.labels} />
    ) : preset.nav === "hybrid" ? (
      <TopNav groups={groups} variant="tabs" />
    ) : undefined;
  const header = (
    <Suspense fallback={<div className="h-14 border-b border-line bg-surface md:h-16" />}>
      <Header brand={!brandInRail} nav={nav} />
    </Suspense>
  );
  const content = config.content.width === "constrained" ? <div className="mx-auto h-full w-full max-w-[var(--content-max)]">{children}</div> : children;
  const page = <PendingPage>{content}</PendingPage>;

  let body: ReactNode;
  if (railSticky && headerSticky) {
    // Rail | header over a scrolling <main> (the original structure).
    body = (
      <div className="flex h-full">
        {brandInRail && rail}
        <div className="flex min-w-0 flex-1 flex-col">
          {header}
          <div className="flex min-h-0 flex-1">
            {!brandInRail && rail}
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{page}</main>
          </div>
        </div>
      </div>
    );
  } else if (railSticky) {
    // The header scrolls away with the page; the rail stays.
    body = (
      <div className="flex h-full">
        {brandInRail && rail}
        <div data-shell-scroll className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {header}
          <div className="flex flex-1">
            {!brandInRail && rail}
            <main className="min-w-0 flex-1">{page}</main>
          </div>
        </div>
      </div>
    );
  } else {
    // The rail scrolls with the page (the header may stay).
    body = (
      <div className="flex h-full flex-col">
        {headerSticky && header}
        <div data-shell-scroll className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {!headerSticky && header}
          <div className="flex flex-1">
            {rail}
            <main className="min-w-0 flex-1">{page}</main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full" data-layout={preset.id} style={{ "--rail-w": `${RAIL_WIDTH[config.sidebar.width]}px` } as CSSProperties}>
      {body}
      <MobileNav />
      <LayoutPreviewBar />
    </div>
  );
}

/** First load (before the local data is read): the shell outline plus this page's skeleton. */
function ShellSkeleton() {
  const pathname = usePathname();
  return (
    <div className="flex h-full">
      <div className="hidden h-full w-16 shrink-0 border-e border-nav-line bg-nav md:block lg:w-64" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-14 shrink-0 border-b border-line bg-surface md:h-16" />
        <div className="min-h-0 flex-1 overflow-hidden">{skeletonFor(pathname)}</div>
      </div>
    </div>
  );
}
