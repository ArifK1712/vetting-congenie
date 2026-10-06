import { Tx } from "./actions";
import { can } from "./permissions";
import { DEFAULT_THRESHOLDS, matchIdentity, type MatchThresholds } from "./screening";
import { OPEN_STATUSES } from "./status";
import type { Database, ID, LocalizedText, SettingsHistoryEvent, VettingConfig } from "./types";

/**
 * Company-wide vetting settings: matching thresholds (9.4), More Information
 * link timing (8.5, 16), sender address (16), reject reasons (8.4) and email
 * templates (16). Every change is logged (19.1). Changes apply from now on;
 * past checks and decisions are never redone.
 */

export type SettingsError = "forbidden" | "stale" | "invalid" | "notFound" | "duplicate" | "system";
export type SettingsResult = { ok: true; db: Database } | { ok: false; error: SettingsError; issues?: ConfigIssue[]; templateIssues?: TemplateIssue[] };

const canEdit = (db: Database, actorId: ID) => can(db, actorId, "registration.vettingSettings");

function logSetting(tx: Tx, e: Omit<SettingsHistoryEvent, "id" | "at">, now: number) {
  const id = tx.id("sh");
  tx.db.settingsHistory = { ...tx.db.settingsHistory, [id]: { ...e, id, at: new Date(now).toISOString() } };
}

// ─── General settings ───────────────────────────────────────────────────

export type ConfigDraft = Pick<VettingConfig, "matching" | "moreInfo" | "senderAddress">;

export const LIMITS = {
  threshold: { min: 70, max: 100 },
  linkDays: { min: 1, max: 30 },
  reminderHours: { min: 1, max: 72 },
} as const;

export type ConfigIssueCode =
  | "thresholdRange"
  | "dobBelowName" // Name + DOB must be at least the Name-only threshold
  | "linkDaysRange"
  | "reminderRange"
  | "reminderAfterExpiry" // reminder must come before the link ends
  | "senderInvalid"
  | "matchingNeedsApprove"; // thresholds change who's matched: Blacklist Approve only

export interface ConfigIssue {
  code: ConfigIssueCode;
  field: "nameWithDob" | "nameOnly" | "linkDays" | "reminderHours" | "senderAddress";
}

export function draftOfConfig(c: VettingConfig): ConfigDraft {
  return { matching: { ...c.matching }, moreInfo: { ...c.moreInfo }, senderAddress: c.senderAddress };
}

const isInt = (n: number) => Number.isInteger(n);

export function validateConfig(db: Database, d: ConfigDraft, actorId: ID): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const { threshold, linkDays, reminderHours } = LIMITS;
  for (const field of ["nameWithDob", "nameOnly"] as const) {
    const v = d.matching[field];
    if (!isInt(v) || v < threshold.min || v > threshold.max) issues.push({ code: "thresholdRange", field });
  }
  if (d.matching.nameWithDob < d.matching.nameOnly) issues.push({ code: "dobBelowName", field: "nameWithDob" });
  if (!isInt(d.moreInfo.linkDays) || d.moreInfo.linkDays < linkDays.min || d.moreInfo.linkDays > linkDays.max) issues.push({ code: "linkDaysRange", field: "linkDays" });
  if (!isInt(d.moreInfo.reminderHours) || d.moreInfo.reminderHours < reminderHours.min || d.moreInfo.reminderHours > reminderHours.max) {
    issues.push({ code: "reminderRange", field: "reminderHours" });
  } else if (d.moreInfo.reminderHours >= d.moreInfo.linkDays * 24) {
    issues.push({ code: "reminderAfterExpiry", field: "reminderHours" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.senderAddress.trim())) issues.push({ code: "senderInvalid", field: "senderAddress" });
  const m = db.config.matching;
  if ((d.matching.nameWithDob !== m.nameWithDob || d.matching.nameOnly !== m.nameOnly) && !can(db, actorId, "blacklist.approve")) {
    issues.push({ code: "matchingNeedsApprove", field: "nameOnly" });
  }
  return issues;
}

