// Appearance (admin layout, linked from the bottom of the sidebar): open to every staff user, 5 preset
// cards driving the preview, "Try it live" switches the real shell (Go back /
// Keep), saved per user and across reloads, options set the <html> data-*
// attributes, non-sticky header scrolls away, phone drawer in every preset,
// dialogs and the Queue table under Top navigation, Arabic RTL, no overflow.
// Usage: node scripts/e2e-appearance.mjs [outDir] [baseUrl]   — dev server must be running.
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
const prefs = (page, id) => page.evaluate((id) => JSON.parse(localStorage.getItem(`vetting-prefs:${id}`) ?? "null"), id);
const setPrefs = (page, id, layout) =>
  page.evaluate(([id, layout]) => localStorage.setItem(`vetting-prefs:${id}`, JSON.stringify({ layout, railCollapsed: false })), [id, layout]);
const clearPrefs = (page) =>
  page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("vetting-prefs:")).forEach((k) => localStorage.removeItem(k)));
async function open(page, path, ready = "main h1") {
  await page.goto(`${base}${path}`);
  await page.waitForSelector(ready, { timeout: 60000 });
}
const appearance = (page, loc = "en") => open(page, `/${loc}/appearance`, "[data-presets]");
const layoutId = (page) => page.locator("[data-layout]").first().getAttribute("data-layout");
const htmlData = (page) => page.evaluate(() => ({ ...document.documentElement.dataset }));
const card = (page, id) => page.locator(`[data-preset="${id}"]`);
const option = (page, key, label) => page.locator(`[data-option="${key}"]`).getByRole("radio", { name: label, exact: true });
const bar = (page) => page.getByRole("status").filter({ hasText: "Previewing" });
const toastSeen = (page, text) => page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
const RAIL = { default: "full", compact: "hover", mini: "mini", topnav: "none", hybrid: "section" };
const PRESETS = Object.keys(RAIL);

const a = await context.newPage();
watch(a);
await open(a, "/en/dashboard", "main");
await a.evaluate(() => localStorage.removeItem("vetting-prototype")); // fresh seed
await clearPrefs(a);

// ─── 1. Open to every staff user (reviewer) ─────────────────────────────
await setPersona(a, "u_omar");
await appearance(a);
check("reviewer: page opens", (await a.locator("main h1").innerText()).trim() === "Appearance");
check("5 preset cards", (await a.getByRole("radiogroup", { name: "Layout preset" }).getByRole("radio").count()) === 5);
check("Default selected and in use", (await card(a, "default").getAttribute("aria-checked")) === "true" && (await card(a, "default").innerText()).includes("In use"));
check("Try it live disabled while unchanged", await a.locator("[data-try-live]").isDisabled());
check("no save bar while unchanged", (await a.locator("[data-save-bar]").count()) === 0);

// ─── 2. Each card updates the large preview and the options ─────────────
for (const id of PRESETS) {
  await card(a, id).click();
  const fig = a.locator("[data-preview]");
  const ok = (await fig.getAttribute("data-preview")) === id && (await fig.getAttribute("data-preview-rail")) === RAIL[id] && (await card(a, id).getAttribute("aria-checked")) === "true";
  const railPart = await a.locator("[data-preview] [data-preview-part^='rail']").count();
  check(`preview follows ${id}`, ok && (id === "topnav" ? railPart === 0 : railPart === 1), `rail parts ${railPart}`);
}
await card(a, "topnav").click();
const optionKeys = async () => a.locator("[data-option]").evaluateAll((els) => els.map((e) => e.getAttribute("data-option")));
check("Top navigation: only its options", (await optionKeys()).join(",") === "labels,headerSticky,contentWidth,spacing,density,borders,shadows", (await optionKeys()).join(","));
await card(a, "default").click();
check("Default: sidebar options shown", (await optionKeys()).slice(0, 3).join(",") === "sidebarState,sidebarWidth,sidebarSticky");
// Keyboard: arrows move the selection.
await card(a, "default").focus();
await a.keyboard.press("ArrowRight");
check("arrow key selects next preset", (await card(a, "compact").getAttribute("aria-checked")) === "true" && (await a.evaluate(() => document.activeElement?.getAttribute("data-preset"))) === "compact");
// Options reach the preview.
await card(a, "default").click();
await option(a, "sidebarState", "Collapsed").click();
check("collapsed default reflected in preview", (await a.locator("[data-preview]").getAttribute("data-preview-collapsed")) === "");
check("save bar appears when changed", await a.locator("[data-save-bar]").isVisible());
await a.getByRole("button", { name: "Discard" }).click();
check("discard returns to saved", (await a.locator("[data-save-bar]").count()) === 0 && (await a.locator("[data-preview]").getAttribute("data-preview-collapsed")) === null);
await a.screenshot({ path: `${out}/appearance.png`, fullPage: true });

