// Registration vetting settings (spec 7) and form-question settings (15.1):
// AC23 (strong identifier), AC29 (new question hidden + alert), AC30 (uncovered
// badge type), history, stale edits, Arabic RTL, phone and dark screenshots.
// Usage: node scripts/e2e-registrations.mjs <outDir> [baseUrl]   — dev server must be running.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = process.argv[2] ?? "screens";
const base = process.argv[3] ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];
const results = [];
const check = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);

const watch = (p) => {
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
};
const setPersona = (page, id) =>
  page.evaluate((id) => {
    localStorage.setItem("vetting-prototype-session", JSON.stringify({ state: { personaId: id, eventScope: "all", sidebarCollapsed: false }, version: 0 }));
  }, id);
const readDb = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("vetting-prototype")).state.db);
const editDb = (page, fn) =>
  page.evaluate((src) => {
    const raw = JSON.parse(localStorage.getItem("vetting-prototype"));
    new Function("db", src)(raw.state.db);
    localStorage.setItem("vetting-prototype", JSON.stringify(raw));
  }, fn);
async function open(page, path, ready = "main h1") {
  await page.goto(`${base}${path}`);
  await page.waitForSelector(ready, { timeout: 60000 });
}
const AC23 = "Link Full name and one ID (National ID / Iqama, or Passport + Nationality) before saving.";

const a = await context.newPage();
watch(a);
await open(a, "/en/dashboard", "main");
await a.evaluate(() => localStorage.removeItem("vetting-prototype")); // fresh seed
await setPersona(a, "u_sara");

// ─── 1. List ────────────────────────────────────────────────────────────
await open(a, "/en/registrations");
check("list title", (await a.locator("main h1").innerText()).trim() === "Registrations");
const refRow = a.locator('a[href$="/registrations/reg_ref_visitor"]');
check("list shows REF Visitor Registration", (await refRow.count()) === 1 && (await refRow.innerText()).includes("Visitor Registration"));
check("REF Visitor has vetting off", (await refRow.innerText()).includes("Vetting off"));
check("REF Visitor flagged: no strong identifier", (await refRow.innerText()).includes("No strong identifier"));
await a.screenshot({ path: `${out}/registrations-list.png`, fullPage: true });

// ─── 2. AC23: turning vetting on needs a strong identifier ──────────────
await refRow.click();
await a.waitForURL(/\/en\/registrations\/reg_ref_visitor/);
await a.waitForSelector("main h1");
await a.getByRole("switch", { name: "Vetting enabled" }).click();
check("AC23 message shown when vetting is turned on", (await a.getByText(AC23).count()) > 0);
const save = a.getByRole("button", { name: "Save changes" });
check("AC23 save blocked", await save.isDisabled());
await a.screenshot({ path: `${out}/registration-vetting-ac23.png`, fullPage: true });

await a.getByRole("tab", { name: /Form questions/ }).click();
check("tab kept in the URL", a.url().includes("tab=questions"), a.url());
await a.getByRole("button", { name: "ID field for National ID / Iqama" }).click();
await a.getByRole("option", { name: /^National ID \/ Iqama/ }).click();
check("AC23 message gone after linking National ID", (await a.getByText(AC23).count()) === 0);
check("save enabled", !(await save.isDisabled()));
await a.screenshot({ path: `${out}/registration-questions.png`, fullPage: true });
await save.click();
await a.waitForSelector("text=Vetting settings saved", { timeout: 15000 });
let db = await readDb(a);
check("vetting on and National ID linked", db.vettingSettings.reg_ref_visitor.enabled && db.vettingSettings.reg_ref_visitor.idFields.nationalId === "std_nationalId");
check("save bar gone after save", (await save.count()) === 0);
await a.getByRole("tab", { name: /History/ }).click();
check("history shows vetting turned on", (await a.getByText("turned vetting on").count()) > 0);
check("history lists the changed setting", (await a.locator("main li", { hasText: "ID fields" }).count()) > 0);

// ─── 3. AC30: a badge type without a workflow needs a choice ────────────
await editDb(a, `for (const [k, x] of Object.entries(db.allotments)) if (x.registrationId === "reg_gis_exhibitor" && x.badgeTypeId === "bt_exhibitor") delete db.allotments[k];`);
await open(a, "/en/registrations");
const exRow = a.locator('a[href$="/registrations/reg_gis_exhibitor"]');
check("list: uncovered badge type needs a choice", (await exRow.innerText()).includes("1 needs a choice"));
await exRow.click();
await a.waitForSelector("text=Choose No vetting or Block for Exhibitor");
check("AC30 message shown", true);
await a.getByRole("switch", { name: "Watchlist screening" }).click();
check("AC30 save blocked", await save.isDisabled());
await a.screenshot({ path: `${out}/registration-vetting-ac30.png`, fullPage: true });
await a.getByRole("radio", { name: /^No vetting/ }).click();
check("AC30 cleared after choosing No vetting", (await a.getByText("Choose No vetting or Block for Exhibitor").count()) === 0 && !(await save.isDisabled()));
await save.click();
await a.waitForSelector("text=Vetting settings saved", { timeout: 15000 });
db = await readDb(a);
check("choice saved", db.vettingSettings.reg_gis_exhibitor.uncoveredBadgeBehaviour.bt_exhibitor === "noVetting");

