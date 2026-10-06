// Settings (8.4 reject reasons, 8.5 More Information link, 9.4 matching
// thresholds, 16 emails): General draft + impact preview + validation + save +
// history + stale banner, threshold lock without Blacklist Approve, reject
// reasons (add / move / deactivate → gone from the reject dialog, Blacklisted
// locked), email templates (edit, preview, list-mention rule, outbox, reset),
// sender address in the outbox, no access for reviewers, Arabic RTL, phones.
// Usage: node scripts/e2e-settings.mjs [outDir] [baseUrl]   — dev server must be running.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = process.argv[2] ?? "screens";
const base = process.argv[3] ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];
const results = [];
const check = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);

const watch = (p) => {
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
};
const setPersona = (page, id) =>
  page.evaluate((id) => {
    localStorage.setItem("vetting-prototype-session", JSON.stringify({ state: { personaId: id, eventScope: "all", sidebarCollapsed: false }, version: 0 }));
  }, id);
const readDb = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("vetting-prototype")).state.db);
const editDb = (page, fn) =>
  page.evaluate((src) => {
    const raw = JSON.parse(localStorage.getItem("vetting-prototype"));
    new Function("db", src)(raw.state.db);
    localStorage.setItem("vetting-prototype", JSON.stringify(raw));
  }, fn);
async function open(page, path, ready = "main h1") {
  await page.goto(`${base}${path}`);
  await page.waitForSelector(ready, { timeout: 60000 });
}
const settings = (page, tab = "general", loc = "en") => open(page, `/${loc}/settings${tab === "general" ? "" : `?tab=${tab}`}`);
const impactSettled = (page) => page.waitForSelector("[data-impact]:not([data-pending])", { timeout: 10000 });
const impactState = (page) =>
  page.evaluate(() => {
    const el = document.querySelector("[data-impact]");
    return { requests: el?.querySelector("[data-impact-requests]")?.getAttribute("data-impact-requests"), text: el?.innerText.replace(/\s+/g, " ") ?? "" };
  });
const saveBtn = (page) => page.getByRole("button", { name: "Save settings" });
const toastSeen = (page, text) => page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 10000 }).then(() => true, () => false);

const a = await context.newPage();
watch(a);
await open(a, "/en/dashboard", "main");
await a.evaluate(() => localStorage.removeItem("vetting-prototype")); // fresh seed
await setPersona(a, "u_sara");

