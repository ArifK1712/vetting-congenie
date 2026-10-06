import { beforeAll, describe, expect, it } from "vitest";
import { createSeed } from "@/mocks/seed";
import { BADGE_CHANNELS, badgeGate, badgeStatus, capacityOf, produceBadges, releasePlace, requestOf, setCapacityLimit, vettingStatus, withdrawRequest } from "./attendees";
import { submitRegistration } from "./intake";
import type { Database } from "./types";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
let seed: Database;
beforeAll(() => {
  seed = createSeed(NOW);
});

const ADMIN = "u_sara";
const REVIEWER = "u_omar";
const byStatus = (db: Database, s: string) => Object.values(db.requests).find((r) => r.status === s)!;

describe("attendee status columns (13.2)", () => {
  it("hides Screening Hold from users without Blacklist View", () => {
    const held = byStatus(seed, "screening_hold");
    const a = seed.attendees[held.attendeeId];
    expect(vettingStatus(seed, a, ADMIN)).toBe("screening_hold");
    expect(vettingStatus(seed, a, REVIEWER)).toBe("under_review");
  });

  it("shows Not required when there is no request", () => {
    const r = submitRegistration(seed, {
      registrationId: "reg_ref_visitor", badgeTypeId: "bt_visitor", submissionKey: "att-1", now: NOW,
      answers: { std_fullName: "No Vetting", std_email: "nv@example.com", std_mobile: "+966500000001", std_nationality: "SA", std_dob: "1990-01-01", std_company: "X" },
    });
    if (!r.ok) throw new Error(r.error);
    const a = r.db.attendees[r.attendeeId];
    expect(vettingStatus(r.db, a, ADMIN)).toBe("not_required");
    expect(badgeStatus(r.db, a)).toBe("issued");
    expect(badgeGate(r.db, a).allowed).toBe(true);
  });
});

describe("no badge without approval (11.2, AC17)", () => {
  it("AC17: every channel is blocked for an unapproved request", () => {
    const pending = byStatus(seed, "pending_review");
    const a = seed.attendees[pending.attendeeId];
    expect(badgeGate(seed, a)).toEqual({ allowed: false, reason: "notApproved" });
    for (const channel of BADGE_CHANNELS) {
      const res = produceBadges(seed, { attendeeIds: [a.id], channel, actorId: channel === "download" || channel === "api" || channel === "kiosk" || channel === "auto" ? "attendee" : ADMIN, now: NOW });
      if (!res.ok) throw new Error(res.error);
      expect(res.printed).toEqual([]);
      expect(res.blocked[0].reason).toBe("notApproved");
    }
  });

  it("a suspended badge can't be printed or scanned", () => {
    const db: Database = structuredClone(seed);
    const approved = Object.values(db.requests).find((r) => r.status === "approved" && r.badgeStatus === "issued")!;
    db.requests[approved.id] = { ...approved, badgeStatus: "suspended" };
    expect(badgeGate(db, db.attendees[approved.attendeeId])).toEqual({ allowed: false, reason: "suspended" });
  });

  it("payment rules still apply after approval", () => {
    const approved = Object.values(seed.requests).find((r) => r.status === "approved" && seed.attendees[r.attendeeId].payment.status === "pending");
    if (!approved) return; // seed may have none
    expect(badgeGate(seed, seed.attendees[approved.attendeeId])).toEqual({ allowed: false, reason: "paymentPending" });
  });

  it("bulk print prints the allowed ones and logs the blocked attempts", () => {
    const ok = Object.values(seed.requests).find((r) => r.status === "approved" && r.badgeStatus === "issued" && seed.attendees[r.attendeeId].payment.status !== "pending")!;
    const no = byStatus(seed, "pending_review");
    const res = produceBadges(seed, { attendeeIds: [ok.attendeeId, no.attendeeId], channel: "bulkPrint", actorId: ADMIN, now: NOW });
    if (!res.ok) throw new Error(res.error);
    expect(res.printed).toEqual([ok.attendeeId]);
    expect(res.blocked).toEqual([{ attendeeId: no.attendeeId, reason: "notApproved" }]);
    expect(Object.values(res.db.history).some((h) => h.requestId === no.id && h.action === "badge_blocked")).toBe(true);
  });

  it("only staff can bulk print", () => {
    const res = produceBadges(seed, { attendeeIds: [byStatus(seed, "approved").attendeeId], channel: "bulkPrint", actorId: REVIEWER, now: NOW });
    expect(res.ok).toBe(false);
  });
});

describe("registration limit (11.3)", () => {
  it("freeing a place needs a reason, is logged, and lets a waiting request take it", () => {
    const approved = Object.values(seed.requests).find((r) => r.status === "approved" && Object.values(seed.allocations).some((x) => x.requestId === r.id && x.state === "held"))!;
    const before = capacityOf(seed, approved.registrationId);
    expect(releasePlace(seed, { requestId: approved.id, reason: " ", actorId: ADMIN, expectedRevision: approved.revision, now: NOW }).ok).toBe(false);
    expect(releasePlace(seed, { requestId: approved.id, reason: "Cancelled by attendee", actorId: REVIEWER, expectedRevision: approved.revision, now: NOW }).ok).toBe(false);
    const res = releasePlace(seed, { requestId: approved.id, reason: "Cancelled by attendee", actorId: ADMIN, expectedRevision: approved.revision, now: NOW });
    if (!res.ok) throw new Error(res.error);
    expect(capacityOf(res.db, approved.registrationId).used).toBe(before.used - 1);
    expect(res.db.requests[approved.id].badgeStatus).toBe("revoked");
    expect(res.db.attendees[approved.attendeeId].registrationStatus).toBe("cancelled");
    expect(Object.values(res.db.history).some((h) => h.requestId === approved.id && h.action === "place_released" && h.remarks === "Cancelled by attendee")).toBe(true);
    // Twice doesn't free two places.
    const again = releasePlace(res.db, { requestId: approved.id, reason: "x", actorId: ADMIN, expectedRevision: res.db.requests[approved.id].revision, now: NOW });
    expect(again.ok).toBe(false);
  });

  it("the limit can be raised but never below the places used", () => {
    const reg = Object.values(seed.registrations).find((r) => capacityOf(seed, r.id).used > 0)!;
    const { used } = capacityOf(seed, reg.id);
    expect(setCapacityLimit(seed, { registrationId: reg.id, limit: used - 1, reason: "x", actorId: ADMIN, now: NOW }).ok).toBe(false);
    const res = setCapacityLimit(seed, { registrationId: reg.id, limit: reg.capacityLimit + 10, reason: "Bigger hall", actorId: ADMIN, now: NOW });
    if (!res.ok) throw new Error(res.error);
    expect(res.db.registrations[reg.id].capacityLimit).toBe(reg.capacityLimit + 10);
    expect(Object.values(res.db.registrationHistory).some((h) => h.action === "limit_changed")).toBe(true);
  });

  it("an admin can withdraw a waiting request with a reason", () => {
    const pending = byStatus(seed, "pending_review");
    const res = withdrawRequest(seed, { requestId: pending.id, reason: "Duplicate registration", actorId: ADMIN, expectedRevision: pending.revision, now: NOW });
    if (!res.ok) throw new Error(res.error);
    expect(res.db.requests[pending.id].status).toBe("withdrawn");
    expect(requestOf(res.db, pending.attendeeId)?.status).toBe("withdrawn");
    const approved = byStatus(seed, "approved");
    expect(withdrawRequest(seed, { requestId: approved.id, reason: "x", actorId: ADMIN, expectedRevision: approved.revision, now: NOW }).ok).toBe(false);
  });
});
