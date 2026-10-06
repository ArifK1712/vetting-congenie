// Attendees list (13.2), no badge without approval (11.2, AC17), registration
// limit (11.3), kiosk and API channels, attendee portal download, live
// updates across tabs (AC21), Arabic RTL, phone and dark screenshots.
// Usage: node scripts/e2e-attendees.mjs <outDir> [baseUrl]   — dev server must be running.
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
const rowOf = (page, attendeeId) => page.locator(`tr[data-attendee="${attendeeId}"]`);
async function search(page, q) {
  const box = page.getByRole("textbox", { name: /Search name, email or request ID|ابحث/ });
  await box.fill(q);
  await page.waitForTimeout(150);
}
async function rowAction(page, name, item) {
  await page.getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}
const usedOf = async (page, regId) => Number((await page.locator(`[data-capacity="${regId}"] [data-used]`).innerText()).replace(/\D/g, ""));
const NOT_APPROVED = "Not approved yet — no badge until the vetting request is Approved";
const SUSPENDED = "Badge suspended, please contact the organiser";

// Seed facts used below (fresh demo data):
//   VR-1001 att_1  Sarah Turner      approved, free, badge issued   → allowed
//   VR-1040 att_2y Ibrahim Al-Mutairi pending review                → not approved
//   VR-1009 att_o  Ghada …           approved, badge suspended       → suspended
//   VR-1006 att_h  Min-jun Choi      approved, paid, holds a place   (reg_gis_visitor)
//   VR-1048 att_3g Abeer …           approved, payment pending
//   VR-1281 att_k7 Nasser …          screening hold
//   VR-1241 att_he Ibrahim Mohammed  pending review (AC21)

const a = await context.newPage();
watch(a);
await open(a, "/en/dashboard", "main");
await a.evaluate(() => localStorage.removeItem("vetting-prototype")); // fresh seed
await setPersona(a, "u_sara");

// ─── 1. List with the four status filters ───────────────────────────────
await open(a, "/en/attendees");
await a.waitForSelector("tr[data-attendee]", { timeout: 30000 });
check("title", (await a.locator("main h1").innerText()).trim() === "Attendees");
for (const f of ["Registration status", "Payment status", "Vetting status", "Badge status"]) {
  check(`filter: ${f}`, (await a.getByRole("button", { name: new RegExp(`^${f}`) }).count()) === 1);
}
check("columns: four status headers", (await a.locator("thead").innerText()).includes("REGISTRATION STATUS") || (await a.locator("thead th").allInnerTexts()).join("|").toLowerCase().includes("registration status"));
check("capacity strip shows registrations", (await a.locator("[data-capacity]").count()) >= 5);
check("25 rows per page", (await a.locator("tr[data-attendee]").count()) === 25);
await a.screenshot({ path: `${out}/attendees-list.png`, fullPage: true });

// ─── 2. Filter: Vetting status = Pending review ─────────────────────────
let db = await readDb(a);
const pendingTotal = Object.values(db.requests).filter((r) => r.status === "pending_review").length;
await a.getByRole("button", { name: /^Vetting status/ }).click();
check("admin sees Screening hold option", (await a.getByRole("option", { name: "Screening hold" }).count()) === 1);
await a.getByRole("option", { name: "Pending review" }).click();
await a.keyboard.press("Escape");
await a.waitForTimeout(200);
const vettingTexts = await a.locator("tr[data-attendee] td:nth-child(6)").allInnerTexts();
check("filter shows only Pending review", vettingTexts.length > 0 && vettingTexts.every((x) => x.trim() === "Pending review"), `${vettingTexts.length} rows`);
check("filter total matches", (await a.locator("[data-range]").innerText()).endsWith(`of ${pendingTotal}`), await a.locator("[data-range]").innerText());
await a.screenshot({ path: `${out}/attendees-filter-pending.png` });
await a.getByRole("button", { name: "Reset filters" }).first().click();

