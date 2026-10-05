import { fieldKey, resolveAccess } from "./fieldAccess";
import { can, teamsOfUser } from "./permissions";
import { normalizeName } from "./screening";
import { OPEN_STATUSES, STATUS_ORDER, visibleStatus } from "./status";
import { stageOf } from "./workflow";
import type { Database, ID, LocalizedText, RequestStatus, VettingRequest, WatchlistLevel } from "./types";

export type ScreeningDisplay = "clear" | "blacklist" | "hit" | "watchlist";

export interface QueueRow {
  id: ID;
  applicantName: string;
  applicantNameAr?: string;
  applicantEmail?: string;
  eventId: ID;
  registrationId: ID;
  badgeTypeId: ID;
  workflowId: ID | null;
  workflowLabel: LocalizedText | null;
  workflowVersionNo: number | null;
  stageNodeId: ID | null;
  stageName: LocalizedText | null;
  teamId: ID | null;
  claimedBy: ID | null;
  screening: ScreeningDisplay;
  watchlistLevel: WatchlistLevel | null;
  status: RequestStatus;
  submittedAt: string;
  stageEnteredAt: string;
  decidedAt: string | null;
  waitingMs: number;
  timeLimitHours: number | null;
  late: boolean;
  responseReceived: boolean;
  awaitingCapacity: boolean;
  searchText: string;
}

const HOUR = 3_600_000;
const WAITING_STATUSES: RequestStatus[] = ["pending_review", "under_review", "escalated"];

export function requestTimeLimit(db: Database, r: VettingRequest): number | null {
  const version = r.workflowVersionId ? db.workflowVersions[r.workflowVersionId] : undefined;
  return (version && stageOf(version.graph, r.currentStageNodeId)?.timeLimitHours) ?? null;
}

export function isLate(db: Database, r: VettingRequest, now: number): boolean {
  // Waiting on capacity is not a reviewer delay.
  if (!WAITING_STATUSES.includes(r.status) || r.awaitingCapacity) return false;
  const limit = requestTimeLimit(db, r);
  return limit !== null && now - Date.parse(r.stageEnteredAt) > limit * HOUR;
}

/**
 * Requests this viewer may see in the Review Queue (section 8):
 * Review All sees everything in scope; others see requests their teams
 * handle now or handled before. Screening Hold requests leave team queues
 * entirely (AC06) unless the viewer holds Blacklist View.
 */
export function visibleRequestsFor(db: Database, viewerId: ID, eventScope: ID | "all"): VettingRequest[] {
  const reviewAll = can(db, viewerId, "queue.reviewAll");
  const seesBlacklist = can(db, viewerId, "blacklist.view");
  if (!can(db, viewerId, "queue.access") && !reviewAll) return [];
  const myTeams = new Set(teamsOfUser(db, viewerId).map((t) => t.id));

  const pastTeamsByRequest = new Map<ID, Set<ID>>();
  if (!reviewAll) {
    for (const e of Object.values(db.stageExecutions)) {
      if (!myTeams.has(e.teamId)) continue;
      if (!pastTeamsByRequest.has(e.requestId)) pastTeamsByRequest.set(e.requestId, new Set());
      pastTeamsByRequest.get(e.requestId)!.add(e.teamId);
    }
  }

  return Object.values(db.requests).filter((r) => {
    if (eventScope !== "all" && r.eventId !== eventScope) return false;
    if (r.status === "screening_hold" && !seesBlacklist) return false;
    if (reviewAll) return true;
    if (r.currentTeamId && myTeams.has(r.currentTeamId)) return true;
    return pastTeamsByRequest.has(r.id);
  });
}

export function buildQueueRows(db: Database, viewerId: ID, eventScope: ID | "all", now: number): QueueRow[] {
  const seesBlacklist = can(db, viewerId, "blacklist.view");
  return visibleRequestsFor(db, viewerId, eventScope).map((r) => {
    const attendee = db.attendees[r.attendeeId];
    const { resolve } = resolveAccess(db, viewerId, r);
    const version = r.workflowVersionId ? db.workflowVersions[r.workflowVersionId] : undefined;
    const workflow = r.workflowId ? db.workflows[r.workflowId] : undefined;
    const stage = version ? stageOf(version.graph, r.currentStageNodeId) : undefined;
    const email = resolve(fieldKey.profile("email")) !== "hidden" ? attendee.profile.email : undefined;
    const nationalId = resolve(fieldKey.profile("nationalId")) !== "hidden" ? attendee.profile.nationalId : undefined;
    const passport = resolve(fieldKey.profile("passportNo")) !== "hidden" ? attendee.profile.passportNo : undefined;

    const screening: ScreeningDisplay =
      r.screening === "blacklist_hit"
        ? seesBlacklist
          ? "blacklist"
          : "hit"
        : r.screening === "watchlist_hit"
          ? "watchlist"
          : "clear";

    return {
      id: r.id,
      applicantName: attendee.profile.fullName,
      applicantNameAr: attendee.profile.fullNameAr,
      applicantEmail: email,
      eventId: r.eventId,
      registrationId: r.registrationId,
      badgeTypeId: r.badgeTypeId,
      workflowId: r.workflowId,
      workflowLabel: workflow?.label ?? null,
      workflowVersionNo: version?.versionNo ?? null,
      stageNodeId: r.currentStageNodeId,
      stageName: stage?.name ?? null,
      teamId: r.currentTeamId,
      claimedBy: r.claimedBy,
      screening,
      watchlistLevel: r.watchlistLevel,
      status: visibleStatus(r.status, seesBlacklist),
      submittedAt: r.submittedAt,
      stageEnteredAt: r.stageEnteredAt,
      decidedAt: r.decidedAt,
      waitingMs: Math.max(0, (r.decidedAt ? Date.parse(r.decidedAt) : now) - Date.parse(r.submittedAt)),
      timeLimitHours: stage?.timeLimitHours ?? null,
      late: isLate(db, r, now),
      responseReceived: r.responseReceived,
      awaitingCapacity: r.awaitingCapacity,
      searchText: [
        r.id,
        normalizeName(attendee.profile.fullName),
        attendee.profile.fullNameAr ?? "",
        email ?? "",
        nationalId ?? "",
        passport ?? "",
      ]
        .join(" ")
        .toLowerCase(),
    };
  });
}

