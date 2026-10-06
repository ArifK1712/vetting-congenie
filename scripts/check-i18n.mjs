// Fails when a locale is missing keys present in English, or has extras.
// Checks messages/<locale>.json and every messages/modules/<module>/<locale>.json.
import { existsSync, readFileSync, readdirSync } from "node:fs";

const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
const load = (p) => new Set(flatten(JSON.parse(readFileSync(p, "utf8"))));

const pairs = [["messages", "messages"]];
if (existsSync("messages/modules")) for (const m of readdirSync("messages/modules")) pairs.push([`messages/modules/${m}`, `module ${m}`]);

let failed = false;
let total = 0;
for (const [dir, label] of pairs) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const base = load(`${dir}/en.json`);
  total += base.size;
  for (const file of files.filter((f) => f !== "en.json")) {
    const keys = load(`${dir}/${file}`);
    const missing = [...base].filter((k) => !keys.has(k));
    const extra = [...keys].filter((k) => !base.has(k));
    if (missing.length || extra.length) {
      failed = true;
      console.error(`${label} ${file}: ${missing.length} missing, ${extra.length} extra`);
      missing.forEach((k) => console.error(`  - missing ${k}`));
      extra.forEach((k) => console.error(`  + extra   ${k}`));
    }
  }
}
if (failed) process.exit(1);
console.log(`i18n OK: ${total} keys in every locale`);
