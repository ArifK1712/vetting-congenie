import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import { buildReport, canOpenReport, defaultFilters, logDownload, nextRun, REPORT_KEYS, runDueSchedules, saveSchedule } from "./reports";
import type { Database, ReportFilters } from "./types";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
let seed: Database;
let f: ReportFilters;
beforeAll(() => {
  seed = createSeed(NOW);
  f = { ...defaultFilters(NOW), from: "2026-01-01" };
});

const ADMIN = "u_sara"; // everything
const OPS = "u_daniel"; // Review All + Reports View/Export, no Blacklist View
const LEAD = "u_lina"; // Reports View + Assign, Watchlist View, own teams only
const COORD = "u_salma"; // Reports View only

describe("report access (14.2)", () => {
  it("follows the 'Who can open it' column", () => {
    expect(REPORT_KEYS.every((k) => canOpenReport(seed, ADMIN, k))).toBe(true);
    expect(canOpenReport(seed, COORD, "vettingStatus")).toBe(true);
    expect(canOpenReport(seed, COORD, "reviewerActivity")).toBe(false); // needs Assign
    expect(canOpenReport(seed, LEAD, "reviewerActivity")).toBe(true);
    expect(canOpenReport(seed, OPS, "listMatches")).toBe(false); // no list view
    expect(canOpenReport(seed, LEAD, "listMatches")).toBe(true); // watchlist view
    expect(canOpenReport(seed, LEAD, "activityLog")).toBe(false); // needs Review All
    expect(buildReport(seed, COORD, "all", "activityLog", f, NOW)).toBeNull();
  });

  it("shows only the viewer's own teams' requests", () => {
    const all = buildReport(seed, ADMIN, "all", "vettingStatus", f, NOW)!;
    const lead = buildReport(seed, LEAD, "all", "vettingStatus", f, NOW)!;
    expect(lead.rows.length).toBeGreaterThan(0);
    expect(lead.rows.length).toBeLessThan(all.rows.length);
  });

  it("list matches only show the lists the viewer can see", () => {
    const lead = buildReport(seed, LEAD, "all", "listMatches", f, NOW)!;
    expect(lead.rows.every((r) => r.list === "watchlist")).toBe(true);
    const admin = buildReport(seed, ADMIN, "all", "listMatches", f, NOW)!;
    expect(admin.rows.some((r) => r.list === "blacklist")).toBe(true);
  });
});

describe("AC25: export without Blacklist View", () => {
  it("masks ID and passport, shows Screening Hold as Under Review, and logs the export", () => {
    const r = buildReport(seed, OPS, "all", "vettingStatus", f, NOW)!;
    expect(r.masked).toBe(true);
    expect(r.rows.some((x) => x.vettingStatus === "screening_hold")).toBe(false);
    const withId = r.rows.find((x) => x.nationalId);
    expect(String(withId?.nationalId)).toMatch(/^•+/);
    // Held requests are still in the report, as Under Review.
    const held = Object.values(seed.requests).find((x) => x.status === "screening_hold")!;
    expect(r.rows.find((x) => x._requestId === held.id)?.vettingStatus).toBe("under_review");

    const admin = buildReport(seed, ADMIN, "all", "vettingStatus", f, NOW)!;
    expect(admin.rows.find((x) => x._requestId === held.id)?.vettingStatus).toBe("screening_hold");

    const res = logDownload(seed, { report: "vettingStatus", format: "csv", filters: f, eventScope: "all", actorId: OPS, now: NOW });
    if (!res.ok) throw new Error(res.error);
    const log = Object.values(res.db.reportDownloads)[0];
    expect(log).toMatchObject({ actorId: OPS, report: "vettingStatus", format: "csv", masked: true, rows: r.rows.length });
  });

  it("downloads need Reports Export", () => {
    const res = logDownload(seed, { report: "vettingStatus", format: "csv", filters: f, eventScope: "all", actorId: COORD, now: NOW });
    expect(res.ok).toBe(false);
  });

  it("the activity log hides list events from users without Blacklist View", () => {
    const ops = buildReport(seed, OPS, "all", "activityLog", f, NOW)!;
    expect(ops.rows.some((x) => x.action === "screening_hold" || x.action === "match_confirmed")).toBe(false);
    const admin = buildReport(seed, ADMIN, "all", "activityLog", f, NOW)!;
    expect(admin.rows.some((x) => x.action === "screening_hold")).toBe(true);
  });

  it("the activity log can show one request's full history", () => {
    const id = Object.values(seed.requests)[0].id;
    const r = buildReport(seed, ADMIN, "all", "activityLog", { ...f, requestId: id.toLowerCase() }, NOW)!;
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((x) => x.request === id)).toBe(true);
  });
});

describe("other reports", () => {
  it("late requests are all past their time limit", () => {
    const r = buildReport(seed, ADMIN, "all", "lateRequests", f, NOW)!;
    expect(r.rows.length).toBeGreaterThan(0);
    expect(r.rows.every((x) => (x.overdue as number) > 0)).toBe(true);
  });

  it("reviewer activity and time per stage have rows", () => {
    expect(buildReport(seed, ADMIN, "all", "reviewerActivity", f, NOW)!.rows.length).toBeGreaterThan(0);
    expect(buildReport(seed, ADMIN, "all", "timePerStage", f, NOW)!.rows.length).toBeGreaterThan(0);
  });

  it("automation is Phase 2 and empty", () => {
    const r = buildReport(seed, ADMIN, "all", "automation", f, NOW)!;
    expect(r.phase2).toBe(true);
    expect(r.rows).toEqual([]);
  });
});

describe("scheduled reports", () => {
  it("next run is at the chosen hour (event time), on the chosen weekday for weekly", () => {
    const daily = nextRun({ frequency: "daily", hour: 8, weekday: 0 }, NOW); // 15:00 Riyadh → tomorrow 08:00
    expect(new Date(daily).toISOString()).toBe("2026-10-06T05:00:00.000Z");
    const weekly = nextRun({ frequency: "weekly", hour: 8, weekday: 0 }, NOW); // next Sunday
    expect(new Date(weekly + 3 * 3_600_000).getUTCDay()).toBe(0);
  });

  it("a due schedule emails the owner, logs the download and moves to the next run", () => {
    const s = saveSchedule(seed, { report: "lateRequests", format: "xlsx", filters: f, eventScope: "all", frequency: "daily", hour: 8, weekday: 0, actorId: OPS, now: NOW });
    if (!s.ok) throw new Error(s.error);
    const due = Date.parse(s.db.reportSchedules[s.scheduleId].nextRunAt) + 1000;
    const after = runDueSchedules(s.db, due);
    expect(Object.values(after.outbox).some((m) => m.template === "report_scheduled" && m.to === "daniel.mercer@vetting.app")).toBe(true);
    expect(Object.values(after.reportDownloads).length).toBe(1);
    expect(Date.parse(after.reportSchedules[s.scheduleId].nextRunAt)).toBeGreaterThan(due);
    // Not due again until then.
    expect(runDueSchedules(after, due + 60_000)).toBe(after);
  });

  it("can't schedule without Reports Export, or as PDF", () => {
    expect(saveSchedule(seed, { report: "vettingStatus", format: "csv", filters: f, eventScope: "all", frequency: "daily", hour: 8, weekday: 0, actorId: COORD, now: NOW }).ok).toBe(false);
    expect(saveSchedule(seed, { report: "vettingStatus", format: "pdf", filters: f, eventScope: "all", frequency: "daily", hour: 8, weekday: 0, actorId: OPS, now: NOW }).ok).toBe(false);
  });
});
