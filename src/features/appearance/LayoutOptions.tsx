"use client";

import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { MiniSwitch } from "@/features/registrations/parts";
import type { LayoutConfig } from "@/layout/config";
import { LAYOUT_PRESETS, type LayoutOption } from "@/layout/presets";

type Patch = (fn: (c: LayoutConfig) => LayoutConfig) => void;

/** The settings that apply to the draft's preset (LAYOUT_PRESETS[preset].options), in that order. */
export function LayoutOptions({ config, patch }: { config: LayoutConfig; patch: Patch }) {
  const t = useTranslations("appearance.options");
  const options = LAYOUT_PRESETS[config.preset].options;

  const seg = <V extends string>(key: string, values: readonly V[], value: V, set: (v: V) => (c: LayoutConfig) => LayoutConfig) => (
    <Segmented
      size="sm"
      label={t(`${key}.label` as never)}
      value={value}
      onChange={(v) => patch(set(v))}
      options={values.map((v) => ({ value: v, label: t(`${key}.${v}` as never), selectedClass: "bg-surface text-accent-text ring-accent/40" }))}
    />
  );

  const rows: Record<LayoutOption, ReactNode> = {
    sidebarState: (
      <Row key="sidebarState" k="sidebarState">
        {seg("sidebarState", ["expanded", "collapsed"] as const, config.sidebar.defaultState, (v) => (c) => ({ ...c, sidebar: { ...c.sidebar, defaultState: v } }))}
      </Row>
    ),
    sidebarWidth: (
      <Row key="sidebarWidth" k="sidebarWidth">
        {seg("sidebarWidth", ["narrow", "regular", "wide"] as const, config.sidebar.width, (v) => (c) => ({ ...c, sidebar: { ...c.sidebar, width: v } }))}
      </Row>
    ),
    sidebarSticky: (
      <SwitchRow key="sidebarSticky" k="sidebarSticky" checked={config.sidebar.sticky} onChange={(v) => patch((c) => ({ ...c, sidebar: { ...c.sidebar, sticky: v } }))} />
    ),
    labels: (
      <Row key="labels" k="labels">
        {seg("labels", ["show", "tooltip"] as const, config.sidebar.labels, (v) => (c) => ({ ...c, sidebar: { ...c.sidebar, labels: v } }))}
      </Row>
    ),
    headerSticky: (
      <SwitchRow key="headerSticky" k="headerSticky" checked={config.header.sticky} onChange={(v) => patch((c) => ({ ...c, header: { sticky: v } }))} />
    ),
    contentWidth: (
      <Row key="contentWidth" k="contentWidth">
        {seg("contentWidth", ["full", "constrained"] as const, config.content.width, (v) => (c) => ({ ...c, content: { ...c.content, width: v } }))}
      </Row>
    ),
    spacing: (
      <Row key="spacing" k="spacing">
        {seg("spacing", ["tight", "normal", "relaxed"] as const, config.content.spacing, (v) => (c) => ({ ...c, content: { ...c.content, spacing: v } }))}
      </Row>
    ),
    density: (
      <Row key="density" k="density">
        {seg("density", ["compact", "comfortable"] as const, config.density, (v) => (c) => ({ ...c, density: v }))}
      </Row>
    ),
    surface: (
      <Fragment key="surface">
        <Row k="borders">
          {seg("borders", ["subtle", "standard", "strong"] as const, config.surface.borders, (v) => (c) => ({ ...c, surface: { ...c.surface, borders: v } }))}
        </Row>
        <Row k="shadows">
          {seg("shadows", ["flat", "soft", "raised"] as const, config.surface.shadows, (v) => (c) => ({ ...c, surface: { ...c.surface, shadows: v } }))}
        </Row>
      </Fragment>
    ),
  };

  return <div className="divide-y divide-line" data-options>{options.map((o) => rows[o])}</div>;
}

type RowKey = "sidebarState" | "sidebarWidth" | "sidebarSticky" | "labels" | "headerSticky" | "contentWidth" | "spacing" | "density" | "borders" | "shadows";

function Row({ k, children }: { k: RowKey; children: ReactNode }) {
  const t = useTranslations("appearance.options");
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5 first:pt-0 last:pb-0" data-option={k}>
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-semibold text-ink">{t(`${k}.label`)}</p>
        <p className="mt-0.5 text-xs text-ink-3">{t(`${k}.hint`)}</p>
      </div>
      {children}
    </div>
  );
}

function SwitchRow({ k, checked, onChange }: { k: "sidebarSticky" | "headerSticky"; checked: boolean; onChange: (v: boolean) => void }) {
  const t = useTranslations("appearance.options");
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0" data-option={k}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{t(`${k}.label`)}</p>
        <p className="mt-0.5 text-xs text-ink-3">{t(`${k}.hint`)}</p>
      </div>
      <MiniSwitch label={t(`${k}.label`)} checked={checked} onChange={onChange} />
    </div>
  );
}