export function saveConfig(db: Database, a: { draft: ConfigDraft; actorId: ID; expectedRevision: number; now: number }): SettingsResult {
  if (!canEdit(db, a.actorId)) return { ok: false, error: "forbidden" };
  if (db.config.revision !== a.expectedRevision) return { ok: false, error: "stale" };
  const issues = validateConfig(db, a.draft, a.actorId);
  if (issues.length) return { ok: false, error: "invalid", issues };

  const before = db.config;
  const d = { ...a.draft, senderAddress: a.draft.senderAddress.trim() };
  const diffs: { area: SettingsHistoryEvent["area"]; changes: string[] }[] = [
    {
      area: "matching",
      changes: (["nameWithDob", "nameOnly"] as const).filter((k) => before.matching[k] !== d.matching[k]).map((k) => `${k}: ${before.matching[k]} → ${d.matching[k]}`),
    },
    {
      area: "moreInfo",
      changes: (["linkDays", "reminderHours"] as const).filter((k) => before.moreInfo[k] !== d.moreInfo[k]).map((k) => `${k}: ${before.moreInfo[k]} → ${d.moreInfo[k]}`),
    },
    { area: "sender", changes: before.senderAddress !== d.senderAddress ? [`${before.senderAddress} → ${d.senderAddress}`] : [] },
  ];
  if (diffs.every((x) => !x.changes.length)) return { ok: true, db };

  const tx = new Tx(db, a.now);
  tx.db.config = { ...before, ...d, revision: before.revision + 1, updatedAt: new Date(a.now).toISOString(), updatedBy: a.actorId };
  for (const x of diffs) if (x.changes.length) logSetting(tx, { area: x.area, action: "changed", changes: x.changes, actorId: a.actorId }, a.now);
  return { ok: true, db: tx.db };
}

/**
 * What new thresholds would do, measured on live requests (open, or approved
 * with a badge) against active list entries. Only a preview: saved
 * thresholds apply to checks from now on and never change past matches.
 */
export function thresholdImpact(db: Database, proposed: MatchThresholds) {
  const live = Object.values(db.requests).filter((r) => OPEN_STATUSES.includes(r.status) || r.status === "screening_hold" || (r.status === "approved" && r.badgeStatus === "issued"));
  const entries = [...Object.values(db.blacklist), ...Object.values(db.watchlist)].filter((e) => e.status === "active");
  const count = (t: MatchThresholds) => {
    const out = { strong: 0, possible: 0, requests: new Set<ID>() };
    for (const r of live) {
      const profile = db.attendees[r.attendeeId].profile;
      for (const e of entries) {
        if (e.eventScope !== "all" && !e.eventScope.includes(r.eventId)) continue;
        const m = matchIdentity(profile, e.identity, t);
        // Only name-based matches depend on thresholds.
        if (!m || (m.matchType !== "name" && m.matchType !== "nameDob")) continue;
        if (m.strength === "strong") out.strong++;
        else out.possible++;
        out.requests.add(r.id);
      }
    }
    return out;
  };
  const now = count(db.config.matching);
  const next = count(proposed);
  return {
    current: { strong: now.strong, possible: now.possible, requests: now.requests.size },
    proposed: { strong: next.strong, possible: next.possible, requests: next.requests.size },
    added: [...next.requests].filter((id) => !now.requests.has(id)).length,
    removed: [...now.requests].filter((id) => !next.requests.has(id)).length,
    checked: live.length,
  };
}

export const SPEC_DEFAULTS: ConfigDraft = {
  matching: { ...DEFAULT_THRESHOLDS },
  moreInfo: { linkDays: 7, reminderHours: 24 },
  senderAddress: "events@congenie.com",
};

// ─── Reject reasons (8.4) ───────────────────────────────────────────────

export const orderedReasons = (db: Database) => Object.values(db.rejectReasons).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

function checkLabel(db: Database, label: LocalizedText, exceptId?: ID): SettingsError | null {
  const en = label.en.trim().toLowerCase();
  if (!en) return "invalid";
  const clash = Object.values(db.rejectReasons).some((r) => r.id !== exceptId && r.label.en.trim().toLowerCase() === en);
  return clash ? "duplicate" : null;
}

