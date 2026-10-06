/**
 * Chart series colours, as CSS variables so they follow the theme (values in
 * globals.css). Validated with the dataviz palette validator, all pairs:
 * light (surface #ffffff) CVD ΔE ≥ 10.5, normal-vision ΔE ≥ 18; dark
 * (surface #141726) all checks pass for open/approved/rejected and for the
 * open/unclaimed pair. Approved green sits below 3:1 contrast in light mode,
 * so every chart that uses it also carries a legend plus tooltips or a table
 * view. Hues match the status pills.
 */
export const SERIES = {
  open: "var(--chart-open)", // indigo — submitted / open work
  approved: "var(--chart-approved)",
  rejected: "var(--chart-rejected)",
  unclaimed: "var(--chart-unclaimed)", // another step of the same ramp
} as const;

export const CHART_GRID = "var(--c-line)";
export const CHART_AXIS_TEXT = "var(--c-ink-3)";
export const CHART_CURSOR = "var(--c-line-strong)";
/** Ring around markers so they separate from lines and each other. */
export const CHART_SURFACE = "var(--c-surface)";
