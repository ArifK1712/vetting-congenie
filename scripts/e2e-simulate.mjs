// Simulate registration (spec 7.1). Usage: node scripts/e2e-simulate.mjs <outDir> [baseUrl]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = process.argv[2] ?? "screens";
const base = process.argv[3] ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
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
const requestCount = async () => Object.keys((await readDb()).requests).length;
async function open(path, ready = "main h1") {
  await page.goto(`${base}${path}`);
  await page.waitForSelector(ready, { timeout: 60000 });
}
const result = () => page.getByTestId("sim-result");
async function preset(name) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(150);
}
async function submitAndWait(button = "Submit registration") {
  const prev = (await result().count()) ? await result().getAttribute("data-run") : null;
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.waitForFunction(
    (prev) => {
      const el = document.querySelector('[data-testid="sim-result"]');
      return !!el && el.getAttribute("data-run") !== prev;
    },
    prev,
    { timeout: 15000 },
  );
  await page.waitForTimeout(150);
  return { outcome: await result().getAttribute("data-outcome"), id: await result().getAttribute("data-request-id") };
}
async function chooseRegistration(pattern) {
  await page.getByRole("button", { name: "Registration", exact: true }).click();
  await page.getByRole("option", { name: pattern }).click();
  await page.waitForTimeout(150);
}

await open("/en/dashboard", "main");
await page.evaluate(() => localStorage.removeItem("vetting-prototype"));
await setPersona("u_sara");

// ─── 1. Clean applicant → one request, Pending Review ───────────────────
await open("/en/dev/simulate");
check("page title", (await page.locator("main h1").textContent())?.trim() === "Simulate registration");
check("preview shows the workflow", (await page.getByText(/\(Version \d+\)/).count()) > 0);
await page.screenshot({ path: `${out}/en-simulate-empty.png`, fullPage: true });
await preset("Clean applicant");
let before = await requestCount();
const clean = await submitAndWait();
check("clean applicant → under review", clean.outcome === "underReview", `${clean.outcome} ${clean.id}`);
check("one request created", (await requestCount()) === before + 1);
check("result names the request", (await result().getByText(clean.id ?? "—").count()) > 0);
await page.screenshot({ path: `${out}/en-simulate-clean.png`, fullPage: true });

// Submit again with the same key → duplicate, no new request.
before = await requestCount();
const again = await submitAndWait();
check("same key again → duplicate (AC05)", again.outcome === "duplicate" && again.id === clean.id, `${again.outcome} ${again.id}`);
check("no second request", (await requestCount()) === before);

// ─── 2. Double submit → exactly one request ─────────────────────────────
await preset("Clean applicant");
before = await requestCount();
await submitAndWait("Submit twice (double-click test)");
await page.getByTestId("sim-double").waitFor({ timeout: 10000 });
const after = await requestCount();
check("double submit → exactly one new request", after === before + 1, `${before} → ${after}`);
check("shows 2 submits → 1 request", /2 submits → 1 request/.test((await page.getByTestId("sim-double").textContent()) ?? ""));
await page.screenshot({ path: `${out}/en-simulate-double.png`, fullPage: true });

// ─── 3. Blacklisted person → Screening Hold ─────────────────────────────
await preset("Blacklisted person");
const held = await submitAndWait();
check("blacklisted preset → screening hold", held.outcome === "screeningHold", `${held.outcome} ${held.id}`);
check("held request status in db", (await readDb()).requests[held.id]?.status === "screening_hold");
check("Match Review link shown", (await result().getByRole("link", { name: "Match Review" }).count()) === 1);
await page.screenshot({ path: `${out}/en-simulate-hold.png`, fullPage: true });

// ─── 4. Watchlist person → under review with a watchlist mark ───────────
await preset("Watchlist person");
const watched = await submitAndWait();
const wReq = (await readDb()).requests[watched.id];
check("watchlist preset → request marked", watched.outcome === "underReview" && wReq?.screening === "watchlist_hit", `${watched.outcome} ${wReq?.screening}`);

// ─── 5. Missing required field → inline error ───────────────────────────
await preset("Clean applicant");
await preset("Leave a required field empty");
before = await requestCount();
const miss = await submitAndWait();
check("missing field → error result", miss.outcome === "missing", miss.outcome ?? "");
check("inline field error shown", (await page.locator("[data-field-error]").count()) >= 1);
check("nothing saved", (await requestCount()) === before);
await page.screenshot({ path: `${out}/en-simulate-missing.png`, fullPage: true });

// ─── 6. REF Visitor (vetting off) → no request ──────────────────────────
await chooseRegistration(/Visitor Registration.*REF26/);
check("preview says vetting is off", (await page.getByText(/Vetting is off for this registration/).count()) > 0);
await preset("Clean applicant");
before = await requestCount();
const off = await submitAndWait();
check("vetting off → no vetting outcome", off.outcome === "noVetting", off.outcome ?? "");
check("no request created", (await requestCount()) === before);

// ─── 7. Recent list ─────────────────────────────────────────────────────
const recent = await page.getByTestId("sim-recent").locator("li").count();
check("recent list shows the simulated registrations", recent >= 5, String(recent));

// ─── 8. The request page ────────────────────────────────────────────────
await open(`/en/requests/${clean.id}`);
check("request page opens", (await page.getByText(clean.id).count()) > 0);
check("request is Pending review", (await page.getByText(/Pending review/i).count()) > 0);

// ─── 9. Responsive, no page overflow ────────────────────────────────────
for (const [w, h] of [[390, 844], [820, 1180]]) {
  await page.setViewportSize({ width: w, height: h });
  await open("/en/dev/simulate");
  await preset("Clean applicant");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`no horizontal overflow at ${w}px`, overflow <= 0, `${overflow}px`);
  await page.screenshot({ path: `${out}/en-simulate-${w}.png`, fullPage: true });
}
await page.setViewportSize({ width: 1440, height: 900 });

// ─── 10. Arabic ─────────────────────────────────────────────────────────
await open("/ar/dev/simulate");
check("Arabic page is RTL", (await page.evaluate(() => document.documentElement.dir)) === "rtl");
check("Arabic title", (await page.locator("main h1").textContent())?.trim() === "محاكاة تسجيل");
await page.getByRole("button", { name: "متقدم سليم", exact: true }).click();
await page.getByRole("button", { name: "إرسال التسجيل", exact: true }).click();
await page.getByTestId("sim-result").waitFor({ timeout: 15000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ar-simulate.png`, fullPage: true });
check("Arabic result renders", (await page.getByText("أُرسل للمراجعة").count()) > 0);

console.log(results.join("\n"));
console.log(errors.length ? `Page errors:\n${[...new Set(errors)].join("\n")}` : "No page errors");
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
