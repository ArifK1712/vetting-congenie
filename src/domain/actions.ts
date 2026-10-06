import { evaluateCondition, readField } from "./conditions";
import { can, isTeamLead } from "./permissions";
import { canClaim } from "./queue";
import { routeStage } from "./routing";
import { screenProfile } from "./screening";
import { canTransition, FINAL_STATUSES } from "./status";
import { resolveAccess } from "./fieldAccess";
import type {
  Database,
  HistoryEvent,
  ID,
  RequestStatus,
  StageExecution,
  VettingRequest,
  WorkflowGraph,
} from "./types";
import { isWatchlistStage, nodeById, pendingWatchlistStage, resolvePath, stageOf, target, type StageNode } from "./workflow";

/**
 * Request actions (spec 8.3, 11). Each is a pure function: it validates
 * permissions, the request revision and the status transition, then returns
 * a new Database. Nothing is changed when a check fails.
 */

export type ActionError =
  | "invalidValue"
  | "blacklistConfirmed"
  | "notFound"
  | "stale"
  | "forbidden"
  | "notClaimable"
  | "claimedByOther"
  | "notClaimedByYou"
  | "claimLimit"
  | "sameReviewer"
  | "actionNotAllowed"
  | "reasonRequired"
  | "remarksRequired"
  | "invalidTarget"
  | "invalidAssignee"
  | "emptyComment";

export type FinalOutcome = "approved" | "limitReached" | "screeningHold";

export type ActionResult =
  | { ok: true; db: Database; outcome?: FinalOutcome | "nextStage" }
  | { ok: false; error: ActionError };

interface Base {
  requestId: ID;
  actorId: ID;
  /** The revision the actor was looking at; a mismatch means someone else acted first. */
  expectedRevision: number;
  now: number;
}

// ─── Copy-on-write transaction ──────────────────────────────────────────

export class Tx {
  db: Database;
  private copied = new Set<keyof Database>();
  private seq = 0;
  constructor(base: Database, private now: number) {
    this.db = { ...base };
  }
  private table<K extends keyof Database>(key: K): Database[K] {
    if (!this.copied.has(key)) {
      this.db[key] = { ...(this.db[key] as object) } as Database[K];
      this.copied.add(key);
    }
    return this.db[key];
  }
  id(prefix: string) {
    return `${prefix}_${this.now.toString(36)}${(++this.seq).toString(36)}`;
  }
  put<K extends "requests" | "stageExecutions" | "history" | "comments" | "allocations" | "outbox" | "matches" | "teams" | "teamHistory" | "blacklist" | "blacklistHistory" | "watchlist" | "watchlistHistory" | "attendees" | "infoRequests">(
    key: K,
    record: Database[K][string],
  ) {
    (this.table(key) as Record<ID, unknown>)[(record as { id: ID }).id] = record;
  }
  request(id: ID) {
    return this.db.requests[id];
  }
  updateRequest(r: VettingRequest, patch: Partial<VettingRequest>) {
    if (patch.status && patch.status !== r.status && !canTransition(r.status, patch.status)) {
      throw new Error(`Illegal transition ${r.status} → ${patch.status}`);
    }
    const next = { ...r, ...patch, revision: r.revision + 1 };
    this.put("requests", next);
    return next;
  }
  log(e: Omit<HistoryEvent, "id" | "at">) {
    this.put("history", { ...e, id: this.id("h"), at: new Date(this.now).toISOString() });
  }
  email(to: string, template: string, requestId: ID, params: Record<string, string> = {}) {
    this.put("outbox", { id: this.id("mail"), to, template, requestId, sentAt: new Date(this.now).toISOString(), params });
  }
}

const iso = (ms: number) => new Date(ms).toISOString();

export function openExecution(db: Database, requestId: ID): StageExecution | undefined {
  return Object.values(db.stageExecutions)
    .filter((e) => e.requestId === requestId && e.status !== "completed")
    .sort((a, b) => Date.parse(b.enteredAt) - Date.parse(a.enteredAt))[0];
}

export function graphOf(db: Database, r: VettingRequest): WorkflowGraph | null {
  return r.workflowVersionId ? (db.workflowVersions[r.workflowVersionId]?.graph ?? null) : null;
}

