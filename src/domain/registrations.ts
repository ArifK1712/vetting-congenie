import { Tx } from "./actions";
import { can } from "./permissions";
import type {
  ApplicantProfile,
  Database,
  FormQuestion,
  ID,
  QuestionType,
  Registration,
  RegistrationVettingSettings,
  ScreeningField,
} from "./types";

/**
 * Registration vetting settings (spec 7) and the vetting settings on form
 * questions (15.1). Pure functions over the Database, like the rest of domain/.
 */

// ─── The registration form ──────────────────────────────────────────────

/**
 * Standard attendee-detail questions every registration form has. They fill the
 * attendee profile; custom questions (reg.questions) fill `answers`.
 */
export const STANDARD_QUESTIONS: FormQuestion[] = [
  { id: "std_fullName", profileField: "fullName", required: true, type: "text", label: { en: "Full name", ar: "الاسم الكامل" } },
  { id: "std_fullNameAr", profileField: "fullNameAr", type: "text", label: { en: "Full name in Arabic", ar: "الاسم الكامل بالعربية" } },
  { id: "std_email", profileField: "email", required: true, type: "text", label: { en: "Email", ar: "البريد الإلكتروني" } },
  { id: "std_mobile", profileField: "mobile", required: true, type: "text", label: { en: "Mobile", ar: "الجوال" } },
  { id: "std_nationality", profileField: "nationality", required: true, type: "singleChoice", label: { en: "Nationality", ar: "الجنسية" } },
  { id: "std_nationalId", profileField: "nationalId", type: "text", label: { en: "National ID / Iqama", ar: "الهوية الوطنية / الإقامة" } },
  { id: "std_passportNo", profileField: "passportNo", type: "text", label: { en: "Passport number", ar: "رقم جواز السفر" } },
  { id: "std_dob", profileField: "dob", required: true, type: "date", label: { en: "Date of birth", ar: "تاريخ الميلاد" } },
  { id: "std_company", profileField: "company", required: true, type: "text", label: { en: "Company", ar: "الشركة" } },
  { id: "std_jobTitle", profileField: "jobTitle", type: "text", label: { en: "Job title", ar: "المسمى الوظيفي" } },
];

/** All questions on a registration's form, standard first. */
export function formOf(reg: Registration): FormQuestion[] {
  return [...STANDARD_QUESTIONS, ...reg.questions];
}

export const SCREENING_FIELDS: ScreeningField[] = ["fullName", "nationalId", "passportNo", "nationality", "dob", "email", "mobile", "company"];

/** Where each identifier sits by default: the standard question of the same name. */
export const DEFAULT_ID_FIELDS: Record<ScreeningField, ID> = {
  fullName: "std_fullName",
  nationalId: "std_nationalId",
  passportNo: "std_passportNo",
  nationality: "std_nationality",
  dob: "std_dob",
  email: "std_email",
  mobile: "std_mobile",
  company: "std_company",
};

/** Questions that can hold an identifier (free text, a choice, or a date). */
export const canHoldId = (q: FormQuestion) => q.type !== "upload" && q.type !== "multiChoice";

/** Questions that can be used in team / workflow conditions. */
export const canUseInVetting = (q: FormQuestion) => q.type !== "upload" && !q.profileField;

// ─── Badge type coverage (7, AC30) ──────────────────────────────────────

export interface CoverageRow {
  badgeTypeId: ID;
  /** The active workflow allotted for this registration + badge type. */
  workflowId: ID | null;
  versionNo: number | null;
  behaviour: "noVetting" | "block" | null;
}

export function badgeCoverage(db: Database, registrationId: ID, behaviour?: RegistrationVettingSettings["uncoveredBadgeBehaviour"]): CoverageRow[] {
  const reg = db.registrations[registrationId];
  const settings = db.vettingSettings[registrationId];
  const chosen = behaviour ?? settings?.uncoveredBadgeBehaviour ?? {};
  return reg.badgeTypeIds.map((badgeTypeId) => {
    const allot = Object.values(db.allotments).find(
      (a) => a.registrationId === registrationId && a.badgeTypeId === badgeTypeId && db.workflows[a.workflowId]?.status === "active",
    );
    const wf = allot ? db.workflows[allot.workflowId] : null;
    const version = wf?.currentVersionId ? db.workflowVersions[wf.currentVersionId] : null;
    return {
      badgeTypeId,
      workflowId: wf?.id ?? null,
      versionNo: version?.versionNo ?? null,
      behaviour: wf ? null : (chosen[badgeTypeId] ?? null),
    };
  });
}

// ─── Settings draft and checks (7, 15.1, AC23, AC30) ────────────────────

export type SettingsDraft = Omit<RegistrationVettingSettings, "registrationId" | "revision" | "updatedAt" | "updatedBy">;

