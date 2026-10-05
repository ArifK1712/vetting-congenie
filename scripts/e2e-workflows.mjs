// End-to-end check of the workflow builder: create, publish checks, publish, allot with
// a clash, versions, undo, unsaved-changes guard, edit conflict, view-only, English-only.
// Usage: node scripts/e2e-workflows.mjs [baseUrl]   — dev server must be running.
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
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
async function open(page, path, ready = "main h1") {
  await page.goto(`${base}${path}`);
  await page.waitForSelector(ready, { timeout: 60000 });
}
const pick = async (page, trigger, option) => {
  await page.getByRole("button", { name: trigger, exact: true }).click();
  await page.getByRole("option", { name: option }).first().click();
};

const a = await context.newPage();
a.on("pageerror", (e) => errors.push(String(e)));
await open(a, "/en/dashboard", "main");
await a.evaluate(() => localStorage.removeItem("vetting-prototype"));
await setPersona(a, "u_sara");

// ─── 1. Create a workflow ───────────────────────────────────────────────
await open(a, "/en/workflows");
await a.getByRole("button", { name: "Create workflow" }).click();
await a.locator("#wf-name").fill("Visitor Express");
await a.locator("#wf-label").fill("Express Security Check");
await pick(a, "Badge type", "Visitor");
await a.getByRole("button", { name: "Create and open builder" }).click();
await a.waitForURL(/\/en\/workflows\/wf_/, { timeout: 15000 });
await a.waitForSelector(".react-flow__node");
check("builder opens with a starter graph", (await a.locator(".react-flow__node").count()) === 4);
check("publish checks flag the empty stage", (await a.getByText(/problems? to fix before publishing/).count()) > 0);

// ─── 2. Fix it in the inspector and publish ─────────────────────────────
await a.locator(".react-flow__node", { hasText: "Security Review" }).click();
await pick(a, "Add team", "General Security Team");
await pick(a, "Fallback team", "Security Review Team");
check("ready to publish after setting teams", (await a.getByText("Ready to publish").count()) > 0);
await a.getByRole("button", { name: "Publish", exact: true }).click();
await a.getByRole("button", { name: "Publish v1" }).click();
await a.waitForSelector("text=Allot to registrations", { timeout: 15000 });
let db = await readDb(a);
const created = Object.values(db.workflows).find((w) => w.name.en === "Visitor Express");
check("version 1 published", created?.status === "active" && !!created.currentVersionId);

// ─── 3. Allot with a clash → Replace ────────────────────────────────────
const row = a.locator("[role=dialog] li", { hasText: "REF26" });
await row.locator("input[type=checkbox]").click();
check("clash is shown", (await a.getByText(/already uses Visitor Security Vetting/).count()) > 0);
await a.getByRole("button", { name: "Replace", exact: true }).click();
await a.getByRole("button", { name: "Save allotment" }).click();
await a.waitForSelector("text=Allotment saved", { timeout: 15000 });
db = await readDb(a);
const owner = Object.values(db.allotments).find((x) => x.registrationId === "reg_ref_visitor" && x.badgeTypeId === "bt_visitor");
check("allotment replaced", owner?.workflowId === created.id);

// ─── 4. Publish the Media draft; running requests stay on v1 ────────────
const mediaRunning = Object.values(db.requests).filter((r) => r.workflowId === "wf_media" && ["pending_review", "under_review"].includes(r.status));
await open(a, "/en/workflows/wf_media", ".react-flow__node");
await a.getByRole("button", { name: "Publish", exact: true }).click();
await a.getByRole("button", { name: "Publish v2" }).click();
await a.waitForSelector("text=Version 2 published", { timeout: 15000 });
db = await readDb(a);
check("media v2 is live", db.workflowVersions[db.workflows.wf_media.currentVersionId].versionNo === 2);
check("requests in progress stay on v1", mediaRunning.every((r) => db.requests[r.id].workflowVersionId === r.workflowVersionId), `${mediaRunning.length} requests`);
await a.getByRole("button", { name: /Versions/ }).click();
check("versions panel lists v1 and v2", (await a.getByText("v1", { exact: true }).count()) > 0 && (await a.getByText("v2", { exact: true }).count()) > 0);

// ─── 5. Undo, and the unsaved-changes guard ─────────────────────────────
await open(a, "/en/workflows/wf_night", ".react-flow__node");
const before = await a.locator(".react-flow__node").count();
await a.getByRole("button", { name: /Condition/ }).first().click();
check("palette adds a block", (await a.locator(".react-flow__node").count()) === before + 1);
await a.getByRole("button", { name: "Undo" }).click();
check("undo removes it", (await a.locator(".react-flow__node").count()) === before);
await a.getByRole("button", { name: "Redo" }).click();
await a.getByRole("button", { name: "Back to workflows" }).click();
check("leaving with changes asks first", (await a.getByText("Leave without saving?").count()) > 0);
await a.getByRole("button", { name: "Cancel" }).click();

// ─── 6. Two tabs editing the same draft ─────────────────────────────────
const b = await context.newPage();
b.on("pageerror", (e) => errors.push(String(e)));
await open(b, "/en/workflows/wf_night", ".react-flow__node");
await b.locator("#wf-d-label").fill("Night Works Access (updated)");
await b.getByRole("button", { name: "Save draft" }).click();
await b.waitForSelector("text=Draft saved", { timeout: 15000 });
await a.waitForSelector("text=Someone changed this workflow in another session", { timeout: 10000 });
check("other tab sees the stale banner", true);
check("other tab cannot save", await a.getByRole("button", { name: "Save draft" }).isDisabled());
await b.close();

// ─── 7. View only, and English in the Arabic app ────────────────────────
await setPersona(a, "u_daniel");
await open(a, "/en/workflows/wf_vip", ".react-flow__node");
check("view-only: no Edit button", (await a.getByRole("button", { name: "Edit workflow" }).count()) === 0);
await open(a, "/ar/workflows");
check("Arabic app keeps Workflows in English", (await a.locator("main h1").innerText()).trim() === "Workflows");
check("Workflows area is left-to-right", (await a.locator(".locale-en").first().getAttribute("dir")) === "ltr");

console.log(results.join("\n"));
console.log(errors.length ? `Page errors:\n${[...new Set(errors)].join("\n")}` : "No page errors");
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