/** "The company can edit the list." */
export function addReason(db: Database, a: { label: LocalizedText; actorId: ID; now: number }): SettingsResult & { reasonId?: ID } {
  if (!canEdit(db, a.actorId)) return { ok: false, error: "forbidden" };
  const err = checkLabel(db, a.label);
  if (err) return { ok: false, error: err };
  const tx = new Tx(db, a.now);
  const id = `rr_${tx.id("c").slice(2)}`;
  const label = { en: a.label.en.trim(), ar: a.label.ar.trim() || a.label.en.trim() };
  const order = Math.max(0, ...Object.values(db.rejectReasons).map((r) => r.order ?? 0)) + 1;
  tx.db.rejectReasons = { ...db.rejectReasons, [id]: { id, label, active: true, order } };
  logSetting(tx, { area: "rejectReasons", action: "added", changes: [label.en], actorId: a.actorId }, a.now);
  return { ok: true, db: tx.db, reasonId: id };
}

export function renameReason(db: Database, a: { id: ID; label: LocalizedText; actorId: ID; now: number }): SettingsResult {
  if (!canEdit(db, a.actorId)) return { ok: false, error: "forbidden" };
  const r = db.rejectReasons[a.id];
  if (!r) return { ok: false, error: "notFound" };
  const err = checkLabel(db, a.label, a.id);
  if (err) return { ok: false, error: err };
  const label = { en: a.label.en.trim(), ar: a.label.ar.trim() || a.label.en.trim() };
  if (label.en === r.label.en && label.ar === r.label.ar) return { ok: true, db };
  const tx = new Tx(db, a.now);
  tx.db.rejectReasons = { ...db.rejectReasons, [r.id]: { ...r, label } };
  logSetting(tx, { area: "rejectReasons", action: "changed", changes: [`${r.label.en} → ${label.en}`], actorId: a.actorId }, a.now);
  return { ok: true, db: tx.db };
}

/** Inactive reasons can't be picked any more but stay on past decisions. Blacklisted can't be turned off. */
export function setReasonActive(db: Database, a: { id: ID; active: boolean; actorId: ID; now: number }): SettingsResult {
  if (!canEdit(db, a.actorId)) return { ok: false, error: "forbidden" };
  const r = db.rejectReasons[a.id];
  if (!r) return { ok: false, error: "notFound" };
  if (r.system && !a.active) return { ok: false, error: "system" };
  if (r.active === a.active) return { ok: true, db };
  const reviewerChoices = Object.values(db.rejectReasons).filter((x) => x.active && !x.system && x.id !== r.id);
  if (!a.active && !reviewerChoices.length) return { ok: false, error: "invalid" }; // keep at least one choice
  const tx = new Tx(db, a.now);
  tx.db.rejectReasons = { ...db.rejectReasons, [r.id]: { ...r, active: a.active } };
  logSetting(tx, { area: "rejectReasons", action: a.active ? "reactivated" : "deactivated", changes: [r.label.en], actorId: a.actorId }, a.now);
  return { ok: true, db: tx.db };
}

export function moveReason(db: Database, a: { id: ID; direction: -1 | 1; actorId: ID; now: number }): SettingsResult {
  if (!canEdit(db, a.actorId)) return { ok: false, error: "forbidden" };
  const list = orderedReasons(db);
  const i = list.findIndex((r) => r.id === a.id);
  const j = i + a.direction;
  if (i < 0) return { ok: false, error: "notFound" };
  if (j < 0 || j >= list.length) return { ok: true, db };
  [list[i], list[j]] = [list[j], list[i]];
  const tx = new Tx(db, a.now);
  tx.db.rejectReasons = Object.fromEntries(list.map((r, k) => [r.id, { ...r, order: k + 1 }]));
  logSetting(tx, { area: "rejectReasons", action: "reordered", changes: [list[j].label.en], actorId: a.actorId }, a.now);
  return { ok: true, db: tx.db };
}

