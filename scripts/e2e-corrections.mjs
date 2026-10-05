// Request Detail fixes: reviewer corrections (with re-screening), logged downloads, photo,
// and reopening a rejected request — in English and Arabic. Usage: node scripts/e2e-corrections.mjs <outDir> [baseUrl]
import { chromium } from "playwright";

const out = process.argv[2] ?? "screens";
const base = process.argv[3] ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
const results = [];
const check = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const setPersona = (id) =>
  page.evaluate((id) => localStorage.setItem("vetting-prototype-session", JSON.stringify({ state: { personaId: id, eventScope: "all", sidebarCollapsed: false }, version: 0 })), id);
const readDb = () => page.evaluate(() => JSON.parse(localStorage.getItem("vetting-prototype")).state.db);
async function open(path, ready = "main h1") {
  await page.goto(`${base}${path}`);
  await page.waitForSelector(ready, { timeout: 60000 });
}

await open("/en/dashboard", "main");
await page.evaluate(() => localStorage.removeItem("vetting-prototype"));
await setPersona("u_omar");
await open("/en/queue");
let db = await readDb();
const req = Object.values(db.requests).find((r) => r.currentTeamId === "t_docs" && r.status === "pending_review" && db.attendees[r.attendeeId].documents.length);

// ─── 1. Photo and Correct buttons ───────────────────────────────────────
await open(`/en/requests/${req.id}`);
check("photo row is shown", (await page.getByText("Sample photo (prototype)").count()) > 0);
check("editable fields have Correct", (await page.getByRole("button", { name: "Correct" }).count()) > 0);
await page.screenshot({ path: `${out}/en-detail-correct.png` });

// ─── 2. Correct the company ─────────────────────────────────────────────
await page.locator("dd", { hasText: db.attendees[req.attendeeId].profile.company }).getByRole("button", { name: "Correct" }).click();
await page.locator("#correct-value").fill("Corrected Trading Co.");
await page.locator("#correct-reason").fill("Company name checked against the letter.");
await page.getByRole("button", { name: "Save correction" }).click();
await page.waitForSelector("text=corrected and logged", { timeout: 15000 });
db = await readDb();
check("registration updated", db.attendees[req.attendeeId].profile.company === "Corrected Trading Co.");
await page.getByRole("tab", { name: "History" }).click();
check("history shows the change", (await page.getByText(/→ Corrected Trading Co\./).count()) > 0);

// ─── 3. Correcting an ID onto a blacklisted number holds the request ────
const listed = Object.values(db.blacklist).find((e) => e.status === "active" && e.identity.nationalId && e.eventScope === "all");
const idReq = Object.values(db.requests).find((r) => r.currentTeamId === "t_docs" && r.status === "pending_review" && r.id !== req.id && db.attendees[r.attendeeId].profile.nationalId);
await open(`/en/requests/${idReq.id}`);
await page.locator("dd", { hasText: db.attendees[idReq.attendeeId].profile.nationalId }).getByRole("button", { name: "Correct" }).click();
check("ID correction warns about re-screening", (await page.getByText("check runs again after you save").count()) > 0);
await page.locator("#correct-value").fill(listed.identity.nationalId);
await page.getByRole("button", { name: "Save correction" }).click();
await page.waitForSelector("text=is on hold", { timeout: 15000 });
db = await readDb();
check("new blacklist match puts it on hold", db.requests[idReq.id].status === "screening_hold");

// ─── 4. Download is logged ──────────────────────────────────────────────
await open(`/en/requests/${req.id}`);
await page.getByRole("tab", { name: /Documents/ }).click();
await page.getByRole("button", { name: "Download" }).first().click();
await page.waitForSelector("text=download logged", { timeout: 15000 });
db = await readDb();
check("download logged in history", Object.values(db.history).some((h) => h.requestId === req.id && h.action === "document_downloaded"));

// ─── 5. Reopen a rejected request (Review All) ──────────────────────────
const rejected = Object.values(db.requests).find((r) => r.status === "rejected" && r.rejectReasonId && r.rejectReasonId !== "rr_blacklisted" && r.currentStageNodeId);
await setPersona("u_omar");
await open(`/en/requests/${rejected.id}`);
check("reviewer without Review All can't reopen", (await page.getByRole("button", { name: "Reopen request" }).count()) === 0);
await setPersona("u_sara");
await open(`/en/requests/${rejected.id}`);
await page.getByRole("button", { name: "Reopen request" }).click();
await page.locator("#reopen-reason").fill("Missing documents arrived by email.");
await page.getByRole("button", { name: "Reopen", exact: true }).click();
await page.waitForSelector("text=reopened and back with its team", { timeout: 15000 });
db = await readDb();
check("reopened to Pending Review with a team", db.requests[rejected.id].status === "pending_review" && !!db.requests[rejected.id].currentTeamId, rejected.id);

// ─── 6. Arabic ──────────────────────────────────────────────────────────
await setPersona("u_omar");
await open(`/ar/requests/${req.id}`);
check("Arabic Correct button", (await page.getByRole("button", { name: "تصحيح" }).count()) > 0);
await page.screenshot({ path: `${out}/ar-detail-correct.png` });
await page.locator("dd", { hasText: "Corrected Trading Co." }).getByRole("button", { name: "تصحيح" }).click();
await page.waitForSelector("[role=dialog]");
await page.screenshot({ path: `${out}/ar-correct-dialog.png` });

console.log(results.join("\n"));
console.log(errors.length ? `Page errors:\n${[...new Set(errors)].join("\n")}` : "No page errors");
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