// ─── 3. Try it live → Go back / Keep ────────────────────────────────────
await setPersona(a, "u_sara");
await appearance(a);
await card(a, "topnav").click();
await a.locator("[data-try-live]").click();
await a.waitForSelector('[data-layout="topnav"]', { timeout: 5000 }).catch(() => {});
check("live: shell switches to Top navigation", (await layoutId(a)) === "topnav" && (await a.locator("[data-rail]").count()) === 0 && (await a.locator('header nav[aria-label="Main navigation"]').isVisible()));
check("live: floating bar shown", await bar(a).isVisible());
check("live: page says it's live", await a.locator("[data-live]").isVisible());
await a.screenshot({ path: `${out}/appearance-live-topnav.png` });
await card(a, "hybrid").click();
check("live: changing the card updates the live preview", (await layoutId(a)) === "hybrid" && (await a.locator('[data-rail="section"]').count()) === 1);
await bar(a).getByRole("button", { name: "Go back" }).click();
check("Go back restores the saved layout", (await layoutId(a)) === "default" && (await a.locator('[data-rail="full"]').count()) === 1 && (await bar(a).count()) === 0);
check("Go back resets the page draft", (await card(a, "default").getAttribute("aria-checked")) === "true" && (await a.locator("[data-save-bar]").count()) === 0);

await card(a, "hybrid").click();
await a.locator("[data-try-live]").click();
await bar(a).getByRole("button", { name: "Keep this layout" }).click();
check("Keep: saved toast", await toastSeen(a, "Layout saved"));
check("Keep: saved for Sara", (await prefs(a, "u_sara"))?.layout?.preset === "hybrid");
check("Keep: card marked In use", (await card(a, "hybrid").innerText()).includes("In use"));
await a.reload();
await a.waitForSelector("[data-layout]");
check("saved layout survives reload", (await layoutId(a)) === "hybrid" && (await a.locator('[data-rail="section"]').count()) === 1);

// Per user
await setPersona(a, "u_omar");
await a.reload();
await a.waitForSelector("[data-presets]");
check("other persona keeps their own default", (await layoutId(a)) === "default" && (await card(a, "default").getAttribute("aria-checked")) === "true");
await setPersona(a, "u_sara");
await a.reload();
await a.waitForSelector("[data-presets]");
check("Sara's layout comes back", (await layoutId(a)) === "hybrid" && (await card(a, "hybrid").getAttribute("aria-checked")) === "true");

// ─── 4. Options → <html> data-* after save ──────────────────────────────
await card(a, "default").click();
await option(a, "density", "Compact").click();
await option(a, "spacing", "Tight").click();
await option(a, "contentWidth", "Constrained").click();
await option(a, "borders", "Strong").click();
await option(a, "shadows", "Flat").click();
const pre = await htmlData(a);
check("options not applied before saving", pre.density === "comfortable" && pre.content === "full");
await a.getByRole("button", { name: "Save layout" }).click();
check("save toast", await toastSeen(a, "Layout saved"));
await a.waitForFunction(() => document.documentElement.dataset.density === "compact", null, { timeout: 5000 }).catch(() => {});
const d = await htmlData(a);
check("html data-* follow the saved options", d.density === "compact" && d.spacing === "tight" && d.content === "constrained" && d.borders === "strong" && d.shadows === "flat", JSON.stringify(d));
check("constrained content wrapper", (await a.locator("main .max-w-\\[var\\(--content-max\\)\\]").count()) === 1);
await a.screenshot({ path: `${out}/appearance-compact.png`, fullPage: true });
await a.getByRole("button", { name: "Reset to default" }).click();
await a.getByRole("button", { name: "Save layout" }).click();
await a.waitForFunction(() => document.documentElement.dataset.density === "comfortable", null, { timeout: 5000 }).catch(() => {});
check("reset to default + save", (await prefs(a, "u_sara"))?.layout?.preset === "default" && (await htmlData(a)).density === "comfortable");

