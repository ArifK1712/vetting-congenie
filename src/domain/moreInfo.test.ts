import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import { claim } from "./actions";
import { attendeeView, askMoreInfo, findByToken, linkState, resendLink, sendDueReminders, submitAnswers } from "./moreInfo";
import { canClaim } from "./queue";
import type { Database, ID, InfoQuestion, VettingRequest } from "./types";
import { stageOf } from "./workflow";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const DAY = 86_400_000;
let seed: Database;
beforeAll(() => {
  seed = createSeed(NOW);
});

/** A claimed request whose stage allows Ask for more information. */
function claimed(db: Database): { db: Database; r: VettingRequest; user: ID } {
  for (const r of Object.values(db.requests)) {
    if (r.status !== "pending_review" || !r.currentTeamId || r.screening !== "clear") continue;
    const stage = stageOf(db.workflowVersions[r.workflowVersionId!].graph, r.currentStageNodeId);
    if (!stage?.allowedActions.includes("moreInfo")) continue;
    const user = db.teams[r.currentTeamId].members.map((m) => m.userId).find((u) => canClaim(db, u, r));
    if (!user) continue;
    const c = claim(db, { requestId: r.id, actorId: user, expectedRevision: r.revision, now: NOW });
    if (!c.ok) continue;
    return { db: c.db, r: c.db.requests[r.id], user };
  }
  throw new Error("no request");
}

const QUESTIONS: InfoQuestion[] = [
  { id: "q1", label: "Company letter", type: "upload", required: true },
  { id: "q2", label: "Correct company name", type: "text", required: true, mapsTo: "company" },
  { id: "q3", label: "Anything else?", type: "longText", required: false },
];

function asked(base = seed) {
  const { db, r, user } = claimed(base);
  const res = askMoreInfo(db, { requestId: r.id, actorId: user, expectedRevision: r.revision, now: NOW, instructions: "Please send the letter.", questions: QUESTIONS, returnToNodeId: r.currentStageNodeId! });
  if (!res.ok) throw new Error(res.error);
  const ir = Object.values(res.db.infoRequests).find((i) => i.requestId === r.id && i.sentAt === new Date(NOW).toISOString())!;
  return { db: res.db, r, user, ir };
}

describe("asking (8.5)", () => {
  it("sets More Information Required, releases the claim and emails a 7-day link", () => {
    const { db, r, ir } = asked();
    expect(db.requests[r.id]).toMatchObject({ status: "more_info_required", claimedBy: null });
    expect(Date.parse(ir.tokenExpiresAt) - NOW).toBe(7 * DAY);
    expect(Object.values(db.outbox).some((m) => m.requestId === r.id && m.template === "more_info" && m.params.token === ir.token)).toBe(true);
  });

  it("needs instructions and at most 10 questions, and choice questions need options", () => {
    const { db, r, user } = claimed(seed);
    const base = { requestId: r.id, actorId: user, expectedRevision: r.revision, now: NOW, returnToNodeId: r.currentStageNodeId! };
    expect(askMoreInfo(db, { ...base, instructions: " ", questions: QUESTIONS })).toEqual({ ok: false, error: "invalidValue" });
    const eleven = Array.from({ length: 11 }, (_, i) => ({ id: `x${i}`, label: "Q", type: "text" as const, required: false }));
    expect(askMoreInfo(db, { ...base, instructions: "x", questions: eleven })).toEqual({ ok: false, error: "invalidValue" });
    expect(askMoreInfo(db, { ...base, instructions: "x", questions: [{ id: "c", label: "Pick", type: "singleChoice", required: true, options: ["only one"] }] })).toEqual({ ok: false, error: "invalidValue" });
  });
});

