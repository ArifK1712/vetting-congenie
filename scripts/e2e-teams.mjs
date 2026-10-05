// End-to-end check of team configuration: create, field access reaching Request
// Detail, deactivate rules, and an edit conflict between two tabs.
// Usage: node scripts/e2e-teams.mjs [baseUrl]   — dev server must be running.
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

const a = await context.newPage();
a.on("pageerror", (e) => errors.push(String(e)));
await open(a, "/en/dashboard", "main");
await a.evaluate(() => localStorage.removeItem("vetting-prototype")); // fresh seed
await setPersona(a, "u_sara");
await open(a, "/en/teams");

// ─── 1. Saving an empty form shows what to fix ──────────────────────────
await open(a, "/en/teams/new");
await a.getByRole("button", { name: "Create team" }).last().click();
check("empty form lists issues", (await a.getByText("Add at least one member.").count()) > 0);

// ─── 2. Create a team ───────────────────────────────────────────────────
await a.locator("#team-name-en").fill("Press Desk");
await a.locator("#team-name-ar").fill("مكتب الصحافة");
await a.getByRole("button", { name: "Add member" }).click();
await a.getByRole("button", { name: /Omar Haddad/ }).click();
await a.keyboard.press("Escape");
await a.getByRole("button", { name: "Add registration" }).click();
await a.getByRole("menuitem", { name: /Media Registration/ }).first().click();
await a.getByRole("button", { name: "Give View to all" }).click();
await a.getByRole("button", { name: "Create team" }).last().click();
await a.waitForURL(/\/en\/teams\/t_/, { timeout: 15000 });
await a.waitForSelector("main h1");
const created = (await a.locator("main h1").innerText()).trim();
check("team created and opened", created === "Press Desk", created);
let db = await readDb(a);
const newTeam = Object.values(db.teams).find((t) => t.name.en === "Press Desk");
check("history has a created entry", Object.values(db.teamHistory).some((h) => h.teamId === newTeam?.id && h.kind === "created"));

// ─── 3. An unused team can be deactivated, then activated ───────────────
await a.getByRole("button", { name: "More actions" }).click();
await a.getByRole("menuitem", { name: "Deactivate" }).click();
await a.getByRole("button", { name: "Deactivate team" }).click();
await a.waitForSelector("text=Press Desk deactivated");
db = await readDb(a);
check("unused team deactivated", db.teams[newTeam.id].status === "inactive");
await a.getByRole("button", { name: "More actions" }).click();
await a.getByRole("menuitem", { name: "Activate" }).click();
await a.waitForSelector("text=Press Desk activated");
db = await readDb(a);
check("team activated again", db.teams[newTeam.id].status === "active");

// ─── 4. A team in use cannot be deactivated ─────────────────────────────
await open(a, "/en/teams/t_docs");
await a.getByRole("button", { name: "More actions" }).click();
await a.getByRole("menuitem", { name: "Deactivate" }).click();
const confirm = a.getByRole("button", { name: "Deactivate team" });
check("in-use team: confirm disabled", await confirm.isDisabled());
check("in-use team: blockers listed", (await a.getByText(/open requests? (is|are) still with the team/).count()) > 0);
await a.keyboard.press("Escape");

// ─── 5. Field access change reaches Request Detail ──────────────────────
// Protocol Office cannot see ID numbers. Reem (a member) opens a request, then Sara grants View.
const req = Object.values(db.requests).find((r) => r.currentTeamId === "t_protocol");
const profile = db.attendees[req.attendeeId].profile;
const idLabel = profile.nationalId ? "National ID / Iqama" : "Passport number";
await setPersona(a, "u_reem");
await open(a, `/en/requests/${req.id}`);
check(`before: ${idLabel} hidden`, (await a.getByText(idLabel, { exact: true }).count()) === 0, req.id);
await setPersona(a, "u_sara");
await open(a, "/en/teams/t_protocol/edit");
const reg = db.registrations[req.registrationId];
const block = a.locator("#access li", { hasText: reg.name.en }).filter({ hasText: db.events[reg.eventId].code }).first();
if (!(await block.getByRole("radiogroup", { name: idLabel }).count())) await block.locator("button[aria-expanded]").click();
await block.getByRole("radiogroup", { name: idLabel }).getByRole("radio", { name: "View", exact: true }).click();
await a.getByRole("button", { name: "Save changes" }).click();
await a.waitForURL(/\/en\/teams\/t_protocol$/, { timeout: 15000 });
await setPersona(a, "u_reem");
await open(a, `/en/requests/${req.id}`);
check(`after: ${idLabel} visible`, (await a.getByText(idLabel, { exact: true }).count()) > 0);

// ─── 6. Two tabs editing the same team ──────────────────────────────────
await setPersona(a, "u_sara");
const b = await context.newPage();
b.on("pageerror", (e) => errors.push(String(e)));
await open(a, "/en/teams/t_media/edit");
await open(b, "/en/teams/t_media/edit");
await b.locator("#team-max-claims").fill("8");
await b.getByRole("button", { name: "Save changes" }).click();
await b.waitForURL(/\/en\/teams\/t_media$/, { timeout: 15000 });
await a.waitForSelector("text=Someone changed this team in another session", { timeout: 10000 });
check("other tab sees the stale banner", true);
check("other tab cannot save", await a.getByRole("button", { name: "Save changes" }).isDisabled());
await a.getByRole("button", { name: "Load latest" }).click();
check("load latest picks up the change", (await a.locator("#team-max-claims").inputValue()) === "8");

// ─── 7. A team lead sees teams read-only ────────────────────────────────
await setPersona(a, "u_lina");
await open(a, "/en/teams");
check("lead: no Create team button", (await a.getByRole("link", { name: "Create team" }).count()) === 0);
await open(a, "/en/teams/t_media/edit", "text=You can't edit teams");
check("lead: editor refused", (await a.getByText("You can't edit teams").count()) > 0);

console.log(results.join("\n"));
console.log(errors.length ? `Page errors:\n${[...new Set(errors)].join("\n")}` : "No page errors");
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