// ─── 3. AC17: Download / Print on a pending attendee are refused ────────
await search(a, "VR-1040");
check("search by request ID", (await a.locator("tr[data-attendee]").count()) === 1);
await rowAction(a, "Ibrahim Al-Mutairi", "Download badge");
const refusal = a.getByRole("dialog", { name: "Badge refused" });
await refusal.waitFor({ timeout: 10000 });
check("AC17 download refused with not-approved message", (await refusal.innerText()).includes(NOT_APPROVED));
await a.screenshot({ path: `${out}/attendees-refused.png` });
await refusal.getByRole("button", { name: "OK" }).click();
await rowAction(a, "Ibrahim Al-Mutairi", "Print badge");
await refusal.waitFor({ timeout: 10000 });
check("AC17 print refused with not-approved message", (await refusal.innerText()).includes(NOT_APPROVED));
await refusal.getByRole("button", { name: "OK" }).click();
db = await readDb(a);
const blockedLog = Object.values(db.history).filter((h) => h.requestId === "VR-1040" && h.action === "badge_blocked");
check("AC17 both attempts logged", blockedLog.length === 2 && blockedLog.some((h) => h.meta.channel === "download") && blockedLog.some((h) => h.meta.channel === "bulkPrint"));
await open(a, "/en/requests/VR-1040");
await a.getByRole("tab", { name: "History" }).click();
check("AC17 request history shows Badge refused", (await a.getByText(/Badge refused/).count()) >= 2);
check("history reason is translated", (await a.getByText(NOT_APPROVED).count()) >= 1);

// ─── 4. AC17: bulk print of a mix ───────────────────────────────────────
await open(a, "/en/attendees");
await a.waitForSelector("tr[data-attendee]");
for (const [q, name] of [["VR-1001", "Sarah Turner"], ["VR-1040", "Ibrahim Al-Mutairi"], ["VR-1009", "Ghada Ibrahim Al-Malki"]]) {
  await search(a, q);
  await a.getByRole("checkbox", { name: `Select ${name}` }).check();
}
const printBtn = a.getByRole("button", { name: "Print badges (3)" });
check("bulk print button shows count", (await printBtn.count()) === 1);
await printBtn.click();
const bulk = a.getByRole("dialog", { name: "Print run finished" });
await bulk.waitFor({ timeout: 10000 });
const bulkText = await bulk.innerText();
check("bulk: 1 printed, 2 refused", bulkText.includes("1 printed") && bulkText.includes("2 refused"), bulkText.replace(/\s+/g, " ").slice(0, 160));
check("bulk: refused list with reasons", bulkText.includes(NOT_APPROVED) && bulkText.includes(SUSPENDED));
await a.screenshot({ path: `${out}/attendees-bulk-result.png` });
await bulk.getByRole("button", { name: "Done" }).click();

// ─── 5. Kiosk ───────────────────────────────────────────────────────────
await search(a, "");
await a.getByRole("button", { name: "Check-in kiosk" }).click();
const kiosk = a.getByRole("dialog", { name: "Check-in kiosk" });
const scan = async (name, code, expected) => {
  await kiosk.getByLabel("Request ID or email").fill(code);
  await kiosk.getByRole("button", { name: "Scan" }).click();
  await kiosk
    .locator("[data-kiosk-result]", { hasText: expected })
    .waitFor({ timeout: 10000 })
    .then(
      () => check(name, true),
      async () => check(name, false, await kiosk.locator("[data-kiosk-result]").innerText()),
    );
};
await scan("kiosk: suspended badge refused", "VR-1009", SUSPENDED);
await a.screenshot({ path: `${out}/attendees-kiosk-suspended.png` });
await scan("kiosk: unapproved refused", "VR-1040", "Not approved — please see the registration desk");
await scan("kiosk: approved welcomed (by email)", "sarah.turner@gmail.com", "Welcome, Sarah Turner");
await a.screenshot({ path: `${out}/attendees-kiosk-welcome.png` });
await kiosk.getByRole("button", { name: "Close" }).last().click();

// ─── 6. API check: Screening Hold reads under_review ────────────────────
await a.getByRole("button", { name: "API check" }).click();
const api = a.getByRole("dialog", { name: "Read-only API" });
await api.getByLabel("Request ID, attendee ID or email").fill("VR-1281");
await api.getByRole("button", { name: "Send request" }).click();
const json = JSON.parse(await api.locator("[data-api-response]").innerText());
check("API: hold shown as under_review", json.vettingStatus === "under_review" && json.badgeAllowed === false && json.attendeeId === "att_k7");
check("API: no list details", Object.keys(json).sort().join(",") === "attendeeId,badgeAllowed,badgeStatus,vettingStatus");
await api.getByRole("button", { name: "Close" }).last().click();

// ─── 7. Free place ──────────────────────────────────────────────────────
const usedBefore = await usedOf(a, "reg_gis_visitor");
await search(a, "VR-1006");
await rowAction(a, "Min-jun Choi", "Free place");
const free = a.getByRole("dialog", { name: /Free the place of Min-jun Choi/ });
check("free place explains revoke and cancel", (await free.innerText()).includes("The badge is revoked") && (await free.innerText()).includes("The registration is cancelled"));
check("free place needs a reason", await free.getByRole("button", { name: "Free place" }).isDisabled());
await free.getByLabel("Reason").fill("Attendee cancelled by email");
await free.getByRole("button", { name: "Free place" }).click();
await a.waitForSelector("text=Place freed for Min-jun Choi", { timeout: 15000 });
await a.waitForTimeout(300);
const usedAfter = await usedOf(a, "reg_gis_visitor");
check("places used decreased", usedAfter === usedBefore - 1, `${usedBefore} → ${usedAfter}`);
const freedRow = await rowOf(a, "att_h").innerText();
check("badge shows Revoked, registration Cancelled", freedRow.includes("Revoked") && freedRow.includes("Cancelled"));
db = await readDb(a);
check("place release logged with reason", Object.values(db.history).some((h) => h.requestId === "VR-1006" && h.action === "place_released" && h.remarks === "Attendee cancelled by email"));

