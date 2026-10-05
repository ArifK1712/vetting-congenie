// Match Review screens (English-only area). Usage: node scripts/shot-matches.mjs <outDir> [baseUrl]
import { chromium } from "playwright";

const out = process.argv[2] ?? "screens";
const base = process.argv[3] ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const persona = (id) =>
  page.evaluate((id) => localStorage.setItem("vetting-prototype-session", JSON.stringify({ state: { personaId: id, eventScope: "all", sidebarCollapsed: false }, version: 0 })), id);
const shot = async (name, full = false) => {
  await page.waitForTimeout(600);
  if (full) await page.locator("main").evaluate((el) => (el.style.overflow = "visible"));
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
};
async function open(path, ready = "main h1") {
  await page.goto(`${base}${path}`);
  await page.waitForSelector(ready, { timeout: 60000 });
}

await page.goto(`${base}/en/dashboard`);
await page.evaluate(() => localStorage.removeItem("vetting-prototype"));
await persona("u_arif");
for (const locale of ["en", "ar"]) {
  await open(`/${locale}/screening/matches`);
  await shot(`${locale}-mr-waiting`, true);
}
const data = await page.evaluate(() => JSON.parse(localStorage.getItem("vetting-prototype")).state.db);
const badge = Object.values(data.matches).find((m) => m.status === "open" && m.listType === "blacklist" && data.requests[m.requestId].badgeStatus === "suspended");
if (badge) {
  await open(`/en/screening/matches?match=${badge.id}`);
  await shot(`en-mr-badge`, true);
}
await open(`/en/screening/matches`);
await page.getByRole("tab", { name: /Decided/ }).click();
await shot(`en-mr-decided`);
console.log(errors.length ? `Console errors:\n${[...new Set(errors)].join("\n")}` : "No console errors");
await browser.close();
