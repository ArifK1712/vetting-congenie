// More Information end to end: ask, attendee answers via the link (with upload and a mapped
// field), request returns, status page, expired link + resend, Arabic portal.
// Usage: node scripts/e2e-moreinfo.mjs <outDir> [baseUrl]
import { chromium } from "playwright";

const out = process.argv[2] ?? "screens";
const base = process.argv[3] ?? "http://localhost:3000";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
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
const pick = async (trigger, option, nth = 0) => {
  await page.getByRole("button", { name: trigger, exact: true }).nth(nth).click();
  await page.getByRole("option", { name: option }).first().click();
};

await open("/en/dashboard", "main");
await page.evaluate(() => localStorage.removeItem("vetting-prototype"));
await setPersona("u_omar");
await open("/en/queue");
let db = await readDb();
const req = Object.values(db.requests).find((r) => r.currentTeamId === "t_docs" && r.status === "pending_review" && r.screening === "clear");

// ─── 1. Reviewer asks ───────────────────────────────────────────────────
await open(`/en/requests/${req.id}`);
await page.getByRole("button", { name: "Claim request" }).click();
await page.waitForSelector("text=It's yours to decide", { timeout: 15000 });
await page.getByRole("button", { name: "Ask for more information" }).click();
await page.locator("#ask-instructions").fill("Please upload your organisation letter and confirm the company name.");
await page.getByRole("textbox", { name: "Question" }).first().fill("Organisation letter");
await pick("Answer type", "Document upload");
await page.getByRole("button", { name: "Add question" }).click();
await page.getByRole("textbox", { name: "Question" }).nth(1).fill("Company name as on the letter");
await pick("Update registration field", "Company");
await page.screenshot({ path: `${out}/en-ask-dialog.png` });
await page.getByRole("button", { name: "Send to attendee" }).click();
await page.waitForSelector("text=is waiting for the attendee", { timeout: 15000 });
db = await readDb();
const ir = Object.values(db.infoRequests).find((i) => i.requestId === req.id && i.status === "sent");
check("request is More Information Required", db.requests[req.id].status === "more_info_required");
check("attendee email queued with the link", Object.values(db.outbox).some((m) => m.requestId === req.id && m.template === "more_info" && m.params.token === ir.token));

// ─── 2. Status page shows "Information required" ────────────────────────
const attendee = await context.newPage();
attendee.on("pageerror", (e) => errors.push(String(e)));
await attendee.goto(`${base}/en/portal/status/${req.id}`);
await attendee.waitForSelector("main h1", { timeout: 60000 });
check("status page asks for information", (await attendee.getByRole("link", { name: "Provide information" }).count()) === 1);
await attendee.screenshot({ path: `${out}/en-portal-status-info.png`, fullPage: true });

// ─── 3. Attendee answers ────────────────────────────────────────────────
await attendee.getByRole("link", { name: "Provide information" }).click();
await attendee.waitForSelector("text=More information needed", { timeout: 30000 });
await attendee.getByRole("button", { name: "Send my answers" }).click();
check("missing answers are flagged", await attendee.waitForSelector("text=Please answer this question.", { timeout: 10000 }).then(() => true, () => false));
await attendee.locator("input[type=file]").setInputFiles({ name: "organisation_letter.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 demo") });
await attendee.locator("input[type=text]").first().fill("Gulf Ports Authority");
await attendee.screenshot({ path: `${out}/en-portal-form.png`, fullPage: true });
await attendee.getByRole("button", { name: "Send my answers" }).click();
await attendee.waitForSelector("text=We've received your answers", { timeout: 15000 });
await page.reload();
await page.waitForSelector("main h1");
db = await readDb();
const back = db.requests[req.id];
check("request back as Pending Review, Response received", back.status === "pending_review" && back.responseReceived);
check("mapped answer updated the registration", db.attendees[req.attendeeId].profile.company === "Gulf Ports Authority");
check("upload added to documents with its round", db.attendees[req.attendeeId].documents.some((d) => d.fileName === "organisation_letter.pdf" && d.infoRound === ir.round));
await attendee.goto(`${base}/en/portal/info/${ir.token}`);
await attendee.waitForSelector("text=Already submitted", { timeout: 30000 });
check("link works once", true);

// ─── 4. Expired link and resend ─────────────────────────────────────────
const expired = Object.values(db.infoRequests).find((i) => i.status === "expired" && db.requests[i.requestId].status === "more_info_required");
if (expired) {
  await attendee.goto(`${base}/en/portal/info/${expired.token}`);
  await attendee.waitForSelector("text=This link has expired", { timeout: 30000 });
  check("expired page shown", true);
  await setPersona("u_sara");
  await open(`/en/requests/${expired.requestId}`);
  await page.getByRole("tab", { name: /More information/ }).click();
  await page.getByRole("button", { name: "Send a new link" }).click();
  await page.waitForSelector("text=The old link no longer works", { timeout: 15000 });
  db = await readDb();
  const fresh = db.infoRequests[expired.id];
  check("resend gives a new working link", fresh.token !== expired.token && fresh.status === "sent");
  await attendee.goto(`${base}/en/portal/info/${expired.token}`);
  await attendee.waitForSelector("text=Link not valid", { timeout: 30000 });
  check("old token no longer valid", true);
} else check("seed has an expired link", false);

// ─── 5. Arabic portal ───────────────────────────────────────────────────
const held = Object.values(db.requests).find((r) => r.status === "screening_hold");
await attendee.goto(`${base}/ar/portal/status/${held.id}`);
await attendee.waitForSelector("main h1", { timeout: 60000 });
check("held request reads Under review (AC22)", (await attendee.getByText("تم تقديم تسجيلك للمراجعة").count()) > 0);
await attendee.screenshot({ path: `${out}/ar-portal-status.png`, fullPage: true });
const open2 = Object.values(db.infoRequests).find((i) => i.status === "sent" && Date.parse(i.tokenExpiresAt) > Date.now());
if (open2) {
  await attendee.goto(`${base}/ar/portal/info/${open2.token}`);
  await attendee.waitForSelector("text=مطلوب معلومات إضافية", { timeout: 30000 });
  await attendee.screenshot({ path: `${out}/ar-portal-form.png`, fullPage: true });
}

console.log(results.join("\n"));
console.log(errors.length ? `Page errors:\n${[...new Set(errors)].join("\n")}` : "No page errors");
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
