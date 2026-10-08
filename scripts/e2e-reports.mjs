// Reports (14.2): picker with locks per persona, shared filters, AC25 (masked
// export without Blacklist View, export logged), CSV / Excel downloads,
// activity log for one request, scheduled emails, Phase 2 automation, outbox
// wording, Arabic RTL and no overflow on phones.
// Usage: node scripts/e2e-reports.mjs <outDir> [baseUrl]   — dev server must be running.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const out = process.argv[2] ?? "screens";
const base = process.argv[3] ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
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
const report = (page, key) => open(page, `/en/reports?report=${key}`, `section[data-report="${key}"]`);
const lockedKeys = (page) => page.$$eval("[data-report-card][data-locked]", (els) => els.map((e) => e.getAttribute("data-report-card")).sort());
const setFrom = async (page, day) => {
  await page.locator('input[data-filter="from"]').fill(day);
  await page.waitForTimeout(200);
};
async function downloadAs(page, item) {
  await page.getByRole("button", { name: /^(Download|تنزيل)/ }).click();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByRole("menuitem", { name: item }).click()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), buf: readFileSync(path) };
}
const columnTexts = (page, col) => page.locator(`tbody td[data-column="${col}"]`).allTextContents();

const a = await context.newPage();
watch(a);
await open(a, "/en/dashboard", "main");
await a.evaluate(() => localStorage.removeItem("vetting-prototype")); // fresh seed
await setPersona(a, "u_sara");

// ─── 1. Picker: eight reports, locks per persona ────────────────────────
const LOCKS = {
  u_sara: [],
  u_salma: ["activityLog", "listEntries", "listMatches", "reviewerActivity"],
  u_lina: ["activityLog"],
  u_daniel: ["listEntries", "listMatches", "reviewerActivity"],
};
for (const [persona, expected] of Object.entries(LOCKS)) {
  await setPersona(a, persona);
  await report(a, "vettingStatus");
  const cards = await a.locator("[data-report-card]").count();
  const locked = await lockedKeys(a);
  check(`${persona}: picker shows 8 reports`, cards === 8, String(cards));
  check(`${persona}: locked reports`, JSON.stringify(locked) === JSON.stringify(expected), locked.join(", ") || "none");
}
await setPersona(a, "u_salma");
await report(a, "vettingStatus");
check("locked card names who can open it", (await a.locator('[data-report-card="activityLog"]').innerText()).includes("Review All"));
check("salma: no Download button, disabled with reason", (await a.locator("[data-download-disabled]").count()) === 1 && (await a.getByRole("button", { name: /^Download$/ }).count()) === 0);
check("salma: no schedule button", (await a.getByRole("button", { name: "Email this report" }).count()) === 0);
await a.locator("[data-download-disabled]").hover();
const tip = await a.getByRole("tooltip").first().textContent({ timeout: 5000 }).catch(() => "");
check("salma: tooltip Needs Reports Export", (tip ?? "").includes("Needs Reports Export"), tip ?? "");
// A locked report in the URL falls back to one the user can open.
await open(a, "/en/reports?report=activityLog", "section[data-report]");
check("locked report in URL is not shown", (await a.locator("section[data-report]").getAttribute("data-report")) !== "activityLog");
await a.screenshot({ path: `${out}/reports-salma.png`, fullPage: true });

// ─── 2. AC25: Daniel (Review All + Export, no Blacklist View) ───────────
await setPersona(a, "u_daniel");
await report(a, "vettingStatus");
await setFrom(a, "2026-01-01");
let db = await readDb(a);
const heldIds = Object.values(db.requests).filter((r) => r.status === "screening_hold").map((r) => r.id);
const fullIds = Object.values(db.attendees).flatMap((x) => [x.profile.nationalId, x.profile.passportNo]).filter(Boolean);
check("AC25 masked notice shown", await a.locator("[data-masked-notice]").isVisible());
check("AC25 no Screening hold in the table", !(await a.locator("table[data-report-table]").innerText()).includes("Screening hold"));
const ids = (await columnTexts(a, "nationalId")).filter((x) => x && x !== "—");
check("AC25 national IDs start with •", ids.length > 0 && ids.every((x) => x.startsWith("•")), `${ids.length} on page, e.g. ${ids[0]}`);
await a.screenshot({ path: `${out}/reports-ac25-daniel.png`, fullPage: false });

