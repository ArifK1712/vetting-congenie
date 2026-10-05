// End-to-end check of Match Review: confirm, not the same person, suspended badge,
// link from Request Detail, permissions, English-only. Usage: node scripts/e2e-matches.mjs [baseUrl]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
const results = [];
const check = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
page.on("pageerror", (e) => errors.push(String(e)));
const setPersona = (id) =>
  page.evaluate((id) => localStorage.setItem("vetting-prototype-session", JSON.stringify({ state: { personaId: id, eventScope: "all", sidebarCollapsed: false }, version: 0 })), id);
const readDb = () => page.evaluate(() => JSON.parse(localStorage.getItem("vetting-prototype")).state.db);
async function open(path, ready = "main h1") {
  await page.goto(`${base}${path}`);
  await page.waitForSelector(ready, { timeout: 60000 });
}
const openMatches = (db) => Object.values(db.matches).filter((m) => m.listType === "blacklist" && m.status === "open");
const single = (db, pred) =>
  openMatches(db).find((m) => pred(db.requests[m.requestId]) && openMatches(db).filter((x) => x.requestId === m.requestId).length === 1);

await open("/en/dashboard", "main");
await page.evaluate(() => localStorage.removeItem("vetting-prototype"));
await setPersona("u_arif");
await open("/en/screening/matches");
let db = await readDb();

// ─── 1. Confirm: rejected as Blacklisted ────────────────────────────────
const toConfirm = single(db, (r) => r.status === "screening_hold");
await open(`/en/screening/matches?match=${toConfirm.id}`);
await page.getByRole("button", { name: "Confirm: same person" }).click();
await page.waitForSelector("text=rejected as Blacklisted", { timeout: 15000 });
db = await readDb();
check("confirm rejects as Blacklisted", db.requests[toConfirm.requestId].status === "rejected" && db.requests[toConfirm.requestId].rejectReasonId === "rr_blacklisted", toConfirm.requestId);
check("attendee gets the normal rejection email", Object.values(db.outbox).some((m) => m.requestId === toConfirm.requestId && m.template === "rejected"));

// ─── 2. Not the same person: back to its stage ──────────────────────────
const toClear = single(db, (r) => r.status === "screening_hold");
await open(`/en/screening/matches?match=${toClear.id}`);
check("clearing needs a note", await page.getByRole("button", { name: "Not the same person" }).isDisabled());
await page.locator("#mr-note").fill("Date of birth and nationality differ.");
await page.getByRole("button", { name: "Not the same person" }).click();
await page.waitForSelector("text=is back with its review team", { timeout: 15000 });
db = await readDb();
const back = db.requests[toClear.requestId];
check("request goes back to its stage", back.status === "pending_review" && !!back.currentTeamId, `${toClear.requestId} → ${back.currentTeamId}`);

// ─── 3. Suspended badge restored ────────────────────────────────────────
const badge = single(db, (r) => r.status === "approved" && r.badgeStatus === "suspended");
await open(`/en/screening/matches?match=${badge.id}`);
await page.locator("#mr-note").fill("Different person; ID checked with the authority.");
await page.getByRole("button", { name: "Not the same person" }).click();
await page.waitForSelector(`text=Badge for ${badge.requestId} restored`, { timeout: 15000 });
db = await readDb();
check("suspended badge restored", db.requests[badge.requestId].badgeStatus === "issued");

// ─── 4. From Request Detail ─────────────────────────────────────────────
await setPersona("u_sara");
const fromDetail = openMatches(db).find((m) => db.requests[m.requestId].status === "screening_hold");
await open(`/en/requests/${fromDetail.requestId}`);
await page.getByRole("tab", { name: /Screening/ }).click();
await page.getByRole("link", { name: "Decide in Match Review" }).first().click();
await page.waitForURL(/screening\/matches\?match=/, { timeout: 15000 });
await page.waitForSelector("main h1");
check("Request Detail links to the match", (await page.locator("main h2").first().innerText()).trim() === db.attendees[db.requests[fromDetail.requestId].attendeeId].profile.fullName);

// ─── 5. Permissions and English-only ────────────────────────────────────
await setPersona("u_lina");
await open("/en/screening/matches", "text=You can't see Match Review");
check("lead without Blacklist View can't open it", true);
await setPersona("u_arif");
await open("/ar/screening/matches");
check("Arabic app keeps Match Review in English", (await page.locator("main h1").innerText()).trim() === "Match Review");

console.log(results.join("\n"));
console.log(errors.length ? `Page errors:\n${[...new Set(errors)].join("\n")}` : "No page errors");
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