// ─── 5. Non-sticky header scrolls away ──────────────────────────────────
await a.locator('[data-option="headerSticky"]').getByRole("switch").click();
await a.getByRole("button", { name: "Save layout" }).click();
await a.waitForSelector("[data-shell-scroll]", { timeout: 5000 }).catch(() => {});
check("non-sticky header: page scroller exists", (await a.locator("[data-shell-scroll]").count()) === 1);
const headerTop = await a.evaluate(async () => {
  const s = document.querySelector("[data-shell-scroll]");
  s.scrollTop = 400;
  await new Promise((r) => setTimeout(r, 100));
  return document.querySelector("header").getBoundingClientRect().bottom;
});
check("non-sticky header scrolls away", headerTop <= 0, String(headerTop));
await a.locator("[data-shell-scroll]").evaluate((s) => (s.scrollTop = 0));
await a.locator('[data-option="headerSticky"]').getByRole("switch").click();
await a.getByRole("button", { name: "Save layout" }).click();
await a.waitForSelector("[data-shell-scroll]", { state: "detached", timeout: 5000 }).catch(() => {});
check("sticky header again: only <main> scrolls", (await a.locator("[data-shell-scroll]").count()) === 0);

// ─── 6. Links to the page ───────────────────────────────────────────────
await open(a, "/en/settings");
check("Settings keeps its 4 tabs and no Appearance link", (await a.getByRole("tab").count()) === 4 && (await a.locator("main").getByText("Appearance").count()) === 0);
await a.locator("[data-rail-footer] a").click();
await a.waitForURL(/\/en\/appearance$/, { timeout: 15000 });
check("sidebar footer link opens Appearance", a.url().endsWith("/en/appearance"));
check("sidebar footer link is marked current", (await a.locator('[data-rail-footer] a[aria-current="page"]').count()) === 1);
await open(a, "/en/queue", "main");
await a.locator("header").getByRole("button").filter({ hasText: "Sara" }).click();
await a.getByRole("menuitem", { name: "Appearance" }).click();
await a.waitForURL(/\/en\/appearance$/, { timeout: 15000 });
check("persona menu opens Appearance", a.url().endsWith("/en/appearance"));

// ─── 7. Top navigation: dialog + Queue table ────────────────────────────
await setPrefs(a, "u_sara", { version: 1, preset: "topnav" });
await open(a, "/en/queue", "main");
await a.waitForSelector('[data-layout="topnav"]');
const rows = await a.locator("main table tbody tr").count();
check("topnav: Queue table renders", rows > 0, `${rows} rows`);
const ow = await a.evaluate(() => document.documentElement.scrollWidth);
check("topnav: Queue no page overflow", ow <= 1440, String(ow));
await a.locator("main table tbody tr").first().click();
await a.waitForTimeout(500);
check("topnav: Queue row opens", /\/requests\/|\/queue/.test(a.url()));
await open(a, "/en/screening/blacklist", "main h1");
await a.getByRole("link", { name: "Add entry" }).click();
await a.waitForURL(/\/screening\/blacklist\/new/, { timeout: 15000 });
await a.waitForSelector("#bl-name", { timeout: 30000 });
check("topnav: Blacklist Add entry page", await a.locator("#bl-name").isVisible());
// A confirm dialog: approve someone else's pending entry.
const db = await a.evaluate(() => JSON.parse(localStorage.getItem("vetting-prototype")).state.db);
let dialogOk = false;
for (const e of Object.values(db.blacklist).filter((e) => e.status === "pending_approval").slice(0, 4)) {
  await open(a, `/en/screening/blacklist/${e.id}`, "main h1");
  const approve = a.getByRole("button", { name: "Approve", exact: true });
  if ((await approve.count()) && (await approve.isEnabled())) {
    await approve.click();
    dialogOk = await a.getByRole("dialog").isVisible().catch(() => false);
    await a.screenshot({ path: `${out}/appearance-topnav-dialog.png` });
    await a.keyboard.press("Escape");
    break;
  }
}
check("topnav: confirm dialog opens", dialogOk);

