import { Tx } from "./actions";
import { can } from "./permissions";
import { matchIdentity, normalizeId, normalizeName, thresholdsOf } from "./screening";
import { canTransition, OPEN_STATUSES } from "./status";
import type {
  BlacklistContent,
  BlacklistEntry,
  BlacklistHistoryEvent,
  BlacklistReason,
  Database,
  ID,
  ListIdentity,
  MatchType,
  ScreeningField,
} from "./types";

/**
 * Blacklist management (spec 9): entry rules, approval by a second person,
 * re-checking existing requests when an entry becomes active, removal and
 * file import. Pure functions over the Database.
 */

export const REASON_TYPES: BlacklistReason[] = ["security_threat", "past_misconduct", "fake_registration", "authority_instruction", "unpaid_dues", "other"];
export const MAX_ALIASES = 5;
export const DETAIL_MAX = 1000;
export const EVIDENCE_MAX = 5;
export const EVIDENCE_MAX_KB = 10 * 1024;
export const EVIDENCE_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"];

const DAY = 86_400_000;

export type EntryDraft = Omit<BlacklistContent, "reasonType"> & { reasonType: BlacklistReason | null };

export type EffectiveStatus = BlacklistEntry["status"] | "change_pending";

/** Active entries past their end date count as expired. */
export function effectiveStatus(e: BlacklistEntry, now: number): BlacklistEntry["status"] {
  if (e.status === "active" && e.endsOn && Date.parse(e.endsOn) < now) return "expired";
  return e.status;
}

export const needsApproval = (e: BlacklistEntry) => e.status === "pending_approval" || !!e.pendingChange;

/** Who has to stay out of the approval: the person who proposed what is waiting. */
export const makerOf = (e: BlacklistEntry) => e.pendingChange?.proposedBy ?? e.proposedBy;