export function guard(db: Database, a: Base): { r: VettingRequest } | { error: ActionError } {
  const r = db.requests[a.requestId];
  if (!r) return { error: "notFound" };
  if (r.revision !== a.expectedRevision) return { error: "stale" };
  if (!db.users[a.actorId]?.active) return { error: "forbidden" };
  return { r };
}

/** The claimer may decide; everyone else is refused with a precise reason. */
export function guardDecision(db: Database, a: Base) {
  const g = guard(db, a);
  if ("error" in g) return g;
  const { r } = g;
  if (r.status !== "under_review" || r.awaitingCapacity) return { error: "actionNotAllowed" as const };
  if (r.claimedBy && r.claimedBy !== a.actorId) return { error: "claimedByOther" as const };
  if (r.claimedBy !== a.actorId) return { error: "notClaimedByYou" as const };
  const graph = graphOf(db, r);
  const stage = graph ? stageOf(graph, r.currentStageNodeId) : undefined;
  if (!graph || !stage) return { error: "actionNotAllowed" as const };
  return { r, graph, stage };
}

/** Requests currently claimed by a user within one team (for the per-reviewer cap). */
export function openClaims(db: Database, userId: ID, teamId: ID) {
  return Object.values(db.requests).filter((r) => r.claimedBy === userId && r.currentTeamId === teamId && r.status === "under_review").length;
}

/** Decision default (5.5): the same reviewer may not approve two stages of one request. */
export function approvedEarlierStage(db: Database, userId: ID, r: VettingRequest) {
  return Object.values(db.stageExecutions).some(
    (e) => e.requestId === r.id && e.assignedUserId === userId && e.outcome === "approve" && e.stageNodeId !== r.currentStageNodeId,
  );
}

// ─── Claim / release ────────────────────────────────────────────────────

export function claim(db: Database, a: Base): ActionResult {
  const g = guard(db, a);
  if ("error" in g) return { ok: false, error: g.error };
  const { r } = g;
  if (r.claimedBy && r.claimedBy !== a.actorId) return { ok: false, error: "claimedByOther" };
  if (!canClaim(db, a.actorId, r)) return { ok: false, error: "notClaimable" };
  const team = db.teams[r.currentTeamId!];
  if (openClaims(db, a.actorId, team.id) >= team.maxOpenClaims) return { ok: false, error: "claimLimit" };
  if (approvedEarlierStage(db, a.actorId, r)) return { ok: false, error: "sameReviewer" };

  const tx = new Tx(db, a.now);
  const exec = openExecution(db, r.id);
  if (exec) tx.put("stageExecutions", { ...exec, status: "claimed", assignedUserId: a.actorId, claimedAt: iso(a.now) });
  tx.updateRequest(r, { status: "under_review", claimedBy: a.actorId });
  tx.log({ requestId: r.id, action: "claimed", actorId: a.actorId, fromStatus: r.status, toStatus: "under_review", stageNodeId: r.currentStageNodeId ?? undefined });
  return { ok: true, db: tx.db };
}

export function release(db: Database, a: Base): ActionResult {
  const g = guard(db, a);
  if ("error" in g) return { ok: false, error: g.error };
  const { r } = g;
  const lead = r.currentTeamId ? isTeamLead(db, a.actorId, r.currentTeamId) : false;
  if (r.status !== "under_review" || r.awaitingCapacity) return { ok: false, error: "actionNotAllowed" };
  if (r.claimedBy !== a.actorId && !lead && !can(db, a.actorId, "queue.assign")) return { ok: false, error: "forbidden" };

  const tx = new Tx(db, a.now);
  const exec = openExecution(db, r.id);
  if (exec) tx.put("stageExecutions", { ...exec, status: "open", assignedUserId: null, claimedAt: null });
  tx.updateRequest(r, { status: "pending_review", claimedBy: null });
  tx.log({ requestId: r.id, action: "released", actorId: a.actorId, fromStatus: "under_review", toStatus: "pending_review" });
  return { ok: true, db: tx.db };
}

// ─── Moving between stages ──────────────────────────────────────────────

