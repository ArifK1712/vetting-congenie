import { Tx } from "./actions";
import { readImport as readBlacklistImport, retroMatches, TEMPLATE_COLUMNS as BL_COLUMNS, validateEntry, parseCsv, type EntryDraft, type EntryIssue, type ImportError, type ImportRow } from "./blacklist";
import { can } from "./permissions";
import { normalizeId, normalizeName } from "./screening";
import type { BlacklistReason, Database, ID, ListIdentity, LocalizedText, VettingRequest, WatchlistEntry, WatchlistHistoryEvent, WatchlistLevel } from "./types";
import { WATCHLIST_REVIEW } from "./workflow";

/**
 * Watchlist management (spec 10). Same identity rules as the blacklist, but
 * a user with Watchlist Manage saves directly (no second approval), a match
 * only marks the request (never suspends a badge), and the entry decides
 * what else happens: an email, or one extra review stage.
 */

export const LEVELS: WatchlistLevel[] = ["low", "medium", "high"];
export const NOTE_MAX = 200;
const RANK: Record<WatchlistLevel, number> = { low: 1, medium: 2, high: 3 };

export interface WatchDraft {
  identity: ListIdentity;
  eventScope: "all" | ID[];
  level: WatchlistLevel | null;
  onMatch: WatchlistEntry["onMatch"];
  extraStage: string | null;
  notify: ID[];
  reviewerNote: string;
  reasonType: BlacklistReason | null;
  reason: string;
  evidence: WatchlistEntry["evidence"];
  startsOn: string;
  endsOn: string | null;
}

export function effectiveStatus(e: WatchlistEntry, now: number): WatchlistEntry["status"] {
  if (e.status === "active" && e.endsOn && Date.parse(e.endsOn) < now) return "expired";
  return e.status;
}

