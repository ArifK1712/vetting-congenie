import { badgeGate, badgeStatus, requestOf, vettingStatus, type BadgeBlock, type VettingColumn } from "@/domain/attendees";
import { STATUS_ORDER } from "@/domain/status";
import type { Attendee, BadgeStatus, Database, ID, VettingRequest } from "@/domain/types";
import type { Tone } from "@/design/tones";

/** One line of the Attendees list (13.2): the four status columns plus what the actions need. */
export interface AttendeeRow {
  id: ID;
  attendee: Attendee;
  request: VettingRequest | undefined;
  name: string;
  nameAr?: string;
  email: string;
  registrationId: ID;
  badgeTypeId: ID;
  registrationStatus: Attendee["registrationStatus"];
  payment: Attendee["payment"]["status"];
  vetting: VettingColumn;
  badge: BadgeStatus;
  /** Approved with a held place: an admin can free it (11.3). */
  holdsPlace: boolean;
  /** Pending Review / More Information Required: an admin can withdraw it. */
  withdrawable: boolean;
}

export function buildRows(db: Database, viewerId: ID, scope: ID | "all"): AttendeeRow[] {
  const held = new Set(Object.values(db.allocations).filter((x) => x.state === "held").map((x) => x.requestId));
  return Object.values(db.attendees)
    .filter((a) => scope === "all" || a.eventId === scope)
    .map((a) => {
      const r = requestOf(db, a.id);
      return {
        id: a.id,
        attendee: a,
        request: r,
        name: a.profile.fullName,
        nameAr: a.profile.fullNameAr,
        email: a.profile.email,
        registrationId: a.registrationId,
        badgeTypeId: a.badgeTypeId,
        registrationStatus: a.registrationStatus,
        payment: a.payment.status,
        vetting: vettingStatus(db, a, viewerId),
        badge: badgeStatus(db, a),
        holdsPlace: !!r && r.status === "approved" && held.has(r.id),
        withdrawable: !!r && (r.status === "pending_review" || r.status === "more_info_required"),
      };
    })
    .sort((x, y) => (y.request?.submittedAt ?? y.attendee.submittedAt).localeCompare(x.request?.submittedAt ?? x.attendee.submittedAt));
}

export interface AttendeeFilters {
  search: string;
  registrationStatus: string[];
  payment: string[];
  vetting: string[];
  badge: string[];
  registrationIds: string[];
  badgeTypeIds: string[];
}

export const EMPTY_FILTERS: AttendeeFilters = { search: "", registrationStatus: [], payment: [], vetting: [], badge: [], registrationIds: [], badgeTypeIds: [] };

export const hasFilters = (f: AttendeeFilters) =>
  f.search.trim() !== "" || (["registrationStatus", "payment", "vetting", "badge", "registrationIds", "badgeTypeIds"] as const).some((k) => f[k].length > 0);

export function applyFilters(rows: AttendeeRow[], f: AttendeeFilters): AttendeeRow[] {
  const q = f.search.trim().toLowerCase();
  const inList = (list: string[], v: string) => !list.length || list.includes(v);
  return rows.filter(
    (r) =>
      inList(f.registrationStatus, r.registrationStatus) &&
      inList(f.payment, r.payment) &&
      inList(f.vetting, r.vetting) &&
      inList(f.badge, r.badge) &&
      inList(f.registrationIds, r.registrationId) &&
      inList(f.badgeTypeIds, r.badgeTypeId) &&
      (!q || `${r.name} ${r.nameAr ?? ""} ${r.email} ${r.request?.id ?? ""} ${r.id}`.toLowerCase().includes(q)),
  );
}

/** Vetting filter values. Screening Hold only for viewers who may see it (Blacklist View). */
export function vettingOptions(seesHold: boolean): VettingColumn[] {
  return ["not_required", ...STATUS_ORDER.filter((s) => seesHold || s !== "screening_hold")];
}

export const REGISTRATION_STATUSES = ["submitted", "confirmed", "cancelled"] as const;
export const PAYMENT_STATUSES = ["paid", "pending", "free"] as const;
export const BADGE_STATUSES: BadgeStatus[] = ["not_issued", "issued", "suspended", "revoked"];

export const REGISTRATION_TONE: Record<Attendee["registrationStatus"], Tone> = { submitted: "sky", confirmed: "emerald", cancelled: "gray" };
export const PAYMENT_TONE: Record<Attendee["payment"]["status"], Tone> = { paid: "teal", pending: "amber", free: "slate" };

/** Find an attendee by request ID, attendee ID or email (kiosk scan, API check). */
export function lookupAttendee(db: Database, code: string): Attendee | undefined {
  const q = code.trim().toLowerCase();
  if (!q) return undefined;
  const byRequest = Object.values(db.requests).find((r) => r.id.toLowerCase() === q);
  if (byRequest) return db.attendees[byRequest.attendeeId];
  return Object.values(db.attendees).find((a) => a.id.toLowerCase() === q || a.profile.email.toLowerCase() === q);
}

/**
 * 13.4: the read-only API response. Screening Hold is always reported as
 * Under Review and nothing about list matches is included.
 */
export function apiResponse(db: Database, attendee: Attendee) {
  const r = requestOf(db, attendee.id);
  const gate = badgeGate(db, attendee);
  return {
    attendeeId: attendee.id,
    vettingStatus: !r ? "not_required" : r.status === "screening_hold" ? "under_review" : r.status,
    badgeStatus: badgeStatus(db, attendee),
    badgeAllowed: gate.allowed,
  };
}

export type { BadgeBlock };