// ─── Email templates (16) ───────────────────────────────────────────────

/** Each template and the values it may use. Built-in wording lives in messages (outbox.templates.*). */
export const TEMPLATE_PARAMS: Record<string, string[]> = {
  submitted: ["name"],
  more_info: ["name", "date"],
  more_info_reminder: ["name", "date"],
  approved: ["name"],
  rejected: ["name"],
  watchlist_match: ["id", "entry", "level"],
  blacklist_entry_waiting: ["entry"],
  blacklist_match: ["id", "entry"],
  badge_suspended: ["id", "entry"],
  configuration_error: ["id", "registration"],
  new_question: ["registration", "question"],
  report_scheduled: ["report", "frequency", "rows", "format"],
};
export const TEMPLATE_KEYS = Object.keys(TEMPLATE_PARAMS);

/** Attendee emails never mention the lists (16: "No email or page ever tells the attendee about the blacklist or watchlist"). */
export const ATTENDEE_TEMPLATES = ["submitted", "more_info", "more_info_reminder", "approved", "rejected"];
const LIST_WORDS = /blacklist|watchlist|black list|watch list|القائمة السوداء|قائمة المراقبة/i;

export type TemplateIssueCode = "empty" | "unknownPlaceholder" | "mentionsLists";
export interface TemplateIssue {
  code: TemplateIssueCode;
  field: "subject" | "body";
  locale: "en" | "ar";
  placeholder?: string;
}

export function validateTemplate(key: string, subject: LocalizedText, body: LocalizedText): TemplateIssue[] {
  const allowed = new Set(TEMPLATE_PARAMS[key] ?? []);
  const issues: TemplateIssue[] = [];
  for (const [field, text] of [["subject", subject], ["body", body]] as const) {
    for (const locale of ["en", "ar"] as const) {
      const v = text[locale];
      if (!v.trim()) issues.push({ code: "empty", field, locale });
      for (const m of v.matchAll(/\{(\w+)\}/g)) if (!allowed.has(m[1])) issues.push({ code: "unknownPlaceholder", field, locale, placeholder: m[1] });
      if (ATTENDEE_TEMPLATES.includes(key) && LIST_WORDS.test(v)) issues.push({ code: "mentionsLists", field, locale });
    }
  }
  return issues;
}

export function saveTemplate(db: Database, a: { key: string; subject: LocalizedText; body: LocalizedText; actorId: ID; now: number }): SettingsResult {
  if (!canEdit(db, a.actorId)) return { ok: false, error: "forbidden" };
  if (!TEMPLATE_PARAMS[a.key]) return { ok: false, error: "notFound" };
  const issues = validateTemplate(a.key, a.subject, a.body);
  if (issues.length) return { ok: false, error: "invalid", templateIssues: issues };
  const tx = new Tx(db, a.now);
  tx.db.emailTemplates = { ...db.emailTemplates, [a.key]: { key: a.key, subject: a.subject, body: a.body, updatedAt: new Date(a.now).toISOString(), updatedBy: a.actorId } };
  logSetting(tx, { area: "emailTemplates", action: "changed", changes: [a.key], actorId: a.actorId }, a.now);
  return { ok: true, db: tx.db };
}

/** Back to the built-in wording. */
export function resetTemplate(db: Database, a: { key: string; actorId: ID; now: number }): SettingsResult {
  if (!canEdit(db, a.actorId)) return { ok: false, error: "forbidden" };
  if (!db.emailTemplates[a.key]) return { ok: true, db };
  const tx = new Tx(db, a.now);
  const rest = { ...db.emailTemplates };
  delete rest[a.key];
  tx.db.emailTemplates = rest;
  logSetting(tx, { area: "emailTemplates", action: "reset", changes: [a.key], actorId: a.actorId }, a.now);
  return { ok: true, db: tx.db };
}

/** Fills {placeholders} in an edited template. Unknown ones stay as written. */
export function fillTemplate(text: string, params: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (all, k: string) => (k in params ? params[k] : all));
}