export function emptyWatchDraft(now: number): WatchDraft {
  return {
    identity: { subjectType: "person", fullName: "", aliases: [] },
    eventScope: "all",
    level: null,
    onMatch: "mark",
    extraStage: null,
    notify: [],
    reviewerNote: "",
    reasonType: null,
    reason: "",
    evidence: [],
    startsOn: new Date(now).toISOString().slice(0, 10),
    endsOn: null,
  };
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

export function watchDraftOf(e: WatchlistEntry): WatchDraft {
  return {
    identity: structuredClone(e.identity),
    eventScope: e.eventScope === "all" ? "all" : [...e.eventScope],
    level: e.level,
    onMatch: e.onMatch,
    extraStage: e.extraStage,
    notify: [...e.notify],
    reviewerNote: e.reviewerNote,
    reasonType: e.reasonType,
    reason: e.reason,
    evidence: e.evidence.map((x) => ({ ...x })),
    startsOn: day(e.startsOn)!,
    endsOn: day(e.endsOn),
  };
}

export function watchDraftFromRequest(db: Database, requestId: ID, now: number): WatchDraft | null {
  const r = db.requests[requestId];
  const a = r ? db.attendees[r.attendeeId] : null;
  if (!r || !a) return null;
  const p = a.profile;
  return {
    ...emptyWatchDraft(now),
    identity: { subjectType: "person", fullName: p.fullName, aliases: p.fullNameAr ? [p.fullNameAr] : [], nationalId: p.nationalId, passportNo: p.passportNo, nationality: p.nationality, email: p.email, mobile: p.mobile, dob: p.dob },
    eventScope: [r.eventId],
  };
}

/** The blacklist form, filled from a watchlist entry ("Move to blacklist"). */
export function blacklistDraftFromWatch(e: WatchlistEntry): EntryDraft {
  return {
    identity: structuredClone(e.identity),
    eventScope: e.eventScope === "all" ? "all" : [...e.eventScope],
    reasonType: e.reasonType,
    reasonDetail: e.reason,
    evidence: e.evidence.map((x) => ({ ...x })),
    startsOn: new Date().toISOString().slice(0, 10),
    endsOn: day(e.endsOn),
  };
}

// ─── Validation (10.2) ──────────────────────────────────────────────────

export type WatchIssueCode = EntryIssue["code"] | "levelRequired" | "notifyRequired" | "stageRequired" | "noteTooLong";

export interface WatchIssue {
  code: WatchIssueCode;
  severity: "error" | "warning";
  ref?: string;
}

const asEntryDraft = (d: WatchDraft): EntryDraft => ({ identity: d.identity, eventScope: d.eventScope, reasonType: d.reasonType, reasonDetail: d.reason, evidence: d.evidence, startsOn: d.startsOn, endsOn: d.endsOn });

export function validateWatch(db: Database, d: WatchDraft, entryId: ID | null, now: number): WatchIssue[] {
  // Same identity, reason, evidence and date rules as the blacklist; the duplicate check is per list.
  const issues: WatchIssue[] = validateEntry(db, asEntryDraft(d), null, now).filter((i) => i.code !== "possibleDuplicate");
  if (!d.level) issues.push({ code: "levelRequired", severity: "error" });
  if (d.onMatch === "markEmail" && !d.notify.length) issues.push({ code: "notifyRequired", severity: "error" });
  if (d.onMatch === "markStage" && !d.extraStage) issues.push({ code: "stageRequired", severity: "error" });
  if (d.reviewerNote.length > NOTE_MAX) issues.push({ code: "noteTooLong", severity: "error" });
  const dup = findWatchDuplicate(db, d.identity, entryId);
  if (dup) issues.push({ code: "possibleDuplicate", severity: "warning", ref: dup });
  return issues;
}

export const errorsOf = (issues: WatchIssue[]) => issues.filter((i) => i.severity === "error");

export function findWatchDuplicate(db: Database, id: ListIdentity, entryId: ID | null): ID | null {
  for (const e of Object.values(db.watchlist)) {
    if (e.id === entryId || e.status === "removed") continue;
    const o = e.identity;
    if (id.nationalId && o.nationalId && normalizeId(id.nationalId) === normalizeId(o.nationalId)) return e.id;
    if (id.passportNo && o.passportNo && normalizeId(id.passportNo) === normalizeId(o.passportNo)) return e.id;
    if (id.email && o.email && id.email.trim().toLowerCase() === o.email.toLowerCase()) return e.id;
    if (id.subjectType === "company" && o.subjectType === "company" && id.company && o.company && normalizeName(id.company) === normalizeName(o.company)) return e.id;
  }
  return null;
}

/** A stage an entry can add. `workflow`/`stage` are null for the standard Watchlist Review; the UI words the label. */
export interface ExtraStageOption {
  value: string;
  workflow: LocalizedText | null;
  stage: LocalizedText | null;
}

/** Stages an entry can add: the standard Watchlist Review, or any published workflow stage. */
export function extraStageOptions(db: Database): ExtraStageOption[] {
  const options: ExtraStageOption[] = [{ value: WATCHLIST_REVIEW, workflow: null, stage: null }];
  for (const wf of Object.values(db.workflows)) {
    const v = wf.currentVersionId ? db.workflowVersions[wf.currentVersionId] : null;
    for (const n of v?.graph.nodes ?? []) {
      if (n.type === "stage") options.push({ value: `${wf.id}:${n.id}`, workflow: wf.name, stage: n.stage.name });
    }
  }
  return options;
}

// ─── Marking requests ───────────────────────────────────────────────────

/** A request's level is the highest level among its open matches on active entries. */
function refreshLevel(tx: Tx, requestId: ID) {
  const r = tx.db.requests[requestId];
  let best: WatchlistLevel | null = null;
  for (const m of Object.values(tx.db.matches)) {
    if (m.requestId !== requestId || m.listType !== "watchlist" || m.status === "cleared") continue;
    const e = tx.db.watchlist[m.entryId];
    if (!e || e.status !== "active") continue;
    if (!best || RANK[e.level] > RANK[best]) best = e.level;
  }
  const screening: VettingRequest["screening"] = r.screening === "blacklist_hit" ? "blacklist_hit" : best ? "watchlist_hit" : "clear";
  if (best !== r.watchlistLevel || screening !== r.screening) tx.updateRequest(r, { watchlistLevel: best, screening });
}

/** 10.3 point 5: a saved entry marks matching requests in progress or approved. Badges are never suspended. */
function markRequests(tx: Tx, entry: WatchlistEntry, actorId: ID, now: number) {
  let marked = 0;
  for (const hit of retroMatches(tx.db, entry.identity, entry.eventScope, entry.id)) {
    tx.put("matches", {
      id: tx.id("m"),
      requestId: hit.requestId,
      listType: "watchlist",
      entryId: entry.id,
      matchType: hit.matchType,
      matchedField: hit.matchedField,
      score: hit.score,
      strength: hit.strength,
      stagePoint: "retro",
      status: "open",
      foundAt: new Date(now).toISOString(),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
    });
    refreshLevel(tx, hit.requestId);
    tx.log({ requestId: hit.requestId, action: "watchlist_marked", actorId, remarks: entry.id, meta: { level: entry.level } });
    if (entry.onMatch === "markEmail") notify(tx, entry, hit.requestId);
    marked++;
  }
  return marked;
}

/** "Mark and send email": internal alert to the chosen users and every member of the chosen teams. */
function notify(tx: Tx, entry: WatchlistEntry, requestId: ID) {
  const people = new Set<ID>();
  for (const id of entry.notify) {
    if (tx.db.users[id]) people.add(id);
    for (const m of tx.db.teams[id]?.members ?? []) people.add(m.userId);
  }
  for (const id of people) {
    const u = tx.db.users[id];
    if (u?.active) tx.email(u.email, "watchlist_match", requestId, { entry: entry.id, level: entry.level });
  }
}

// ─── Actions ────────────────────────────────────────────────────────────

export type WatchError = "forbidden" | "notFound" | "stale" | "invalid" | "notEditable" | "notActive" | "noteRequired" | "notOpen";

export type WatchResult = { ok: true; db: Database; entryId: ID; marked?: number } | { ok: false; error: WatchError; issues?: WatchIssue[] };

interface Actor {
  actorId: ID;
  now: number;
}

const toIso = (ymd: string | null) => (ymd ? `${ymd}T00:00:00.000Z` : null);

function content(d: WatchDraft) {
  const clean = (s?: string) => (s?.trim() ? s.trim() : undefined);
  const id = d.identity;
  const person = id.subjectType === "person";
  return {
    identity: {
      subjectType: id.subjectType,
      fullName: id.fullName.trim(),
      aliases: id.aliases.map((a) => a.trim()).filter(Boolean),
      nationalId: person ? clean(id.nationalId) : undefined,
      passportNo: person ? clean(id.passportNo) : undefined,
      nationality: person ? id.nationality || undefined : undefined,
      email: clean(id.email)?.toLowerCase(),
      mobile: clean(id.mobile),
      dob: person ? clean(id.dob) : undefined,
      company: clean(id.company),
    },
    eventScope: d.eventScope,
    level: d.level!,
    onMatch: d.onMatch,
    extraStage: d.onMatch === "markStage" ? d.extraStage : null,
    notify: d.onMatch === "markEmail" ? d.notify : [],
    reviewerNote: d.reviewerNote.trim(),
    reasonType: d.reasonType!,
    reason: d.reason.trim(),
    evidence: d.evidence,
    startsOn: toIso(d.startsOn)!,
    endsOn: toIso(d.endsOn),
  };
}

function log(tx: Tx, e: Omit<WatchlistHistoryEvent, "id">) {
  tx.put("watchlistHistory", { ...e, id: tx.id("wlh") });
}

function nextId(db: Database, n = 1) {
  const max = Math.max(200, ...Object.keys(db.watchlist).map((k) => Number(k.replace(/\D/g, "")) || 0));
  return `WL-${String(max + n).padStart(4, "0")}`;
}

/** 10.2: saved directly by a user with Watchlist Manage; no second approval. */
export function createWatchEntry(db: Database, a: Actor & { draft: WatchDraft; source: WatchlistEntry["source"]; sourceRequestId?: ID | null }): WatchResult {
  if (!can(db, a.actorId, "watchlist.manage")) return { ok: false, error: "forbidden" };
  const issues = validateWatch(db, a.draft, null, a.now);
  if (errorsOf(issues).length) return { ok: false, error: "invalid", issues };
  const tx = new Tx(db, a.now);
  const at = new Date(a.now).toISOString();
  const entry: WatchlistEntry = {
    id: nextId(db),
    ...content(a.draft),
    status: "active",
    createdBy: a.actorId,
    createdAt: at,
    source: a.source,
    sourceRequestId: a.sourceRequestId ?? null,
    removedBy: null,
    removedAt: null,
    removalReason: null,
    revision: 1,
    updatedAt: at,
    updatedBy: a.actorId,
  };
  tx.put("watchlist", entry);
  const marked = Date.parse(entry.startsOn) <= a.now ? markRequests(tx, entry, a.actorId, a.now) : 0;
  log(tx, { entryId: entry.id, action: "created", actorId: a.actorId, at, marked, ref: a.sourceRequestId ?? undefined });
  return { ok: true, db: tx.db, entryId: entry.id, marked };
}

export function editWatchEntry(db: Database, a: Actor & { entryId: ID; draft: WatchDraft; expectedRevision: number }): WatchResult {
  if (!can(db, a.actorId, "watchlist.manage")) return { ok: false, error: "forbidden" };
  const e = db.watchlist[a.entryId];
  if (!e) return { ok: false, error: "notFound" };
  if (e.revision !== a.expectedRevision) return { ok: false, error: "stale" };
  if (effectiveStatus(e, a.now) !== "active") return { ok: false, error: "notEditable" };
  const issues = validateWatch(db, a.draft, e.id, a.now);
  if (errorsOf(issues).length) return { ok: false, error: "invalid", issues };
  const tx = new Tx(db, a.now);
  const at = new Date(a.now).toISOString();
  const next: WatchlistEntry = { ...e, ...content(a.draft), revision: e.revision + 1, updatedAt: at, updatedBy: a.actorId };
  tx.put("watchlist", next);
  // A new level applies to requests it already marked; a new identity may mark more.
  for (const m of Object.values(tx.db.matches)) if (m.entryId === e.id && m.status !== "cleared") refreshLevel(tx, m.requestId);
  const marked = Date.parse(next.startsOn) <= a.now ? markRequests(tx, next, a.actorId, a.now) : 0;
  log(tx, { entryId: e.id, action: "edited", actorId: a.actorId, at, marked });
  return { ok: true, db: tx.db, entryId: e.id, marked };
}

export function removeWatchEntry(db: Database, a: Actor & { entryId: ID; expectedRevision: number; reason: string }): WatchResult {
  if (!can(db, a.actorId, "watchlist.manage")) return { ok: false, error: "forbidden" };
  const e = db.watchlist[a.entryId];
  if (!e) return { ok: false, error: "notFound" };
  if (e.revision !== a.expectedRevision) return { ok: false, error: "stale" };
  if (e.status !== "active") return { ok: false, error: "notActive" };
  if (!a.reason.trim()) return { ok: false, error: "noteRequired" };
  const tx = new Tx(db, a.now);
  const at = new Date(a.now).toISOString();
  tx.put("watchlist", { ...e, status: "removed", removedBy: a.actorId, removedAt: at, removalReason: a.reason.trim(), revision: e.revision + 1, updatedAt: at, updatedBy: a.actorId });
  for (const m of Object.values(tx.db.matches)) if (m.entryId === e.id && m.status !== "cleared") refreshLevel(tx, m.requestId);
  log(tx, { entryId: e.id, action: "removed", actorId: a.actorId, at, note: a.reason.trim() });
  return { ok: true, db: tx.db, entryId: e.id };
}

/** 10.3 point 4: a reviewer with Watchlist View marks a match as not the same person; logged on both sides. */
export function clearWatchMatch(db: Database, a: Actor & { matchId: ID; note: string }): WatchResult {
  if (!can(db, a.actorId, "watchlist.view")) return { ok: false, error: "forbidden" };
  const m = db.matches[a.matchId];
  if (!m || m.listType !== "watchlist") return { ok: false, error: "notFound" };
  if (m.status !== "open") return { ok: false, error: "notOpen" };
  if (!a.note.trim()) return { ok: false, error: "noteRequired" };
  const tx = new Tx(db, a.now);
  const at = new Date(a.now).toISOString();
  tx.put("matches", { ...m, status: "cleared", decidedBy: a.actorId, decidedAt: at, decisionNote: a.note.trim() });
  refreshLevel(tx, m.requestId);
  tx.log({ requestId: m.requestId, action: "match_cleared", actorId: a.actorId, remarks: a.note.trim(), meta: { list: "watchlist", entryId: m.entryId } });
  log(tx, { entryId: m.entryId, action: "match_cleared", actorId: a.actorId, at, ref: m.requestId, note: a.note.trim() });
  const e = tx.db.watchlist[m.entryId];
  if (e) tx.put("watchlist", { ...e, revision: e.revision + 1, updatedAt: at });
  return { ok: true, db: tx.db, entryId: m.entryId };
}

/** Logged on the watchlist entry once its blacklist proposal is sent. */
export function noteMovedToBlacklist(db: Database, a: Actor & { entryId: ID; blacklistId: ID }): WatchResult {
  const e = db.watchlist[a.entryId];
  if (!e) return { ok: false, error: "notFound" };
  const tx = new Tx(db, a.now);
  log(tx, { entryId: e.id, action: "moved_to_blacklist", actorId: a.actorId, at: new Date(a.now).toISOString(), ref: a.blacklistId });
  tx.put("watchlist", { ...e, revision: e.revision + 1 });
  return { ok: true, db: tx.db, entryId: e.id };
}

// ─── Import ─────────────────────────────────────────────────────────────

export const WATCH_COLUMNS = [...BL_COLUMNS, "level", "on_match", "reviewer_note"] as const;

export interface WatchImportRow {
  line: number;
  draft: WatchDraft;
  issues: WatchIssue[];
  readErrors: ImportError[];
}

export function readWatchImport(db: Database, text: string, now: number): { rows: WatchImportRow[]; headerError: ImportError | null } {
  const base = readBlacklistImport(db, text, now);
  if (base.headerError) return { rows: [], headerError: base.headerError };
  const table = parseCsv(text);
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = ["level", "on_match", "reviewer_note"].filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], headerError: { code: "missingWatchColumns", params: { columns: missing.join(", ") } } };
  const col = (r: string[], c: string) => (r[header.indexOf(c)] ?? "").trim();
  const ON_MATCH: Record<string, WatchlistEntry["onMatch"]> = { mark: "mark", mark_only: "mark", email: "markEmail", mark_and_email: "markEmail", stage: "markStage", mark_and_stage: "markStage" };

  const rows = base.rows.map((b: ImportRow, i): WatchImportRow => {
    const r = table[i + 1];
    const readErrors = [...b.readErrors];
    const levelRaw = col(r, "level").toLowerCase();
    const level = LEVELS.find((l) => l === levelRaw) ?? null;
    if (levelRaw && !level) readErrors.push({ code: "badLevel", params: { value: col(r, "level") } });
    const onRaw = col(r, "on_match").toLowerCase().replace(/[\s-]+/g, "_") || "mark";
    const onMatch = ON_MATCH[onRaw];
    if (!onMatch) readErrors.push({ code: "badOnMatch", params: { value: col(r, "on_match") } });
    const draft: WatchDraft = {
      identity: b.draft.identity,
      eventScope: b.draft.eventScope,
      level,
      onMatch: onMatch === "markEmail" ? "mark" : (onMatch ?? "mark"),
      extraStage: onMatch === "markStage" ? WATCHLIST_REVIEW : null,
      notify: [],
      reviewerNote: col(r, "reviewer_note"),
      reasonType: b.draft.reasonType,
      reason: b.draft.reasonDetail,
      evidence: [],
      startsOn: b.draft.startsOn,
      endsOn: b.draft.endsOn,
    };
    if (onMatch === "markEmail") readErrors.push({ code: "emailNotImportable" });
    const issues = validateWatch(db, draft, null, now).filter(
      (x) => !(b.readErrors.some((e) => e.code === "unknownEvent") && x.code === "eventsRequired") && !(levelRaw && !level && x.code === "levelRequired"),
    );
    return { line: b.line, draft, issues, readErrors };
  });
  return { rows, headerError: null };
}

export const watchRowReady = (r: WatchImportRow) => !r.readErrors.length && !errorsOf(r.issues).length;

export function importWatchEntries(db: Database, a: Actor & { drafts: WatchDraft[] }): { ok: true; db: Database; ids: ID[]; marked: number } | { ok: false; error: WatchError } {
  if (!can(db, a.actorId, "watchlist.manage")) return { ok: false, error: "forbidden" };
  let next = db;
  const ids: ID[] = [];
  let marked = 0;
  for (const d of a.drafts) {
    const r = createWatchEntry(next, { ...a, draft: d, source: "import" });
    if (!r.ok) return { ok: false, error: r.error };
    next = r.db;
    ids.push(r.entryId);
    marked += r.marked ?? 0;
  }
  return { ok: true, db: next, ids, marked };
}

export function watchTemplateCsv() {
  return `${WATCH_COLUMNS.join(",")}\nperson,Full Name,Other spelling|الاسم بالعربية,1012345678,,SA,name@example.com,+966500000000,1985-04-12,,all,other,"Why this person needs a careful check",2026-10-05,,medium,stage,Check the company letter with the issuer\n`;
}

