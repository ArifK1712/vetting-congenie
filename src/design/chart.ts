/**
 * Chart series colours, as CSS variables so they follow the theme (values in
 * globals.css), taken from the Congenie brand ramps: Spark Violet for open
 * work, the brand Success and Error colours for decisions, and Info blue for
 * unclaimed. Validated with the dataviz palette validator (all pairs):
 * light (surface #FFFFFF) and dark (surface #141743) pass every check; the
 * green/red pair is in the colour-blind 6–8 ΔE band, which is allowed only
 * with secondary encoding — every chart that uses it has a legend plus
 * tooltips or a table view, as the brand guideline asks ("always add an icon
 * or a word").
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
