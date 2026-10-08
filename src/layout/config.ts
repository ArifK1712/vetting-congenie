/**
 * Admin workspace layout: one configuration object decides how the single
 * AppShell renders navigation, header and content. Pages never read it —
 * they keep using <main> and the PAGE spacing, which follow the config
 * through CSS variables.
 *
 * Stored per user (services/preferences). Bump `version` and add a step to
 * `normalizeLayout` when the shape changes.
 */

export type LayoutPresetId = "default" | "compact" | "mini" | "topnav" | "hybrid";

export interface LayoutConfig {
  version: 1;
  preset: LayoutPresetId;
  sidebar: {
    /** Where a collapsible rail starts (Default, Hybrid). */
    defaultState: "expanded" | "collapsed";
    /** Expanded rail width: 224 / 256 / 288 px. */
    width: "narrow" | "regular" | "wide";
    /** Stays put while the page scrolls, or scrolls with it. */
    sticky: boolean;
    /** Icon-only places: show short labels, or names on hover only. */
    labels: "show" | "tooltip";
  };
  header: { sticky: boolean };
  content: {
    width: "full" | "constrained";
    spacing: "tight" | "normal" | "relaxed";
  };
  density: "compact" | "comfortable";
  surface: {
    borders: "subtle" | "standard" | "strong";
    shadows: "flat" | "soft" | "raised";
  };
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  version: 1,
  preset: "default",
  sidebar: { defaultState: "expanded", width: "regular", sticky: true, labels: "show" },
  header: { sticky: true },
  content: { width: "full", spacing: "normal" },
  density: "comfortable",
  surface: { borders: "standard", shadows: "soft" },
};

/** Pixel widths for the expanded rail. */
export const RAIL_WIDTH: Record<LayoutConfig["sidebar"]["width"], number> = { narrow: 224, regular: 256, wide: 288 };

const PRESET_IDS: LayoutPresetId[] = ["default", "compact", "mini", "topnav", "hybrid"];
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/**
 * Turns anything read from storage (or, later, an API) into a valid config:
 * unknown values fall back to the defaults, so a bad or old record can never
 * break the shell.
 */
export function normalizeLayout(raw: unknown): LayoutConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | unknown>;
  const sb = (r.sidebar ?? {}) as Record<string, unknown>;
  const hd = (r.header ?? {}) as Record<string, unknown>;
  const ct = (r.content ?? {}) as Record<string, unknown>;
  const sf = (r.surface ?? {}) as Record<string, unknown>;
  const d = DEFAULT_LAYOUT;
  return {
    version: 1,
    preset: pick(r.preset, PRESET_IDS, d.preset),
    sidebar: {
      defaultState: pick(sb.defaultState, ["expanded", "collapsed"] as const, d.sidebar.defaultState),
      width: pick(sb.width, ["narrow", "regular", "wide"] as const, d.sidebar.width),
      sticky: bool(sb.sticky, d.sidebar.sticky),
      labels: pick(sb.labels, ["show", "tooltip"] as const, d.sidebar.labels),
    },
    header: { sticky: bool(hd.sticky, d.header.sticky) },
    content: {
      width: pick(ct.width, ["full", "constrained"] as const, d.content.width),
      spacing: pick(ct.spacing, ["tight", "normal", "relaxed"] as const, d.content.spacing),
    },
    density: pick(r.density, ["compact", "comfortable"] as const, d.density),
    surface: {
      borders: pick(sf.borders, ["subtle", "standard", "strong"] as const, d.surface.borders),
      shadows: pick(sf.shadows, ["flat", "soft", "raised"] as const, d.surface.shadows),
    },
  };
}

export const sameLayout = (a: LayoutConfig, b: LayoutConfig) => JSON.stringify(a) === JSON.stringify(b);