/** Follows edges from a node, evaluating condition nodes, until a stage or terminal node. */
export function resolveNext(db: Database, r: VettingRequest, graph: WorkflowGraph, fromId: ID, handle: string) {
  const attendee = db.attendees[r.attendeeId];
  let id = target(graph, fromId, handle);
  for (let guardSteps = 0; id && guardSteps < 20; guardSteps++) {
    const node = nodeById(graph, id);
    if (!node) return undefined;
    if (node.type !== "condition") return node;
    const branch = node.condition.branches.find((b) => evaluateCondition(b.condition, readField(b.condition.field, attendee, r)));
    id = target(graph, node.id, branch?.id ?? "otherwise");
  }
  return undefined;
}

export function enterStage(tx: Tx, r: VettingRequest, node: StageNode, status: RequestStatus, now: number) {
  const attendee = tx.db.attendees[r.attendeeId];
  const { teamId } = routeStage(tx.db, node.stage, r, attendee);
  tx.put("stageExecutions", {
    id: tx.id("se"),
    requestId: r.id,
    stageNodeId: node.id,
    stageName: node.stage.name,
    teamId: teamId!,
    assignedUserId: null,
    status: "open",
    enteredAt: iso(now),
    claimedAt: null,
    completedAt: null,
    outcome: null,
  });
  const next = tx.updateRequest(r, {
    status,
    currentStageNodeId: node.id,
    currentTeamId: teamId,
    claimedBy: null,
    stageEnteredAt: iso(now),
    responseReceived: false,
  });
  tx.log({ requestId: r.id, action: "routed", actorId: "system", stageNodeId: node.id, teamId: teamId ?? undefined });
  return next;
}

function completeExecution(tx: Tx, requestId: ID, outcome: StageExecution["outcome"], now: number) {
  const exec = openExecution(tx.db, requestId);
  if (exec) tx.put("stageExecutions", { ...exec, status: "completed", completedAt: iso(now), outcome });
}

/** What Approve will do, for the confirmation dialog. */
export function previewApprove(db: Database, r: VettingRequest):
  | { kind: "stage"; node: StageNode; teamId: ID | null }
  | { kind: "final"; used: number; limit: number }
  | null {
  const graph = graphOf(db, r);
  if (!graph || !r.currentStageNodeId) return null;
  const next = nextAfterApprove(db, r, graph);
  if (next?.type === "stage") {
    return { kind: "stage", node: next, teamId: routeStage(db, next.stage, r, db.attendees[r.attendeeId]).teamId };
  }
  if (next?.type === "final") {
    const reg = db.registrations[r.registrationId];
    return { kind: "final", used: placesUsed(db, reg.id), limit: reg.capacityLimit };
  }
  return null;
}

/**
 * Where Approve leads. The watchlist extra stage (10.3) slots in once just
 * before final approval, and always continues to final approval itself.
 */
function nextAfterApprove(db: Database, r: VettingRequest, graph: WorkflowGraph) {
  const final = graph.nodes.find((n) => n.type === "final");
  if (isWatchlistStage(r.currentStageNodeId)) return final;
  const next = resolveNext(db, r, graph, r.currentStageNodeId!, "approve");
  if (next?.type === "final") return pendingWatchlistStage(db, r, graph) ?? next;
  return next;
}

export function placesUsed(db: Database, registrationId: ID) {
  return Object.values(db.allocations).filter((x) => x.registrationId === registrationId && x.state === "held").length;
}

// ─── Approve / final approval ───────────────────────────────────────────

export function approve(db: Database, a: Base & { comment?: string }): ActionResult {
  const g = guardDecision(db, a);
  if ("error" in g) return { ok: false, error: g.error };
  const { r, graph, stage } = g;
  if (!stage.allowedActions.includes("approve")) return { ok: false, error: "actionNotAllowed" };
  if (approvedEarlierStage(db, a.actorId, r)) return { ok: false, error: "sameReviewer" };

  const tx = new Tx(db, a.now);
  completeExecution(tx, r.id, "approve", a.now);
  const next = nextAfterApprove(db, r, graph);
  const lastStage = next?.type !== "stage";
  tx.log({
    requestId: r.id,
    action: "approved_stage",
    actorId: a.actorId,
    stageNodeId: r.currentStageNodeId!,
    fromStatus: "under_review",
    toStatus: lastStage ? "under_review" : "pending_review",
    remarks: a.comment?.trim() || undefined,
  });

  if (next?.type === "stage") {
    enterStage(tx, tx.request(r.id), next, "pending_review", a.now);
    return { ok: true, db: tx.db, outcome: "nextStage" };
  }
  if (next?.type === "final") {
    const outcome = runFinalApproval(tx, tx.request(r.id), a.actorId, a.now);
    return { ok: true, db: tx.db, outcome };
  }
  return { ok: false, error: "actionNotAllowed" };
}