// ─── 1. General: impact preview, validation, save, history, stale ───────
await settings(a);
check("title", (await a.locator("main h1").innerText()).trim() === "Settings");
check("tabs in page", (await a.getByRole("tab").count()) === 4);
await impactSettled(a);
const before = await impactState(a);
check("impact preview shown, labelled preview", before.text.includes("Impact preview") && before.text.includes("Preview only") && /On today's \d+ live requests?/.test(before.text), before.text.slice(0, 160));
check("spec defaults noted", (await a.locator("#matching").innerText()).includes("Spec default 90 %") && (await a.locator("#matching").innerText()).includes("Spec default 85 %"));
check("exact matches note", (await a.locator("#matching").innerText()).includes("always exact"));

await a.locator('input[data-field="nameOnly"]').fill("70");
await a.waitForSelector("[data-impact][data-pending]", { timeout: 3000 }).catch(() => {});
await impactSettled(a);
const at70 = await impactState(a);
await a.locator('input[data-field="nameOnly"]').fill("88");
await impactSettled(a);
const at88 = await impactState(a);
check("impact preview updates with the draft", at70.text !== before.text || at88.text !== before.text, `85: ${before.requests} req · 70: ${at70.requests} req · 88: ${at88.requests} req`);
check("lower threshold never matches fewer", Number(at70.requests) >= Number(before.requests) && Number(at88.requests) <= Number(before.requests));
check("impact shows +A / −B", /\+\d+\s*\/\s*−\d+/.test(at88.text), at88.text.match(/\+\d+\s*\/\s*−\d+/)?.[0]);
check("save bar appears", await a.locator("[data-save-bar]").isVisible());
await a.screenshot({ path: `${out}/settings-general.png`, fullPage: true });

// Reminder ≥ link lifetime
await a.locator('input[data-field="linkDays"]').fill("1");
await a.locator('input[data-field="reminderHours"]').fill("24");
const errShown = await a.getByText("The reminder must come before the link ends").first().isVisible().catch(() => false);
check("reminder ≥ link lifetime: error shown", errShown);
check("reminder ≥ link lifetime: save blocked", await saveBtn(a).isDisabled());
await a.screenshot({ path: `${out}/settings-general-error.png`, fullPage: true });
await a.locator('input[data-field="linkDays"]').fill("7");
check("valid again: save enabled", await saveBtn(a).isEnabled());

// Second tab open before saving → stale banner after the save.
const b = await context.newPage();
watch(b);
await settings(b);
await saveBtn(a).click();
check("save toast", await toastSeen(a, "Settings saved"));
let db = await readDb(a);
check("saved to db", db.config.matching.nameOnly === 88 && db.config.revision === 2, JSON.stringify(db.config.matching));
check("save bar gone after save", (await a.locator("[data-save-bar]").count()) === 0);
await b.waitForSelector("[data-stale]", { timeout: 10000 }).then(
  () => check("other tab sees the stale banner", true),
  () => check("other tab sees the stale banner", false),
);
check("saving tab has no stale banner", (await a.locator("[data-stale]").count()) === 0);
await b.getByRole("button", { name: "Load latest" }).click().catch(() => {});
check("load latest picks up 88", (await b.locator('input[data-field="nameOnly"]').inputValue()) === "88");
await b.close();

await a.getByRole("tab", { name: /History/ }).click();
check("tab in URL", a.url().includes("tab=history"));
const hist = await a.locator("[data-settings-history]").innerText().catch(() => "");
check("history lists the change", hist.includes("Sara Al-Otaibi") && hist.includes("Name only: 85 % → 88 %"), hist.split("\n").slice(0, 4).join(" | "));

// Sender address
await a.getByRole("tab", { name: "General" }).click();
await a.locator('input[data-field="senderAddress"]').fill("not-an-email");
check("invalid sender blocked", (await a.getByText("Enter a valid email address").count()) > 0 && (await saveBtn(a).isDisabled()));
await a.locator('input[data-field="senderAddress"]').fill("vetting@congenie.com");
await saveBtn(a).click();
await a.locator("[data-save-bar]").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
db = await readDb(a);
check("sender saved", db.config.senderAddress === "vetting@congenie.com");

// ─── 2. Thresholds locked without Blacklist Approve ─────────────────────
// No seed persona has Vetting Settings without Blacklist Approve: give the
// Operations Manager role (Daniel) Vetting Settings for this check.
await editDb(a, `db.roles.role_ops.permissions.push("registration.vettingSettings");`);
await setPersona(a, "u_daniel");
await settings(a);
check("daniel: threshold inputs disabled", (await a.locator('input[data-field="nameOnly"]').isDisabled()) && (await a.locator('input[data-field="nameWithDob"]').isDisabled()));
check("daniel: locked badge", await a.locator("[data-locked-thresholds]").isVisible());
await a.locator('input[data-field="nameOnly"]').locator("xpath=ancestor::div[@tabindex='0'][1]").hover();
const tip = await a.getByRole("tooltip").first().textContent({ timeout: 5000 }).catch(() => "");
check("daniel: tooltip explains Blacklist Approve", (tip ?? "").includes("Blacklist Approve"), tip ?? "");
check("daniel: other settings still editable", await a.locator('input[data-field="linkDays"]').isEnabled());
await editDb(a, `db.roles.role_ops.permissions = db.roles.role_ops.permissions.filter((p) => p !== "registration.vettingSettings");`);
await setPersona(a, "u_sara");

// ─── 3. Reject reasons ──────────────────────────────────────────────────
await settings(a, "reasons");
const rows = a.locator("[data-reason]");
check("reasons listed in order", (await rows.count()) === 7 && (await rows.first().locator("[data-reason-label]").innerText()) === "Documents missing or wrong");
const bl = a.locator('[data-reason="rr_blacklisted"]');
check("Blacklisted: system badge", (await bl.innerText()).includes("System — used by Match Review"));
check("Blacklisted: switch locked", await bl.getByRole("switch").isDisabled());
check("usage count shown", (await a.locator("[data-usage]").first().innerText()).length > 0);

await a.getByRole("button", { name: "Add reason" }).first().click();
const dlg = a.getByRole("dialog");
await dlg.locator("#reason-en").fill("Late application");
await dlg.locator("#reason-ar").fill("طلب متأخر");
await dlg.getByRole("button", { name: "Add reason" }).click();
await dlg.waitFor({ state: "detached", timeout: 10000 });
check("added toast", await toastSeen(a, "“Late application” added"));
const labels = () => a.locator("[data-reason] [data-reason-label]").allInnerTexts();
let order = await labels();
check("new reason at the end", order.at(-1) === "Late application", order.join(", "));

// Duplicate
await a.getByRole("button", { name: "Add reason" }).first().click();
await dlg.locator("#reason-en").fill("late application");
await dlg.getByRole("button", { name: "Add reason" }).click();
check("duplicate rejected", await dlg.getByText("A reason with this English name already exists.").waitFor({ timeout: 5000 }).then(() => true, () => false));
await dlg.getByRole("button", { name: "Cancel" }).click();

await a.getByRole("button", { name: "Move Late application up" }).click();
await a.waitForFunction(() => [...document.querySelectorAll("[data-reason] [data-reason-label]")].at(-1)?.textContent !== "Late application", null, { timeout: 10000 }).catch(() => {});
order = await labels();
check("moved up one", order.at(-2) === "Late application" && order.at(-1) === "Other", order.join(", "));

// Blacklisted can't be turned off (toast if forced via domain is covered by unit tests).
db = await readDb(a);
const claimed = Object.values(db.requests).find((r) => r.claimedBy && r.status === "under_review" && db.users[r.claimedBy]);
check("found a claimed request", !!claimed, claimed ? `${claimed.id} by ${claimed.claimedBy}` : "");
const rejectChoices = async () => {
  await setPersona(a, claimed.claimedBy);
  await open(a, `/en/requests/${claimed.id}`);
  await a.getByRole("button", { name: "Reject", exact: true }).click();
  const d = a.getByRole("dialog");
  await d.waitFor();
  const names = await d.getByRole("radio").allInnerTexts();
  await d.getByRole("button", { name: "Cancel" }).click();
  await setPersona(a, "u_sara");
  return names.map((n) => n.trim());
};
if (claimed) {
  const listed = await rejectChoices();
  check("reject dialog lists the new reason before Other", listed.indexOf("Late application") >= 0 && listed.indexOf("Late application") === listed.indexOf("Other") - 1, listed.join(", "));
  check("reject dialog never lists Blacklisted", !listed.includes("Blacklisted"));
}

await settings(a, "reasons");
const late = a.locator("[data-reason]").filter({ hasText: "Late application" });
await a.getByRole("switch", { name: "Active: Late application" }).click();
check("deactivated toast", await toastSeen(a, "is hidden from reviewers"));
check("inactive note shown", (await late.locator("[data-inactive-note]").innerText()).includes("Hidden from reviewers; stays on past decisions"));
await a.screenshot({ path: `${out}/settings-reasons.png`, fullPage: true });
if (claimed) {
  const listed = await rejectChoices();
  check("reject dialog no longer lists it", !listed.includes("Late application") && listed.length > 0, listed.join(", "));
}

// ─── 4. Email templates ─────────────────────────────────────────────────
await settings(a, "emails");
check("groups: attendees and staff", (await a.locator('[data-template-group="attendees"] [data-template]').count()) === 5 && (await a.locator('[data-template-group="staff"] [data-template]').count()) === 7);
check("sender note", (await a.locator("[data-sender-note]").innerText()).includes("vetting@congenie.com"));
await a.getByRole("button", { name: "Edit Approved" }).click();
let ed = a.locator('[data-template-editor="approved"]');
await ed.waitFor();
check("editor prefilled with built-in subject", (await ed.locator("#tpl-subject").inputValue()) === "Your registration is approved");
await ed.locator("#tpl-subject").fill("Welcome aboard, ");
await ed.locator("#tpl-subject").focus();
await ed.locator('[data-chip="name"]').click();
check("chip inserts {name} at the cursor", (await ed.locator("#tpl-subject").inputValue()) === "Welcome aboard, {name}");
check("preview shows the sample name", (await ed.locator("[data-preview-subject]").innerText()).includes("Welcome aboard, Layla Hassan"));
await ed.locator("#tpl-body").fill("Hello {name}, you're in. {unknown}");
check("unknown placeholder flagged", (await ed.locator("[data-template-issues]").innerText()).includes("{unknown} isn't available"));
await ed.locator("#tpl-body").fill("Hello {name}, your registration is approved. See you there!");
await a.screenshot({ path: `${out}/settings-template-editor.png` });
await ed.getByRole("button", { name: "Save template" }).click();
await ed.waitFor({ state: "detached", timeout: 10000 });
check("saved toast", await toastSeen(a, "“Approved” saved"));
check("Edited badge", await a.locator('[data-template="approved"] [data-edited]').isVisible());
db = await readDb(a);
check("override saved", db.emailTemplates.approved?.subject.en === "Welcome aboard, {name}" && db.emailTemplates.approved?.subject.ar === "تمت الموافقة على تسجيلك");

await a.getByRole("button", { name: "Edit Rejected" }).click();
ed = a.locator('[data-template-editor="rejected"]');
await ed.waitFor();
await ed.locator("#tpl-body").fill("Hello {name}, you are on our blacklist.");
check("attendee email mentioning the blacklist is rejected", (await ed.locator("[data-template-issues]").innerText()).includes("Attendee emails must never mention the blacklist or watchlist"));
check("save disabled", await ed.getByRole("button", { name: "Save template" }).isDisabled());
await ed.getByRole("button", { name: "Cancel" }).click();
await ed.waitFor({ state: "detached" });

// Outbox uses the edited template and the sender address.
await editDb(
  a,
  `db.outbox["mail_e2e_appr"] = { id: "mail_e2e_appr", to: "guest@example.com", template: "approved", requestId: null, sentAt: new Date(Date.now() + 60000).toISOString(), params: { name: "Kareem Odeh", badge: "yes" } };`,
);
await open(a, "/en/dev/outbox");
await a.waitForTimeout(300);
check("outbox: edited subject filled", (await a.locator("[data-outbox-subject]").innerText()).includes("Welcome aboard, Kareem Odeh"));
check("outbox: edited body", (await a.locator("[data-outbox-body]").innerText()).includes("See you there!"));
check("outbox: From is the sender address", (await a.locator("[data-outbox-from]").innerText()).trim() === "vetting@congenie.com");
await a.screenshot({ path: `${out}/settings-outbox.png` });

// Reset to built-in
await settings(a, "emails");
await a.getByRole("button", { name: "Edit Approved" }).click();
ed = a.locator('[data-template-editor="approved"]');
await ed.waitFor();
await ed.getByRole("button", { name: "Reset to built-in" }).click();
await ed.waitFor({ state: "detached", timeout: 10000 });
check("reset toast", await toastSeen(a, "uses the built-in wording again"));
check("Edited badge gone", (await a.locator('[data-template="approved"] [data-edited]').count()) === 0);
await a.getByRole("button", { name: "Edit Approved" }).click();
check("reset restores built-in text", (await a.locator("#tpl-subject").inputValue()) === "Your registration is approved");
await a.keyboard.press("Escape");
await open(a, "/en/dev/outbox");
check("outbox: built-in wording again", (await a.locator("[data-outbox-subject]").innerText()).trim() === "Your registration is approved");

await settings(a, "history");
const hist2 = await a.locator("[data-settings-history]").innerText();
check("history: reasons and templates logged", hist2.includes("added a reject reason") && hist2.includes("edited an email template") && hist2.includes("reset an email template") && hist2.includes("vetting@congenie.com"));

// ─── 5. Reviewer has no access ──────────────────────────────────────────
await setPersona(a, "u_omar");
await open(a, "/en/settings", "main p");
check("reviewer: no access", (await a.getByText("You can't open Settings").count()) > 0);
check("reviewer: no settings form", (await a.locator('input[data-field="nameOnly"]').count()) === 0);
await setPersona(a, "u_sara");

// ─── 6. Arabic RTL ──────────────────────────────────────────────────────
await settings(a, "general", "ar");
check("ar: dir=rtl", (await a.evaluate(() => document.documentElement.dir)) === "rtl");
check("ar: Arabic title", (await a.locator("main h1").innerText()).trim() === "الإعدادات");
check("ar: Arabic tabs", (await a.getByRole("tab").allInnerTexts()).join(" ").includes("أسباب الرفض"));
await a.screenshot({ path: `${out}/settings-ar.png`, fullPage: true });
await settings(a, "emails", "ar");
await a.getByRole("button", { name: /تعديل تمت الموافقة/ }).click();
await a.locator('[data-template-editor="approved"]').waitFor();
check("ar: editor opens in Arabic", (await a.locator("#tpl-subject").getAttribute("dir")) === "rtl" && (await a.locator("#tpl-subject").inputValue()) === "تمت الموافقة على تسجيلك");
await a.screenshot({ path: `${out}/settings-ar-editor.png` });
await a.keyboard.press("Escape");

// ─── 7. Phones and tablets: no horizontal overflow ──────────────────────
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
watch(phone);
for (const loc of ["en", "ar"]) {
  for (const tab of ["general", "reasons", "emails", "history"]) {
    await settings(phone, tab, loc);
    await phone.waitForTimeout(350);
    const o = await phone.evaluate(() => ({ doc: document.documentElement.scrollWidth, main: document.querySelector("main").scrollWidth }));
    check(`390px ${loc}/${tab}: no page overflow`, o.doc <= 390 && o.main <= 390, JSON.stringify(o));
  }
}
await settings(phone, "emails");
await phone.getByRole("button", { name: "Edit Submitted for review" }).click();
await phone.locator("[data-template-editor]").waitFor();
const od = await phone.evaluate(() => document.documentElement.scrollWidth);
check("390px editor: no overflow", od <= 390, String(od));
await phone.screenshot({ path: `${out}/settings-phone-editor.png` });
await phone.keyboard.press("Escape");
await settings(phone, "general");
await phone.screenshot({ path: `${out}/settings-phone.png`, fullPage: true });
const tablet = await browser.newPage({ viewport: { width: 820, height: 1100 } });
await settings(tablet, "reasons");
const ot = await tablet.evaluate(() => document.documentElement.scrollWidth);
check("820px: no page overflow", ot <= 820, String(ot));
await tablet.screenshot({ path: `${out}/settings-tablet.png`, fullPage: true });

// Dark mode screenshot
await settings(a, "general");
await a.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
await a.waitForTimeout(300);
await a.screenshot({ path: `${out}/settings-dark.png`, fullPage: true });

const relevant = errors.filter((e) => !/favicon|Download the React DevTools|\[HMR\]/i.test(e));
check("no page errors", relevant.length === 0, relevant.slice(0, 3).join(" || "));
console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
await browser.close();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