// ─── 8. Phones: hamburger + drawer in every preset ──────────────────────
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
watch(phone);
await open(phone, "/en/dashboard", "main"); // its own browser context: own storage
await setPersona(phone, "u_sara");
for (const id of PRESETS) {
  await setPrefs(phone, "u_sara", { version: 1, preset: id });
  await open(phone, "/en/dashboard", "main");
  await phone.waitForSelector(`[data-layout="${id}"]`);
  const burger = phone.getByRole("button", { name: "Open menu" });
  const shown = await burger.isVisible();
  await burger.click();
  const drawer = phone.getByRole("dialog", { name: "Main navigation" });
  await drawer.waitFor({ timeout: 5000 }).catch(() => {});
  const links = await drawer.getByRole("link").count();
  check(`390px ${id}: hamburger + drawer with links`, shown && links > 3, `${links} links`);
  await phone.keyboard.press("Escape");
}
await setPrefs(phone, "u_sara", { version: 1, preset: "default" });
for (const loc of ["en", "ar"]) {
  await appearance(phone, loc);
  await phone.waitForTimeout(300);
  const o = await phone.evaluate(() => ({ doc: document.documentElement.scrollWidth, main: document.querySelector("main").scrollWidth }));
  check(`390px ${loc}: no page overflow`, o.doc <= 390 && o.main <= 390, JSON.stringify(o));
}
await appearance(phone);
await card(phone, "mini").click();
const op = await phone.evaluate(() => document.documentElement.scrollWidth);
check("390px with save bar: no overflow", op <= 390, String(op));
await phone.screenshot({ path: `${out}/appearance-phone.png`, fullPage: true });
const tablet = await browser.newPage({ viewport: { width: 820, height: 1100 } });
watch(tablet);
await appearance(tablet);
const ot = await tablet.evaluate(() => document.documentElement.scrollWidth);
check("820px: no page overflow", ot <= 820, String(ot));
check("820px: two card columns", (await tablet.locator("[data-presets]").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)) === 2);
await tablet.screenshot({ path: `${out}/appearance-tablet.png`, fullPage: true });

// ─── 9. Arabic RTL ──────────────────────────────────────────────────────
await appearance(a, "ar");
check("ar: dir=rtl", (await a.evaluate(() => document.documentElement.dir)) === "rtl");
check("ar: Arabic title", (await a.locator("main h1").innerText()).trim() === "المظهر");
await card(a, "default").click();
const mirrored = await a.evaluate(() => {
  const fig = document.querySelector("[data-preview]").getBoundingClientRect();
  const rail = document.querySelector("[data-preview] [data-preview-part^='rail']").getBoundingClientRect();
  return rail.right > fig.right - 10 && rail.left > fig.left + fig.width / 2;
});
check("ar: preview rail on the right", mirrored);
await a.screenshot({ path: `${out}/appearance-ar.png`, fullPage: true });

// Dark
await appearance(a);
await a.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
await a.waitForTimeout(300);
await a.screenshot({ path: `${out}/appearance-dark.png`, fullPage: true });

await clearPrefs(a);
const relevant = errors.filter((e) => !/favicon|Download the React DevTools|\[HMR\]/i.test(e));
check("no page errors", relevant.length === 0, relevant.slice(0, 3).join(" || "));
console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