// ─── 8. Withdraw ────────────────────────────────────────────────────────
await search(a, "VR-1040");
await rowAction(a, "Ibrahim Al-Mutairi", "Withdraw request");
const wd = a.getByRole("dialog", { name: "Withdraw request VR-1040" });
await wd.getByLabel("Reason").fill("Duplicate registration");
await wd.getByRole("button", { name: "Withdraw request" }).click();
await a.waitForSelector("text=Request VR-1040 withdrawn", { timeout: 15000 });
check("withdrawn request shows Withdrawn", (await rowOf(a, "att_2y").innerText()).includes("Withdrawn"));

// ─── 9. Change limit ────────────────────────────────────────────────────
const card = a.locator('[data-capacity="reg_rdw_media"]');
check("full registration shows waiting for a place", /waiting for a place/.test(await card.locator("[data-waiting]").innerText().catch(() => "")));
await card.getByRole("button", { name: /Change limit/ }).click();
const lim = a.getByRole("dialog", { name: "Change the registration limit" });
await lim.getByLabel("New limit").fill("1");
await lim.getByLabel("Reason").fill("Venue change");
await lim.getByRole("button", { name: "Save limit" }).click();
await lim.getByText("The limit can't be lower than the places already used.").waitFor({ timeout: 10000 }).then(
  () => check("limit below used refused", true),
  () => check("limit below used refused", false),
);
await lim.getByLabel("New limit").fill("40");
await lim.getByRole("button", { name: "Save limit" }).click();
await a.waitForSelector("text=Limit for Media Registration set to 40", { timeout: 15000 });
db = await readDb(a);
check("limit saved", db.registrations.reg_rdw_media.capacityLimit === 40);
check("capacity card updated", (await card.innerText()).includes("/ 40"));
await a.screenshot({ path: `${out}/attendees-after-actions.png`, fullPage: true });

// ─── 10. Personas: no Screening hold without Blacklist View ─────────────
await setPersona(a, "u_omar");
await open(a, "/en/attendees", "main p");
check("reviewer (u_omar, no list access): no-access state", (await a.getByText("You can't open the attendee list").count()) === 1);
for (const persona of ["u_lina", "u_daniel"]) {
  await setPersona(a, persona);
  await open(a, "/en/attendees");
  await a.waitForSelector("tr[data-attendee]");
  await a.getByRole("button", { name: /^Vetting status/ }).click();
  check(`${persona}: no Screening hold filter option`, (await a.getByRole("option", { name: "Screening hold" }).count()) === 0);
  await a.keyboard.press("Escape");
  await search(a, "VR-1281");
  const holdRow = await rowOf(a, "att_k7").innerText();
  check(`${persona}: hold shown as Under review`, holdRow.includes("Under review") && !holdRow.includes("Screening hold"));
  check(`${persona}: page never says Screening hold`, !(await a.locator("main").innerText()).includes("Screening hold"));
}
// Without Review Queue Access the vetting status opens a read-only summary.
await setPersona(a, "u_salma");
await open(a, "/en/attendees");
await a.waitForSelector("tr[data-attendee]");
await search(a, "VR-1281");
await a.getByRole("button", { name: /Show vetting summary for/ }).click();
const summary = a.locator("[data-vetting-summary]");
await summary.waitFor();
const sumText = await summary.innerText();
check("summary: status, submitted, stage, decided", ["Under review", "Submitted", "Current stage", "Decided"].every((x) => sumText.includes(x)));
check("summary: no list or team details", !/screening|blacklist|watchlist|team/i.test(sumText));
check("no row checkboxes without print rights", (await a.getByRole("checkbox").count()) === 0);
await a.screenshot({ path: `${out}/attendees-summary.png` });
await a.keyboard.press("Escape");
await setPersona(a, "u_sara");

