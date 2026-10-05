/**
 * Chart series colours. Validated with the dataviz palette validator
 * (light surface #ffffff, all pairs): CVD ΔE ≥ 10.5, normal-vision ΔE ≥ 18.
 * Approved green sits below 3:1 contrast, so every chart that uses it also
 * carries a legend plus tooltips or a table view. Hues match the status pills.
 */
export const SERIES = {
  open: "#6366f1", // indigo-500 — submitted / open work
  approved: "#10b981", // emerald-500
  rejected: "#e11d48", // rose-600
  unclaimed: "#c7d2fe", // indigo-200 — lighter step of the same ramp
} as const;

export const CHART_GRID = "#eef0f5";
export const CHART_AXIS_TEXT = "#8a90a7";
