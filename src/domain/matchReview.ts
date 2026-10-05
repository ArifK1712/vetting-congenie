import { enterStage, graphOf, openExecution, Tx } from "./actions";
import { can } from "./permissions";
import { FINAL_STATUSES, OPEN_STATUSES } from "./status";
import type { Database, ID, ScreeningMatch, VettingRequest, WatchlistLevel } from "./types";
import { nodeById, requestPath, type StageNode } from "./workflow";

/**
 * Match Review (spec 9.5). A user with Blacklist Approve decides each open
 * blacklist match: Confirm rejects the request with reason "Blacklisted"
 * (or revokes a suspended badge); Not the same person sends it back to its
 * stage and the pair never matches again.
 */

const HOUR = 3_600_000;
const STRENGTH_RANK = { id: 0, company: 1, nameDob: 2, name: 3 } as const;

export interface ReviewCase {
  match: ScreeningMatch;
  request: VettingRequest;
  /** Other open blacklist matches on the same request. */
  others: number;
  kind: "hold" | "badge" | "inProgress";
  waitingMs: number;
}

/** A match still needs a decision while its request is live (held, in progress, or approved with a suspended badge). */
function live(r: VettingRequest) {
  return r.status === "screening_hold" || OPEN_STATUSES.includes(r.status) || (r.status === "approved" && r.badgeStatus === "suspended");
}

export function reviewQueue(db: Database, now: number): ReviewCase[] {
  const open = Object.values(db.matches).filter((m) => m.listType === "blacklist" && m.status === "open");
  const perRequest = new Map<ID, number>();
  for (const m of open) perRequest.set(m.requestId, (perRequest.get(m.requestId) ?? 0) + 1);
  return open
    .map((match): ReviewCase | null => {
      const request = db.requests[match.requestId];
      if (!request || !live(request)) return null;
      return {
        match,
        request,
        others: (perRequest.get(match.requestId) ?? 1) - 1,
        kind: request.status === "approved" ? "badge" : request.status === "screening_hold" ? "hold" : "inProgress",
        waitingMs: now - Date.parse(match.foundAt),
      };
    })
    .filter((c): c is ReviewCase => !!c)
    .sort((a, b) => STRENGTH_RANK[a.match.matchType] - STRENGTH_RANK[b.match.matchType] || b.waitingMs - a.waitingMs);
}

export function decidedRecently(db: Database, now: number, days = 7) {
  return Object.values(db.matches)
    .filter((m) => m.listType === "blacklist" && m.status !== "open" && m.decidedAt && now - Date.parse(m.decidedAt) < days * 24 * HOUR)
    .sort((a, b) => b.decidedAt!.localeCompare(a.decidedAt!));
}

// ─── Actions ────────────────────────────────────────────────────────────

export type ReviewError = "forbidden" | "notFound" | "notOpen" | "noteRequired" | "stale";

export type ReviewResult = { ok: true; db: Database; requestId: ID; outcome: "rejected" | "badgeRevoked" | "backToStage" | "stillHeld" | "badgeRestored" | "recorded" } | { ok: false; error: ReviewError };

interface Base {
  matchId: ID;
  actorId: ID;
  /** The request revision the reviewer was looking at. */
  expectedRevision: number;
  now: number;
}

function guard(db: Database, a: Base) {
  if (!can(db, a.actorId, "blacklist.approve")) return { error: "forbidden" as const };
  const m = db.matches[a.matchId];
  if (!m || m.listType !== "blacklist") return { error: "notFound" as const };
  if (m.status !== "open") return { error: "notOpen" as const };
  const r = db.requests[m.requestId];
  if (!r) return { error: "notFound" as const };
  if (r.revision !== a.expectedRevision) return { error: "stale" as const };
  return { m, r };
}

const iso = (ms: number) => new Date(ms).toISOString();
const RANK: Record<WatchlistLevel, number> = { low: 1, medium: 2, high: 3 };

/** Screening flag after a decision: any open blacklist match wins, then the highest open watchlist level. */
function screeningAfter(db: Database, requestId: ID): Pick<VettingRequest, "screening" | "watchlistLevel"> {
  const open = Object.values(db.matches).filter((m) => m.requestId === requestId && m.status === "open");
  if (open.some((m) => m.listType === "blacklist")) return { screening: "blacklist_hit", watchlistLevel: db.requests[requestId].watchlistLevel };
  let level: WatchlistLevel | null = null;
  for (const m of open) {
    const e = m.listType === "watchlist" ? db.watchlist[m.entryId] : null;
    if (e?.status === "active" && (!level || RANK[e.level] > RANK[level])) level = e.level;
  }
  return { screening: level ? "watchlist_hit" : "clear", watchlistLevel: level };
}