/** Retry final approval after capacity was full (11.3). */
export function retryFinalApproval(db: Database, a: Base): ActionResult {
  const g = guard(db, a);
  if ("error" in g) return { ok: false, error: g.error };
  const { r } = g;
  if (!r.awaitingCapacity) return { ok: false, error: "actionNotAllowed" };
  if (r.claimedBy !== a.actorId && !can(db, a.actorId, "queue.reviewAll")) return { ok: false, error: "forbidden" };
  const tx = new Tx(db, a.now);
  const outcome = runFinalApproval(tx, r, a.actorId, a.now);
  return { ok: true, db: tx.db, outcome };
}

/**
 * Section 11.1: re-screen, then take exactly one place, then issue the badge.
 * Capacity is idempotent per request (vetting_capacity_allocation.request_id
 * is unique), so a double click can never use two places.
 */
function runFinalApproval(tx: Tx, r: VettingRequest, actorId: ID, now: number): FinalOutcome {
  const db = tx.db;
  const attendee = db.attendees[r.attendeeId];

  // 1. Re-screen against current lists, skipping pairs already cleared.
  const cleared = new Set(
    Object.values(db.matches).filter((m) => m.requestId === r.id && m.status === "cleared").map((m) => m.entryId),
  );
  const known = new Set(Object.values(db.matches).filter((m) => m.requestId === r.id).map((m) => m.entryId));
  const hits = screenProfile(attendee.profile, r.eventId, Object.values(db.blacklist), Object.values(db.watchlist), cleared);
  for (const [listType, list] of [["blacklist", hits.blacklist], ["watchlist", hits.watchlist]] as const) {
    for (const m of list) {
      if (known.has(m.entryId)) continue;
      tx.put("matches", {
        id: tx.id("m"), requestId: r.id, listType, entryId: m.entryId, matchType: m.matchType, matchedField: m.matchedField,
        score: m.score, strength: m.strength, stagePoint: "final", status: "open", foundAt: iso(now),
        decidedBy: null, decidedAt: null, decisionNote: null,
      });
    }
  }
  const newWatch = hits.watchlist.filter((m) => !known.has(m.entryId));
  if (newWatch.length && r.screening !== "blacklist_hit") {
    const rank = { low: 1, medium: 2, high: 3 } as const;
    const levels = [...newWatch.map((m) => db.watchlist[m.entryId].level), ...(r.watchlistLevel ? [r.watchlistLevel] : [])];
    const top = levels.sort((a, b) => rank[b] - rank[a])[0];
    r = tx.updateRequest(r, { screening: "watchlist_hit", watchlistLevel: top });
  }
  const newBlacklist = hits.blacklist.filter((m) => !known.has(m.entryId));
  if (newBlacklist.length) {
    tx.updateRequest(r, { status: "screening_hold", screening: "blacklist_hit", claimedBy: null, awaitingCapacity: false, stageEnteredAt: iso(now) });
    tx.log({ requestId: r.id, action: "screening_hold", actorId: "system", fromStatus: r.status, toStatus: "screening_hold", meta: { stagePoint: "final" } });
    return "screeningHold";
  }

  // 2. Capacity.
  const reg = db.registrations[r.registrationId];
  const existing = Object.values(db.allocations).find((x) => x.requestId === r.id && x.state === "held");
  const used = placesUsed(db, reg.id);
  if (!existing && used >= reg.capacityLimit) {
    tx.updateRequest(r, { awaitingCapacity: true, claimedBy: r.claimedBy ?? actorId });
    tx.log({ requestId: r.id, action: "limit_reached", actorId: "system", remarks: `${used}/${reg.capacityLimit}` });
    return "limitReached";
  }
  if (!existing) {
    tx.put("allocations", { id: tx.id("cap"), requestId: r.id, registrationId: reg.id, state: "held", createdAt: iso(now) });
  }

  // 3. Approve and issue the badge (payment rules still apply).
  const badgeIssued = attendee.payment.status !== "pending";
  tx.updateRequest(r, {
    status: "approved",
    awaitingCapacity: false,
    decidedAt: iso(now),
    currentTeamId: null,
    claimedBy: null,
    badgeStatus: badgeIssued ? "issued" : "not_issued",
  });
  tx.log({
    requestId: r.id, action: "final_approved", actorId: "system", fromStatus: "under_review", toStatus: "approved",
    meta: { placesUsed: (existing ? used : used + 1), limit: reg.capacityLimit },
  });
  if (badgeIssued) tx.log({ requestId: r.id, action: "badge_issued", actorId: "system" });
  tx.email(attendee.profile.email, "approved", r.id, { name: attendee.profile.fullName, badge: badgeIssued ? "yes" : "pendingPayment" });
  return "approved";
}

