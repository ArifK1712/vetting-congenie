// End-to-end check of the blacklist: add from a request, second-person approval, re-check of
// approved badges, not approving, removal, file import, permissions, English-only.
// Usage: node scripts/e2e-blacklist.mjs [baseUrl]   — dev server must be running.
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];
const results = [];
const check = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);

const page = await context.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
const setPersona = (id) =>
  page.evaluate((id) => localStorage.setItem("vetting-prototype-session", JSON.stringify({ state: { personaId: id, eventScope: "all", sidebarCollapsed: false }, version: 0 })), id);
const readDb = () => page.evaluate(() => JSON.parse(localStorage.getItem("vetting-prototype")).state.db);
async function open(path, ready = "main h1") {
  await page.goto(`${base}${path}`);
  await page.waitForSelector(ready, { timeout: 60000 });
}
const pick = async (trigger, option) => {
  await page.getByRole("button", { name: trigger, exact: true }).click();
  await page.getByRole("option", { name: option }).first().click();
};
const fillReason = async () => {
  await pick("Reason type", "Security threat");
  await page.locator("#bl-detail").fill("Reported by venue security, ref. VS-2026-201.");
};

await open("/en/dashboard", "main");
await page.evaluate(() => localStorage.removeItem("vetting-prototype"));
await setPersona("u_arif");
await open("/en/screening/blacklist");
let db = await readDb();

// ─── 1. Add to Blacklist from a request ─────────────────────────────────
const req = Object.values(db.requests).find((r) => r.status === "pending_review" && r.screening === "clear");
await open(`/en/screening/blacklist/new?fromRequest=${req.id}`);
check("form is filled from the applicant", (await page.locator("#bl-name").inputValue()) === db.attendees[req.attendeeId].profile.fullName);
await fillReason();
await page.getByRole("button", { name: "Send for approval" }).click();
await page.waitForURL(/\/screening\/blacklist\/BL-/, { timeout: 15000 });
db = await readDb();
const fromReq = Object.values(db.blacklist).find((e) => e.sourceRequestId === req.id);
check("entry waits for approval", fromReq?.status === "pending_approval", fromReq?.id);
check("the request goes to Screening Hold", db.requests[req.id].status === "screening_hold");

// ─── 2. The proposer can't approve ──────────────────────────────────────
check("proposer's Approve is disabled", await page.getByRole("button", { name: "Approve", exact: true }).isDisabled());

// ─── 3. Sara approves; an approved badge gets suspended ─────────────────
const holder = Object.values(db.requests).find((r) => r.status === "approved" && r.badgeStatus === "issued" && db.attendees[r.attendeeId].profile.nationalId);
const hp = db.attendees[holder.attendeeId].profile;
await open("/en/screening/blacklist/new");
await page.locator("#bl-name").fill(hp.fullName);
await page.locator("#bl-nid").fill(hp.nationalId);
await fillReason();
check("live preview finds the badge holder", (await page.getByText(holder.id).count()) > 0);
await page.getByRole("button", { name: "Send for approval" }).click();
await page.waitForURL(/\/screening\/blacklist\/BL-/, { timeout: 15000 });
const newId = page.url().split("/").pop();

await setPersona("u_sara");
await open(`/en/screening/blacklist/${newId}`);
await page.getByRole("button", { name: "Approve", exact: true }).click();
await page.getByRole("button", { name: "Approve entry" }).click();
await page.waitForSelector("text=is now active", { timeout: 15000 });
db = await readDb();
check("second person approved it", db.blacklist[newId].status === "active" && db.blacklist[newId].approvedBy === "u_sara");
check("approved badge suspended (9.5)", db.requests[holder.id].badgeStatus === "suspended");

// ─── 4. Not approving needs a note and releases the held request ────────
await open(`/en/screening/blacklist/${fromReq.id}`);
await page.getByRole("button", { name: "Don’t approve" }).click();
check("note is required", await page.getByRole("button", { name: "Don’t approve" }).last().isDisabled());
await page.locator("#decision-note").fill("Different person; date of birth does not match.");
await page.getByRole("button", { name: "Don’t approve" }).last().click();
await page.waitForSelector("text=not approved", { timeout: 15000 });
db = await readDb();
check("entry closed as Not approved", db.blacklist[fromReq.id].status === "not_approved");
check("held request goes back to its stage", db.requests[req.id].status === "pending_review");

// ─── 5. Remove with a reason ────────────────────────────────────────────
await open(`/en/screening/blacklist/${newId}`);
await page.getByRole("button", { name: "More actions" }).click();
await page.getByRole("menuitem", { name: "Remove entry" }).click();
await page.locator("#decision-note").fill("Restriction lifted by the security authority.");
await page.getByRole("button", { name: "Remove entry" }).click();
await page.waitForSelector(`text=${newId} removed`, { timeout: 15000 });
db = await readDb();
check("entry removed and logged", db.blacklist[newId].status === "removed" && Object.values(db.blacklistHistory).some((h) => h.entryId === newId && h.action === "removed"));

// ─── 6. Import ──────────────────────────────────────────────────────────
const before = Object.values(db.blacklist).filter((e) => e.status === "pending_approval").length;
await open("/en/screening/blacklist/import");
await page.getByRole("button", { name: /sample file/ }).click();
const send = page.getByRole("button", { name: /^Send \d+ for approval$/ });
const label = await send.innerText();
check("import shows ready and problem rows", /Send 4 for approval/.test(label), label);
await send.click();
await page.waitForURL(/tab=approvals/, { timeout: 15000 });
db = await readDb();
check("imported rows wait for approval", Object.values(db.blacklist).filter((e) => e.status === "pending_approval").length === before + 4);

// ─── 7. Permissions and English-only ────────────────────────────────────
await setPersona("u_omar");
await open("/en/screening/blacklist", "text=You can't see the blacklist");
check("reviewer can't open the blacklist", true);
await setPersona("u_sara");
await open("/ar/screening/blacklist");
check("Blacklist is in Arabic, right-to-left", (await page.locator("main h1").innerText()).trim() === "القائمة السوداء" && (await page.locator("html").getAttribute("dir")) === "rtl");

console.log(results.join("\n"));
console.log(errors.length ? `Page errors:\n${[...new Set(errors)].join("\n")}` : "No page errors");
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