export function draftOf(s: RegistrationVettingSettings): SettingsDraft {
  return {
    enabled: s.enabled,
    uncoveredBadgeBehaviour: { ...s.uncoveredBadgeBehaviour },
    blacklistScreening: s.blacklistScreening,
    blacklistMatchAction: s.blacklistMatchAction,
    watchlistScreening: s.watchlistScreening,
    rejectionTemplateId: s.rejectionTemplateId,
    idFields: { ...s.idFields },
    vettingQuestions: [...s.vettingQuestions],
  };
}

export type SettingsIssueCode =
  | "noFullName" // AC23
  | "noStrongId" // AC23: National ID, or Passport + Nationality
  | "noDob" // warning
  | "uncoveredBadge" // AC30
  | "duplicateIdField" // one question mapped to two identifiers
  | "blacklistOffNotAllowed"; // needs Blacklist Approve

export interface SettingsIssue {
  code: SettingsIssueCode;
  severity: "error" | "warning";
  badgeTypeId?: ID;
  field?: ScreeningField;
}

export function validateSettings(db: Database, registrationId: ID, d: SettingsDraft, actorId: ID): SettingsIssue[] {
  const issues: SettingsIssue[] = [];
  const reg = db.registrations[registrationId];
  const questions = new Set(formOf(reg).map((q) => q.id));
  const mapped = (f: ScreeningField) => !!d.idFields[f] && questions.has(d.idFields[f]!);

  // Mapping rules apply when vetting is on (the tab can't be saved otherwise).
  if (d.enabled) {
    if (!mapped("fullName")) issues.push({ code: "noFullName", severity: "error", field: "fullName" });
    if (!mapped("nationalId") && !(mapped("passportNo") && mapped("nationality"))) issues.push({ code: "noStrongId", severity: "error" });
    if (!mapped("dob")) issues.push({ code: "noDob", severity: "warning", field: "dob" });
    const seen = new Map<ID, ScreeningField>();
    for (const f of SCREENING_FIELDS) {
      const q = d.idFields[f];
      if (!q) continue;
      if (seen.has(q)) issues.push({ code: "duplicateIdField", severity: "error", field: f });
      else seen.set(q, f);
    }
    for (const row of badgeCoverage(db, registrationId, d.uncoveredBadgeBehaviour)) {
      if (!row.workflowId && !row.behaviour) issues.push({ code: "uncoveredBadge", severity: "error", badgeTypeId: row.badgeTypeId });
    }
  }
  const before = db.vettingSettings[registrationId];
  if (before?.blacklistScreening && !d.blacklistScreening && !can(db, actorId, "blacklist.approve")) {
    issues.push({ code: "blacklistOffNotAllowed", severity: "error" });
  }
  return issues;
}

export const blocking = (issues: SettingsIssue[]) => issues.some((i) => i.severity === "error");

/** Setting keys that differ between the saved settings and a draft. */
export function changedKeys(s: RegistrationVettingSettings, d: SettingsDraft): (keyof SettingsDraft)[] {
  const before = draftOf(s);
  return (Object.keys(d) as (keyof SettingsDraft)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(d[k]));
}

export type RegistrationError = "notAllowed" | "stale" | "invalid" | "notFound" | "emptyLabel" | "noOptions";

export type RegistrationResult = { ok: true; db: Database } | { ok: false; error: RegistrationError; issues?: SettingsIssue[] };

export function saveSettings(
  db: Database,
  a: { registrationId: ID; draft: SettingsDraft; actorId: ID; expectedRevision: number; now: number },
): RegistrationResult {
  if (!can(db, a.actorId, "registration.vettingSettings")) return { ok: false, error: "notAllowed" };
  const current = db.vettingSettings[a.registrationId];
  if (!current) return { ok: false, error: "notFound" };
  if (current.revision !== a.expectedRevision) return { ok: false, error: "stale" };
  const issues = validateSettings(db, a.registrationId, a.draft, a.actorId);
  if (blocking(issues)) return { ok: false, error: "invalid", issues };

  const changes = changedKeys(current, a.draft);
  if (!changes.length) return { ok: true, db };
  const tx = new Tx(db, a.now);
  const at = new Date(a.now).toISOString();
  tx.db.vettingSettings = {
    ...db.vettingSettings,
    [a.registrationId]: { ...current, ...a.draft, revision: current.revision + 1, updatedAt: at, updatedBy: a.actorId },
  };
  const action = changes.includes("enabled") ? (a.draft.enabled ? "vetting_enabled" : "vetting_disabled") : "settings_saved";
  const hid = tx.id("rh");
  tx.db.registrationHistory = {
    ...db.registrationHistory,
    [hid]: { id: hid, registrationId: a.registrationId, action, actorId: a.actorId, at, changes },
  };
  return { ok: true, db: tx.db };
}