// ─── Reject / escalate ──────────────────────────────────────────────────

export function reject(db: Database, a: Base & { reasonId: ID | null; comment?: string }): ActionResult {
  const g = guardDecision(db, a);
  if ("error" in g) return { ok: false, error: g.error };
  const { r, stage } = g;
  if (stage.rejectReasonRequired && !a.reasonId) return { ok: false, error: "reasonRequired" };

  const tx = new Tx(db, a.now);
  completeExecution(tx, r.id, "reject", a.now);
  tx.updateRequest(r, { status: "rejected", rejectReasonId: a.reasonId, decidedAt: iso(a.now), currentTeamId: null, claimedBy: null });
  tx.log({
    requestId: r.id, action: "rejected", actorId: a.actorId, stageNodeId: r.currentStageNodeId!, fromStatus: "under_review", toStatus: "rejected",
    remarks: a.comment?.trim() || undefined, meta: a.reasonId ? { reasonId: a.reasonId } : undefined,
  });
  // The attendee gets the registration's rejection email, never the internal reason (8.4).
  const attendee = db.attendees[r.attendeeId];
  tx.email(attendee.profile.email, "rejected", r.id, { name: attendee.profile.fullName });
  return { ok: true, db: tx.db };
}

export function escalate(db: Database, a: Base & { targetNodeId: ID; remarks: string }): ActionResult {
  const g = guardDecision(db, a);
  if ("error" in g) return { ok: false, error: g.error };
  const { r, graph, stage } = g;
  if (!stage.allowedActions.includes("escalate")) return { ok: false, error: "actionNotAllowed" };
  if (!a.remarks.trim()) return { ok: false, error: "remarksRequired" };
  const targetNode = nodeById(graph, a.targetNodeId);
  if (!stage.escalateTo.includes(a.targetNodeId) || targetNode?.type !== "stage") return { ok: false, error: "invalidTarget" };

  const tx = new Tx(db, a.now);
  completeExecution(tx, r.id, "escalate", a.now);
  tx.log({ requestId: r.id, action: "escalated", actorId: a.actorId, stageNodeId: r.currentStageNodeId!, fromStatus: "under_review", toStatus: "escalated", remarks: a.remarks.trim() });
  enterStage(tx, tx.request(r.id), targetNode, "escalated", a.now);
  return { ok: true, db: tx.db };
}

// ─── Assign / comment ───────────────────────────────────────────────────

export function canReassign(db: Database, actorId: ID, r: VettingRequest) {
  if (!r.currentTeamId || !["pending_review", "under_review", "escalated"].includes(r.status) || r.awaitingCapacity) return false;
  return can(db, actorId, "queue.assign") || isTeamLead(db, actorId, r.currentTeamId);
}