export function emptyDraft(now: number): EntryDraft {
  return {
    identity: { subjectType: "person", fullName: "", aliases: [] },
    eventScope: "all",
    reasonType: null,
    reasonDetail: "",
    evidence: [],
    startsOn: new Date(now).toISOString().slice(0, 10),
    endsOn: null,
  };
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

export function draftFromEntry(e: BlacklistEntry): EntryDraft {
  const c = e.pendingChange ?? e;
  return {
    identity: structuredClone(c.identity),
    eventScope: c.eventScope === "all" ? "all" : [...c.eventScope],
    reasonType: c.reasonType,
    reasonDetail: c.reasonDetail,
    evidence: c.evidence.map((x) => ({ ...x })),
    startsOn: day(c.startsOn)!,
    endsOn: day(c.endsOn),
  };
}

/** "Add to Blacklist" from a request: filled in from the applicant's data. */
export function draftFromRequest(db: Database, requestId: ID, now: number): EntryDraft | null {
  const r = db.requests[requestId];
  const a = r ? db.attendees[r.attendeeId] : null;
  if (!r || !a) return null;
  const p = a.profile;
  return {
    ...emptyDraft(now),
    identity: {
      subjectType: "person",
      fullName: p.fullName,
      aliases: p.fullNameAr ? [p.fullNameAr] : [],
      nationalId: p.nationalId,
      passportNo: p.passportNo,
      nationality: p.nationality,
      email: p.email,
      mobile: p.mobile,
      dob: p.dob,
    },
    eventScope: [r.eventId],
  };
}

// ─── Validation (9.2) ───────────────────────────────────────────────────

export type EntryIssueCode =
  | "nameRequired"
  | "tooManyAliases"
  | "idRequired"
  | "nationalityRequired"
  | "companyRequired"
  | "emailInvalid"
  | "dobInvalid"
  | "eventsRequired"
  | "reasonTypeRequired"
  | "reasonDetailRequired"
  | "reasonDetailTooLong"
  | "tooManyFiles"
  | "fileTooLarge"
  | "fileType"
  | "startRequired"
  | "endBeforeStart"
  | "possibleDuplicate";

export interface EntryIssue {
  code: EntryIssueCode;
  severity: "error" | "warning";
  /** The other entry (duplicates) or file (evidence). */
  ref?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function validateEntry(db: Database, d: EntryDraft, entryId: ID | null, now: number): EntryIssue[] {
  const issues: EntryIssue[] = [];
  const add = (code: EntryIssueCode, ref?: string, severity: EntryIssue["severity"] = "error") => issues.push({ code, ref, severity });
  const id = d.identity;
  if (!id.fullName.trim()) add("nameRequired");
  if (id.aliases.length > MAX_ALIASES) add("tooManyAliases");
  if (id.subjectType === "person") {
    const hasId = !!id.nationalId?.trim();
    const hasPassport = !!id.passportNo?.trim();
    if (!hasId && !hasPassport) add("idRequired");
    if (hasPassport && !id.nationality) add("nationalityRequired");
  } else if (!id.company?.trim()) add("companyRequired");
  if (id.email && !EMAIL.test(id.email.trim())) add("emailInvalid");
  if (id.dob && (!YMD.test(id.dob) || Date.parse(id.dob) > now)) add("dobInvalid");
  if (d.eventScope !== "all" && d.eventScope.length === 0) add("eventsRequired");
  if (!d.reasonType) add("reasonTypeRequired");
  if (!d.reasonDetail.trim()) add("reasonDetailRequired");
  if (d.reasonDetail.length > DETAIL_MAX) add("reasonDetailTooLong");
  if (d.evidence.length > EVIDENCE_MAX) add("tooManyFiles");
  for (const f of d.evidence) {
    if (f.sizeKb > EVIDENCE_MAX_KB) add("fileTooLarge", f.fileName);
    if (!EVIDENCE_EXTENSIONS.includes(f.fileName.split(".").pop()?.toLowerCase() ?? "")) add("fileType", f.fileName);
  }
  if (!d.startsOn) add("startRequired");
  if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) add("endBeforeStart");
  const dup = findDuplicate(db, id, entryId);
  if (dup) add("possibleDuplicate", dup, "warning");
  return issues;
}

export const errorsOf = (issues: EntryIssue[]) => issues.filter((i) => i.severity === "error");

/** Another live entry for the same ID number, passport, or company. */
export function findDuplicate(db: Database, id: ListIdentity, entryId: ID | null): ID | null {
  for (const e of Object.values(db.blacklist)) {
    if (e.id === entryId || e.status === "removed" || e.status === "not_approved") continue;
    const o = e.identity;
    if (id.nationalId && o.nationalId && normalizeId(id.nationalId) === normalizeId(o.nationalId)) return e.id;
    if (id.passportNo && o.passportNo && normalizeId(id.passportNo) === normalizeId(o.passportNo)) return e.id;
    if (id.subjectType === "company" && o.subjectType === "company" && id.company && o.company && normalizeName(id.company) === normalizeName(o.company)) return e.id;
  }
  return null;
}

// ─── Who it would match ─────────────────────────────────────────────────

const inScope = (scope: "all" | ID[], eventId: ID) => scope === "all" || scope.includes(eventId);

export interface RetroHit {
  requestId: ID;
  matchType: MatchType;
  matchedField: ScreeningField;
  score: number;
  strength: "strong" | "possible";
  /** Approved with a badge: the badge would be suspended. */
  approved: boolean;
}

/**
 * Requests an identity would match today: in progress or approved, in the
 * entry's events, and not a pair already cleared as "not the same person".
 */
export function retroMatches(db: Database, identity: ListIdentity, eventScope: "all" | ID[], entryId: ID | null): RetroHit[] {
  const hits: RetroHit[] = [];
  if (!identity.fullName.trim() && !identity.company?.trim()) return hits;
  for (const r of Object.values(db.requests)) {
    const live = OPEN_STATUSES.includes(r.status) || r.status === "screening_hold" || (r.status === "approved" && r.badgeStatus === "issued");
    if (!live || !inScope(eventScope, r.eventId)) continue;
    if (entryId && Object.values(db.matches).some((m) => m.requestId === r.id && m.entryId === entryId)) continue;
    const m = matchIdentity(db.attendees[r.attendeeId].profile, identity, thresholdsOf(db));
    if (m) hits.push({ requestId: r.id, ...m, approved: r.status === "approved" });
  }
  return hits;
}

// ─── Actions ────────────────────────────────────────────────────────────

export type BlacklistError = "forbidden" | "notFound" | "stale" | "invalid" | "ownProposal" | "notWaiting" | "notEditable" | "notActive" | "noteRequired";

export type BlacklistResult =
  | { ok: true; db: Database; entryId: ID; matched?: number; suspended?: number }
  | { ok: false; error: BlacklistError; issues?: EntryIssue[] };

interface Actor {
  actorId: ID;
  now: number;
}

const iso = (ms: number) => new Date(ms).toISOString();
const toIso = (ymd: string | null) => (ymd ? `${ymd}T00:00:00.000Z` : null);

function content(d: EntryDraft): BlacklistContent {
  const id = d.identity;
  const clean = (s?: string) => (s?.trim() ? s.trim() : undefined);
  return {
    identity: {
      subjectType: id.subjectType,
      fullName: id.fullName.trim(),
      aliases: id.aliases.map((a) => a.trim()).filter(Boolean),
      nationalId: id.subjectType === "person" ? clean(id.nationalId) : undefined,
      passportNo: id.subjectType === "person" ? clean(id.passportNo) : undefined,
      nationality: id.subjectType === "person" ? id.nationality || undefined : undefined,
      email: clean(id.email)?.toLowerCase(),
      mobile: clean(id.mobile),
      dob: id.subjectType === "person" ? clean(id.dob) : undefined,
      company: clean(id.company),
    },
    eventScope: d.eventScope,
    reasonType: d.reasonType!,
    reasonDetail: d.reasonDetail.trim(),
    evidence: d.evidence,
    startsOn: toIso(d.startsOn)!,
    endsOn: toIso(d.endsOn),
  };
}

function log(tx: Tx, e: Omit<BlacklistHistoryEvent, "id">) {
  tx.put("blacklistHistory", { ...e, id: tx.id("blh") });
}

function nextEntryId(db: Database) {
  const max = Math.max(100, ...Object.keys(db.blacklist).map((k) => Number(k.replace(/\D/g, "")) || 0));
  return (n: number) => `BL-${String(max + n).padStart(4, "0")}`;
}

/** Puts a request on Screening Hold for an entry (from the request, or retro). */
function holdRequest(tx: Tx, requestId: ID, entryId: ID, hit: Omit<RetroHit, "requestId" | "approved">, actorId: ID | "system", now: number) {
  const r = tx.db.requests[requestId];
  tx.put("matches", {
    id: tx.id("m"),
    requestId,
    listType: "blacklist",
    entryId,
    matchType: hit.matchType,
    matchedField: hit.matchedField,
    score: hit.score,
    strength: hit.strength,
    stagePoint: "retro",
    status: "open",
    foundAt: iso(now),
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  });
  if (r.status === "approved") {
    if (r.badgeStatus === "issued") {
      tx.updateRequest(r, { badgeStatus: "suspended", screening: "blacklist_hit" });
      tx.log({ requestId, action: "badge_suspended", actorId: "system", remarks: entryId });
      tx.emailStaff("registration.vettingSettings", "badge_suspended", requestId, { entry: entryId });
      return "suspended" as const;
    }
    return null;
  }
  if (canTransition(r.status, "screening_hold")) {
    tx.updateRequest(r, { status: "screening_hold", claimedBy: null, screening: "blacklist_hit", stageEnteredAt: iso(now) });
    tx.log({ requestId, action: "screening_hold", actorId, fromStatus: r.status, toStatus: "screening_hold", remarks: entryId });
    tx.emailStaff("blacklist.approve", "blacklist_match", requestId, { entry: entryId });
  } else {
    tx.updateRequest(r, { screening: "blacklist_hit" });
  }
  return "held" as const;
}

/** 9.5: when an entry becomes active, requests in progress or approved are checked again. */
function retroScreen(tx: Tx, entry: BlacklistEntry, now: number) {
  let matched = 0;
  let suspended = 0;
  for (const hit of retroMatches(tx.db, entry.identity, entry.eventScope, entry.id)) {
    const result = holdRequest(tx, hit.requestId, entry.id, hit, "system", now);
    if (result) matched++;
    if (result === "suspended") suspended++;
  }
  return { matched, suspended };
}

export function proposeEntry(
  db: Database,
  a: Actor & { draft: EntryDraft; source: BlacklistEntry["source"]; sourceRequestId?: ID | null },
): BlacklistResult {
  if (!can(db, a.actorId, "blacklist.propose")) return { ok: false, error: "forbidden" };
  const issues = validateEntry(db, a.draft, null, a.now);
  if (errorsOf(issues).length) return { ok: false, error: "invalid", issues };
  const tx = new Tx(db, a.now);
  const id = nextEntryId(db)(1);
  const at = iso(a.now);
  const entry: BlacklistEntry = {
    id,
    ...content(a.draft),
    status: "pending_approval",
    proposedBy: a.actorId,
    proposedAt: at,
    approvedBy: null,
    approvedAt: null,
    source: a.source,
    sourceRequestId: a.sourceRequestId ?? null,
    pendingChange: null,
    decisionNote: null,
    removedBy: null,
    removedAt: null,
    removalReason: null,
    revision: 1,
    updatedAt: at,
  };
  tx.put("blacklist", entry);
  log(tx, { entryId: id, action: "proposed", actorId: a.actorId, at, note: a.sourceRequestId ? `From request ${a.sourceRequestId}` : undefined });
  tx.emailStaff("blacklist.approve", "blacklist_entry_waiting", null, { entry: id }, a.actorId);

  // Spec 9 table: Add to Blacklist from a request puts that request on Screening Hold.
  if (a.sourceRequestId && tx.db.requests[a.sourceRequestId]) {
    const r = tx.db.requests[a.sourceRequestId];
    const m = matchIdentity(tx.db.attendees[r.attendeeId].profile, entry.identity, thresholdsOf(tx.db)) ?? { matchType: "id" as const, matchedField: "fullName" as const, score: 100, strength: "strong" as const };
    holdRequest(tx, r.id, id, m, a.actorId, a.now);
  }
  return { ok: true, db: tx.db, entryId: id };
}

/** Several entries from a file; each waits for approval like any other. */
export function importEntries(db: Database, a: Actor & { drafts: EntryDraft[] }): { ok: true; db: Database; ids: ID[] } | { ok: false; error: BlacklistError } {
  if (!can(db, a.actorId, "blacklist.propose")) return { ok: false, error: "forbidden" };
  let next = db;
  const ids: ID[] = [];
  for (const d of a.drafts) {
    const r = proposeEntry(next, { ...a, draft: d, source: "import" });
    if (!r.ok) return { ok: false, error: r.error };
    next = r.db;
    ids.push(r.entryId);
  }
  return { ok: true, db: next, ids };
}

/**
 * Editing. A waiting or not-approved entry is changed in place and waits
 * again, with the editor as proposer. An active entry keeps working as it
 * is; the edit becomes a proposed change for a second person (9.3).
 */
export function editEntry(db: Database, a: Actor & { entryId: ID; draft: EntryDraft; expectedRevision: number }): BlacklistResult {
  if (!can(db, a.actorId, "blacklist.propose")) return { ok: false, error: "forbidden" };
  const e = db.blacklist[a.entryId];
  if (!e) return { ok: false, error: "notFound" };
  if (e.revision !== a.expectedRevision) return { ok: false, error: "stale" };
  const status = effectiveStatus(e, a.now);
  if (status === "removed" || status === "expired") return { ok: false, error: "notEditable" };
  const issues = validateEntry(db, a.draft, e.id, a.now);
  if (errorsOf(issues).length) return { ok: false, error: "invalid", issues };
  const tx = new Tx(db, a.now);
  const at = iso(a.now);
  if (status === "active") {
    tx.put("blacklist", { ...e, pendingChange: { ...content(a.draft), proposedBy: a.actorId, proposedAt: at }, decisionNote: null, revision: e.revision + 1, updatedAt: at });
    log(tx, { entryId: e.id, action: "change_proposed", actorId: a.actorId, at });
    tx.emailStaff("blacklist.approve", "blacklist_entry_waiting", null, { entry: e.id, change: "yes" }, a.actorId);
  } else {
    tx.put("blacklist", { ...e, ...content(a.draft), status: "pending_approval", proposedBy: a.actorId, proposedAt: at, decisionNote: null, revision: e.revision + 1, updatedAt: at });
    log(tx, { entryId: e.id, action: "edited", actorId: a.actorId, at });
  }
  return { ok: true, db: tx.db, entryId: e.id };
}

export function approveEntry(db: Database, a: Actor & { entryId: ID; expectedRevision: number }): BlacklistResult {
  if (!can(db, a.actorId, "blacklist.approve")) return { ok: false, error: "forbidden" };
  const e = db.blacklist[a.entryId];
  if (!e) return { ok: false, error: "notFound" };
  if (e.revision !== a.expectedRevision) return { ok: false, error: "stale" };
  if (!needsApproval(e)) return { ok: false, error: "notWaiting" };
  if (makerOf(e) === a.actorId) return { ok: false, error: "ownProposal" };

  const tx = new Tx(db, a.now);
  const at = iso(a.now);
  const isChange = !!e.pendingChange;
  const pc = e.pendingChange;
  const next: BlacklistEntry = pc
    ? {
        ...e,
        identity: pc.identity,
        eventScope: pc.eventScope,
        reasonType: pc.reasonType,
        reasonDetail: pc.reasonDetail,
        evidence: pc.evidence,
        startsOn: pc.startsOn,
        endsOn: pc.endsOn,
        pendingChange: null,
        revision: e.revision + 1,
        updatedAt: at,
      }
    : { ...e, status: "active", approvedBy: a.actorId, approvedAt: at, revision: e.revision + 1, updatedAt: at };
  tx.put("blacklist", next);
  const result = Date.parse(next.startsOn) <= a.now ? retroScreen(tx, next, a.now) : { matched: 0, suspended: 0 };
  log(tx, { entryId: e.id, action: isChange ? "change_approved" : "approved", actorId: a.actorId, at, ...result });
  return { ok: true, db: tx.db, entryId: e.id, ...result };
}

/** Not approved: a new entry closes; a proposed change is dropped. Requests held only by it go back. */
export function rejectEntry(db: Database, a: Actor & { entryId: ID; expectedRevision: number; note: string }): BlacklistResult {
  if (!can(db, a.actorId, "blacklist.approve")) return { ok: false, error: "forbidden" };
  const e = db.blacklist[a.entryId];
  if (!e) return { ok: false, error: "notFound" };
  if (e.revision !== a.expectedRevision) return { ok: false, error: "stale" };
  if (!needsApproval(e)) return { ok: false, error: "notWaiting" };
  if (makerOf(e) === a.actorId) return { ok: false, error: "ownProposal" };
  if (!a.note.trim()) return { ok: false, error: "noteRequired" };

  const tx = new Tx(db, a.now);
  const at = iso(a.now);
  if (e.pendingChange) {
    tx.put("blacklist", { ...e, pendingChange: null, decisionNote: a.note.trim(), revision: e.revision + 1, updatedAt: at });
    log(tx, { entryId: e.id, action: "change_rejected", actorId: a.actorId, at, note: a.note.trim() });
    return { ok: true, db: tx.db, entryId: e.id };
  }
  tx.put("blacklist", { ...e, status: "not_approved", decisionNote: a.note.trim(), revision: e.revision + 1, updatedAt: at });
  log(tx, { entryId: e.id, action: "not_approved", actorId: a.actorId, at, note: a.note.trim() });
  releaseHolds(tx, e.id, a.actorId, "Blacklist entry not approved.", a.now);
  return { ok: true, db: tx.db, entryId: e.id };
}

/** Clears open matches for an entry that never became active; requests with no other hold go back. */
function releaseHolds(tx: Tx, entryId: ID, actorId: ID, note: string, now: number) {
  for (const m of Object.values(tx.db.matches)) {
    if (m.entryId !== entryId || m.status !== "open") continue;
    tx.put("matches", { ...m, status: "cleared", decidedBy: actorId, decidedAt: iso(now), decisionNote: note });
    const r = tx.db.requests[m.requestId];
    const other = Object.values(tx.db.matches).some((x) => x.requestId === r.id && x.listType === "blacklist" && x.status === "open" && x.entryId !== entryId);
    if (r.status === "screening_hold" && !other) {
      tx.updateRequest(r, { status: "pending_review", screening: "clear", stageEnteredAt: iso(now) });
      tx.log({ requestId: r.id, action: "match_cleared", actorId, fromStatus: "screening_hold", toStatus: "pending_review", remarks: note });
    }
  }
}

/** 9.3: removing an active entry needs a reason and is logged. Existing decisions stay. */
export function removeEntry(db: Database, a: Actor & { entryId: ID; expectedRevision: number; reason: string }): BlacklistResult {
  if (!can(db, a.actorId, "blacklist.approve")) return { ok: false, error: "forbidden" };
  const e = db.blacklist[a.entryId];
  if (!e) return { ok: false, error: "notFound" };
  if (e.revision !== a.expectedRevision) return { ok: false, error: "stale" };
  if (e.status !== "active") return { ok: false, error: "notActive" };
  if (!a.reason.trim()) return { ok: false, error: "noteRequired" };
  const tx = new Tx(db, a.now);
  const at = iso(a.now);
  tx.put("blacklist", { ...e, status: "removed", pendingChange: null, removedBy: a.actorId, removedAt: at, removalReason: a.reason.trim(), revision: e.revision + 1, updatedAt: at });
  log(tx, { entryId: e.id, action: "removed", actorId: a.actorId, at, note: a.reason.trim() });
  return { ok: true, db: tx.db, entryId: e.id };
}

// ─── Import (Excel / CSV template) ──────────────────────────────────────

export const TEMPLATE_COLUMNS = [
  "type",
  "full_name",
  "other_names",
  "national_id",
  "passport_no",
  "nationality",
  "email",
  "mobile",
  "date_of_birth",
  "company",
  "events",
  "reason_type",
  "reason_details",
  "start_date",
  "end_date",
] as const;

/** RFC 4180-style CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export interface ImportRow {
  line: number;
  draft: EntryDraft;
  issues: EntryIssue[];
  /** Problems reading the row itself (unknown event code, bad type…). */
  readErrors: ImportError[];
}

