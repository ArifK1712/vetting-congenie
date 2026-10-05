// Fails when a locale file is missing keys present in en.json, or has extras.
import { readFileSync, readdirSync } from "node:fs";

const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

const load = (f) => new Set(flatten(JSON.parse(readFileSync(`messages/${f}`, "utf8"))));
const base = load("en.json");
let failed = false;
for (const file of readdirSync("messages").filter((f) => f !== "en.json")) {
  const keys = load(file);
  const missing = [...base].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !base.has(k));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`${file}: ${missing.length} missing, ${extra.length} extra`);
    missing.forEach((k) => console.error(`  - missing ${k}`));
    extra.forEach((k) => console.error(`  + extra   ${k}`));
  }
}
if (failed) process.exit(1);
console.log(`i18n OK: ${base.size} keys in every locale`);
