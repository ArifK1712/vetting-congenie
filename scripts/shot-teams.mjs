// Teams screens per locale (full page). Usage: node scripts/shot-teams.mjs <outDir> [baseUrl]
import { chromium } from "playwright";

const out = process.argv[2] ?? "screens";
const base = process.argv[3] ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

async function persona(id) {
  await page.evaluate(
    (id) => localStorage.setItem("vetting-prototype-session", JSON.stringify({ state: { personaId: id, eventScope: "all", sidebarCollapsed: false }, version: 0 })),
    id,
  );
}

async function shot(name, full = true) {
  await page.waitForTimeout(500);
  await page.locator("main").evaluate((el) => (el.style.overflow = "visible"));
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
}

async function open(path) {
  await page.goto(`${base}${path}`);
  await page.waitForSelector("main h1", { timeout: 60000 });
}

await page.goto(`${base}/en/teams`);
await persona("u_sara");

for (const locale of ["en", "ar"]) {
  await open(`/${locale}/teams`);
  await shot(`${locale}-teams-list`);

  await open(`/${locale}/teams/t_vipsec`);
  await shot(`${locale}-team-overview`);
  for (const [i, name] of ["members", "usedin", "history"].entries()) {
    await page.getByRole("tab").nth(i + 1).click();
    await shot(`${locale}-team-${name}`);
  }

  await open(`/${locale}/teams/t_intl`);
  await shot(`${locale}-team-intl`);

  await open(`/${locale}/teams/t_docs`);
  await page.getByRole("button", { name: locale === "en" ? "More actions" : "إجراءات أخرى" }).click();
  await page.getByRole("menuitem").first().click();
  await page.waitForSelector("[role=dialog]");
  await shot(`${locale}-team-deactivate-blocked`, false);
  await page.keyboard.press("Escape");

  await open(`/${locale}/teams/t_vipsec/edit`);
  await shot(`${locale}-team-edit`);

  await open(`/${locale}/teams/new`);
  await page.getByRole("button", { name: locale === "en" ? "Create team" : "إنشاء الفريق" }).last().click();
  await shot(`${locale}-team-new-errors`);
}

await persona("u_lina");
await open(`/en/teams`);
await shot(`en-teams-list-lead`, false);

console.log(errors.length ? `Console errors:\n${[...new Set(errors)].join("\n")}` : "No console errors");
await browser.close();
