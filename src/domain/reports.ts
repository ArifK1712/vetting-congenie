import { Tx } from "./actions";
import { badgeStatus } from "./attendees";
import { can, teamsOfUser } from "./permissions";
import { isLate, requestTimeLimit } from "./queue";
import { maskId } from "./screening";
import { OPEN_STATUSES, visibleStatus } from "./status";
import type {
  BlacklistEntry,
  Database,
  HistoryEvent,
  ID,
  LocalizedText,
  Permission,
  ReportFilters,
  ReportFormat,
  ReportKey,
  ReportSchedule,
  VettingRequest,
  WatchlistEntry,
} from "./types";
import { stageOf } from "./workflow";

/**
 * Ready-made reports (spec 14.2). Each report is built as typed rows; the UI
 * words and formats each cell by its column kind, and the same rows go to the
 * screen, CSV, Excel and PDF. Users only see their own events and teams;
 * Screening Hold reads as Under Review and IDs are masked without Blacklist
 * View (AC25).
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TZ_OFFSET = 3 * HOUR; // event time zone (Asia/Riyadh)

export const REPORT_KEYS: ReportKey[] = [
  "vettingStatus",
  "timePerStage",
  "lateRequests",
  "reviewerActivity",
  "automation",
  "listMatches",
  "listEntries",
  "activityLog",
];

/** Who can open each report (14.2 "Who can open it"); every permission listed is required. */
const ACCESS: Record<ReportKey, (has: (p: Permission) => boolean) => boolean> = {
  vettingStatus: (has) => has("reports.view"),
  timePerStage: (has) => has("reports.view"),
  lateRequests: (has) => has("reports.view"),
  reviewerActivity: (has) => has("reports.view") && has("queue.assign"),
  automation: (has) => has("reports.view"),
  listMatches: (has) => has("blacklist.view") || has("watchlist.view"),
  listEntries: (has) => has("blacklist.view") || has("watchlist.view"),
  activityLog: (has) => has("queue.reviewAll"),
};

export const canOpenReport = (db: Database, viewerId: ID, key: ReportKey) => ACCESS[key]((p) => can(db, viewerId, p));
export const canExport = (db: Database, viewerId: ID) => can(db, viewerId, "reports.export");

// ─── Columns and cells ──────────────────────────────────────────────────

/** How the UI shows (and exports) a column. */
export type ColumnKind =
  | "text" // plain text (names, notes)
  | "code" // Latin identifiers: request / entry IDs, masked IDs
  | "number"
  | "hours" // a duration in hours
  | "date" // YYYY-MM-DD or ISO
  | "dateTime" // ISO
  | "localized" // LocalizedText
  | "user" // user id → name ("system", "attendee" allowed)
  | "requestStatus"
  | "badgeStatus"
  | "payment"
  | "registrationStatus"
  | "stageOutcome"
  | "listType"
  | "matchType"
  | "matchStatus"
  | "screeningField"
  | "strength"
  | "entryStatus"
  | "level"
  | "reason" // blacklist reason type
  | "historyAction";

export interface ReportColumn {
  key: string;
  kind: ColumnKind;
}

export type Cell = string | number | LocalizedText | null;
export type ReportRow = Record<string, Cell> & { _id: string; _requestId?: string };

export interface ReportResult {
  key: ReportKey;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** IDs were masked for this viewer (AC25). */
  masked: boolean;
  /** Phase 2 reports have no data in Phase 1. */
  phase2?: boolean;
}

// ─── Filters ────────────────────────────────────────────────────────────

/** YYYY-MM-DD for a timestamp in the event time zone. */
export function dayOf(ms: number) {
  return new Date(ms + TZ_OFFSET).toISOString().slice(0, 10);
}

export function defaultFilters(now: number): ReportFilters {
  return { from: dayOf(now - 30 * DAY), to: dayOf(now), registrationIds: [], badgeTypeIds: [], workflowIds: [], teamIds: [] };
}

/** Millisecond bounds of the inclusive date range. */
function bounds(f: ReportFilters) {
  return { start: Date.parse(`${f.from}T00:00:00.000Z`) - TZ_OFFSET, end: Date.parse(`${f.to}T00:00:00.000Z`) - TZ_OFFSET + DAY };
}
const inRange = (iso: string | null | undefined, b: { start: number; end: number }) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= b.start && t < b.end;
};

