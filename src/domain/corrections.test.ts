import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import { correctField, logDownload, reject, claim, reopenRequest, type ActionResult } from "./actions";
import { resolveAccess } from "./fieldAccess";
import { canClaim } from "./queue";
import type { Database, ID, VettingRequest } from "./types";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
let seed: Database;
beforeAll(() => {
  seed = createSeed(NOW);
});

function ok(r: ActionResult): Database {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.db;
}

/** An open request and a user whose team may edit the given field on it. */
function editable(db: Database, field: (r: VettingRequest) => string): { r: VettingRequest; user: ID } {
  for (const r of Object.values(db.requests)) {
    if (!["pending_review", "under_review", "escalated"].includes(r.status) || !r.currentTeamId) continue;
    const user = db.teams[r.currentTeamId].members.map((m) => m.userId).find((u) => resolveAccess(db, u, r).resolve(field(r)) === "edit");
    if (user) return { r, user };
  }
  throw new Error("no editable request in seed");
}

describe("reviewer corrections (5.6, 15.2)", () => {
  it("updates the registration and logs old and new values", () => {
    const { r, user } = editable(seed, () => "profile.company");
    const db = ok(correctField(seed, { requestId: r.id, actorId: user, expectedRevision: r.revision, now: NOW, field: "profile.company", value: "Corrected Holdings", reason: "Typo" }));
    expect(db.attendees[r.attendeeId].profile.company).toBe("Corrected Holdings");
    const h = Object.values(db.history).find((x) => x.requestId === r.id && x.action === "field_corrected")!;
    expect(h.meta).toMatchObject({ field: "profile.company", to: "Corrected Holdings" });
    expect(h.remarks).toBe("Typo");
  });

  it("refuses a field the team can only view", () => {
    const r = Object.values(seed.requests).find((x) => x.currentTeamId === "t_vipsec" && x.status === "pending_review")!;
    expect(correctField(seed, { requestId: r.id, actorId: "u_lina", expectedRevision: r.revision, now: NOW, field: "profile.company", value: "X" })).toEqual({ ok: false, error: "forbidden" });
  });

  it("re-runs the list check when an ID changes, and holds on a new blacklist match", () => {
    const { r, user } = editable(seed, () => "profile.nationalId");
    const listed = Object.values(seed.blacklist).find((e) => e.status === "active" && e.identity.nationalId && e.eventScope === "all")!;
    const res = correctField(seed, { requestId: r.id, actorId: user, expectedRevision: r.revision, now: NOW, field: "profile.nationalId", value: listed.identity.nationalId! });
    const db = ok(res);
    expect(res.ok && res.outcome).toBe("screeningHold");
    expect(db.requests[r.id].status).toBe("screening_hold");
    expect(Object.values(db.matches).some((m) => m.requestId === r.id && m.entryId === listed.id && m.stagePoint === "resubmission")).toBe(true);
  });

  it("rejects an invalid or unchanged value", () => {
    const { r, user } = editable(seed, () => "profile.email");
    const base = { requestId: r.id, actorId: user, expectedRevision: r.revision, now: NOW, field: "profile.email" };
    expect(correctField(seed, { ...base, value: "not-an-email" })).toEqual({ ok: false, error: "invalidValue" });
    expect(correctField(seed, { ...base, value: seed.attendees[r.attendeeId].profile.email })).toEqual({ ok: false, error: "invalidValue" });
  });
});

describe("downloads are logged (8.2, 15.3)", () => {
  it("logs a download for a team with View & Download, refuses View only", () => {
    const r = Object.values(seed.requests).find((x) => x.currentTeamId === "t_docs" && seed.attendees[x.attendeeId].documents.length)!;
    const doc = seed.attendees[r.attendeeId].documents[0];
    const db = ok(logDownload(seed, { requestId: r.id, actorId: "u_omar", documentId: doc.id, now: NOW }));
    expect(Object.values(db.history).some((h) => h.requestId === r.id && h.action === "document_downloaded" && h.meta?.file === doc.fileName)).toBe(true);
    const vip = Object.values(seed.requests).find((x) => x.currentTeamId === "t_vipsec" && seed.attendees[x.attendeeId].documents.length)!;
    expect(logDownload(seed, { requestId: vip.id, actorId: "u_lina", documentId: seed.attendees[vip.attendeeId].documents[0].id, now: NOW })).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("reopening a rejected request (17)", () => {
  function rejected(db: Database) {
    for (const r of Object.values(db.requests)) {
      if (r.status !== "pending_review" || !r.currentTeamId) continue;
      const user = db.teams[r.currentTeamId].members.map((m) => m.userId).find((u) => canClaim(db, u, r));
      if (!user) continue;
      let next = ok(claim(db, { requestId: r.id, actorId: user, expectedRevision: r.revision, now: NOW }));
      next = ok(reject(next, { requestId: r.id, actorId: user, expectedRevision: next.requests[r.id].revision, now: NOW + 1, reasonId: "rr_docs" }));
      return { db: next, id: r.id };
    }
    throw new Error("no request to reject");
  }

  it("only Review All users can reopen, with a reason; it goes back to its stage", () => {
    const { db, id } = rejected(seed);
    const rev = db.requests[id].revision;
    expect(reopenRequest(db, { requestId: id, actorId: "u_omar", expectedRevision: rev, now: NOW + 2, reason: "x" })).toEqual({ ok: false, error: "forbidden" });
    expect(reopenRequest(db, { requestId: id, actorId: "u_sara", expectedRevision: rev, now: NOW + 2, reason: " " })).toEqual({ ok: false, error: "reasonRequired" });
    const after = ok(reopenRequest(db, { requestId: id, actorId: "u_sara", expectedRevision: rev, now: NOW + 2, reason: "Documents arrived by email." }));
    expect(after.requests[id]).toMatchObject({ status: "pending_review", rejectReasonId: null, decidedAt: null });
    expect(after.requests[id].currentTeamId).toBeTruthy();
    expect(Object.values(after.history).some((h) => h.requestId === id && h.action === "reopened")).toBe(true);
  });

  it("a confirmed blacklist rejection can't be reopened", () => {
    const r = Object.values(seed.requests).find((x) => x.status === "rejected" && x.rejectReasonId === "rr_blacklisted")!;
    expect(reopenRequest(seed, { requestId: r.id, actorId: "u_sara", expectedRevision: r.revision, now: NOW, reason: "x" })).toEqual({ ok: false, error: "blacklistConfirmed" });
  });
});