export function reassign(db: Database, a: Base & { toUserId: ID; reason: string }): ActionResult {
  const g = guard(db, a);
  if ("error" in g) return { ok: false, error: g.error };
  const { r } = g;
  if (!canReassign(db, a.actorId, r)) return { ok: false, error: "forbidden" };
  if (!a.reason.trim()) return { ok: false, error: "reasonRequired" };
  const team = db.teams[r.currentTeamId!];
  const assignee = db.users[a.toUserId];
  if (!assignee?.active || !team.members.some((m) => m.userId === a.toUserId) || a.toUserId === r.claimedBy) {
    return { ok: false, error: "invalidAssignee" };
  }
  if (approvedEarlierStage(db, a.toUserId, r)) return { ok: false, error: "sameReviewer" };

  const tx = new Tx(db, a.now);
  const exec = openExecution(db, r.id);
  if (exec) tx.put("stageExecutions", { ...exec, status: "claimed", assignedUserId: a.toUserId, claimedAt: iso(a.now) });
  tx.updateRequest(r, { status: "under_review", claimedBy: a.toUserId });
  tx.log({
    requestId: r.id, action: "reassigned", actorId: a.actorId, fromStatus: r.status, toStatus: "under_review",
    remarks: a.reason.trim(), meta: { from: r.claimedBy, to: a.toUserId },
  });
  return { ok: true, db: tx.db };
}

export function addComment(db: Database, a: Omit<Base, "expectedRevision"> & { body: string }): ActionResult {
  const r = db.requests[a.requestId];
  if (!r) return { ok: false, error: "notFound" };
  if (!a.body.trim()) return { ok: false, error: "emptyComment" };
  const tx = new Tx(db, a.now);
  tx.put("comments", { id: tx.id("c"), requestId: r.id, authorId: a.actorId, body: a.body.trim(), at: iso(a.now) });
  tx.log({ requestId: r.id, action: "commented", actorId: a.actorId });
  return { ok: true, db: tx.db };
}

// ─── Reviewer corrections, downloads, reopening ─────────────────────────

const SCREENED_PROFILE_FIELDS = new Set(["email", "mobile", "nationalId", "passportNo", "nationality", "dob", "company"]);
const LEVEL_RANK = { low: 1, medium: 2, high: 3 } as const;

/**
 * 5.6 / 15.2: a reviewer whose team has View & Edit corrects a field. The
 * registration is updated and the change logged; a field used for list
 * screening re-runs the blacklist and watchlist check (new matches only).
 */
export function correctField(db: Database, a: Base & { field: string; value: string | string[]; reason?: string }): ActionResult {
  const g = guard(db, a);
  if ("error" in g) return { ok: false, error: g.error };
  const { r } = g;
  if (FINAL_STATUSES.includes(r.status)) return { ok: false, error: "actionNotAllowed" };
  if (resolveAccess(db, a.actorId, r).resolve(a.field) !== "edit") return { ok: false, error: "forbidden" };
  const [source, key] = a.field.split(".");
  const value = Array.isArray(a.value) ? a.value.map((v) => v.trim()).filter(Boolean) : a.value.trim();
  if (!value.length) return { ok: false, error: "invalidValue" };
  if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string)) return { ok: false, error: "invalidValue" };
  if (key === "dob" && (!/^\d{4}-\d{2}-\d{2}$/.test(value as string) || Date.parse(value as string) > a.now)) return { ok: false, error: "invalidValue" };

  const attendee = db.attendees[r.attendeeId];
  const before = source === "profile" ? (attendee.profile as unknown as Record<string, string | undefined>)[key] : attendee.answers[key];
  if (JSON.stringify(before ?? "") === JSON.stringify(value)) return { ok: false, error: "invalidValue" };
  const next = source === "profile" ? { ...attendee, profile: { ...attendee.profile, [key]: value } } : { ...attendee, answers: { ...attendee.answers, [key]: value } };

  const tx = new Tx(db, a.now);
  tx.put("attendees", next);
  const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v ?? ""));
  tx.log({ requestId: r.id, action: "field_corrected", actorId: a.actorId, remarks: a.reason?.trim() || undefined, meta: { field: a.field, from: show(before), to: show(value) } });
  let current = tx.updateRequest(r, {});

  if (source === "profile" && SCREENED_PROFILE_FIELDS.has(key)) {
    const known = new Set(Object.values(db.matches).filter((m) => m.requestId === r.id).map((m) => m.entryId));
    const hits = screenProfile(next.profile, r.eventId, Object.values(db.blacklist), Object.values(db.watchlist), known);
    for (const [listType, list] of [["blacklist", hits.blacklist], ["watchlist", hits.watchlist]] as const) {
      for (const m of list) {
        tx.put("matches", {
          id: tx.id("m"), requestId: r.id, listType, entryId: m.entryId, matchType: m.matchType, matchedField: m.matchedField,
          score: m.score, strength: m.strength, stagePoint: "resubmission", status: "open", foundAt: iso(a.now),
          decidedBy: null, decidedAt: null, decisionNote: null,
        });
      }
    }
    tx.log({ requestId: r.id, action: "screened", actorId: "system", meta: { blacklist: hits.blacklist.length, watchlist: hits.watchlist.length } });
    if (hits.blacklist.length && canTransition(current.status, "screening_hold")) {
      const exec = openExecution(tx.db, r.id);
      if (exec) tx.put("stageExecutions", { ...exec, status: "open", assignedUserId: null, claimedAt: null });
      tx.log({ requestId: r.id, action: "screening_hold", actorId: "system", fromStatus: current.status, toStatus: "screening_hold" });
      current = tx.updateRequest(current, { status: "screening_hold", screening: "blacklist_hit", claimedBy: null, stageEnteredAt: iso(a.now) });
      return { ok: true, db: tx.db, outcome: "screeningHold" };
    }
    if (hits.watchlist.length && current.screening !== "blacklist_hit") {
      const levels = [...hits.watchlist.map((m) => db.watchlist[m.entryId].level), ...(current.watchlistLevel ? [current.watchlistLevel] : [])];
      tx.updateRequest(current, { screening: "watchlist_hit", watchlistLevel: levels.sort((x, y) => LEVEL_RANK[y] - LEVEL_RANK[x])[0] });
    }
  }
  return { ok: true, db: tx.db };
}