// ─── 11. Portal download ────────────────────────────────────────────────
await open(a, "/en/portal/status/VR-1001");
await a.getByRole("button", { name: "Download badge" }).click();
await a.waitForSelector("[data-badge-result=ok]", { timeout: 10000 });
check("portal: approved + paid attendee downloads badge", true);
await open(a, "/en/portal/status/VR-1048");
await a.getByRole("button", { name: "Download badge" }).click();
await a.waitForSelector("[data-badge-result=refused]", { timeout: 10000 });
check("portal: payment pending refused", (await a.locator("[data-badge-result=refused]").innerText()).includes("once payment is complete"));
await open(a, "/en/portal/status/VR-1009");
await a.getByRole("button", { name: "Download badge" }).click();
await a.waitForSelector("[data-badge-result=refused]", { timeout: 10000 });
check("portal: suspended refused", (await a.locator("[data-badge-result=refused]").innerText()).includes("Badge suspended, please contact the organiser"));
await a.screenshot({ path: `${out}/portal-badge-refused.png`, fullPage: true });
await open(a, "/en/portal/status/VR-1241");
check("portal: pending request has no download button", (await a.getByRole("button", { name: "Download badge" }).count()) === 0);
db = await readDb(a);
check("portal attempts logged as attendee", Object.values(db.history).some((h) => h.requestId === "VR-1048" && h.action === "badge_blocked" && h.actorId === "attendee"));

// ─── 12. AC21: live update from another tab ─────────────────────────────
await open(a, "/en/attendees");
await a.waitForSelector("tr[data-attendee]");
await search(a, "VR-1241");
check("AC21 before: Pending review", (await rowOf(a, "att_he").innerText()).includes("Pending review"));
const b = await context.newPage();
watch(b);
await open(b, "/en/dashboard", "main");
const t0 = Date.now();
await editDb(b, `db.requests["VR-1241"].status = "under_review"; db.requests["VR-1241"].revision += 1;`);
await a
  .waitForFunction(() => document.querySelector('tr[data-attendee="att_he"]')?.textContent.includes("Under review"), null, { timeout: 5000 })
  .then(
    () => check("AC21 list updates within 5 s without reload", true, `${Date.now() - t0} ms`),
    () => check("AC21 list updates within 5 s without reload", false),
  );
await b.close();

// ─── 13. Arabic RTL ─────────────────────────────────────────────────────
await open(a, "/ar/attendees");
await a.waitForSelector("tr[data-attendee]");
check("Arabic: dir=rtl", (await a.locator("html").getAttribute("dir")) === "rtl");
check("Arabic: title", (await a.locator("main h1").innerText()).trim() === "الحضور");
check("Arabic: status filter", (await a.getByRole("button", { name: /^حالة التدقيق/ }).count()) === 1);
await a.screenshot({ path: `${out}/ar-attendees-list.png`, fullPage: true });

// ─── 14. Phone and dark mode ────────────────────────────────────────────
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await phone.newPage();
watch(p);
await open(p, "/en/dashboard", "main");
await setPersona(p, "u_sara");
await open(p, "/en/attendees");
await p.waitForSelector("tr[data-attendee]");
check("phone: no horizontal scroll", !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
const visibleHeaders = await p.locator("thead th:visible").count();
check("phone: collapsed columns", visibleHeaders <= 3, `${visibleHeaders} visible`);
await p.screenshot({ path: `${out}/phone-attendees.png`, fullPage: true });
await open(p, "/ar/attendees");
await p.waitForSelector("tr[data-attendee]");
check("phone (ar): no horizontal scroll", !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
await phone.close();

const tablet = await browser.newContext({ viewport: { width: 820, height: 1180 } });
const tp = await tablet.newPage();
watch(tp);
await open(tp, "/en/dashboard", "main");
await setPersona(tp, "u_sara");
await open(tp, "/en/attendees");
await tp.waitForSelector("tr[data-attendee]");
check("tablet: no horizontal scroll", !(await tp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
await tp.screenshot({ path: `${out}/tablet-attendees.png` });
await tablet.close();

const dark = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
await dark.addInitScript(() => localStorage.setItem("vetting-theme", "dark"));
const d = await dark.newPage();
watch(d);
await open(d, "/en/dashboard", "main");
await setPersona(d, "u_sara");
await open(d, "/en/attendees");
await d.waitForSelector("tr[data-attendee]");
await d.screenshot({ path: `${out}/dark-attendees.png` });
await d.getByRole("button", { name: "Check-in kiosk" }).click();
await d.getByLabel("Request ID or email").fill("VR-1001");
await d.getByRole("button", { name: "Scan" }).click();
await d.waitForTimeout(900);
await d.screenshot({ path: `${out}/dark-attendees-kiosk.png` });
await dark.close();

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(errors.length ? `Page errors:\n${[...new Set(errors)].join("\n")}` : "No page errors");
await browser.close();