// ─── 4. AC29: a new question is hidden from every team, admins alerted ──
await open(a, "/en/registrations/reg_gis_media?tab=questions");
await a.getByRole("button", { name: "Add question" }).first().click();
const dialog = a.getByRole("dialog");
await dialog.locator("#q-label-en").fill("Editor's letter reference");
await dialog.locator("#q-label-ar").fill("مرجع خطاب رئيس التحرير");
await dialog.getByRole("button", { name: "Add question" }).click();
await a.waitForSelector("text=Question added", { timeout: 15000 });
const newRow = a.locator("li[data-question]", { hasText: "Editor's letter reference" });
check("new question listed", (await newRow.count()) === 1);
check("new question hidden from every team", (await newRow.getByText("New · hidden from every team").count()) === 1);
check("grant access link to Teams", (await newRow.locator('a[href$="/teams"]').count()) === 1);
await a.getByRole("button", { name: /^Alerts/ }).click();
check("bell alert for the new question", (await a.getByText(/New question on Media Registration/).count()) > 0);
await a.keyboard.press("Escape");
await a.screenshot({ path: `${out}/registration-new-question.png`, fullPage: true });

// ─── 5. Stale settings: another tab saves first ─────────────────────────
const b = await context.newPage();
watch(b);
await open(a, "/en/registrations/reg_rdw_visitor");
await open(b, "/en/registrations/reg_rdw_visitor");
await b.getByRole("radio", { name: /^Auto-reject on exact identifier match/ }).click();
await b.getByRole("button", { name: "Save changes" }).click();
await b.waitForSelector("text=Vetting settings saved", { timeout: 15000 });
await a.waitForSelector("text=Someone changed these settings in another session", { timeout: 10000 }).then(
  () => check("other tab sees the stale banner", true),
  () => check("other tab sees the stale banner", false),
);
await a.getByRole("button", { name: "Load latest" }).click().catch(() => {});
check("load latest picks up the change", (await a.getByRole("radio", { name: /^Auto-reject/ }).getAttribute("aria-checked")) === "true");
await b.close();

// ─── 6. Permission: a reviewer can't open it ────────────────────────────
await setPersona(a, "u_omar");
await open(a, "/en/registrations", "main p");
check("reviewer: no access", (await a.getByText("You can't manage registration vetting").count()) > 0);
await setPersona(a, "u_sara");

// ─── 7. Arabic RTL ──────────────────────────────────────────────────────
await open(a, "/ar/registrations");
check("Arabic: dir=rtl", (await a.locator("html").getAttribute("dir")) === "rtl");
check("Arabic: title", (await a.locator("main h1").innerText()).trim() === "التسجيلات");
await a.screenshot({ path: `${out}/ar-registrations-list.png`, fullPage: true });
await open(a, "/ar/registrations/reg_ref_visitor?tab=questions");
await a.screenshot({ path: `${out}/ar-registration-questions.png`, fullPage: true });

// ─── 8. Phone and dark mode ─────────────────────────────────────────────
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await phone.newPage();
watch(p);
await open(p, "/en/dashboard", "main");
await setPersona(p, "u_sara");
await open(p, "/en/registrations");
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check("phone: list has no horizontal scroll", !overflow);
await p.screenshot({ path: `${out}/phone-registrations-list.png`, fullPage: true });
await open(p, "/en/registrations/reg_gis_visitor?tab=questions");
check("phone: detail has no horizontal scroll", !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
await p.screenshot({ path: `${out}/phone-registration-questions.png`, fullPage: true });
await open(p, "/en/registrations/reg_gis_visitor");
await p.screenshot({ path: `${out}/phone-registration-vetting.png`, fullPage: true });
await phone.close();

const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
await dark.addInitScript(() => localStorage.setItem("vetting-theme", "dark"));
const d = await dark.newPage();
watch(d);
await open(d, "/en/dashboard", "main");
await setPersona(d, "u_sara");
await open(d, "/en/registrations/reg_ref_visitor");
await d.getByRole("switch", { name: "Vetting enabled" }).click();
await d.screenshot({ path: `${out}/dark-registration-vetting.png`, fullPage: true });
await dark.close();

console.log(results.join("\n"));
console.log(errors.length ? `Page errors:\n${[...new Set(errors)].join("\n")}` : "No page errors");
await browser.close();