/** A reviewer can claim an unclaimed, waiting request of a team they belong to. */
export function canClaim(db: Database, viewerId: ID, r: Pick<VettingRequest, "status" | "claimedBy" | "currentTeamId">): boolean {
  if (!can(db, viewerId, "queue.access")) return false;
  if (r.status !== "pending_review" && r.status !== "escalated") return false;
  if (r.claimedBy) return false;
  return !!r.currentTeamId && !!db.teams[r.currentTeamId]?.members.some((m) => m.userId === viewerId);
}

// ─── Filtering ──────────────────────────────────────────────────────────

export type SubmittedRange = "any" | "today" | "7d" | "30d";
export type AssignedFilter = "anyone" | "me" | "nobody";

export interface QueueFilters {
  search: string;
  statuses: RequestStatus[];
  teamIds: ID[];
  stageNodeIds: ID[];
  registrationIds: ID[];
  badgeTypeIds: ID[];
  workflowIds: ID[];
  screening: ScreeningDisplay[];
  assigned: AssignedFilter;
  submitted: SubmittedRange;
}

export const OPEN_VIEW: RequestStatus[] = OPEN_STATUSES;

export const EMPTY_FILTERS: QueueFilters = {
  search: "",
  statuses: OPEN_VIEW,
  teamIds: [],
  stageNodeIds: [],
  registrationIds: [],
  badgeTypeIds: [],
  workflowIds: [],
  screening: [],
  assigned: "anyone",
  submitted: "any",
};

function matchesExceptStatus(row: QueueRow, f: QueueFilters, viewerId: ID, now: number): boolean {
  const inList = <T,>(list: T[], v: T | null) => list.length === 0 || (v !== null && list.includes(v));
  if (!inList(f.teamIds, row.teamId)) return false;
  if (!inList(f.stageNodeIds, row.stageNodeId)) return false;
  if (!inList(f.registrationIds, row.registrationId)) return false;
  if (!inList(f.badgeTypeIds, row.badgeTypeId)) return false;
  if (!inList(f.workflowIds, row.workflowId)) return false;
  if (f.screening.length) {
    const key = row.screening === "hit" ? "blacklist" : row.screening;
    if (!f.screening.includes(key)) return false;
  }
  if (f.assigned === "me" && row.claimedBy !== viewerId) return false;
  if (f.assigned === "nobody" && row.claimedBy !== null) return false;
  if (f.submitted !== "any") {
    const age = now - Date.parse(row.submittedAt);
    const max = f.submitted === "today" ? 24 * HOUR : f.submitted === "7d" ? 7 * 24 * HOUR : 30 * 24 * HOUR;
    if (age > max) return false;
  }
  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    const qn = normalizeName(q);
    if (!row.searchText.includes(q) && !(qn && row.searchText.includes(qn))) return false;
  }
  return true;
}

/** Late requests first, then oldest first (8.1). */
export function sortQueue(rows: QueueRow[]): QueueRow[] {
  return [...rows].sort((a, b) => {
    if (a.late !== b.late) return a.late ? -1 : 1;
    return Date.parse(a.submittedAt) - Date.parse(b.submittedAt);
  });
}

export function applyQueueFilters(rows: QueueRow[], f: QueueFilters, viewerId: ID, now: number) {
  const base = rows.filter((r) => matchesExceptStatus(r, f, viewerId, now));
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<RequestStatus, number>;
  const late = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<RequestStatus, number>;
  for (const r of base) {
    counts[r.status]++;
    if (r.late) late[r.status]++;
  }
  const filtered = f.statuses.length ? base.filter((r) => f.statuses.includes(r.status)) : base;
  return { rows: sortQueue(filtered), counts, late, total: base.length };
}