/**
 * Requests in this viewer's reach: Review All (or vetting admins) see every
 * request in the event scope; others see requests their teams handle now or
 * handled before. Unlike the queue, held requests stay in (masked).
 */
function scopedRequests(db: Database, viewerId: ID, eventScope: ID | "all", f: ReportFilters): VettingRequest[] {
  const all = can(db, viewerId, "queue.reviewAll") || can(db, viewerId, "registration.vettingSettings");
  const mine = new Set(teamsOfUser(db, viewerId).map((t) => t.id));
  const teamsByRequest = new Map<ID, Set<ID>>();
  for (const e of Object.values(db.stageExecutions)) {
    if (!teamsByRequest.has(e.requestId)) teamsByRequest.set(e.requestId, new Set());
    teamsByRequest.get(e.requestId)!.add(e.teamId);
  }
  const has = (list: ID[], v: ID | null) => !list.length || (!!v && list.includes(v));
  return Object.values(db.requests).filter((r) => {
    if (eventScope !== "all" && r.eventId !== eventScope) return false;
    const teams = teamsByRequest.get(r.id) ?? new Set<ID>();
    if (r.currentTeamId) teams.add(r.currentTeamId);
    if (!all && ![...teams].some((t) => mine.has(t))) return false;
    if (!has(f.registrationIds, r.registrationId) || !has(f.badgeTypeIds, r.badgeTypeId) || !has(f.workflowIds, r.workflowId)) return false;
    if (f.teamIds.length && ![...teams].some((t) => f.teamIds.includes(t))) return false;
    return true;
  });
}

// ─── Reports ────────────────────────────────────────────────────────────

const stageNameOf = (db: Database, r: VettingRequest, nodeId: ID | null): LocalizedText | null => {
  const v = r.workflowVersionId ? db.workflowVersions[r.workflowVersionId] : undefined;
  return (v && stageOf(v.graph, nodeId)?.name) ?? null;
};

function vettingStatus(db: Database, reqs: VettingRequest[], b: ReturnType<typeof bounds>, masked: boolean): Omit<ReportResult, "key" | "masked"> {
  const seesBlacklist = !masked;
  const rows = reqs
    .filter((r) => inRange(r.submittedAt, b))
    .sort((x, y) => y.submittedAt.localeCompare(x.submittedAt))
    .map((r): ReportRow => {
      const a = db.attendees[r.attendeeId];
      const id = (v?: string) => (v ? (masked ? maskId(v) : v) : null);
      return {
        _id: r.id,
        _requestId: r.id,
        request: r.id,
        attendee: a.profile.fullName,
        registration: db.registrations[r.registrationId].name,
        badgeType: db.badgeTypes[r.badgeTypeId].name,
        registrationStatus: a.registrationStatus,
        payment: a.payment.status,
        vettingStatus: visibleStatus(r.status, seesBlacklist),
        badgeStatus: badgeStatus(db, a),
        nationalId: id(a.profile.nationalId),
        passportNo: id(a.profile.passportNo),
        submitted: r.submittedAt,
        decided: r.decidedAt,
      };
    });
  return {
    columns: [
      { key: "request", kind: "code" },
      { key: "attendee", kind: "text" },
      { key: "registration", kind: "localized" },
      { key: "badgeType", kind: "localized" },
      { key: "registrationStatus", kind: "registrationStatus" },
      { key: "payment", kind: "payment" },
      { key: "vettingStatus", kind: "requestStatus" },
      { key: "badgeStatus", kind: "badgeStatus" },
      { key: "nationalId", kind: "code" },
      { key: "passportNo", kind: "code" },
      { key: "submitted", kind: "dateTime" },
      { key: "decided", kind: "dateTime" },
    ],
    rows,
  };
}