/**
 * A problem reading an import file or row, as a code plus parameters so the
 * screen can show it in the user's language. Blacklist codes: empty,
 * missingColumns {columns}, badType {value}, unknownEvent {code},
 * unknownReason {value}, duplicateRow. Other lists (watchlist) add their own.
 */
export interface ImportError {
  code: string;
  params?: Record<string, string>;
}

export function readImport(db: Database, text: string, now: number): { rows: ImportRow[]; headerError: ImportError | null } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], headerError: { code: "empty" } };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = TEMPLATE_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], headerError: { code: "missingColumns", params: { columns: missing.join(", ") } } };
  const col = (r: string[], c: (typeof TEMPLATE_COLUMNS)[number]) => (r[header.indexOf(c)] ?? "").trim();
  const codes = new Map(Object.values(db.events).map((e) => [e.code.toUpperCase(), e.id]));

  const seen: ListIdentity[] = [];
  const rows = table.slice(1).map((r, i): ImportRow => {
    const readErrors: ImportError[] = [];
    const type = col(r, "type").toLowerCase();
    if (type !== "person" && type !== "company") readErrors.push({ code: "badType", params: { value: col(r, "type") } });
    const eventsRaw = col(r, "events");
    let eventScope: "all" | ID[] = "all";
    if (eventsRaw && eventsRaw.toLowerCase() !== "all") {
      eventScope = [];
      for (const code of eventsRaw.split("|").map((x) => x.trim().toUpperCase()).filter(Boolean)) {
        const id = codes.get(code);
        if (id) eventScope.push(id);
        else readErrors.push({ code: "unknownEvent", params: { code } });
      }
    }
    const reasonRaw = col(r, "reason_type").toLowerCase().replace(/[\s-]+/g, "_");
    const reasonType = REASON_TYPES.find((x) => x === reasonRaw || x.startsWith(reasonRaw)) ?? null;
    if (col(r, "reason_type") && !reasonType) readErrors.push({ code: "unknownReason", params: { value: col(r, "reason_type") } });
    const draft: EntryDraft = {
      identity: {
        subjectType: type === "company" ? "company" : "person",
        fullName: col(r, "full_name"),
        aliases: col(r, "other_names").split("|").map((x) => x.trim()).filter(Boolean),
        nationalId: col(r, "national_id") || undefined,
        passportNo: col(r, "passport_no") || undefined,
        nationality: col(r, "nationality").toUpperCase() || undefined,
        email: col(r, "email") || undefined,
        mobile: col(r, "mobile") || undefined,
        dob: col(r, "date_of_birth") || undefined,
        company: col(r, "company") || undefined,
      },
      eventScope,
      reasonType,
      reasonDetail: col(r, "reason_details"),
      evidence: [],
      startsOn: col(r, "start_date") || new Date(now).toISOString().slice(0, 10),
      endsOn: col(r, "end_date") || null,
    };
    const unknownEvents = readErrors.some((e) => e.code === "unknownEvent");
    const issues = validateEntry(db, draft, null, now).filter((x) => !(unknownEvents && x.code === "eventsRequired"));
    // The same person twice in one file.
    const twin = seen.find((s) => (s.nationalId && s.nationalId === draft.identity.nationalId) || (s.passportNo && s.passportNo === draft.identity.passportNo));
    if (twin) readErrors.push({ code: "duplicateRow" });
    seen.push(draft.identity);
    return { line: i + 2, draft, issues, readErrors };
  });
  return { rows, headerError: null };
}

export const rowReady = (r: ImportRow) => !r.readErrors.length && !errorsOf(r.issues).length;

export function templateCsv() {
  return `${TEMPLATE_COLUMNS.join(",")}\nperson,Full Name,Other spelling|الاسم بالعربية,1012345678,,SA,name@example.com,+966500000000,1985-04-12,,all,security_threat,"What happened, and who reported it",2026-10-05,\n`;
}

export const DAY_MS = DAY;
