import { Tx } from "./actions";
import { can } from "./permissions";
import { OPEN_STATUSES } from "./status";
import type { Attendee, BadgeStatus, Database, ID, RequestStatus, VettingRequest } from "./types";

/**
 * Attendees (13.2), no badge without approval (11.2) and the registration
 * limit (11.3). Pure functions over the Database.
 */

// ─── Status columns (13.2) ──────────────────────────────────────────────

export type VettingColumn = "not_required" | RequestStatus;

/** The one request for an attendee (one registration → one request). */
export function requestOf(db: Database, attendeeId: ID): VettingRequest | undefined {
  return Object.values(db.requests).find((r) => r.attendeeId === attendeeId);
}

/**
 * Vetting status as staff see it. Screening Hold shows as Under Review to
 * anyone without Blacklist View, so a list match is never revealed.
 */
export function vettingStatus(db: Database, attendee: Attendee, viewerId: ID): VettingColumn {
  const r = requestOf(db, attendee.id);
  if (!r) return "not_required";
  if (r.status === "screening_hold" && !can(db, viewerId, "blacklist.view")) return "under_review";
  return r.status;
}

/**
 * Badge status. With a request it's kept on the request; without one (vetting
 * off or not needed for the badge type) the normal process applies: issued
 * once the registration is confirmed and payment allows it.
 */
export function badgeStatus(db: Database, attendee: Attendee): BadgeStatus {
  const r = requestOf(db, attendee.id);
  if (r) return r.badgeStatus;
  if (attendee.registrationStatus === "cancelled") return "revoked";
  return attendee.registrationStatus === "confirmed" && attendee.payment.status !== "pending" ? "issued" : "not_issued";
}

// ─── Badge gates (11.2, AC17) ───────────────────────────────────────────

/** Everywhere a badge can come from. All of them use the same gate. */
export const BADGE_CHANNELS = ["auto", "download", "adminGenerate", "bulkPrint", "kiosk", "api"] as const;
export type BadgeChannel = (typeof BADGE_CHANNELS)[number];

export type BadgeBlock =
  | "notApproved" // vetting on and the request isn't Approved
  | "suspended" // blacklist match after approval (9.5)
  | "revoked"
  | "cancelled" // registration cancelled
  | "paymentPending"; // existing payment rules

export type BadgeGate = { allowed: true } | { allowed: false; reason: BadgeBlock };

/** 11.2: one rule for every channel. Order: hardest stop first. */
export function badgeGate(db: Database, attendee: Attendee): BadgeGate {
  if (attendee.registrationStatus === "cancelled") return { allowed: false, reason: "cancelled" };
  const r = requestOf(db, attendee.id);
  if (r) {
    if (r.badgeStatus === "suspended") return { allowed: false, reason: "suspended" };
    if (r.badgeStatus === "revoked") return { allowed: false, reason: "revoked" };
    if (r.status !== "approved") return { allowed: false, reason: "notApproved" };
  }
  if (attendee.payment.status === "pending") return { allowed: false, reason: "paymentPending" };
  return { allowed: true };
}

export type BadgeResult = { ok: true; db: Database; printed: ID[]; blocked: { attendeeId: ID; reason: BadgeBlock }[] } | { ok: false; error: "forbidden" | "empty" };

/**
 * Produce badges through a channel. Allowed ones are produced; blocked ones
 * are refused and the attempt is logged on the request (if there is one), so
 * history shows who tried to print an unapproved badge.
 */
export function produceBadges(db: Database, a: { attendeeIds: ID[]; channel: BadgeChannel; actorId: ID | "attendee"; now: number }): BadgeResult {
  if (!a.attendeeIds.length) return { ok: false, error: "empty" };
  const staffChannel = a.channel === "adminGenerate" || a.channel === "bulkPrint";
  if (staffChannel && (a.actorId === "attendee" || !(can(db, a.actorId, "queue.reviewAll") || can(db, a.actorId, "registration.vettingSettings")))) {
    return { ok: false, error: "forbidden" };
  }
  const tx = new Tx(db, a.now);
  const printed: ID[] = [];
  const blocked: { attendeeId: ID; reason: BadgeBlock }[] = [];
  for (const id of a.attendeeIds) {
    const attendee = db.attendees[id];
    if (!attendee) continue;
    const gate = badgeGate(db, attendee);
    const r = requestOf(db, id);
    if (gate.allowed) {
      printed.push(id);
      if (r) tx.log({ requestId: r.id, action: "badge_printed", actorId: a.actorId, meta: { channel: a.channel } });
    } else {
      blocked.push({ attendeeId: id, reason: gate.reason });
      if (r) tx.log({ requestId: r.id, action: "badge_blocked", actorId: a.actorId, remarks: gate.reason, meta: { channel: a.channel } });
    }
  }
  return { ok: true, db: tx.db, printed, blocked };
}

// ─── Registration limit (11.3) ──────────────────────────────────────────