/** 8.2 / 15.3: every download is logged. Only teams with View & Download may download. */
export function logDownload(db: Database, a: { requestId: ID; actorId: ID; documentId: ID; now: number }): ActionResult {
  const r = db.requests[a.requestId];
  if (!r) return { ok: false, error: "notFound" };
  const doc = db.attendees[r.attendeeId].documents.find((d) => d.id === a.documentId);
  if (!doc) return { ok: false, error: "notFound" };
  const level = resolveAccess(db, a.actorId, r).resolve(doc.questionId.startsWith("info.") ? "moreInfo" : `document.${doc.questionId}`);
  if (level !== "download" && !(doc.questionId.startsWith("info.") && level !== "hidden")) return { ok: false, error: "forbidden" };
  const tx = new Tx(db, a.now);
  tx.log({ requestId: r.id, action: "document_downloaded", actorId: a.actorId, meta: { file: doc.fileName } });
  return { ok: true, db: tx.db };
}

/**
 * Status rules (17): a rejected request can be reopened only by a Review All
 * user, with a reason that is logged. It goes back to the stage where it was
 * rejected as Pending Review. A confirmed blacklist rejection stays closed.
 */
export function reopenRequest(db: Database, a: Base & { reason: string }): ActionResult {
  const g = guard(db, a);
  if ("error" in g) return { ok: false, error: g.error };
  const { r } = g;
  if (!can(db, a.actorId, "queue.reviewAll")) return { ok: false, error: "forbidden" };
  if (r.status !== "rejected") return { ok: false, error: "actionNotAllowed" };
  if (!a.reason.trim()) return { ok: false, error: "reasonRequired" };
  if (Object.values(db.matches).some((m) => m.requestId === r.id && m.listType === "blacklist" && m.status === "confirmed")) {
    return { ok: false, error: "blacklistConfirmed" };
  }
  const graph = graphOf(db, r);
  if (!graph) return { ok: false, error: "actionNotAllowed" };
  const node = (nodeById(graph, r.currentStageNodeId) ?? resolvePath(graph)[0]) as StageNode | undefined;
  if (node?.type !== "stage") return { ok: false, error: "actionNotAllowed" };
  const tx = new Tx(db, a.now);
  tx.log({ requestId: r.id, action: "reopened", actorId: a.actorId, fromStatus: "rejected", toStatus: "pending_review", remarks: a.reason.trim() });
  const cleared = tx.updateRequest(r, { rejectReasonId: null, decidedAt: null });
  enterStage(tx, cleared, node, "pending_review", a.now);
  return { ok: true, db: tx.db };
}