function timePerStage(db: Database, reqs: VettingRequest[], b: ReturnType<typeof bounds>, now: number, f: ReportFilters) {
  const byId = new Map(reqs.map((r) => [r.id, r]));
  const rows = Object.values(db.stageExecutions)
    .filter((e) => byId.has(e.requestId) && inRange(e.enteredAt, b) && (!f.teamIds.length || f.teamIds.includes(e.teamId)))
    .sort((x, y) => y.enteredAt.localeCompare(x.enteredAt))
    .map((e): ReportRow => {
      const end = e.completedAt ? Date.parse(e.completedAt) : now;
      return {
        _id: e.id,
        _requestId: e.requestId,
        request: e.requestId,
        stage: e.stageName,
        team: db.teams[e.teamId]?.name ?? null,
        reviewer: e.assignedUserId,
        entered: e.enteredAt,
        completed: e.completedAt,
        hours: Math.round(((end - Date.parse(e.enteredAt)) / HOUR) * 10) / 10,
        outcome: e.completedAt ? (e.outcome ?? "returned") : null,
      };
    });
  return {
    columns: [
      { key: "request", kind: "code" },
      { key: "stage", kind: "localized" },
      { key: "team", kind: "localized" },
      { key: "reviewer", kind: "user" },
      { key: "entered", kind: "dateTime" },
      { key: "completed", kind: "dateTime" },
      { key: "hours", kind: "hours" },
      { key: "outcome", kind: "stageOutcome" },
    ] satisfies ReportColumn[],
    rows,
  };
}

function lateRequests(db: Database, reqs: VettingRequest[], now: number, seesBlacklist: boolean) {
  const rows = reqs
    .filter((r) => OPEN_STATUSES.includes(r.status) && isLate(db, r, now))
    .map((r): ReportRow => {
      const limit = requestTimeLimit(db, r) ?? 0;
      const waited = (now - Date.parse(r.stageEnteredAt)) / HOUR;
      return {
        _id: r.id,
        _requestId: r.id,
        request: r.id,
        attendee: db.attendees[r.attendeeId].profile.fullName,
        status: visibleStatus(r.status, seesBlacklist),
        stage: stageNameOf(db, r, r.currentStageNodeId),
        team: r.currentTeamId ? db.teams[r.currentTeamId]?.name ?? null : null,
        owner: r.claimedBy,
        timeLimit: limit,
        waiting: Math.round(waited * 10) / 10,
        overdue: Math.round((waited - limit) * 10) / 10,
      };
    })
    .sort((x, y) => (y.overdue as number) - (x.overdue as number));
  return {
    columns: [
      { key: "request", kind: "code" },
      { key: "attendee", kind: "text" },
      { key: "status", kind: "requestStatus" },
      { key: "stage", kind: "localized" },
      { key: "team", kind: "localized" },
      { key: "owner", kind: "user" },
      { key: "timeLimit", kind: "hours" },
      { key: "waiting", kind: "hours" },
      { key: "overdue", kind: "hours" },
    ] satisfies ReportColumn[],
    rows,
  };
}


function reviewerActivity(db: Database, reqs: VettingRequest[], b: ReturnType<typeof bounds>) {
  const ids = new Set(reqs.map((r) => r.id));
  const stats = new Map<ID, { claims: number; approved: number; rejected: number; moreInfo: number; escalated: number; hours: number[] }>();
  const get = (u: ID) => {
    if (!stats.has(u)) stats.set(u, { claims: 0, approved: 0, rejected: 0, moreInfo: 0, escalated: 0, hours: [] });
    return stats.get(u)!;
  };
  for (const h of Object.values(db.history)) {
    if (!ids.has(h.requestId) || !inRange(h.at, b) || !db.users[h.actorId]) continue;
    if (h.action === "claimed") get(h.actorId).claims++;
    else if (h.action === "approved_stage") get(h.actorId).approved++;
    else if (h.action === "rejected") get(h.actorId).rejected++;
    else if (h.action === "more_info_requested") get(h.actorId).moreInfo++;
    else if (h.action === "escalated") get(h.actorId).escalated++;
  }
  for (const e of Object.values(db.stageExecutions)) {
    if (!ids.has(e.requestId) || !e.assignedUserId || !e.claimedAt || !e.completedAt || !inRange(e.completedAt, b)) continue;
    get(e.assignedUserId).hours.push((Date.parse(e.completedAt) - Date.parse(e.claimedAt)) / HOUR);
  }
  const rows = [...stats.entries()]
    .map(([u, s]): ReportRow => {
      const decisions = s.approved + s.rejected + s.moreInfo + s.escalated;
      const avg = s.hours.length ? s.hours.reduce((x, y) => x + y, 0) / s.hours.length : null;
      return { _id: u, reviewer: u, claims: s.claims, decisions, approved: s.approved, rejected: s.rejected, moreInfo: s.moreInfo, escalated: s.escalated, avgHours: avg === null ? null : Math.round(avg * 10) / 10 };
    })
    .sort((x, y) => (y.decisions as number) - (x.decisions as number));
  return {
    columns: [
      { key: "reviewer", kind: "user" },
      { key: "claims", kind: "number" },
      { key: "decisions", kind: "number" },
      { key: "approved", kind: "number" },
      { key: "rejected", kind: "number" },
      { key: "moreInfo", kind: "number" },
      { key: "escalated", kind: "number" },
      { key: "avgHours", kind: "hours" },
    ] satisfies ReportColumn[],
    rows,
  };
}