/** Confirm: the same person. The request is rejected as Blacklisted; a suspended badge is revoked. */
export function confirmMatch(db: Database, a: Base & { note: string }): ReviewResult {
  const g = guard(db, a);
  if ("error" in g) return { ok: false, error: g.error! };
  const { m, r } = g;
  const tx = new Tx(db, a.now);
  tx.put("matches", { ...m, status: "confirmed", decidedBy: a.actorId, decidedAt: iso(a.now), decisionNote: a.note.trim() || "Identity confirmed against the entry." });
  const attendee = db.attendees[r.attendeeId];

  if (r.status === "approved") {
    tx.updateRequest(r, { badgeStatus: "revoked" });
    for (const al of Object.values(db.allocations)) if (al.requestId === r.id && al.state === "held") tx.put("allocations", { ...al, state: "released" });
    tx.log({ requestId: r.id, action: "match_confirmed", actorId: a.actorId, remarks: a.note.trim() || undefined, meta: { entryId: m.entryId, badge: "revoked" } });
    return { ok: true, db: tx.db, requestId: r.id, outcome: "badgeRevoked" };
  }
  if (FINAL_STATUSES.includes(r.status)) return { ok: true, db: tx.db, requestId: r.id, outcome: "recorded" };

  const exec = openExecution(db, r.id);
  if (exec) tx.put("stageExecutions", { ...exec, status: "completed", completedAt: iso(a.now), outcome: "reject" });
  // A confirmed blacklist match ends the request from any open status (9.5), so the
  // status is written directly rather than through the reviewer transition table.
  tx.put("requests", {
    ...r,
    status: "rejected",
    rejectReasonId: "rr_blacklisted",
    screening: "blacklist_hit",
    decidedAt: iso(a.now),
    currentTeamId: null,
    claimedBy: null,
    awaitingCapacity: false,
    revision: r.revision + 1,
  });
  tx.log({ requestId: r.id, action: "match_confirmed", actorId: a.actorId, fromStatus: r.status, toStatus: "rejected", remarks: a.note.trim() || undefined, meta: { entryId: m.entryId } });
  // The attendee gets the registration's normal rejection email, never the reason (9.5).
  tx.email(attendee.profile.email, "rejected", r.id, { name: attendee.profile.fullName });
  return { ok: true, db: tx.db, requestId: r.id, outcome: "rejected" };
}

/** Not the same person: the pair never matches again; the request goes back to its stage once nothing else holds it. */
export function clearMatch(db: Database, a: Base & { note: string }): ReviewResult {
  const g = guard(db, a);
  if ("error" in g) return { ok: false, error: g.error! };
  if (!a.note.trim()) return { ok: false, error: "noteRequired" };
  const { m, r } = g;
  const tx = new Tx(db, a.now);
  tx.put("matches", { ...m, status: "cleared", decidedBy: a.actorId, decidedAt: iso(a.now), decisionNote: a.note.trim() });
  const flags = screeningAfter(tx.db, r.id);
  const stillHeld = flags.screening === "blacklist_hit";

  if (r.status === "approved") {
    const restore = !stillHeld && r.badgeStatus === "suspended";
    tx.updateRequest(r, { ...flags, ...(restore ? { badgeStatus: "issued" as const } : {}) });
    tx.log({ requestId: r.id, action: "match_cleared", actorId: a.actorId, remarks: a.note.trim(), meta: { entryId: m.entryId, badge: restore ? "restored" : "suspended" } });
    return { ok: true, db: tx.db, requestId: r.id, outcome: restore ? "badgeRestored" : "stillHeld" };
  }

  if (r.status !== "screening_hold" || stillHeld) {
    tx.updateRequest(r, flags);
    tx.log({ requestId: r.id, action: "match_cleared", actorId: a.actorId, remarks: a.note.trim(), meta: { entryId: m.entryId } });
    return { ok: true, db: tx.db, requestId: r.id, outcome: stillHeld ? "stillHeld" : "recorded" };
  }

  // Back to its stage. A request held at registration was never routed, so it enters its stage now.
  tx.log({ requestId: r.id, action: "match_cleared", actorId: a.actorId, fromStatus: "screening_hold", toStatus: "pending_review", remarks: a.note.trim(), meta: { entryId: m.entryId } });
  const graph = graphOf(db, r);
  const exec = openExecution(db, r.id);
  if (exec || !graph) {
    if (exec) tx.put("stageExecutions", { ...exec, status: "open", assignedUserId: null, claimedAt: null });
    tx.updateRequest(r, { ...flags, status: "pending_review", claimedBy: null, stageEnteredAt: iso(a.now) });
  } else {
    const node = (nodeById(graph, r.currentStageNodeId) ?? requestPath(graph, db.attendees[r.attendeeId], r)[0]) as StageNode | undefined;
    const updated = tx.updateRequest(r, flags);
    if (node?.type === "stage") enterStage(tx, updated, node, "pending_review", a.now);
    else tx.updateRequest(updated, { status: "pending_review", stageEnteredAt: iso(a.now) });
  }
  return { ok: true, db: tx.db, requestId: r.id, outcome: "backToStage" };
}
