// Every main page at phone / tablet / desktop widths, light and dark, both languages.
// Also flags horizontal page overflow. Usage:
//   node scripts/shot-responsive.mjs <outDir> [baseUrl] [--pages=dashboard,queue] [--sizes=phone,tablet] [--themes=dark] [--locales=en]
import fs from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]?.split(",");
const [out = "screens/responsive", base = "http://localhost:3000"] = args.filter((a) => !a.startsWith("--"));
fs.mkdirSync(out, { recursive: true });

const SIZES = { phone: { width: 390, height: 844 }, tablet: { width: 820, height: 1180 }, desktop: { width: 1440, height: 900 } };
const PAGES = {
  dashboard: "/dashboard",
  queue: "/queue",
  request: "/requests/VR-1040",
  attendees: "/attendees",
  matches: "/screening/matches",
  blacklist: "/screening/blacklist",
  blacklistEntry: "/screening/blacklist/BL-0001",
  blacklistNew: "/screening/blacklist/new",
  watchlist: "/screening/watchlist",
  teams: "/teams",
  team: "/teams/t_docs",
  teamEdit: "/teams/t_docs/edit",
  workflows: "/workflows",
  workflow: "/workflows/wf_visitor",
  outbox: "/dev/outbox",
  portalStatus: "/portal/status/VR-1040",
};
const pages = flag("pages") ?? Object.keys(PAGES);
const sizes = flag("sizes") ?? Object.keys(SIZES);
const themes = flag("themes") ?? ["light", "dark"];
const locales = flag("locales") ?? ["en", "ar"];

const browser = await chromium.launch();
const problems = [];
for (const theme of themes) {
  for (const size of sizes) {
    const ctx = await browser.newContext({ viewport: SIZES[size] });
    await ctx.addInitScript((theme) => {
      localStorage.setItem("vetting-theme", theme);
      localStorage.setItem("vetting-prototype-session", JSON.stringify({ state: { personaId: "u_sara", eventScope: "all", sidebarCollapsed: false }, version: 0 }));
    }, theme);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => problems.push(`${size}/${theme}: page error ${e}`));
    for (const locale of locales) {
      for (const key of pages) {
        await page.goto(`${base}/${locale}${PAGES[key]}`);
        await page.waitForSelector("main h1, main h2", { timeout: 60000 }).catch(() => problems.push(`${key} ${locale}: no heading`));
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(() => {
          const wide = [];
          const vw = document.documentElement.clientWidth;
          if (document.documentElement.scrollWidth > vw + 1) wide.push(`page ${document.documentElement.scrollWidth}px`);
          const main = document.querySelector("main");
          if (main && main.scrollWidth > main.clientWidth + 1) wide.push(`main ${main.scrollWidth}px > ${main.clientWidth}px`);
          return wide;
        });
        if (overflow.length) problems.push(`${key} ${locale} ${size} ${theme}: overflow ${overflow.join(", ")}`);
        await page.screenshot({ path: `${out}/${key}-${locale}-${size}-${theme}.png`, fullPage: size === "phone" });
      }
    }
    await ctx.close();
  }
}
console.log(problems.length ? problems.join("\n") : "No overflow or errors");
await browser.close();