function listMatches(db: Database, viewerId: ID, reqs: VettingRequest[], b: ReturnType<typeof bounds>) {
  const ids = new Set(reqs.map((r) => r.id));
  const lists = new Set([can(db, viewerId, "blacklist.view") && "blacklist", can(db, viewerId, "watchlist.view") && "watchlist"]);
  const rows = Object.values(db.matches)
    .filter((m) => ids.has(m.requestId) && lists.has(m.listType) && inRange(m.foundAt, b))
    .sort((x, y) => y.foundAt.localeCompare(x.foundAt))
    .map((m): ReportRow => ({
      _id: m.id,
      _requestId: m.requestId,
      request: m.requestId,
      list: m.listType,
      entry: m.entryId,
      matchType: m.matchType,
      field: m.matchedField,
      score: m.score,
      strength: m.strength,
      status: m.status,
      found: m.foundAt,
      decidedBy: m.decidedBy,
      decided: m.decidedAt,
    }));
  return {
    columns: [
      { key: "request", kind: "code" },
      { key: "list", kind: "listType" },
      { key: "entry", kind: "code" },
      { key: "matchType", kind: "matchType" },
      { key: "field", kind: "screeningField" },
      { key: "score", kind: "number" },
      { key: "strength", kind: "strength" },
      { key: "status", kind: "matchStatus" },
      { key: "found", kind: "dateTime" },
      { key: "decidedBy", kind: "user" },
      { key: "decided", kind: "dateTime" },
    ] satisfies ReportColumn[],
    rows,
  };
}

function listEntries(db: Database, viewerId: ID, eventScope: ID | "all", masked: boolean) {
  const inScope = (e: BlacklistEntry | WatchlistEntry) => eventScope === "all" || e.eventScope === "all" || e.eventScope.includes(eventScope);
  const name = (e: BlacklistEntry | WatchlistEntry) => (e.identity.subjectType === "company" ? (e.identity.company ?? "") : e.identity.fullName);
  const id = (e: BlacklistEntry | WatchlistEntry) => {
    const v = e.identity.nationalId ?? e.identity.passportNo;
    return v ? (masked ? maskId(v) : v) : null;
  };
  const rows: ReportRow[] = [];
  if (can(db, viewerId, "blacklist.view")) {
    for (const e of Object.values(db.blacklist).filter(inScope)) {
      rows.push({ _id: e.id, entry: e.id, list: "blacklist", name: name(e), idNumber: id(e), reason: e.reasonType, level: null, status: e.status, starts: e.startsOn, ends: e.endsOn });
    }
  }
  if (can(db, viewerId, "watchlist.view")) {
    for (const e of Object.values(db.watchlist).filter(inScope)) {
      rows.push({ _id: e.id, entry: e.id, list: "watchlist", name: name(e), idNumber: id(e), reason: e.reasonType, level: e.level, status: e.status, starts: e.startsOn, ends: e.endsOn });
    }
  }
  // Soonest end date first; entries with no end date last.
  rows.sort((x, y) => String(x.ends ?? "9999").localeCompare(String(y.ends ?? "9999")));
  return {
    columns: [
      { key: "entry", kind: "code" },
      { key: "list", kind: "listType" },
      { key: "name", kind: "text" },
      { key: "idNumber", kind: "code" },
      { key: "reason", kind: "reason" },
      { key: "level", kind: "level" },
      { key: "status", kind: "entryStatus" },
      { key: "starts", kind: "date" },
      { key: "ends", kind: "date" },
    ] satisfies ReportColumn[],
    rows,
  };
}

