// Visual QA: captures key screens in every locale. Usage: node scripts/screens.mjs <outDir> [baseUrl]
import { chromium } from "playwright";

const out = process.argv[2] ?? "screens";
const base = process.argv[3] ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

async function persona(id) {
  await page.evaluate((id) => {
    const raw = localStorage.getItem("vetting-prototype-session");
    const data = raw ? JSON.parse(raw) : { state: {}, version: 0 };
    data.state.personaId = id;
    localStorage.setItem("vetting-prototype-session", JSON.stringify(data));
  }, id);
}

async function shot(name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
}

for (const locale of ["en", "ar"]) {
  await page.goto(`${base}/${locale}/queue`);
  await page.waitForSelector("tbody tr", { timeout: 60000 });
  await persona("u_omar");
  await page.reload();
  await page.waitForSelector("tbody tr");
  await shot(`${locale}-queue`);
  await page.locator("tbody tr").nth(2).click();
  await shot(`${locale}-queue-preview`);
  const id = await page.locator("tbody tr").nth(2).locator("td").first().innerText();
  await page.goto(`${base}/${locale}/requests/${id.trim()}`);
  await page.waitForSelector("h1");
  await shot(`${locale}-detail`);

  await persona("u_sara");
  await page.goto(`${base}/${locale}/queue`);
  await page.waitForSelector("tbody tr");
  await page.getByRole("tab").nth(5).click();
  await page.waitForSelector("tbody tr");
  const held = await page.locator("tbody tr").first().locator("td").first().innerText();
  await page.goto(`${base}/${locale}/requests/${held.trim()}`);
  await page.waitForSelector("h1");
  await shot(`${locale}-detail-hold`);
  await page.getByRole("tab", { name: locale === "en" ? /Screening/ : /الفحص/ }).click();
  await shot(`${locale}-detail-hold-screening`);
}
console.log(errors.length ? `Console errors:\n${[...new Set(errors)].join("\n")}` : "No console errors");
await browser.close();
