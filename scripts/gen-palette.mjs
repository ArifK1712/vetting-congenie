// Generates the Congenie colour system (Brand Guidelines: The Colour Palette, Vol. 01) as CSS:
//   src/design/brand-palette.css  – brand ramps, mapped onto the Tailwind colour names the app uses
//   src/design/dark-palette.css   – the dark-mode ramps
// Usage: node scripts/gen-palette.mjs
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

// ─── Colour maths (sRGB ⇄ OKLab), for filling in steps between guideline anchors ──
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const unlin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function toOklab(hex) {
  const [r, g, b] = hex2rgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, unlin(c))) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
const mix = (a, b, t) => {
  const A = toOklab(a), B = toOklab(b);
  return fromOklab(A.map((v, i) => v + (B[i] - v) * t));
};

/** Fills every step from a few anchors (step → hex), interpolating in OKLab. */
function ramp(anchors) {
  const keys = Object.keys(anchors).map(Number).sort((a, b) => a - b);
  const out = {};
  for (const s of STEPS) {
    if (anchors[s]) { out[s] = anchors[s].toUpperCase(); continue; }
    const lo = [...keys].reverse().find((k) => k < s) ?? keys[0];
    const hi = keys.find((k) => k > s) ?? keys[keys.length - 1];
    out[s] = lo === hi ? anchors[lo] : mix(anchors[lo], anchors[hi], (s - lo) / (hi - lo));
  }
  return out;
}

// ─── The guideline ──────────────────────────────────────────────────────
// Page 06: Navy, Violet and Slate tints & shades (★ = brand colour).
const NAVY = ramp({ 50: "#F3F4FA", 100: "#E4E5F2", 200: "#C5C8E3", 300: "#9A9FCC", 400: "#6A70AE", 500: "#424891", 600: "#272C74", 700: "#161A5C", 800: "#0B0F4D", 900: "#040742", 950: "#02042A" });
const VIOLET = ramp({ 50: "#F7F2FF", 100: "#EFE6FE", 200: "#DDCBFD", 300: "#C3A3FB", 400: "#A47BF9", 500: "#843DF5", 600: "#7030E0", 700: "#5E1FC4", 800: "#4A189B", 900: "#361271", 950: "#22104A" });
const SLATE = ramp({ 50: "#F7F8FB", 100: "#EEF0F5", 200: "#DDE0EA", 300: "#C3C7D6", 400: "#9499AE", 500: "#636880", 600: "#4D5269", 700: "#363A50", 800: "#22253A", 900: "#13152A", 950: "#0B0D1C" });
// Pages 08 & 11: status colour, its subtle background, and the dark-mode colour & background.
const status = (subtle, main, dark, darkSubtle) => ramp({ 50: subtle, 400: dark, 700: main, 950: darkSubtle });
const SUCCESS = status("#E6F5EF", "#0F7B5A", "#3CC99A", "#0F2E2A");
const WARNING = status("#FDF1E3", "#A45106", "#F5A54A", "#33240F");
const ERROR = status("#FCE9EC", "#C2273B", "#F27387", "#3A1626");
const INFO = status("#E8F0FC", "#1F5FC4", "#6EA4F5", "#142650");

// The Tailwind colour names used across the app, pointed at the guideline ramps.
const FAMILIES = {
  navy: NAVY,
  indigo: NAVY,
  violet: VIOLET, purple: VIOLET, fuchsia: VIOLET,
  slate: SLATE, gray: SLATE, zinc: SLATE, neutral: SLATE, stone: SLATE,
  emerald: SUCCESS, green: SUCCESS, teal: SUCCESS, lime: SUCCESS,
  amber: WARNING, yellow: WARNING, orange: WARNING,
  rose: ERROR, red: ERROR, pink: ERROR,
  sky: INFO, blue: INFO, cyan: INFO,
};

// Dark mode: ramps mirror (50↔950) so tints become deep backgrounds with light text,
// and the lightest steps use the guideline's dark-mode subtle backgrounds.
const DARK_SUBTLE = { navy: "#1D2155", violet: "#2A2163", slate: "#1D2155", success: "#0F2E2A", warning: "#33240F", error: "#3A1626", info: "#142650" };
const kindOf = (r) => (r === NAVY ? "navy" : r === VIOLET ? "violet" : r === SLATE ? "slate" : r === SUCCESS ? "success" : r === WARNING ? "warning" : r === ERROR ? "error" : "info");
function darkRamp(r) {
  const flip = Object.fromEntries(STEPS.map((s, i) => [s, r[STEPS[STEPS.length - 1 - i]]]));
  flip[50] = DARK_SUBTLE[kindOf(r)];
  flip[100] = mix(flip[50], r[800], 0.5);
  return flip;
}

const vars = (fn) => Object.entries(FAMILIES).flatMap(([name, r]) => STEPS.map((s) => `  --color-${name}-${s}: ${fn(r)[s]};`)).join("\n");

const header = (what) => `/*
 * ${what}
 * Generated by scripts/gen-palette.mjs from the Congenie Brand Guidelines
 * (The Colour Palette, Vol. 01) — do not edit by hand.
 */`;

fs.writeFileSync(
  `${root}src/design/brand-palette.css`,
  `${header("Congenie colour ramps (Navy, Violet, Slate + status), mapped onto the Tailwind colour names the app uses.")}
@theme {
${vars((r) => r)}
}
`,
);
fs.writeFileSync(
  `${root}src/design/dark-palette.css`,
  `${header("Dark-mode ramps: mirrored (50↔950, 500 stays), lightest steps use the guideline's dark subtle backgrounds.")}
:root[data-theme="dark"] {
${vars(darkRamp)}
}
`,
);
console.log("brand ramps:", Object.keys(FAMILIES).length, "families");
console.log("success", SUCCESS, "\nwarning", WARNING, "\nerror", ERROR, "\ninfo", INFO);