export function capacityOf(db: Database, registrationId: ID) {
  const reg = db.registrations[registrationId];
  const used = Object.values(db.allocations).filter((x) => x.registrationId === registrationId && x.state === "held").length;
  const waiting = Object.values(db.requests).filter((r) => r.registrationId === registrationId && r.awaitingCapacity && OPEN_STATUSES.includes(r.status)).length;
  const released = Object.values(db.allocations).filter((x) => x.registrationId === registrationId && x.state === "released").length;
  return { limit: reg.capacityLimit, used, free: Math.max(0, reg.capacityLimit - used), waiting, released };
}

export type CapacityError = "forbidden" | "notFound" | "reasonRequired" | "noPlace" | "stale" | "belowUsed" | "invalidLimit" | "notWithdrawable";

export type CapacityResult = { ok: true; db: Database; waiting: number } | { ok: false; error: CapacityError };

const canManage = (db: Database, actorId: ID) => can(db, actorId, "registration.vettingSettings");

/**
 * 11.3: an admin frees the place of an approved attendee who cancelled or
 * withdrew, with a reason that is logged. The registration is cancelled and
 * the badge revoked; the request keeps its Approved decision in history.
 */
export function releasePlace(db: Database, a: { requestId: ID; reason: string; actorId: ID; expectedRevision: number; now: number }): CapacityResult {
  if (!canManage(db, a.actorId)) return { ok: false, error: "forbidden" };
  const r = db.requests[a.requestId];
  if (!r) return { ok: false, error: "notFound" };
  if (r.revision !== a.expectedRevision) return { ok: false, error: "stale" };
  if (!a.reason.trim()) return { ok: false, error: "reasonRequired" };
  const alloc = Object.values(db.allocations).find((x) => x.requestId === r.id && x.state === "held");
  if (!alloc) return { ok: false, error: "noPlace" };

  const tx = new Tx(db, a.now);
  tx.put("allocations", { ...alloc, state: "released" });
  tx.put("attendees", { ...db.attendees[r.attendeeId], registrationStatus: "cancelled" });
  tx.updateRequest(r, { badgeStatus: "revoked" });
  tx.log({ requestId: r.id, action: "place_released", actorId: a.actorId, remarks: a.reason.trim() });
  return { ok: true, db: tx.db, waiting: capacityOf(tx.db, r.registrationId).waiting };
}

/** An admin withdraws a request that's still waiting (Pending Review or More Information Required). */
export function withdrawRequest(db: Database, a: { requestId: ID; reason: string; actorId: ID; expectedRevision: number; now: number }): CapacityResult {
  if (!canManage(db, a.actorId)) return { ok: false, error: "forbidden" };
  const r = db.requests[a.requestId];
  if (!r) return { ok: false, error: "notFound" };
  if (r.revision !== a.expectedRevision) return { ok: false, error: "stale" };
  if (!a.reason.trim()) return { ok: false, error: "reasonRequired" };
  if (r.status !== "pending_review" && r.status !== "more_info_required") return { ok: false, error: "notWithdrawable" };

  const tx = new Tx(db, a.now);
  tx.updateRequest(r, { status: "withdrawn", claimedBy: null, currentTeamId: null, decidedAt: new Date(a.now).toISOString() });
  tx.put("attendees", { ...db.attendees[r.attendeeId], registrationStatus: "cancelled" });
  // Close any open stage work.
  for (const e of Object.values(db.stageExecutions)) {
    if (e.requestId === r.id && e.status !== "completed") tx.put("stageExecutions", { ...e, status: "completed", completedAt: new Date(a.now).toISOString(), outcome: null });
  }
  tx.log({ requestId: r.id, action: "withdrawn", actorId: a.actorId, fromStatus: r.status, toStatus: "withdrawn", remarks: a.reason.trim() });
  return { ok: true, db: tx.db, waiting: capacityOf(tx.db, r.registrationId).waiting };
}

/** The organiser changes the registration limit (never below the places already used). Logged. */
export function setCapacityLimit(db: Database, a: { registrationId: ID; limit: number; reason: string; actorId: ID; now: number }): CapacityResult {
  if (!canManage(db, a.actorId)) return { ok: false, error: "forbidden" };
  const reg = db.registrations[a.registrationId];
  if (!reg) return { ok: false, error: "notFound" };
  if (!Number.isInteger(a.limit) || a.limit < 1) return { ok: false, error: "invalidLimit" };
  if (!a.reason.trim()) return { ok: false, error: "reasonRequired" };
  if (a.limit < capacityOf(db, reg.id).used) return { ok: false, error: "belowUsed" };

  const tx = new Tx(db, a.now);
  tx.db.registrations = { ...db.registrations, [reg.id]: { ...reg, capacityLimit: a.limit } };
  const hid = tx.id("rh");
  tx.db.registrationHistory = {
    ...db.registrationHistory,
    [hid]: {
      id: hid, registrationId: reg.id, action: "limit_changed", actorId: a.actorId, at: new Date(a.now).toISOString(),
      changes: [`${reg.capacityLimit}→${a.limit}`, a.reason.trim()],
    },
  };
  return { ok: true, db: tx.db, waiting: capacityOf(tx.db, reg.id).waiting };
}
