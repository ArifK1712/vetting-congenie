// Workflows screens (English-only area) under both app locales. Usage: node scripts/shot-workflows.mjs <outDir> [baseUrl]
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
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
};
async function open(path, ready = "main h1") {
  await page.goto(`${base}${path}`);
  await page.waitForSelector(ready, { timeout: 60000 });
}

await page.goto(`${base}/en/dashboard`);
await persona("u_sara");

for (const locale of ["en", "ar"]) {
  await open(`/${locale}/workflows`);
  await shot(`${locale}-wf-list`);

  await open(`/${locale}/workflows/wf_vip`, ".react-flow__node");
  await shot(`${locale}-wf-vip-live`);

  await open(`/${locale}/workflows/wf_media`, ".react-flow__node");
  await page.locator(".react-flow__node", { hasText: "Coverage Plan Review" }).click();
  await shot(`${locale}-wf-media-stage`);

  await open(`/${locale}/workflows/wf_night`, ".react-flow__node");
  await page.getByRole("button", { name: "Validate" }).click();
  await shot(`${locale}-wf-night-problems`);
}

await open(`/en/workflows/wf_visitor`, ".react-flow__node");
await page.locator(".react-flow__node", { hasText: "Watchlist level" }).first().click();
await shot(`en-wf-visitor-condition`);
await page.getByRole("button", { name: /Versions/ }).click();
await shot(`en-wf-versions`);

await open(`/en/workflows/wf_vip`, ".react-flow__node");
await page.getByRole("button", { name: /Allot/ }).click();
await page.waitForSelector("[role=dialog]");
await shot(`en-wf-allot`);

await open(`/ar/workflows`);
await page.getByRole("button", { name: "Create workflow" }).click();
await page.waitForSelector("[role=dialog]");
await shot(`ar-wf-create`);

await persona("u_daniel");
await open(`/en/workflows/wf_vip`, ".react-flow__node");
await shot(`en-wf-viewonly`);

console.log(errors.length ? `Console errors:\n${[...new Set(errors)].join("\n")}` : "No console errors");
await browser.close();