function activityLog(db: Database, reqs: VettingRequest[], b: ReturnType<typeof bounds>, f: ReportFilters, seesBlacklist: boolean) {
  const one = f.requestId?.trim().toUpperCase();
  const ids = new Set(reqs.map((r) => r.id));
  const hidden: HistoryEvent["action"][] = seesBlacklist ? [] : ["screening_hold", "match_confirmed", "match_cleared", "watchlist_marked"];
  const rows = Object.values(db.history)
    .filter((h) => ids.has(h.requestId) && (one ? h.requestId === one : inRange(h.at, b)) && !hidden.includes(h.action))
    .sort((x, y) => y.at.localeCompare(x.at))
    .map((h): ReportRow => ({
      _id: h.id,
      _requestId: h.requestId,
      at: h.at,
      request: h.requestId,
      actor: h.actorId,
      action: h.action,
      from: h.fromStatus ? visibleStatus(h.fromStatus, seesBlacklist) : null,
      to: h.toStatus ? visibleStatus(h.toStatus, seesBlacklist) : null,
      remarks: h.remarks ?? null,
    }));
  return {
    columns: [
      { key: "at", kind: "dateTime" },
      { key: "request", kind: "code" },
      { key: "actor", kind: "user" },
      { key: "action", kind: "historyAction" },
      { key: "from", kind: "requestStatus" },
      { key: "to", kind: "requestStatus" },
      { key: "remarks", kind: "text" },
    ] satisfies ReportColumn[],
    rows,
  };
}

export function buildReport(db: Database, viewerId: ID, eventScope: ID | "all", key: ReportKey, f: ReportFilters, now: number): ReportResult | null {
  if (!canOpenReport(db, viewerId, key)) return null;
  const masked = !can(db, viewerId, "blacklist.view");
  const b = bounds(f);
  const reqs = scopedRequests(db, viewerId, eventScope, f);
  const base = { key, masked };
  switch (key) {
    case "vettingStatus":
      return { ...base, ...vettingStatus(db, reqs, b, masked) };
    case "timePerStage":
      return { ...base, ...timePerStage(db, reqs, b, now, f) };
    case "lateRequests":
      return { ...base, ...lateRequests(db, reqs, now, !masked) };
    case "reviewerActivity":
      return { ...base, ...reviewerActivity(db, reqs, b) };
    case "automation":
      // Phase 2: auto rules and fast-track don't exist yet, so nothing is decided by rule.
      return { ...base, phase2: true, columns: [{ key: "request", kind: "code" }, { key: "rule", kind: "text" }, { key: "result", kind: "requestStatus" }, { key: "at", kind: "dateTime" }], rows: [] };
    case "listMatches":
      return { ...base, ...listMatches(db, viewerId, reqs, b) };
    case "listEntries":
      return { ...base, ...listEntries(db, viewerId, eventScope, masked) };
    case "activityLog":
      return { ...base, ...activityLog(db, reqs, b, f, !masked) };
  }
}

// ─── Downloads and schedules ────────────────────────────────────────────

export type ReportError = "forbidden" | "noExport" | "invalid" | "notFound";

/** Logs a download (14.2, AC25). The file itself is produced in the browser. */
export function logDownload(
  db: Database,
  a: { report: ReportKey; format: ReportFormat; filters: ReportFilters; eventScope: ID | "all"; actorId: ID; now: number },
): { ok: true; db: Database; rows: number } | { ok: false; error: ReportError } {
  if (!canOpenReport(db, a.actorId, a.report)) return { ok: false, error: "forbidden" };
  if (!canExport(db, a.actorId)) return { ok: false, error: "noExport" };
  const result = buildReport(db, a.actorId, a.eventScope, a.report, a.filters, a.now)!;
  const tx = new Tx(db, a.now);
  const id = tx.id("dl");
  tx.db.reportDownloads = {
    ...db.reportDownloads,
    [id]: { id, report: a.report, format: a.format, filters: a.filters, eventScope: a.eventScope, rows: result.rows.length, masked: result.masked, actorId: a.actorId, at: new Date(a.now).toISOString() },
  };
  return { ok: true, db: tx.db, rows: result.rows.length };
}