describe("attendee answers", () => {
  it("returns the request to its stage, marked Response received, and adds the upload", () => {
    const { db, r, ir } = asked();
    const res = submitAnswers(db, { token: ir.token, now: NOW + DAY, answers: { q1: { fileName: "letter.pdf", sizeKb: 300 }, q2: "Gulf Ports Authority" } });
    if (!res.ok) throw new Error(res.error);
    const req = res.db.requests[r.id];
    expect(req).toMatchObject({ status: "pending_review", responseReceived: true, currentStageNodeId: ir.returnToNodeId });
    expect(res.db.attendees[r.attendeeId].documents.some((d) => d.fileName === "letter.pdf" && d.infoRound === ir.round)).toBe(true);
  });

  it("AC24: a mapped answer updates the registration and logs old and new values", () => {
    const { db, r, ir } = asked();
    const before = db.attendees[r.attendeeId].profile.company;
    const res = submitAnswers(db, { token: ir.token, now: NOW + DAY, answers: { q1: { fileName: "l.pdf", sizeKb: 10 }, q2: "Gulf Ports Authority" } });
    if (!res.ok) throw new Error(res.error);
    expect(res.db.attendees[r.attendeeId].profile.company).toBe("Gulf Ports Authority");
    const h = Object.values(res.db.history).find((x) => x.requestId === r.id && x.action === "field_corrected" && x.actorId === "attendee")!;
    expect(h.meta).toMatchObject({ field: "profile.company", from: before, to: "Gulf Ports Authority" });
  });

  it("works once only, and refuses missing answers or bad files", () => {
    const { db, ir } = asked();
    expect(submitAnswers(db, { token: ir.token, now: NOW, answers: { q2: "X" } })).toMatchObject({ ok: false, error: "missing", questionId: "q1" });
    expect(submitAnswers(db, { token: ir.token, now: NOW, answers: { q1: { fileName: "clip.mp4", sizeKb: 10 }, q2: "X" } })).toMatchObject({ ok: false, error: "badFile" });
    expect(submitAnswers(db, { token: ir.token, now: NOW, answers: { q1: { fileName: "big.pdf", sizeKb: 9000 }, q2: "X" } })).toMatchObject({ ok: false, error: "badFile" });
    const first = submitAnswers(db, { token: ir.token, now: NOW, answers: { q1: { fileName: "a.pdf", sizeKb: 10 }, q2: "X" } });
    if (!first.ok) throw new Error(first.error);
    expect(submitAnswers(first.db, { token: ir.token, now: NOW, answers: { q1: { fileName: "a.pdf", sizeKb: 10 }, q2: "X" } })).toEqual({ ok: false, error: "used" });
  });

  it("re-runs the list check on resubmission", () => {
    const { db, r, ir } = asked();
    const listed = Object.values(db.blacklist).find((e) => e.status === "active" && e.identity.subjectType === "company" && e.eventScope === "all");
    if (!listed) return;
    const res = submitAnswers(db, { token: ir.token, now: NOW, answers: { q1: { fileName: "a.pdf", sizeKb: 10 }, q2: listed.identity.company! } });
    if (!res.ok) throw new Error(res.error);
    expect(res.db.requests[r.id].status).toBe("screening_hold");
  });
});

describe("expiry and resend (AC13)", () => {
  it("an expired link is refused; resending gives a new link and the old one stops working", () => {
    const { db, r, user, ir } = asked();
    const later = NOW + 8 * DAY;
    expect(linkState(ir, later)).toBe("expired");
    expect(submitAnswers(db, { token: ir.token, now: later, answers: {} })).toEqual({ ok: false, error: "expired" });

    const res = resendLink(db, { requestId: r.id, actorId: user, expectedRevision: db.requests[r.id].revision, now: later, infoRequestId: ir.id });
    if (!res.ok) throw new Error(res.error);
    const fresh = res.db.infoRequests[ir.id];
    expect(fresh.token).not.toBe(ir.token);
    expect(findByToken(res.db, ir.token)).toBeUndefined();
    expect(linkState(fresh, later)).toBe("open");
  });

  it("sends the 24-hour reminder once", () => {
    const { db, ir } = asked();
    const almost = Date.parse(ir.tokenExpiresAt) - 2 * 3_600_000;
    const once = sendDueReminders(db, almost)!;
    expect(Object.values(once.outbox).filter((m) => m.template === "more_info_reminder" && m.params.token === ir.token)).toHaveLength(1);
    expect(sendDueReminders(once, almost + 1000)).toBeNull();
  });

  it("allows at most 3 rounds", () => {
    const first = asked();
    const { r, user } = first;
    let { db, ir } = first;
    for (let round = 2; round <= 4; round++) {
      const ans = submitAnswers(db, { token: ir.token, now: NOW + round, answers: { q1: { fileName: "a.pdf", sizeKb: 1 }, q2: `Co ${round}` } });
      if (!ans.ok) throw new Error(ans.error);
      const c = claim(ans.db, { requestId: r.id, actorId: user, expectedRevision: ans.db.requests[r.id].revision, now: NOW + round });
      const base = c.ok ? c.db : ans.db;
      const res = askMoreInfo(base, { requestId: r.id, actorId: user, expectedRevision: base.requests[r.id].revision, now: NOW + round + 0.5, instructions: "Again", questions: QUESTIONS, returnToNodeId: r.currentStageNodeId! });
      if (round === 4) {
        expect(res).toEqual({ ok: false, error: "invalidValue" });
        return;
      }
      if (!res.ok) throw new Error(`round ${round}: ${res.error}`);
      db = res.db;
      ir = Object.values(db.infoRequests).find((i) => i.requestId === r.id && i.round === round)!;
    }
  });
});

describe("attendee status (13.3, AC22)", () => {
  it("shows a request on Screening Hold as Under review", () => {
    const held = Object.values(seed.requests).find((r) => r.status === "screening_hold")!;
    expect(attendeeView(seed, held.id, NOW)?.phase).toBe("review");
  });
});
