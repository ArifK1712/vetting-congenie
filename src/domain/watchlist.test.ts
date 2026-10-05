import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import { approve, claim, previewApprove } from "./actions";
import { canClaim } from "./queue";
import type { Database, ID, VettingRequest } from "./types";
import {
  clearWatchMatch,
  createWatchEntry,
  editWatchEntry,
  emptyWatchDraft,
  errorsOf,
  readWatchImport,
  removeWatchEntry,
  validateWatch,
  watchDraftOf,
  watchRowReady,
  watchTemplateCsv,
  type WatchDraft,
  type WatchResult,
} from "./watchlist";
import { WATCHLIST_REVIEW } from "./workflow";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
let seed: Database;
beforeAll(() => {
  seed = createSeed(NOW);
});

function ok(r: WatchResult): Database {
  if (!r.ok) throw new Error(`expected ok, got ${r.error} ${JSON.stringify(r.issues ?? "")}`);
  return r.db;
}

/** A watch draft for the applicant of a request, matched on an ID number. */
function draftFor(db: Database, r: VettingRequest, over: Partial<WatchDraft> = {}): WatchDraft {
  const p = db.attendees[r.attendeeId].profile;
  return {
    ...emptyWatchDraft(NOW),
    identity: { subjectType: "person", fullName: p.fullName, aliases: [], nationalId: p.nationalId, passportNo: p.passportNo, nationality: p.nationality },
    level: "medium",
    reasonType: "other",
    reason: "Check carefully.",
    reviewerNote: "Confirm employment with the sponsor.",
    ...over,
  };
}
const clearReq = (pred: (r: VettingRequest) => boolean) => Object.values(seed.requests).find((r) => r.screening === "clear" && pred(r))!;
const newest = (db: Database) => Object.values(db.watchlist).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];

describe("entry rules (10.2)", () => {
  it("needs a level, recipients for email, and a stage for an extra review", () => {
    const r = clearReq(() => true);
    const codes = (d: WatchDraft) => errorsOf(validateWatch(seed, d, null, NOW)).map((i) => i.code);
    expect(codes(draftFor(seed, r, { level: null }))).toContain("levelRequired");
    expect(codes(draftFor(seed, r, { onMatch: "markEmail" }))).toContain("notifyRequired");
    expect(codes(draftFor(seed, r, { onMatch: "markStage" }))).toContain("stageRequired");
    expect(codes(draftFor(seed, r))).toEqual([]);
  });

  it("is saved directly, without a second approval, and only with Watchlist Manage", () => {
    const r = clearReq((x) => x.status === "pending_review");
    expect(createWatchEntry(seed, { draft: draftFor(seed, r), source: "manual", actorId: "u_lina", now: NOW })).toEqual({ ok: false, error: "forbidden" });
    const db = ok(createWatchEntry(seed, { draft: draftFor(seed, r), source: "manual", actorId: "u_arif", now: NOW }));
    expect(newest(db)).toMatchObject({ status: "active", createdBy: "u_arif" });
  });
});

