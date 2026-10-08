import type { LayoutConfig, LayoutPresetId } from "./config";

/**
 * Layout presets. Each describes WHAT the shell shows; the shell and the
 * previews read these fields, so a new preset is a new entry here (plus its
 * name in messages/modules/appearance) — no new page structure.
 */

/** Where the main navigation lives. */
export type NavPlacement = "side" | "top" | "hybrid";

/**
 * How the left rail behaves on desktop:
 *  full        – labelled sidebar, can be collapsed to icons
 *  hover       – icon rail that expands over the content on hover, pinned open on click
 *  mini        – narrow fixed rail, icon with a small label
 *  none        – no left rail (navigation is in the header)
 *  section     – the current module's pages only (Hybrid)
 */
export type RailMode = "full" | "hover" | "mini" | "none" | "section";

/** Settings that the Appearance page offers for a preset (others don't apply to it). */
export type LayoutOption =
  | "sidebarState"
  | "sidebarWidth"
  | "sidebarSticky"
  | "labels"
  | "headerSticky"
  | "contentWidth"
  | "spacing"
  | "density"
  | "surface";

export interface LayoutPreset {
  id: LayoutPresetId;
  nav: NavPlacement;
  rail: RailMode;
  /** Applied when the preset is chosen (the person can still change them). */
  defaults: Partial<{ sidebar: Partial<LayoutConfig["sidebar"]> }>;
  options: LayoutOption[];
}

const COMMON: LayoutOption[] = ["headerSticky", "contentWidth", "spacing", "density", "surface"];

export const LAYOUT_PRESETS: Record<LayoutPresetId, LayoutPreset> = {
  default: {
    id: "default",
    nav: "side",
    rail: "full",
    defaults: { sidebar: { defaultState: "expanded" } },
    options: ["sidebarState", "sidebarWidth", "sidebarSticky", ...COMMON],
  },
  compact: {
    id: "compact",
    nav: "side",
    rail: "hover",
    defaults: { sidebar: { defaultState: "collapsed" } },
    options: ["sidebarWidth", "sidebarSticky", ...COMMON],
  },
  mini: {
    id: "mini",
    nav: "side",
    rail: "mini",
    defaults: {},
    options: ["labels", "sidebarSticky", ...COMMON],
  },
  topnav: {
    id: "topnav",
    nav: "top",
    rail: "none",
    defaults: {},
    options: ["labels", ...COMMON],
  },
  hybrid: {
    id: "hybrid",
    nav: "hybrid",
    rail: "section",
    defaults: { sidebar: { defaultState: "expanded", width: "narrow" } },
    options: ["sidebarState", "sidebarWidth", "sidebarSticky", ...COMMON],
  },
};

export const PRESET_ORDER: LayoutPresetId[] = ["default", "compact", "mini", "topnav", "hybrid"];

/** Switches preset, applying that preset's defaults on top of the current choices. */
export function withPreset(config: LayoutConfig, id: LayoutPresetId): LayoutConfig {
  const p = LAYOUT_PRESETS[id];
  return { ...config, preset: id, sidebar: { ...config.sidebar, ...(p.defaults.sidebar ?? {}) } };
}
