// Alerts (header bell) and the email outbox. Usage: node scripts/e2e-alerts.mjs <outDir> [baseUrl]
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
const bell = () => page.getByRole("button", { name: /^Alerts/ });

await open("/en/dashboard", "main");
await page.evaluate(() => localStorage.removeItem("vetting-prototype"));

// ─── 1. A team lead sees late requests; a reviewer sees new requests ────
await setPersona("u_lina");
await open("/en/queue");
await bell().click();
check("lead gets a late-requests digest", (await page.getByText(/late in your team/).count()) > 0);
await page.keyboard.press("Escape");
await setPersona("u_omar");
await open("/en/queue");
await bell().click();
check("reviewer sees new requests in the team", (await page.getByText(/arrived in Document Check Team/).count()) > 0);
check("reviewer gets no list alerts", (await page.getByText(/Blacklist match|waiting for your approval/).count()) === 0);
await page.keyboard.press("Escape");

// ─── 2. Arif proposes an entry → Sara is alerted and emailed ────────────
await setPersona("u_arif");
await open("/en/screening/blacklist/new");
await page.locator("#bl-name").fill("Alert Demo Person");
await page.locator("#bl-nid").fill("1444444444");
await page.getByRole("button", { name: "Reason type", exact: true }).click();
await page.getByRole("option", { name: "Security threat" }).click();
await page.locator("#bl-detail").fill("Reported by venue security.");
await page.getByRole("button", { name: "Send for approval" }).click();
await page.waitForURL(/\/screening\/blacklist\/BL-/, { timeout: 15000 });
const entryId = page.url().split("/").pop();

await setPersona("u_sara");
await open("/en/queue");
const label = await bell().getAttribute("aria-label");
check("unread count on the bell", /\d+ new/.test(label ?? ""), label ?? "");
await bell().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/en-alerts.png` });
const item = page.getByRole("link", { name: new RegExp(`${entryId}.{0,2} from .?Arif Khan.? is waiting`) });
check("approver alerted about the waiting entry", (await item.count()) === 1);
await page.getByRole("button", { name: "Mark all as read" }).click();
await page.waitForTimeout(400);
check("mark all as read clears the count", /All caught up/.test((await bell().getAttribute("aria-label")) ?? ""));
await item.click();
await page.waitForURL(new RegExp(`/screening/blacklist/${entryId}`), { timeout: 15000 });
check("alert opens the entry", true);

// ─── 3. Outbox ──────────────────────────────────────────────────────────
await open("/en/dev/outbox");
const db = await readDb();
check("approver email in the outbox", Object.values(db.outbox).some((m) => m.template === "blacklist_entry_waiting" && m.params.entry === entryId && m.to === "sara.alotaibi@vetting.app"));
check("Arif is not emailed about his own entry", !Object.values(db.outbox).some((m) => m.template === "blacklist_entry_waiting" && m.params.entry === entryId && m.to === "arif.khan@vetting.app"));
await page.getByRole("button", { name: "Email", exact: true }).click();
await page.getByRole("option", { name: "Blacklist entry waiting" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/en-outbox.png` });
check("preview shows the subject", (await page.getByText(`Blacklist entry ${entryId} needs your approval`).count()) > 0);

// ─── 4. Arabic ──────────────────────────────────────────────────────────
await open("/ar/dev/outbox");
await page.screenshot({ path: `${out}/ar-outbox.png` });
await page.getByRole("button", { name: /^التنبيهات/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/ar-alerts.png` });
check("Arabic alerts render", (await page.getByText("التنبيهات").count()) > 0);

console.log(results.join("\n"));
console.log(errors.length ? `Page errors:\n${[...new Set(errors)].join("\n")}` : "No page errors");
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
