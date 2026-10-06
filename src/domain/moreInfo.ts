import { enterStage, graphOf, guard, guardDecision, openExecution, Tx, type ActionResult } from "./actions";
import { can } from "./permissions";
import { screenProfile, thresholdsOf } from "./screening";
import type { Database, ID, InfoQuestion, InfoRequest, QuestionType, VettingRequest, WatchlistLevel } from "./types";
import { nodeById, type StageNode } from "./workflow";

/**
 * Ask for more information (spec 8.5). The reviewer sends instructions and up
 * to 10 questions; the attendee answers through a one-time link valid for
 * 7 days; the request then goes back to the chosen stage as Pending Review,
 * marked "Response received". Up to 3 rounds per request.
 */

export const MAX_ROUNDS = 3;
export const MAX_QUESTIONS = 10;
/** Spec default; the company can change it in Settings (db.config.moreInfo.linkDays). */
export const LINK_DAYS = 7;
const linkDays = (db: Database) => db.config?.moreInfo.linkDays ?? LINK_DAYS;
const reminderMs = (db: Database) => (db.config?.moreInfo.reminderHours ?? 24) * 3_600_000;
export const UPLOAD_MAX_KB = 5 * 1024;
export const UPLOAD_TYPES = ["pdf", "jpg", "jpeg", "png"];
export const QUESTION_TYPES: QuestionType[] = ["text", "longText", "number", "date", "singleChoice", "multiChoice", "upload"];
/** Registration fields an answer may update (15.2). */
export const MAPPABLE_FIELDS = ["email", "mobile", "nationalId", "passportNo", "nationality", "dob", "company", "jobTitle"] as const;

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

export type LinkState = "open" | "answered" | "expired";

export function linkState(ir: InfoRequest, now: number): LinkState {
  if (ir.status === "answered") return "answered";
  if (ir.status === "expired" || Date.parse(ir.tokenExpiresAt) <= now) return "expired";
  return "open";
}

export const roundsOf = (db: Database, requestId: ID) => Object.values(db.infoRequests).filter((i) => i.requestId === requestId);

export function findByToken(db: Database, token: string): InfoRequest | undefined {
  return token ? Object.values(db.infoRequests).find((i) => i.token === token) : undefined;
}