describe("what happens on a match (10.3)", () => {
  it("marks an approved badge holder with the level, without suspending the badge", () => {
    const r = clearReq((x) => x.status === "approved" && x.badgeStatus === "issued");
    const res = createWatchEntry(seed, { draft: draftFor(seed, r, { level: "high" }), source: "manual", actorId: "u_arif", now: NOW });
    const db = ok(res);
    expect(res.ok && res.marked).toBeGreaterThanOrEqual(1);
    expect(db.requests[r.id]).toMatchObject({ screening: "watchlist_hit", watchlistLevel: "high", badgeStatus: "issued" });
    expect(Object.values(db.history).some((h) => h.requestId === r.id && h.action === "watchlist_marked")).toBe(true);
  });

  it("emails the chosen users and team members", () => {
    const r = clearReq((x) => x.status === "pending_review");
    const before = Object.keys(seed.outbox).length;
    const db = ok(createWatchEntry(seed, { draft: draftFor(seed, r, { onMatch: "markEmail", notify: ["u_sara", "t_protocol"] }), source: "manual", actorId: "u_arif", now: NOW }));
    const sent = Object.values(db.outbox).slice(before).filter((m) => m.template === "watchlist_match").map((m) => m.to);
    expect(sent).toEqual(expect.arrayContaining(["sara.alotaibi@vetting.app", "noura.alqahtani@vetting.app", "reem.aldosari@vetting.app"]));
  });

  it("raising the level on edit raises it on the marked requests", () => {
    const r = clearReq((x) => x.status === "pending_review");
    let db = ok(createWatchEntry(seed, { draft: draftFor(seed, r, { level: "low" }), source: "manual", actorId: "u_arif", now: NOW }));
    const e = newest(db);
    db = ok(editWatchEntry(db, { entryId: e.id, draft: { ...watchDraftOf(e), level: "high" }, expectedRevision: e.revision, actorId: "u_sara", now: NOW + 1 }));
    expect(db.requests[r.id].watchlistLevel).toBe("high");
  });

  it("a reviewer with Watchlist View can clear a match; the mark goes and it is logged", () => {
    const r = clearReq((x) => x.status === "pending_review");
    let db = ok(createWatchEntry(seed, { draft: draftFor(seed, r), source: "manual", actorId: "u_arif", now: NOW }));
    const m = Object.values(db.matches).find((x) => x.requestId === r.id && x.listType === "watchlist")!;
    expect(clearWatchMatch(db, { matchId: m.id, note: "", actorId: "u_lina", now: NOW })).toEqual({ ok: false, error: "noteRequired" });
    db = ok(clearWatchMatch(db, { matchId: m.id, note: "Different date of birth.", actorId: "u_lina", now: NOW + 1 }));
    expect(db.requests[r.id]).toMatchObject({ screening: "clear", watchlistLevel: null });
    expect(Object.values(db.watchlistHistory).some((h) => h.action === "match_cleared" && h.ref === r.id)).toBe(true);
  });

  it("removing an entry takes its level off the requests it marked", () => {
    const r = clearReq((x) => x.status === "pending_review");
    let db = ok(createWatchEntry(seed, { draft: draftFor(seed, r), source: "manual", actorId: "u_arif", now: NOW }));
    const e = newest(db);
    db = ok(removeWatchEntry(db, { entryId: e.id, expectedRevision: e.revision, reason: "Resolved.", actorId: "u_sara", now: NOW + 1 }));
    expect(db.requests[r.id].watchlistLevel).toBeNull();
  });

  it("adds the extra review stage once, just before final approval", () => {
    // A claimed request whose next step is final approval.
    const r = Object.values(seed.requests).find(
      (x) => x.status === "under_review" && x.claimedBy && !x.awaitingCapacity && x.screening === "clear" && previewApprove(seed, x)?.kind === "final",
    )!;
    let db = ok(createWatchEntry(seed, { draft: draftFor(seed, r, { level: "high", onMatch: "markStage", extraStage: WATCHLIST_REVIEW }), source: "manual", actorId: "u_arif", now: NOW }));
    const req = db.requests[r.id];
    const first = approve(db, { requestId: r.id, actorId: req.claimedBy!, expectedRevision: req.revision, now: NOW + 1 });
    expect(first.ok && first.outcome).toBe("nextStage");
    if (!first.ok) return;
    db = first.db;
    expect(db.requests[r.id]).toMatchObject({ currentStageNodeId: WATCHLIST_REVIEW, status: "pending_review" });

    // Someone in the routed team claims and approves: it continues to final approval.
    const team = db.teams[db.requests[r.id].currentTeamId!];
    const reviewer = team.members.map((m) => m.userId).find((u: ID) => canClaim(db, u, db.requests[r.id]) && u !== req.claimedBy)!;
    const c = claim(db, { requestId: r.id, actorId: reviewer, expectedRevision: db.requests[r.id].revision, now: NOW + 2 });
    if (!c.ok) throw new Error(c.error);
    const second = approve(c.db, { requestId: r.id, actorId: reviewer, expectedRevision: c.db.requests[r.id].revision, now: NOW + 3 });
    expect(second.ok && ["approved", "limitReached", "screeningHold"].includes(String(second.outcome))).toBe(true);
  });
});

describe("import", () => {
  it("reads the watchlist template and refuses rows that need recipients", () => {
    const text = `${watchTemplateCsv()}person,Mail Person,,1033334444,,SA,,,,,all,other,detail,2026-10-05,,low,email,\n`;
    const { rows, headerError } = readWatchImport(seed, text, NOW);
    expect(headerError).toBeNull();
    expect(rows.map(watchRowReady)).toEqual([true, false]);
    expect(rows[0].draft).toMatchObject({ level: "medium", onMatch: "markStage", extraStage: WATCHLIST_REVIEW });
  });
});
