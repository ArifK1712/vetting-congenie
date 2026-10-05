// End-to-end check of the watchlist: add from a request (saved directly), the request mark,
// email alerts, view-only lead clearing a match, removal, move to blacklist, import,
// permissions and English-only. Usage: node scripts/e2e-watchlist.mjs [baseUrl]
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
  await page.keyboard.press("Escape");
};
const fillCommon = async (note) => {
  await page.locator("#wl-note").fill(note);
  await pick("Reason type", "Past misconduct");
  await page.locator("#wl-reason").fill("Badge was lent to another person at the 2025 edition.");
};

await open("/en/dashboard", "main");
await page.evaluate(() => localStorage.removeItem("vetting-prototype"));
await setPersona("u_sara");
await open("/en/screening/watchlist");
let db = await readDb();
const clear = Object.values(db.requests).filter((r) => r.status === "pending_review" && r.screening === "clear");

// ─── 1. Add from a request: saved directly, request marked ──────────────
const req = clear[0];
await open(`/en/screening/watchlist/new?fromRequest=${req.id}`);
await page.getByRole("radio", { name: /High/ }).click();
await page.getByRole("radio", { name: /add a review stage/ }).click();
await pick("Extra review stage", "Standard Watchlist Review");
await fillCommon("Compare the photo with the ID carefully");
await page.getByRole("button", { name: "Save entry" }).click();
await page.waitForURL(/\/screening\/watchlist\/WL-/, { timeout: 15000 });
const entryId = page.url().split("/").pop();
db = await readDb();
check("entry is active straight away", db.watchlist[entryId]?.status === "active", entryId);
check("request marked High", db.requests[req.id].screening === "watchlist_hit" && db.requests[req.id].watchlistLevel === "high");
await open(`/en/requests/${req.id}`);
check("request shows the reviewer note", (await page.getByText("Compare the photo with the ID carefully").count()) > 0);

// ─── 2. Mark and send email ─────────────────────────────────────────────
const before = Object.keys(db.outbox).length;
await open(`/en/screening/watchlist/new?fromRequest=${clear[1].id}`);
await page.getByRole("radio", { name: /Medium/ }).click();
await page.getByRole("radio", { name: /send email/ }).click();
await pick("Send email to", "Protocol Office");
await fillCommon("Verify the delegation with Protocol");
await page.getByRole("button", { name: "Save entry" }).click();
await page.waitForURL(/\/screening\/watchlist\/WL-/, { timeout: 15000 });
db = await readDb();
const mails = Object.values(db.outbox).slice(before).filter((m) => m.template === "watchlist_match");
check("team members are emailed on the match", mails.length >= 2, mails.map((m) => m.to).join(", "));

// ─── 3. A team lead (view only) clears a match ──────────────────────────
await setPersona("u_lina");
await open("/en/screening/watchlist");
check("lead has no Add entry button", (await page.getByRole("link", { name: "Add entry" }).count()) === 0);
await open(`/en/screening/watchlist/${entryId}`);
await page.getByRole("button", { name: "Not the same person" }).first().click();
await page.locator("#wl-clear").fill("Different date of birth.");
await page.getByRole("button", { name: "Clear the match" }).click();
await page.waitForSelector("text=Match cleared", { timeout: 15000 });
db = await readDb();
check("cleared match removes the mark", db.requests[req.id].screening === "clear" && db.requests[req.id].watchlistLevel === null);

// ─── 4. Move to blacklist ───────────────────────────────────────────────
await setPersona("u_sara");
await open(`/en/screening/watchlist/${entryId}`);
await page.getByRole("button", { name: "More actions" }).click();
await page.getByRole("menuitem", { name: "Move to blacklist" }).click();
await page.waitForSelector("text=Moving watchlist entry", { timeout: 30000 });
check("blacklist form is filled from the entry", (await page.locator("#bl-name").inputValue()) === db.watchlist[entryId].identity.fullName);
await page.getByRole("button", { name: "Send for approval" }).click();
await page.waitForURL(/\/screening\/blacklist\/BL-/, { timeout: 15000 });
db = await readDb();
check("blacklist entry waits for approval", Object.values(db.blacklist).some((e) => e.status === "pending_approval" && e.identity.fullName === db.watchlist[entryId].identity.fullName));
check("move is logged on the watchlist entry", Object.values(db.watchlistHistory).some((h) => h.entryId === entryId && h.action === "moved_to_blacklist"));

// ─── 5. Remove with a reason ────────────────────────────────────────────
await open(`/en/screening/watchlist/${entryId}`);
await page.getByRole("button", { name: "More actions" }).click();
await page.getByRole("menuitem", { name: "Remove entry" }).click();
await page.locator("#wl-remove").fill("Concern resolved.");
await page.getByRole("button", { name: "Remove entry" }).click();
await page.waitForSelector(`text=${entryId} removed`, { timeout: 15000 });
db = await readDb();
check("entry removed", db.watchlist[entryId].status === "removed");

// ─── 6. Import ──────────────────────────────────────────────────────────
const count = Object.keys(db.watchlist).length;
await open("/en/screening/watchlist/import");
await page.getByRole("button", { name: /sample file/ }).click();
const save = page.getByRole("button", { name: /^Save \d+ entr/ });
const label = await save.innerText();
check("import shows ready and problem rows", /Save 4 entries/.test(label), label);
await save.click();
await page.waitForURL(/\/screening\/watchlist$/, { timeout: 15000 });
db = await readDb();
check("imported rows saved directly", Object.keys(db.watchlist).length === count + 4);

// ─── 7. Permissions and English-only ────────────────────────────────────
await setPersona("u_omar");
await open("/en/screening/watchlist", "text=You can't see the watchlist");
check("reviewer can't open the watchlist", true);
await setPersona("u_sara");
await open("/ar/screening/watchlist");
check("Arabic app keeps the watchlist in English", (await page.locator("main h1").innerText()).trim() === "Watchlist");

console.log(results.join("\n"));
console.log(errors.length ? `Page errors:\n${[...new Set(errors)].join("\n")}` : "No page errors");
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
