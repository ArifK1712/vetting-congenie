// Blacklist screens (English-only area) under both app locales. Usage: node scripts/shot-blacklist.mjs <outDir> [baseUrl]
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
const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("vetting-prototype")).state.db);

await page.goto(`${base}/en/dashboard`);
await page.evaluate(() => localStorage.removeItem("vetting-prototype"));
await persona("u_sara");
await open(`/en/screening/blacklist`);
const data = await db();
const changed = Object.values(data.blacklist).find((e) => e.pendingChange);
const retro = Object.values(data.blacklist).find((e) => Object.values(data.matches).some((m) => m.entryId === e.id && m.stagePoint === "retro"));
const request = Object.values(data.requests).find((r) => r.status === "pending_review");

for (const locale of ["en", "ar"]) {
  await open(`/${locale}/screening/blacklist`);
  await shot(`${locale}-bl-list`);
  await page.getByRole("tab", { name: /Waiting for approval/ }).click();
  await shot(`${locale}-bl-approvals`);
  await open(`/${locale}/screening/blacklist/${changed.id}`);
  await shot(`${locale}-bl-change`, true);
  await open(`/${locale}/screening/blacklist/new?fromRequest=${request.id}`);
  await shot(`${locale}-bl-from-request`, true);
}
await open(`/en/screening/blacklist/${retro.id}`);
await shot(`en-bl-retro`, true);
await open(`/en/screening/blacklist/new`);
await page.getByRole("button", { name: "Send for approval" }).click();
await shot(`en-bl-new-errors`, true);
await open(`/en/screening/blacklist/import`);
await page.getByRole("button", { name: /sample file/ }).click();
await shot(`en-bl-import`, true);
await open(`/en/screening/blacklist/${changed.id}`);
await page.getByRole("button", { name: "Approve", exact: true }).click();
await page.waitForSelector("[role=dialog]");
await shot(`en-bl-approve-dialog`);

console.log(errors.length ? `Console errors:\n${[...new Set(errors)].join("\n")}` : "No console errors");
await browser.close();