/** Next send time after `after`, at `hour` event time, daily or on `weekday`. */
export function nextRun(s: Pick<ReportSchedule, "frequency" | "hour" | "weekday">, after: number): number {
  const local = after + TZ_OFFSET;
  let t = local - (local % DAY) + s.hour * HOUR;
  while (t <= local || (s.frequency === "weekly" && new Date(t).getUTCDay() !== s.weekday)) t += DAY;
  return t - TZ_OFFSET;
}

export function saveSchedule(
  db: Database,
  a: { id?: ID; report: ReportKey; format: ReportFormat; filters: ReportFilters; eventScope: ID | "all"; frequency: "daily" | "weekly"; hour: number; weekday: number; actorId: ID; now: number },
): { ok: true; db: Database; scheduleId: ID } | { ok: false; error: ReportError } {
  if (!canOpenReport(db, a.actorId, a.report)) return { ok: false, error: "forbidden" };
  if (!canExport(db, a.actorId)) return { ok: false, error: "noExport" };
  if (a.hour < 0 || a.hour > 23 || a.weekday < 0 || a.weekday > 6 || a.format === "pdf") return { ok: false, error: "invalid" };
  const existing = a.id ? db.reportSchedules[a.id] : undefined;
  if (a.id && (!existing || existing.ownerId !== a.actorId)) return { ok: false, error: "notFound" };
  const tx = new Tx(db, a.now);
  const id = existing?.id ?? tx.id("sch");
  const s: ReportSchedule = {
    id, report: a.report, format: a.format, filters: a.filters, eventScope: a.eventScope, frequency: a.frequency, hour: a.hour, weekday: a.weekday,
    ownerId: a.actorId, active: true, createdAt: existing?.createdAt ?? new Date(a.now).toISOString(), lastRunAt: existing?.lastRunAt ?? null,
    nextRunAt: new Date(nextRun(a, a.now)).toISOString(),
  };
  tx.db.reportSchedules = { ...db.reportSchedules, [id]: s };
  return { ok: true, db: tx.db, scheduleId: id };
}

export function deleteSchedule(db: Database, a: { id: ID; actorId: ID; now: number }): { ok: true; db: Database } | { ok: false; error: ReportError } {
  const s = db.reportSchedules[a.id];
  if (!s || s.ownerId !== a.actorId) return { ok: false, error: "notFound" };
  const rest = { ...db.reportSchedules };
  delete rest[a.id];
  return { ok: true, db: { ...db, reportSchedules: rest } };
}

/**
 * Sends every schedule that's due (called every minute, like the More
 * Information reminders). Each run emails the owner with the report attached,
 * built with the owner's current access, and is logged as a download.
 */
export function runDueSchedules(db: Database, now: number): Database {
  const due = Object.values(db.reportSchedules).filter((s) => s.active && Date.parse(s.nextRunAt) <= now);
  if (!due.length) return db;
  let next = db;
  for (const s of due) {
    const owner = next.users[s.ownerId];
    const allowed = owner?.active && canOpenReport(next, s.ownerId, s.report) && canExport(next, s.ownerId);
    // A schedule keeps the length of its date range, ending on the run day.
    const span = Math.max(0, Date.parse(s.filters.to) - Date.parse(s.filters.from));
    const filters = { ...s.filters, to: dayOf(now), from: dayOf(now - span) };
    const tx = new Tx(next, now);
    if (allowed) {
      const result = buildReport(next, s.ownerId, s.eventScope, s.report, filters, now)!;
      tx.email(owner.email, "report_scheduled", null, { report: s.report, rows: String(result.rows.length), format: s.format, frequency: s.frequency });
      const id = tx.id("dl");
      tx.db.reportDownloads = {
        ...tx.db.reportDownloads,
        [id]: { id, report: s.report, format: s.format, filters, eventScope: s.eventScope, rows: result.rows.length, masked: result.masked, actorId: s.ownerId, at: new Date(now).toISOString() },
      };
    }
    tx.db.reportSchedules = {
      ...tx.db.reportSchedules,
      // Lost access pauses the schedule rather than sending what they can't see.
      [s.id]: { ...s, active: !!allowed, lastRunAt: new Date(now).toISOString(), nextRunAt: new Date(nextRun(s, now)).toISOString() },
    };
    next = tx.db;
  }
  return next;
}