const before = Object.keys(db.reportDownloads).length;
const csv = await downloadAs(a, /CSV/);
// The toast shows for 4 s, so check it before the slower file checks below.
check("toast after download", await a.getByText(/Vetting status downloaded/).first().isVisible().catch(() => false));
const csvText = csv.buf.toString("utf8");
check("CSV file name", /^vetting-status_\d{4}-\d{2}-\d{2}\.csv$/.test(csv.name), csv.name);
check("CSV starts with a UTF-8 BOM", csv.buf[0] === 0xef && csv.buf[1] === 0xbb && csv.buf[2] === 0xbf);
check("CSV header in English", csvText.replace(/^﻿/, "").startsWith("Request,Attendee,Registration,Badge type"));
check("AC25 CSV has no Screening hold", !csvText.includes("Screening hold"));
check("AC25 CSV has no full ID or passport", !fullIds.some((id) => csvText.includes(id)));
check("AC25 CSV keeps held requests (as Under review)", heldIds.length > 0 && heldIds.some((id) => new RegExp(`${id},[^\\n]*Under review`).test(csvText)));
check("CSV has masked IDs", csvText.includes("•"));
await a.waitForTimeout(400);
db = await readDb(a);
const logs = Object.values(db.reportDownloads).sort((x, y) => y.at.localeCompare(x.at));
check("AC25 download logged", logs.length === before + 1 && logs[0].actorId === "u_daniel" && logs[0].report === "vettingStatus" && logs[0].format === "csv" && logs[0].masked === true, JSON.stringify(logs[0] ?? {}));

const xlsx = await downloadAs(a, /Excel/);
check("Excel file is a real .xlsx (PK zip)", xlsx.name.endsWith(".xlsx") && xlsx.buf.subarray(0, 2).toString() === "PK", xlsx.name);
await a.waitForTimeout(300);
db = await readDb(a);
check("Excel download logged too", Object.keys(db.reportDownloads).length === before + 2);
check("Downloads log panel lists the download", (await a.locator("[data-panel=downloads] [data-download]").count()) >= 2 && (await a.locator("[data-panel=downloads]").innerText()).includes("Daniel Mercer"));

// PDF: logged, then the print view (print dialog stubbed).
await a.evaluate(() => {
  window.__printed = 0;
  window.print = () => {
    window.__printed++;
    window.__printHtml = document.getElementById("report-print")?.innerText ?? "";
  };
});
await a.getByRole("button", { name: /^Download/ }).click();
await a.getByRole("menuitem", { name: /PDF/ }).click();
await a.waitForFunction(() => window.__printed > 0, null, { timeout: 10000 }).catch(() => {});
const printed = await a.evaluate(() => ({ n: window.__printed, html: window.__printHtml }));
check("PDF opens the print view with title and filters", printed.n === 1 && printed.html.includes("Vetting status") && printed.html.includes("Filters"), String(printed.n));
check("PDF print view is masked too", !printed.html.includes("Screening hold") && printed.html.includes("partly hidden"));
check("print view removed afterwards", (await a.locator("#report-print").count()) === 0);

// ─── 3. Sara sees Screening hold and full IDs ───────────────────────────
await setPersona(a, "u_sara");
await report(a, "vettingStatus");
await setFrom(a, "2026-01-01");
check("sara: no masked notice", (await a.locator("[data-masked-notice]").count()) === 0);
check("sara: Screening hold in the table", (await a.locator("table[data-report-table]").innerText()).includes("Screening hold"));
const sIds = (await columnTexts(a, "nationalId")).filter((x) => x && x !== "—");
check("sara: full IDs", sIds.length > 0 && sIds.every((x) => !x.includes("•")), sIds[0]);
const sCsv = (await downloadAs(a, /CSV/)).buf.toString("utf8");
check("sara: CSV has Screening hold and full IDs", sCsv.includes("Screening hold") && fullIds.some((id) => sCsv.includes(id)));

// Sorting and paging
await a.getByRole("button", { name: "Sort by Attendee" }).click();
const names = (await columnTexts(a, "attendee")).slice(0, 10);
check("sort by attendee", names.join("|") === [...names].sort((x, y) => x.localeCompare(y, "en", { sensitivity: "base", numeric: true })).join("|"), names.slice(0, 3).join(", "));
check("50 rows per page", (await a.locator("tbody tr").count()) === 50);
check("request IDs link to the request", (await a.locator('tbody td[data-column="request"] a[href*="/requests/VR-"]').count()) === 50);

// ─── 4. Activity log: full history of one request ───────────────────────
await report(a, "activityLog");
await a.getByRole("textbox", { name: "Request ID" }).fill("vr-1001");
await a.waitForTimeout(300);
const reqs = await columnTexts(a, "request");
check("activity log by request shows only that request", reqs.length > 0 && reqs.every((x) => x.trim() === "VR-1001"), `${reqs.length} rows`);
check("request ID hint shown", (await a.locator("[data-filter-note]").innerText()).includes("VR-1001"));
await a.screenshot({ path: `${out}/reports-activity-one.png`, fullPage: false });
await a.getByRole("textbox", { name: "Request ID" }).fill("VR-0000");
await a.waitForTimeout(200);
check("unknown request shows an empty state", await a.getByText("No history found for VR-0000").isVisible());

