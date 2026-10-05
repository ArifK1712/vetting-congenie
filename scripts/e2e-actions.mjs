// End-to-end check of request actions across two tabs (two personas, one shared store).
// Usage: node scripts/e2e-actions.mjs <outDir> [baseUrl]   — dev server must be running.
import { chromium } from "playwright";

const out = process.argv[2] ?? "screens";
const base = process.argv[3] ?? "http://localhost:3000";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];
const results = [];
const check = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);

const setPersona = (page, id) =>
  page.evaluate((id) => {
    localStorage.setItem("vetting-prototype-session", JSON.stringify({ state: { personaId: id, eventScope: "all", sidebarCollapsed: false }, version: 0 }));
  }, id);

const readDb = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("vetting-prototype")).state.db);

async function open(page, path) {
  await page.goto(`${base}${path}`);
  await page.waitForSelector("main h1", { timeout: 60000 });
}

const a = await context.newPage();
a.on("pageerror", (e) => errors.push(String(e)));
await open(a, "/en/queue");
await a.evaluate(() => localStorage.removeItem("vetting-prototype")); // fresh seed
await setPersona(a, "u_omar");
await open(a, "/en/queue");

// A pending General Security request neither Omar nor Maya approved before.
let db = await readDb(a);
const target = Object.values(db.requests).find(
  (r) =>
    r.status === "pending_review" &&
    r.currentTeamId === "t_gensec" &&
    !Object.values(db.stageExecutions).some((e) => e.requestId === r.id && e.outcome === "approve"),
);
check("found a shared-team request", !!target, target?.id);

await open(a, `/en/requests/${target.id}`);

// Tab B: Maya claims it.
await setPersona(a, "u_maya"); // session key is read on load by the new tab
const b = await context.newPage();
b.on("pageerror", (e) => errors.push(String(e)));
await open(b, `/en/requests/${target.id}`);
await b.getByRole("button", { name: "Claim request" }).click();
await b.getByText(`${target.id} claimed`).waitFor({ timeout: 5000 });
db = await readDb(b);
check("Maya's claim saved", db.requests[target.id].claimedBy === "u_maya");

// Tab A (Omar) sees the live banner and locked actions.
await a.getByText("Maya Rahman updated this request").first().waitFor({ timeout: 6000 }).then(
  () => check("live banner in other tab", true),
  () => check("live banner in other tab", false),
);
await a.screenshot({ path: `${out}/e2e-1-banner.png` });
await a.getByRole("button", { name: "Reload" }).click();
const claimedMsg = await a.getByText("Claimed by Maya Rahman").count();
check("other tab shows claimed by Maya", claimedMsg > 0);

// Tab B approves.
await b.getByRole("button", { name: "Approve", exact: true }).click();
await b.getByRole("dialog").waitFor();
await b.screenshot({ path: `${out}/e2e-2-approve-dialog.png` });
await b.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
await b.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
db = await readDb(b);
const after = db.requests[target.id];
check("approve moved the request on", after.status !== "under_review" || after.awaitingCapacity, `${after.status}`);
await b.screenshot({ path: `${out}/e2e-3-after-approve.png` });

// Reject flow (Omar, Document Check Team).
await setPersona(b, "u_omar");
db = await readDb(b);
const rej = Object.values(db.requests).find((r) => r.status === "pending_review" && r.currentTeamId === "t_docs"
  && !Object.values(db.stageExecutions).some((e) => e.requestId === r.id && e.assignedUserId === "u_omar" && e.outcome === "approve"));
await open(b, `/en/requests/${rej.id}`);
await b.getByRole("button", { name: "Claim request" }).click();
await b.getByRole("button", { name: "Reject", exact: true }).waitFor();
await b.getByRole("button", { name: "Reject", exact: true }).click();
await b.getByRole("radio", { name: "Documents missing or wrong" }).click();
await b.getByRole("dialog").locator("textarea").fill("ID copy is cropped.");
await b.screenshot({ path: `${out}/e2e-4-reject-dialog.png` });
await b.getByRole("dialog").getByRole("button", { name: "Reject request" }).click();
await b.getByRole("dialog").waitFor({ state: "detached" });
db = await readDb(b);
check("reject saved with reason", db.requests[rej.id].status === "rejected" && db.requests[rej.id].rejectReasonId === "rr_docs");
check("rejection email queued", Object.values(db.outbox).some((m) => m.requestId === rej.id && m.template === "rejected"));

// Escalate flow in Arabic (VIP Document Check → Senior Security).
const esc = Object.values(db.requests).find((r) => r.status === "pending_review" && r.currentStageNodeId === "vip_docs" && r.workflowVersionId === "wfv_vip_2");
if (esc) {
  await open(b, `/ar/requests/${esc.id}`);
  await b.getByRole("button", { name: "استلام الطلب" }).click();
  await b.getByRole("button", { name: "تصعيد" }).waitFor();
  await b.getByRole("button", { name: "تصعيد" }).click();
  await b.getByRole("dialog").locator("textarea").fill("لم يتم التحقق من بيانات الوفد.");
  await b.screenshot({ path: `${out}/e2e-5-escalate-ar.png` });
  await b.getByRole("dialog").getByRole("button", { name: "تصعيد" }).click();
  await b.getByRole("dialog").waitFor({ state: "detached" });
  db = await readDb(b);
  check("escalated to Senior Security", db.requests[esc.id].status === "escalated" && db.requests[esc.id].currentTeamId === "t_senior");
} else check("escalation candidate", false, "none in seed");

// Queue claim button.
await open(b, "/en/queue");
const claimBtn = b.getByRole("button", { name: "Claim", exact: true }).first();
await claimBtn.click();
await b.getByText("claimed. It's yours to decide.").first().waitFor({ timeout: 5000 }).then(() => check("claim from queue", true), () => check("claim from queue", false));
await b.screenshot({ path: `${out}/e2e-6-queue-after-claim.png` });

console.log(results.join("\n"));
console.log(errors.length ? `Page errors:\n${[...new Set(errors)].join("\n")}` : "No page errors");
await browser.close();