// ─── Adding a question (AC29) ───────────────────────────────────────────

export interface NewQuestion {
  label: { en: string; ar: string };
  type: QuestionType;
  options: { en: string; ar: string }[];
}

/**
 * A question added to a live form is hidden from every team (no team has an
 * access entry for it yet) and the vetting admins are told, so they can grant
 * access in Teams → Field access.
 */
export function addQuestion(
  db: Database,
  a: { registrationId: ID; question: NewQuestion; actorId: ID; now: number },
): { ok: true; db: Database; questionId: ID } | { ok: false; error: RegistrationError } {
  if (!can(db, a.actorId, "registration.vettingSettings")) return { ok: false, error: "notAllowed" };
  const reg = db.registrations[a.registrationId];
  if (!reg) return { ok: false, error: "notFound" };
  const en = a.question.label.en.trim();
  if (!en) return { ok: false, error: "emptyLabel" };
  const choice = a.question.type === "singleChoice" || a.question.type === "multiChoice";
  const options = a.question.options.filter((o) => o.en.trim());
  if (choice && options.length < 2) return { ok: false, error: "noOptions" };

  const tx = new Tx(db, a.now);
  const questionId = `q_${tx.id("new").slice(4)}`;
  const at = new Date(a.now).toISOString();
  const question: FormQuestion = {
    id: questionId,
    label: { en, ar: a.question.label.ar.trim() || en },
    type: a.question.type,
    ...(choice
      ? { options: options.map((o, i) => ({ value: `opt_${i + 1}`, label: { en: o.en.trim(), ar: o.ar.trim() || o.en.trim() } })) }
      : {}),
    addedAt: at,
    addedBy: a.actorId,
  };
  tx.db.registrations = { ...db.registrations, [reg.id]: { ...reg, questions: [...reg.questions, question] } };
  const hid = tx.id("rh");
  tx.db.registrationHistory = {
    ...db.registrationHistory,
    [hid]: { id: hid, registrationId: reg.id, action: "question_added", actorId: a.actorId, at, changes: [questionId] },
  };
  tx.emailStaff("registration.vettingSettings", "new_question", null, { registration: reg.name.en, registrationId: reg.id, question: en });
  return { ok: true, db: tx.db, questionId };
}

/** Teams that can see a question (any access other than hidden). */
export function teamsSeeing(db: Database, registrationId: ID, q: FormQuestion): ID[] {
  const key = q.type === "upload" ? `document.${q.id}` : `answer.${q.id}`;
  return Object.values(db.teams)
    .filter((t) => {
      const level = t.access.find((x) => x.registrationId === registrationId)?.fields[key];
      return !!level && level !== "hidden";
    })
    .map((t) => t.id);
}

/** New questions still hidden from every team: what the admin alert is about. */
export function hiddenNewQuestions(db: Database) {
  const out: { registrationId: ID; question: FormQuestion }[] = [];
  for (const reg of Object.values(db.registrations)) {
    for (const q of reg.questions) {
      if (q.addedAt && !teamsSeeing(db, reg.id, q).length) out.push({ registrationId: reg.id, question: q });
    }
  }
  return out;
}

// ─── Summary for the list page ──────────────────────────────────────────

export function registrationSummary(db: Database, registrationId: ID) {
  const s = db.vettingSettings[registrationId];
  const coverage = badgeCoverage(db, registrationId);
  const issues = s ? validateSettings(db, registrationId, { ...draftOf(s), enabled: true }, "system") : [];
  return {
    enabled: !!s?.enabled,
    covered: coverage.filter((c) => c.workflowId).length,
    uncovered: coverage.filter((c) => !c.workflowId && !c.behaviour).length,
    noVetting: coverage.filter((c) => c.behaviour === "noVetting").length,
    blocked: coverage.filter((c) => c.behaviour === "block").length,
    badgeTypes: coverage.length,
    idsOk: !issues.some((i) => i.code === "noFullName" || i.code === "noStrongId"),
    newHidden: hiddenNewQuestions(db).filter((x) => x.registrationId === registrationId).length,
    requests: Object.values(db.requests).filter((r) => r.registrationId === registrationId).length,
  };
}

/** Profile field a question fills, through the ID mapping or a standard question. */
export function profileFieldOf(settings: RegistrationVettingSettings | undefined, q: FormQuestion): keyof ApplicantProfile | undefined {
  if (q.profileField) return q.profileField;
  const mapped = settings && (Object.entries(settings.idFields) as [ScreeningField, ID][]).find(([, id]) => id === q.id)?.[0];
  return mapped;
}
