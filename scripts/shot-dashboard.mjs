// Full-page dashboard screenshots per locale. Usage: node scripts/shot-dashboard.mjs <outDir> [persona]
import { chromium } from "playwright";
const out = process.argv[2] ?? "screens";
const persona = process.argv[3] ?? "u_sara";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("http://localhost:3000/en/dashboard");
await page.evaluate((id) => localStorage.setItem("vetting-prototype-session", JSON.stringify({ state: { personaId: id, eventScope: "all", sidebarCollapsed: false }, version: 0 })), persona);
for (const locale of ["en", "ar"]) {
  await page.goto(`http://localhost:3000/${locale}/dashboard`);
  await page.waitForSelector("main h1", { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.locator("main").evaluate((el) => (el.style.overflow = "visible"));
  await page.screenshot({ path: `${out}/dash-${locale}.png`, fullPage: true });
}
console.log(errors.length ? [...new Set(errors)].join("\n") : "No console errors");
await browser.close();
