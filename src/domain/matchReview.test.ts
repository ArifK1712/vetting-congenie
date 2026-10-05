import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import { approveEntry, proposeEntry, emptyDraft } from "./blacklist";
import { clearMatch, confirmMatch, reviewQueue, type ReviewResult } from "./matchReview";
import { screenProfile } from "./screening";
import type { Database } from "./types";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
let seed: Database;
beforeAll(() => {
  seed = createSeed(NOW);
});

function ok(r: ReviewResult | { ok: true; db: Database } | { ok: false; error: string }): Database {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.db;
}

/** A held request with exactly one open blacklist match. */
function heldCase(db: Database) {
  return reviewQueue(db, NOW).find((c) => c.kind === "hold" && c.others === 0)!;
}

describe("queue", () => {
  it("lists open blacklist matches on live requests, ID matches first", () => {
    const q = reviewQueue(seed, NOW);
    expect(q.length).toBeGreaterThan(0);
    expect(q.every((c) => c.match.status === "open" && c.match.listType === "blacklist")).toBe(true);
    const types = q.map((c) => c.match.matchType);
    expect(types.indexOf("name") === -1 || types.lastIndexOf("id") < types.indexOf("name")).toBe(true);
  });
});

describe("decisions (9.5)", () => {
  it("only Blacklist Approve can decide", () => {
    const c = heldCase(seed);
    expect(confirmMatch(seed, { matchId: c.match.id, note: "", actorId: "u_lina", expectedRevision: c.request.revision, now: NOW })).toEqual({ ok: false, error: "forbidden" });
  });

  it("confirm rejects the request as Blacklisted and emails the normal rejection", () => {
    const c = heldCase(seed);
    const db = ok(confirmMatch(seed, { matchId: c.match.id, note: "Same passport.", actorId: "u_arif", expectedRevision: c.request.revision, now: NOW }));
    expect(db.requests[c.request.id]).toMatchObject({ status: "rejected", rejectReasonId: "rr_blacklisted" });
    expect(db.matches[c.match.id].status).toBe("confirmed");
    expect(Object.values(db.outbox).some((m) => m.requestId === c.request.id && m.template === "rejected")).toBe(true);
  });

  it("not the same person needs a note and sends the request back to its stage", () => {
    const c = heldCase(seed);
    expect(clearMatch(seed, { matchId: c.match.id, note: " ", actorId: "u_arif", expectedRevision: c.request.revision, now: NOW })).toEqual({ ok: false, error: "noteRequired" });
    const db = ok(clearMatch(seed, { matchId: c.match.id, note: "Different date of birth.", actorId: "u_arif", expectedRevision: c.request.revision, now: NOW }));
    const r = db.requests[c.request.id];
    expect(r.status).toBe("pending_review");
    expect(r.currentTeamId).toBeTruthy();
    expect(r.screening).not.toBe("blacklist_hit");
  });

  it("a cleared pair never matches again", () => {
    const c = heldCase(seed);
    const db = ok(clearMatch(seed, { matchId: c.match.id, note: "Different person.", actorId: "u_arif", expectedRevision: c.request.revision, now: NOW }));
    const cleared = new Set(Object.values(db.matches).filter((m) => m.requestId === c.request.id && m.status === "cleared").map((m) => m.entryId));
    const hits = screenProfile(db.attendees[c.request.attendeeId].profile, c.request.eventId, Object.values(db.blacklist), [], cleared);
    expect(hits.blacklist.some((h) => h.entryId === c.match.entryId)).toBe(false);
  });

  it("refuses a decision on a request that changed meanwhile", () => {
    const c = heldCase(seed);
    expect(confirmMatch(seed, { matchId: c.match.id, note: "", actorId: "u_arif", expectedRevision: c.request.revision - 1, now: NOW })).toEqual({ ok: false, error: "stale" });
  });

  it("a suspended badge is revoked on confirm, or restored when cleared", () => {
    const holder = Object.values(seed.requests).find((r) => r.status === "approved" && r.badgeStatus === "issued" && seed.attendees[r.attendeeId].profile.nationalId)!;
    const p = seed.attendees[holder.attendeeId].profile;
    const draft = { ...emptyDraft(NOW), identity: { subjectType: "person" as const, fullName: p.fullName, aliases: [], nationalId: p.nationalId }, reasonType: "other" as const, reasonDetail: "Test." };
    let db = ok(proposeEntry(seed, { draft, source: "manual", actorId: "u_arif", now: NOW }));
    const entry = Object.values(db.blacklist).find((e) => e.status === "pending_approval" && e.identity.nationalId === p.nationalId)!;
    db = ok(approveEntry(db, { entryId: entry.id, expectedRevision: entry.revision, actorId: "u_sara", now: NOW + 1 }));
    expect(db.requests[holder.id].badgeStatus).toBe("suspended");
    const m = Object.values(db.matches).find((x) => x.requestId === holder.id && x.entryId === entry.id)!;

    const revoked = ok(confirmMatch(db, { matchId: m.id, note: "Same ID.", actorId: "u_arif", expectedRevision: db.requests[holder.id].revision, now: NOW + 2 }));
    expect(revoked.requests[holder.id].badgeStatus).toBe("revoked");
    expect(Object.values(revoked.allocations).some((x) => x.requestId === holder.id && x.state === "held")).toBe(false);

    const restored = ok(clearMatch(db, { matchId: m.id, note: "Different person.", actorId: "u_arif", expectedRevision: db.requests[holder.id].revision, now: NOW + 2 }));
    expect(restored.requests[holder.id].badgeStatus).toBe("issued");
  });
});
