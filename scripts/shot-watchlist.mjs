// Watchlist screens (English-only area) under both app locales. Usage: node scripts/shot-watchlist.mjs <outDir> [baseUrl]
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
await persona("u_sara");
await open(`/en/screening/watchlist`);
const data = await page.evaluate(() => JSON.parse(localStorage.getItem("vetting-prototype")).state.db);
const withMatches = Object.values(data.watchlist).find((e) => e.level === "high" && Object.values(data.matches).some((m) => m.entryId === e.id));
const request = Object.values(data.requests).find((r) => r.status === "pending_review" && r.screening === "clear");

for (const locale of ["en", "ar"]) {
  await open(`/${locale}/screening/watchlist`);
  await shot(`${locale}-wl-list`);
  await open(`/${locale}/screening/watchlist/${withMatches.id}`);
  await shot(`${locale}-wl-detail`, true);
}
await open(`/en/screening/watchlist/new?fromRequest=${request.id}`);
await page.getByRole("radio", { name: /High/ }).click();
await page.getByRole("radio", { name: /add a review stage/ }).click();
await shot(`en-wl-form`, true);
await open(`/en/screening/watchlist/new`);
await page.getByRole("button", { name: "Save entry" }).click();
await shot(`en-wl-form-errors`, true);
await open(`/en/screening/watchlist/import`);
await page.getByRole("button", { name: /sample file/ }).click();
await shot(`en-wl-import`, true);

await persona("u_lina");
await open(`/en/screening/watchlist/${withMatches.id}`);
await shot(`en-wl-detail-lead`);

console.log(errors.length ? `Console errors:\n${[...new Set(errors)].join("\n")}` : "No console errors");
await browser.close();