/** A link that is hard to guess but stable in tests. */
function newToken(tx: Tx, r: VettingRequest, round: number, now: number) {
  let h = 2166136261;
  for (const ch of `${r.id}:${round}:${now}:${tx.id("tk")}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return `${r.id.toLowerCase()}-r${round}-${(h >>> 0).toString(36)}${now.toString(36).slice(-4)}`;
}

// ─── Ask ────────────────────────────────────────────────────────────────

export type InfoIssue = "instructionsRequired" | "noQuestions" | "tooManyQuestions" | "labelRequired" | "optionsRequired" | "maxRounds" | "badReturnStage";

export function validateAsk(db: Database, r: VettingRequest, a: { instructions: string; questions: InfoQuestion[]; returnToNodeId: ID }): InfoIssue[] {
  const issues: InfoIssue[] = [];
  if (!a.instructions.trim()) issues.push("instructionsRequired");
  if (!a.questions.length) issues.push("noQuestions");
  if (a.questions.length > MAX_QUESTIONS) issues.push("tooManyQuestions");
  if (a.questions.some((q) => !q.label.trim())) issues.push("labelRequired");
  if (a.questions.some((q) => (q.type === "singleChoice" || q.type === "multiChoice") && (q.options ?? []).filter((o) => o.trim()).length < 2)) issues.push("optionsRequired");
  if (roundsOf(db, r.id).length >= MAX_ROUNDS) issues.push("maxRounds");
  const graph = graphOf(db, r);
  if (!graph || nodeById(graph, a.returnToNodeId)?.type !== "stage") issues.push("badReturnStage");
  return issues;
}

export function askMoreInfo(
  db: Database,
  a: { requestId: ID; actorId: ID; expectedRevision: number; now: number; instructions: string; questions: InfoQuestion[]; returnToNodeId: ID },
): ActionResult & { infoRequestId?: ID } {
  const g = guardDecision(db, a);
  if ("error" in g) return { ok: false, error: g.error! };
  const { r, stage } = g;
  if (!stage.allowedActions.includes("moreInfo")) return { ok: false, error: "actionNotAllowed" };
  if (validateAsk(db, r, a).length) return { ok: false, error: "invalidValue" };

  const tx = new Tx(db, a.now);
  const exec = openExecution(db, r.id);
  if (exec) tx.put("stageExecutions", { ...exec, status: "completed", completedAt: iso(a.now), outcome: "moreInfo" });
  const round = roundsOf(db, r.id).length + 1;
  const info: InfoRequest = {
    id: tx.id("ir"),
    requestId: r.id,
    round,
    stageNodeId: r.currentStageNodeId!,
    requestedBy: a.actorId,
    instructions: a.instructions.trim(),
    questions: a.questions.map((q, i) => ({
      ...q,
      id: q.id || `q${i + 1}`,
      label: q.label.trim(),
      options: q.options?.map((o) => o.trim()).filter(Boolean),
      mapsTo: q.type === "upload" ? null : (q.mapsTo ?? null),
    })),
    answers: null,
    status: "sent",
    token: newToken(tx, r, round, a.now),
    returnToNodeId: a.returnToNodeId,
    remindedAt: null,
    tokenExpiresAt: iso(a.now + linkDays(db) * DAY),
    sentAt: iso(a.now),
    answeredAt: null,
  };
  tx.put("infoRequests", info);
  tx.updateRequest(r, { status: "more_info_required", claimedBy: null, responseReceived: false, stageEnteredAt: iso(a.now) });
  tx.log({ requestId: r.id, action: "more_info_requested", actorId: a.actorId, stageNodeId: r.currentStageNodeId!, fromStatus: "under_review", toStatus: "more_info_required", meta: { round } });
  const attendee = db.attendees[r.attendeeId];
  tx.email(attendee.profile.email, "more_info", r.id, { name: attendee.profile.fullName, token: info.token, expires: info.tokenExpiresAt });
  return { ok: true, db: tx.db, infoRequestId: info.id };
}

// ─── Resend ─────────────────────────────────────────────────────────────

/** 8.5 point 5: the reviewer sends a new link; the old one stops working. */
export function resendLink(db: Database, a: { requestId: ID; actorId: ID; expectedRevision: number; now: number; infoRequestId: ID }): ActionResult {
  const g = guard(db, a);
  if ("error" in g) return { ok: false, error: g.error! };
  const { r } = g;
  const ir = db.infoRequests[a.infoRequestId];
  if (!ir || ir.requestId !== r.id) return { ok: false, error: "notFound" };
  if (r.status !== "more_info_required" || ir.status === "answered") return { ok: false, error: "actionNotAllowed" };
  const inTeam = !!r.currentTeamId && !!db.teams[r.currentTeamId]?.members.some((m) => m.userId === a.actorId);
  if (!inTeam && !can(db, a.actorId, "queue.reviewAll")) return { ok: false, error: "forbidden" };

  const tx = new Tx(db, a.now);
  const next: InfoRequest = { ...ir, status: "sent", token: newToken(tx, r, ir.round, a.now), tokenExpiresAt: iso(a.now + linkDays(db) * DAY), remindedAt: null };
  tx.put("infoRequests", next);
  tx.updateRequest(r, {});
  tx.log({ requestId: r.id, action: "more_info_requested", actorId: a.actorId, remarks: "link_resent", meta: { round: ir.round, resent: true } });
  const attendee = db.attendees[r.attendeeId];
  tx.email(attendee.profile.email, "more_info", r.id, { name: attendee.profile.fullName, token: next.token, expires: next.tokenExpiresAt, resent: "yes" });
  return { ok: true, db: tx.db };
}

/** 16: "Link ends in 24 hours" reminder (hours set in Settings), sent once per link. Run whenever the app loads. */
export function sendDueReminders(db: Database, now: number): Database | null {
  const due = Object.values(db.infoRequests).filter((i) => i.status === "sent" && !i.remindedAt && Date.parse(i.tokenExpiresAt) > now && Date.parse(i.tokenExpiresAt) - now <= reminderMs(db));
  if (!due.length) return null;
  const tx = new Tx(db, now);
  for (const ir of due) {
    const r = db.requests[ir.requestId];
    if (r?.status !== "more_info_required") continue;
    const attendee = db.attendees[r.attendeeId];
    tx.put("infoRequests", { ...ir, remindedAt: iso(now) });
    tx.email(attendee.profile.email, "more_info_reminder", r.id, { name: attendee.profile.fullName, token: ir.token, expires: ir.tokenExpiresAt });
  }
  return tx.db;
}

// ─── Attendee answers ───────────────────────────────────────────────────

export type AnswerValue = string | string[] | { fileName: string; sizeKb: number };

export type SubmitError = "notFound" | "expired" | "used" | "missing" | "badFile" | "badValue";

export type SubmitResult = { ok: true; db: Database; requestId: ID } | { ok: false; error: SubmitError; questionId?: ID };

const RANK: Record<WatchlistLevel, number> = { low: 1, medium: 2, high: 3 };

export function submitAnswers(db: Database, a: { token: string; answers: Record<ID, AnswerValue>; now: number }): SubmitResult {
  const ir = findByToken(db, a.token);
  if (!ir) return { ok: false, error: "notFound" };
  const state = linkState(ir, a.now);
  if (state === "answered") return { ok: false, error: "used" };
  if (state === "expired") return { ok: false, error: "expired" };
  const r = db.requests[ir.requestId];
  if (!r || r.status !== "more_info_required") return { ok: false, error: "used" };

  // Validate every question.
  const stored: Record<ID, string | string[]> = {};
  for (const q of ir.questions) {
    const v = a.answers[q.id];
    const empty = v === undefined || v === "" || (Array.isArray(v) && !v.length);
    if (empty) {
      if (q.required) return { ok: false, error: "missing", questionId: q.id };
      continue;
    }
    if (q.type === "upload") {
      if (typeof v !== "object" || Array.isArray(v) || !UPLOAD_TYPES.includes(v.fileName.split(".").pop()?.toLowerCase() ?? "") || v.sizeKb > UPLOAD_MAX_KB) {
        return { ok: false, error: "badFile", questionId: q.id };
      }
      stored[q.id] = v.fileName;
    } else {
      if (typeof v === "object" && !Array.isArray(v)) return { ok: false, error: "badValue", questionId: q.id };
      if (q.type === "number" && Number.isNaN(Number(v))) return { ok: false, error: "badValue", questionId: q.id };
      if (q.mapsTo === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) return { ok: false, error: "badValue", questionId: q.id };
      stored[q.id] = Array.isArray(v) ? v : String(v).trim();
    }
  }

  const tx = new Tx(db, a.now);
  const at = iso(a.now);
  tx.put("infoRequests", { ...ir, answers: stored, status: "answered", answeredAt: at });

  // Uploads join the request's documents, marked with the round (15.3).
  const attendee = db.attendees[r.attendeeId];
  let profile = attendee.profile;
  const documents = [...attendee.documents];
  for (const q of ir.questions) {
    const v = a.answers[q.id];
    if (q.type === "upload" && v && typeof v === "object" && !Array.isArray(v)) {
      const ext = v.fileName.split(".").pop()?.toLowerCase();
      documents.push({ id: tx.id("doc"), questionId: `info.${ir.id}.${q.id}`, fileName: v.fileName, mime: ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg", sizeKb: v.sizeKb, uploadedAt: at, infoRound: ir.round });
    }
  }
  tx.log({ requestId: r.id, action: "more_info_received", actorId: "attendee", fromStatus: "more_info_required", toStatus: "pending_review", meta: { round: ir.round } });

  // 15.2: mapped answers update the registration, old and new value logged (AC24).
  for (const q of ir.questions) {
    const v = stored[q.id];
    if (!q.mapsTo || v === undefined || Array.isArray(v)) continue;
    const before = (profile as unknown as Record<string, string | undefined>)[q.mapsTo];
    if (before === v) continue;
    profile = { ...profile, [q.mapsTo]: v };
    tx.log({ requestId: r.id, action: "field_corrected", actorId: "attendee", remarks: `More information, round ${ir.round}`, meta: { field: `profile.${q.mapsTo}`, from: before ?? "", to: v } });
  }
  tx.put("attendees", { ...attendee, profile, documents });

  // Back to the chosen stage as Pending Review, marked "Response received".
  const graph = graphOf(db, r);
  const node = graph ? (nodeById(graph, ir.returnToNodeId) as StageNode | undefined) : undefined;
  let current = tx.request(r.id);
  if (node?.type === "stage") current = enterStage(tx, current, node, "pending_review", a.now);
  else current = tx.updateRequest(current, { status: "pending_review", stageEnteredAt: at });
  current = tx.updateRequest(current, { responseReceived: true });

  // 17: the list check runs again on resubmission (new matches only).
  const known = new Set(Object.values(db.matches).filter((m) => m.requestId === r.id).map((m) => m.entryId));
  const hits = screenProfile(profile, r.eventId, Object.values(db.blacklist), Object.values(db.watchlist), known, thresholdsOf(db));
  for (const [listType, list] of [["blacklist", hits.blacklist], ["watchlist", hits.watchlist]] as const) {
    for (const m of list) {
      tx.put("matches", { id: tx.id("m"), requestId: r.id, listType, entryId: m.entryId, matchType: m.matchType, matchedField: m.matchedField, score: m.score, strength: m.strength, stagePoint: "resubmission", status: "open", foundAt: at, decidedBy: null, decidedAt: null, decisionNote: null });
    }
  }
  tx.log({ requestId: r.id, action: "screened", actorId: "system", meta: { blacklist: hits.blacklist.length, watchlist: hits.watchlist.length } });
  if (hits.blacklist.length) {
    const exec = openExecution(tx.db, r.id);
    if (exec) tx.put("stageExecutions", { ...exec, status: "open", assignedUserId: null, claimedAt: null });
    tx.log({ requestId: r.id, action: "screening_hold", actorId: "system", fromStatus: "pending_review", toStatus: "screening_hold" });
    tx.emailStaff("blacklist.approve", "blacklist_match", r.id, { entry: hits.blacklist[0].entryId });
    tx.updateRequest(current, { status: "screening_hold", screening: "blacklist_hit" });
  } else if (hits.watchlist.length) {
    const levels = [...hits.watchlist.map((m) => db.watchlist[m.entryId].level), ...(current.watchlistLevel ? [current.watchlistLevel] : [])];
    tx.updateRequest(current, { screening: "watchlist_hit", watchlistLevel: levels.sort((x, y) => RANK[y] - RANK[x])[0] });
  }
  return { ok: true, db: tx.db, requestId: r.id };
}

// ─── Attendee status (13.3) ─────────────────────────────────────────────

export type AttendeeStep = "submitted" | "review" | "info" | "decision";

/**
 * What the attendee may see: Submitted → Under review → Decision, plus
 * "Information required" when needed. Stage names, teams, reviewers and list
 * matches are never shown; Screening Hold reads "Under review".
 */
export function attendeeView(db: Database, requestId: ID, now: number) {
  const r = db.requests[requestId];
  if (!r) return null;
  const openInfo = roundsOf(db, r.id)
    .filter((i) => i.status !== "answered")
    .sort((a, b) => b.round - a.round)[0];
  const phase: "review" | "info" | "approved" | "rejected" | "withdrawn" =
    r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : r.status === "withdrawn" ? "withdrawn" : r.status === "more_info_required" ? "info" : "review";
  return {
    request: r,
    attendee: db.attendees[r.attendeeId],
    event: db.events[r.eventId],
    registration: db.registrations[r.registrationId],
    badgeType: db.badgeTypes[r.badgeTypeId],
    phase,
    info: phase === "info" && openInfo ? { ...openInfo, state: linkState(openInfo, now) } : null,
    badge: r.status === "approved" ? r.badgeStatus : null,
  };
}
