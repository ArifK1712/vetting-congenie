import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import { addComment, approve, claim, escalate, placesUsed, reassign, reject, release, retryFinalApproval, type ActionResult } from "./actions";
import { canClaim } from "./queue";
import type { Database, ID, VettingRequest } from "./types";
import { stageOf } from "./workflow";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
let seed: Database;
beforeAll(() => {
  seed = createSeed(NOW);
});

function ok(r: ActionResult): Database {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.db;
}

/** A pending request, and a member of its team who may claim it. */
function claimable(db: Database, pred: (r: VettingRequest) => boolean = () => true): { r: VettingRequest; user: ID } {
  for (const r of Object.values(db.requests)) {
    if (r.status !== "pending_review" || !pred(r)) continue;
    const user = db.teams[r.currentTeamId!]?.members.map((m) => m.userId).find((u) => canClaim(db, u, r));
    if (user) return { r, user };
  }
  throw new Error("no claimable request in seed");
}

const base = (r: VettingRequest, actorId: ID, at = NOW) => ({ requestId: r.id, actorId, expectedRevision: r.revision, now: at });

describe("claim", () => {
  it("moves the request to Under Review for the claimer", () => {
    const { r, user } = claimable(seed);
    const db = ok(claim(seed, base(r, user)));
    expect(db.requests[r.id]).toMatchObject({ status: "under_review", claimedBy: user, revision: r.revision + 1 });
    expect(seed.requests[r.id].status).toBe("pending_review"); // input untouched
  });

  it("lets only one of two simultaneous claims win (AC12)", () => {
    const { r, user } = claimable(seed);
    const other = seed.teams[r.currentTeamId!].members.map((m) => m.userId).find((u) => u !== user && canClaim(seed, u, r))!;
    const first = ok(claim(seed, base(r, user)));
    const second = claim(first, base(r, other)); // other still holds the old revision
    expect(second).toEqual({ ok: false, error: "stale" });
  });

  it("enforces the per-reviewer open claim limit", () => {
    const { r, user } = claimable(seed);
    const team = seed.teams[r.currentTeamId!];
    const db: Database = { ...seed, teams: { ...seed.teams, [team.id]: { ...team, maxOpenClaims: 0 } } };
    expect(claim(db, base(r, user))).toEqual({ ok: false, error: "claimLimit" });
  });

  it("can be released back to the team", () => {
    const { r, user } = claimable(seed);
    const claimed = ok(claim(seed, base(r, user)));
    const released = ok(release(claimed, base(claimed.requests[r.id], user)));
    expect(released.requests[r.id]).toMatchObject({ status: "pending_review", claimedBy: null });
  });
});