// ─── 5. Schedule: weekly, listed, deleted ───────────────────────────────
await report(a, "lateRequests");
await a.getByRole("button", { name: "Email this report" }).click();
const dlg = a.getByRole("dialog", { name: "Email this report" });
await dlg.waitFor();
await dlg.getByRole("radio", { name: "Weekly" }).click();
await dlg.getByRole("button", { name: "Day" }).click();
await a.getByRole("option", { name: "Monday" }).click();
await dlg.getByRole("button", { name: /Time/ }).click();
await a.getByRole("option", { name: "07:00" }).click();
await dlg.getByRole("radio", { name: "CSV" }).click();
await a.screenshot({ path: `${out}/reports-schedule-dialog.png` });
await dlg.getByRole("button", { name: "Save schedule" }).click();
await dlg.waitFor({ state: "detached", timeout: 10000 });
const sched = a.locator("[data-panel=schedules] [data-schedule]");
await sched.first().waitFor({ timeout: 10000 });
const schedText = await sched.first().innerText();
check("schedule listed", (await sched.count()) === 1 && schedText.includes("Late requests") && /every Monday at 07:00/i.test(schedText) && schedText.includes("CSV") && schedText.includes("Active"), schedText.replace(/\n/g, " | "));
db = await readDb(a);
const saved = Object.values(db.reportSchedules)[0];
check("schedule saved with filters", saved && saved.frequency === "weekly" && saved.weekday === 1 && saved.hour === 7 && saved.format === "csv" && saved.ownerId === "u_sara" && saved.filters.from);
await a.screenshot({ path: `${out}/reports-schedules.png`, fullPage: true });
await a.getByRole("button", { name: "Delete schedule for Late requests" }).click();
await a.waitForTimeout(600);
check("schedule deleted", (await sched.count()) === 0 && Object.keys((await readDb(a)).reportSchedules).length === 0);

// ─── 6. Automation is Phase 2 ───────────────────────────────────────────
await report(a, "automation");
check("automation: Phase 2 empty state", await a.locator("[data-phase2]").isVisible());
check("automation: Phase 2 badge", (await a.locator("[data-report-title]").innerText()).includes("Phase 2"));
check("automation: download disabled", (await a.locator("[data-download-disabled]").count()) === 1);

// ─── 7. Outbox: scheduled report email is worded ────────────────────────
await editDb(
  a,
  `db.outbox["mail_e2e_rep"] = { id: "mail_e2e_rep", to: "sara.alotaibi@vetting.app", template: "report_scheduled", requestId: null, sentAt: new Date(Date.now() + 60000).toISOString(), params: { report: "vettingStatus", rows: "12", format: "xlsx", frequency: "weekly" } };`,
);
await open(a, "/en/dev/outbox");
await a.waitForTimeout(300);
const outboxText = await a.locator("main").innerText();
check("outbox: report email subject translated", outboxText.includes("Your weekly report: Vetting status"), outboxText.match(/Your .* report[^\n]*/)?.[0]);
check("outbox: rows and format worded", outboxText.includes("(12 rows, Excel)"));

// ─── 8. Arabic: RTL, Arabic title and CSV header ────────────────────────
await open(a, "/ar/reports?report=vettingStatus", "section[data-report]");
check("ar: dir=rtl", (await a.evaluate(() => document.documentElement.dir)) === "rtl");
check("ar: Arabic title", (await a.locator("main h1").innerText()).trim() === "التقارير");
check("ar: report name in Arabic", (await a.locator("[data-report-title]").innerText()).includes("حالة التدقيق"));
const arCsv = (await downloadAs(a, /CSV/)).buf.toString("utf8").replace(/^﻿/, "");
check("ar: CSV header in Arabic", arCsv.startsWith("الطلب,المشارك,التسجيل,نوع الشارة"), arCsv.slice(0, 40));
check("ar: CSV statuses in Arabic", arCsv.includes("بانتظار المراجعة") || arCsv.includes("مقبول"));
await a.screenshot({ path: `${out}/reports-ar.png`, fullPage: false });

// ─── 9. Phone: no horizontal overflow ───────────────────────────────────
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
watch(phone);
for (const [loc, key] of [["en", "vettingStatus"], ["en", "activityLog"], ["ar", "listMatches"]]) {
  await open(phone, `/${loc}/reports?report=${key}`, "section[data-report]");
  await phone.waitForTimeout(400);
  const o = await phone.evaluate(() => ({ doc: document.documentElement.scrollWidth, main: document.querySelector("main").scrollWidth }));
  check(`390px ${loc}/${key}: no page overflow`, o.doc <= 390 && o.main <= 390, JSON.stringify(o));
}
await open(phone, "/en/reports?report=vettingStatus", "section[data-report]");
await phone.screenshot({ path: `${out}/reports-phone.png`, fullPage: true });
const tablet = await browser.newPage({ viewport: { width: 820, height: 1100 } });
await open(tablet, "/en/reports?report=listMatches", "section[data-report]");
const ot = await tablet.evaluate(() => document.documentElement.scrollWidth);
check("820px: no page overflow", ot <= 820, String(ot));
await tablet.screenshot({ path: `${out}/reports-tablet.png`, fullPage: true });

// Dark mode screenshot
await a.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
await open(a, "/en/reports?report=listMatches", "section[data-report]");
await a.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
await a.waitForTimeout(300);
await a.screenshot({ path: `${out}/reports-dark.png`, fullPage: false });

const relevant = errors.filter((e) => !/favicon|Download the React DevTools|\[HMR\]/i.test(e));
check("no page errors", relevant.length === 0, relevant.slice(0, 3).join(" || "));
console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