describe("approve", () => {
  it("routes to the next stage and its team", () => {
    const { r, user } = claimable(seed, (x) => x.workflowId === "wf_contractor" && x.currentStageNodeId === "con_docs");
    const claimed = ok(claim(seed, base(r, user)));
    const db = ok(approve(claimed, base(claimed.requests[r.id], user)));
    const next = db.requests[r.id];
    expect(next).toMatchObject({ status: "pending_review", currentStageNodeId: "con_site", claimedBy: null });
    expect(next.currentTeamId).toBe("t_gensec");
  });

  it("refuses the same reviewer on a second stage", () => {
    const { r, user } = claimable(seed, (x) => x.workflowId === "wf_contractor" && x.currentStageNodeId === "con_docs");
    let db = ok(claim(seed, base(r, user)));
    db = ok(approve(db, base(db.requests[r.id], user)));
    // Make the same user a member of the next team, then try again.
    const team = db.teams[db.requests[r.id].currentTeamId!];
    db = { ...db, teams: { ...db.teams, [team.id]: { ...team, members: [...team.members, { userId: user, role: "reviewer" }] } } };
    expect(claim(db, base(db.requests[r.id], user))).toEqual({ ok: false, error: "sameReviewer" });
  });

  it("takes exactly one place at final approval and issues the badge", () => {
    const { r, user } = claimable(seed, (x) => x.workflowId === "wf_exhibitor");
    const reg = r.registrationId;
    const before = placesUsed(seed, reg);
    let db = ok(claim(seed, base(r, user)));
    const res = approve(db, base(db.requests[r.id], user));
    db = ok(res);
    expect(res.ok && res.outcome).toBe("approved");
    expect(db.requests[r.id].status).toBe("approved");
    expect(placesUsed(db, reg)).toBe(before + 1);
    expect(Object.values(db.outbox).some((m) => m.requestId === r.id && m.template === "approved")).toBe(true);
  });

  it("blocks the last place for the second of two approvals (AC14)", () => {
    const pending = Object.values(seed.requests).filter((x) => x.workflowId === "wf_exhibitor" && x.status === "pending_review");
    const regId = pending[0].registrationId;
    const two = pending.filter((x) => x.registrationId === regId).slice(0, 2);
    expect(two.length).toBe(2);
    // Limit = places already used + 1.
    let db: Database = {
      ...seed,
      registrations: { ...seed.registrations, [regId]: { ...seed.registrations[regId], capacityLimit: placesUsed(seed, regId) + 1 } },
    };
    const outcomes: string[] = [];
    for (const r of two) {
      const user = db.teams[r.currentTeamId!].members.map((m) => m.userId).find((u) => canClaim(db, u, db.requests[r.id]))!;
      db = ok(claim(db, base(db.requests[r.id], user)));
      const res = approve(db, base(db.requests[r.id], user));
      db = ok(res);
      outcomes.push(res.ok ? (res.outcome ?? "") : "");
    }
    expect(outcomes).toEqual(["approved", "limitReached"]);
    expect(db.requests[two[1].id]).toMatchObject({ status: "under_review", awaitingCapacity: true });
    expect(Object.values(db.allocations).filter((x) => x.requestId === two[1].id)).toHaveLength(0);

    // Raising the limit lets it through on retry, using one place.
    db = { ...db, registrations: { ...db.registrations, [regId]: { ...db.registrations[regId], capacityLimit: 9999 } } };
    const claimer = db.requests[two[1].id].claimedBy!;
    db = ok(retryFinalApproval(db, base(db.requests[two[1].id], claimer)));
    expect(db.requests[two[1].id].status).toBe("approved");
  });

  it("stops at Screening Hold when a new blacklist entry matches at final approval (AC15)", () => {
    const { r, user } = claimable(seed, (x) => x.workflowId === "wf_exhibitor");
    const attendee = seed.attendees[r.attendeeId];
    const db0: Database = {
      ...seed,
      blacklist: {
        ...seed.blacklist,
        "BL-TEST": {
          id: "BL-TEST",
          identity: { subjectType: "person", fullName: attendee.profile.fullName, aliases: [], email: attendee.profile.email },
          eventScope: "all", reasonType: "other", reasonDetail: "test", evidence: [], startsOn: "2026-01-01T00:00:00.000Z",
          endsOn: null, status: "active", proposedBy: "u_arif", proposedAt: "2026-01-01T00:00:00.000Z", approvedBy: "u_tariq", approvedAt: "2026-01-01T00:00:00.000Z",
          source: "manual", sourceRequestId: null, pendingChange: null, decisionNote: null, removedBy: null, removedAt: null, removalReason: null,
          revision: 1, updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    };
    let db = ok(claim(db0, base(r, user)));
    const res = approve(db, base(db.requests[r.id], user));
    db = ok(res);
    expect(res.ok && res.outcome).toBe("screeningHold");
    expect(db.requests[r.id].status).toBe("screening_hold");
    expect(Object.values(db.allocations).some((x) => x.requestId === r.id)).toBe(false);
  });
});

describe("reject, escalate, reassign, comment", () => {
  it("requires a reason and never uses a place", () => {
    const { r, user } = claimable(seed);
    const db = ok(claim(seed, base(r, user)));
    expect(reject(db, { ...base(db.requests[r.id], user), reasonId: null })).toEqual({ ok: false, error: "reasonRequired" });
    const done = ok(reject(db, { ...base(db.requests[r.id], user), reasonId: "rr_docs" }));
    expect(done.requests[r.id]).toMatchObject({ status: "rejected", rejectReasonId: "rr_docs" });
    expect(Object.values(done.allocations).some((x) => x.requestId === r.id)).toBe(false);
  });

  it("refuses decisions from anyone but the claimer", () => {
    const { r, user } = claimable(seed);
    const db = ok(claim(seed, base(r, user)));
    expect(approve(db, base(db.requests[r.id], "u_sara"))).toEqual({ ok: false, error: "claimedByOther" });
  });

  it("escalates only to configured stages, with remarks", () => {
    const { r, user } = claimable(seed, (x) => x.workflowId === "wf_vip" && x.currentStageNodeId === "vip_docs" && x.workflowVersionId === "wfv_vip_2");
    let db = ok(claim(seed, base(r, user)));
    const cur = db.requests[r.id];
    expect(escalate(db, { ...base(cur, user), targetNodeId: "vip_senior", remarks: " " })).toEqual({ ok: false, error: "remarksRequired" });
    expect(escalate(db, { ...base(cur, user), targetNodeId: "vip_protocol", remarks: "x" })).toEqual({ ok: false, error: "invalidTarget" });
    db = ok(escalate(db, { ...base(cur, user), targetNodeId: "vip_senior", remarks: "Delegation unclear" }));
    expect(db.requests[r.id]).toMatchObject({ status: "escalated", currentStageNodeId: "vip_senior", currentTeamId: "t_senior" });
    const graph = db.workflowVersions[r.workflowVersionId!].graph;
    expect(stageOf(graph, "vip_senior")?.mandatory).toBe(true);
  });

  it("lets only leads or Assign holders reassign within the team", () => {
    const { r } = claimable(seed, (x) => x.currentTeamId === "t_docs");
    const member = seed.teams.t_docs.members.find((m) => m.role === "reviewer")!.userId;
    expect(reassign(seed, { ...base(r, "u_omar"), toUserId: member, reason: "balance" })).toEqual({ ok: false, error: "forbidden" });
    const db = ok(reassign(seed, { ...base(r, "u_yousef"), toUserId: member, reason: "Workload balance" }));
    expect(db.requests[r.id]).toMatchObject({ status: "under_review", claimedBy: member });
  });

  it("adds internal comments without changing the request revision", () => {
    const r = Object.values(seed.requests)[0];
    const db = ok(addComment(seed, { requestId: r.id, actorId: "u_omar", now: NOW, body: "Checked with sponsor." }));
    expect(Object.values(db.comments).some((c) => c.body === "Checked with sponsor.")).toBe(true);
    expect(db.requests[r.id].revision).toBe(r.revision);
  });
});
