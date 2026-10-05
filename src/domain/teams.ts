import { Tx, openExecution } from "./actions";
import { evaluateAll } from "./conditions";
import { PROFILE_FIELDS, fieldKey, type ProfileField } from "./fieldAccess";
import { can } from "./permissions";
import { isLate } from "./queue";
import { OPEN_STATUSES } from "./status";
import type {
  Condition,
  ConditionOperator,
  Database,
  FieldAccessLevel,
  FormQuestion,
  ID,
  LocalizedText,
  Registration,
  Team,
  TeamChange,
  TeamHistoryEvent,
  TeamMember,
  WorkflowGraph,
} from "./types";

/**
 * Teams (spec 5): field-access rows, usage in workflows, validation and the
 * save / activate / deactivate actions. Pure functions over the Database.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 500;
export const CONDITIONS_MAX = 10;
export const DEFAULT_MAX_CLAIMS = 10;
export const MAX_CLAIMS_LIMIT = 50;

// ─── Field access rows (5.6) ────────────────────────────────────────────

export type FieldGroupKey = "profile" | "answers" | "documents" | "payment" | "moreInfo";

export const FIELD_GROUPS: FieldGroupKey[] = ["profile", "answers", "documents", "payment", "moreInfo"];

/** The levels each field group offers, lowest first. */
export const GROUP_LEVELS: Record<FieldGroupKey, FieldAccessLevel[]> = {
  profile: ["hidden", "view", "edit"],
  answers: ["hidden", "view", "edit"],
  documents: ["hidden", "view", "download"],
  payment: ["hidden", "view"],
  moreInfo: ["hidden", "view"],
};

export type AccessRow =
  | { key: string; group: "profile"; field: ProfileField }
  | { key: string; group: "answers" | "documents"; question: FormQuestion }
  | { key: string; group: "payment" | "moreInfo" };

export function accessRows(reg: Registration): AccessRow[] {
  const rows: AccessRow[] = PROFILE_FIELDS.map((field) => ({ key: fieldKey.profile(field), group: "profile" as const, field }));
  for (const q of reg.questions) {
    if (q.type !== "upload") rows.push({ key: fieldKey.answer(q.id), group: "answers", question: q });
  }
  for (const q of reg.questions) {
    if (q.type === "upload") rows.push({ key: fieldKey.document(q.id), group: "documents", question: q });
  }
  rows.push({ key: fieldKey.payment, group: "payment" }, { key: fieldKey.moreInfo, group: "moreInfo" });
  return rows;
}

/** Fits a level into what a group allows: anything above the top becomes the top. */
export function clampLevel(group: FieldGroupKey, level: FieldAccessLevel): FieldAccessLevel {
  const allowed = GROUP_LEVELS[group];
  if (allowed.includes(level)) return level;
  return level === "hidden" ? "hidden" : allowed[allowed.length - 1];
}

export function fillAccess(reg: Registration, level: (row: AccessRow) => FieldAccessLevel): Record<string, FieldAccessLevel> {
  return Object.fromEntries(accessRows(reg).map((row) => [row.key, clampLevel(row.group, level(row))]));
}

/** Shortcut: every field visible, nothing editable. */
export const giveViewToAll = (reg: Registration) => fillAccess(reg, () => "view");

/**
 * Shortcut: apply one registration's levels to another. Same field → same
 * level; a question the source form does not have takes the level of the
 * first field in the same group.
 */
export function applyAccessTo(
  source: Record<string, FieldAccessLevel>,
  sourceReg: Registration,
  targetReg: Registration,
): Record<string, FieldAccessLevel> {
  const sourceRows = accessRows(sourceReg);
  const groupLevel = (group: FieldGroupKey) => {
    const first = sourceRows.find((r) => r.group === group);
    return first ? (source[first.key] ?? "hidden") : "hidden";
  };
  return fillAccess(targetReg, (row) => source[row.key] ?? groupLevel(row.group));
}

/** How many fields of each group the team can see (anything but Hidden). */
export function accessSummary(reg: Registration, fields: Record<string, FieldAccessLevel>) {
  const summary = Object.fromEntries(FIELD_GROUPS.map((g) => [g, { total: 0, visible: 0, top: 0 }])) as Record<
    FieldGroupKey,
    { total: number; visible: number; top: number }
  >;
  for (const row of accessRows(reg)) {
    const level = fields[row.key] ?? "hidden";
    const s = summary[row.group];
    s.total++;
    if (level !== "hidden") s.visible++;
    if (level !== "hidden" && level === GROUP_LEVELS[row.group].at(-1) && level !== "view") s.top++;
  }
  return summary;
}

// ─── Draft ──────────────────────────────────────────────────────────────

export type TeamDraft = Pick<
  Team,
  | "name"
  | "description"
  | "status"
  | "members"
  | "eventScope"
  | "badgeScope"
  | "access"
  | "conditions"
  | "conditionMatch"
  | "assignmentMode"
  | "maxOpenClaims"
>;

export function emptyDraft(): TeamDraft {
  return {
    name: { en: "", ar: "" },
    description: { en: "", ar: "" },
    status: "active",
    members: [],
    eventScope: "all",
    badgeScope: "all",
    access: [],
    conditions: [],
    conditionMatch: "all",
    assignmentMode: "selfClaim",
    maxOpenClaims: DEFAULT_MAX_CLAIMS,
  };
}

export function draftOf(team: Team): TeamDraft {
  return {
    name: { ...team.name },
    description: { ...team.description },
    status: team.status,
    members: team.members.map((m) => ({ ...m })),
    eventScope: team.eventScope === "all" ? "all" : [...team.eventScope],
    badgeScope: team.badgeScope === "all" ? "all" : [...team.badgeScope],
    access: team.access.map((a) => ({ registrationId: a.registrationId, fields: { ...a.fields } })),
    conditions: team.conditions.map((c) => ({ ...c, value: [...c.value] })),
    conditionMatch: team.conditionMatch,
    assignmentMode: team.assignmentMode,
    maxOpenClaims: team.maxOpenClaims,
  };
}

/** Registrations that fit the team's events and badge types (what "+ Add registration" offers). */
export function registrationsInScope(db: Database, scope: Pick<TeamDraft, "eventScope" | "badgeScope">): Registration[] {
  return Object.values(db.registrations).filter(
    (r) =>
      (scope.eventScope === "all" || scope.eventScope.includes(r.eventId)) &&
      (scope.badgeScope === "all" || r.badgeTypeIds.some((b) => (scope.badgeScope as ID[]).includes(b))),
  );
}

// ─── Conditions (5.3) ───────────────────────────────────────────────────

export const VALUELESS_OPERATORS: ConditionOperator[] = ["isEmpty", "isNotEmpty"];
const CHOICE_OPERATORS: ConditionOperator[] = ["is", "isNot", "isAnyOf", "isNoneOf", "isEmpty", "isNotEmpty"];
const TEXT_OPERATORS: ConditionOperator[] = ["is", "isNot", "contains", "isEmpty", "isNotEmpty"];

export type ConditionFieldSource = "profile" | "answer" | "payment" | "screening";

export interface ConditionField {
  field: string;
  source: ConditionFieldSource;
  /** Profile field, question or fixed key; the UI turns it into a label. */
  profileField?: ProfileField;
  question?: FormQuestion;
  /** Options for choice fields: value plus a label key the UI resolves. */
  options: { value: string; label?: LocalizedText }[] | null;
  operators: ConditionOperator[];
}

/**
 * Fields a team condition can test: profile data, answers from the
 * registrations the team covers, payment status and watchlist level.
 */
export function conditionFields(db: Database, registrationIds: ID[]): ConditionField[] {
  const nationalities = [...new Set(Object.values(db.attendees).map((a) => a.profile.nationality))].sort();
  const fields: ConditionField[] = [
    { field: "profile.nationality", source: "profile", profileField: "nationality", options: nationalities.map((value) => ({ value })), operators: CHOICE_OPERATORS },
    { field: "profile.company", source: "profile", profileField: "company", options: null, operators: TEXT_OPERATORS },
    { field: "profile.jobTitle", source: "profile", profileField: "jobTitle", options: null, operators: TEXT_OPERATORS },
    { field: "profile.email", source: "profile", profileField: "email", options: null, operators: TEXT_OPERATORS },
  ];
  const seen = new Set<ID>();
  for (const regId of registrationIds) {
    for (const q of db.registrations[regId]?.questions ?? []) {
      if (q.type === "upload" || seen.has(q.id)) continue;
      seen.add(q.id);
      fields.push({
        field: `answer.${q.id}`,
        source: "answer",
        question: q,
        options: q.options ? q.options.map((o) => ({ value: o.value, label: o.label })) : null,
        operators: q.options ? CHOICE_OPERATORS : TEXT_OPERATORS,
      });
    }
  }
  fields.push(
    { field: "payment.status", source: "payment", options: ["paid", "pending", "free"].map((value) => ({ value })), operators: CHOICE_OPERATORS },
    { field: "screening.watchlistLevel", source: "screening", options: ["low", "medium", "high"].map((value) => ({ value })), operators: CHOICE_OPERATORS },
  );
  return fields;
}

export function conditionComplete(c: Condition) {
  return !!c.field && (VALUELESS_OPERATORS.includes(c.operator) || c.value.some((v) => v.trim() !== ""));
}

/**
 * Live preview for the form: of the requests that fit the team's events,
 * badge types and registrations, how many also pass its conditions.
 */
export function routingPreview(db: Database, draft: TeamDraft) {
  const regs = new Set(draft.access.map((a) => a.registrationId));
  let inScope = 0;
  let matched = 0;
  for (const r of Object.values(db.requests)) {
    if (draft.eventScope !== "all" && !draft.eventScope.includes(r.eventId)) continue;
    if (draft.badgeScope !== "all" && !draft.badgeScope.includes(r.badgeTypeId)) continue;
    if (!regs.has(r.registrationId)) continue;
    inScope++;
    const complete = draft.conditions.filter(conditionComplete);
    if (evaluateAll(complete, draft.conditionMatch, db.attendees[r.attendeeId], r)) matched++;
  }
  return { inScope, matched };
}

// ─── Usage in workflows and current load ────────────────────────────────

export interface StageUse {
  workflowId: ID;
  versionNo: number | null;
  source: "live" | "inactive" | "draft";
  nodeId: ID;
  stageName: LocalizedText;
  role: "team" | "fallback";
  /** 1-based priority for "team"; 0 for fallback. */
  position: number;
  teams: ID[];
  fallbackTeamId: ID | null;
}

function stageUsesIn(graph: WorkflowGraph, teamId: ID, base: Pick<StageUse, "workflowId" | "versionNo" | "source">): StageUse[] {
  const uses: StageUse[] = [];
  for (const n of graph.nodes) {
    if (n.type !== "stage") continue;
    const common = { ...base, nodeId: n.id, stageName: n.stage.name, teams: n.stage.teams, fallbackTeamId: n.stage.fallbackTeamId };
    const i = n.stage.teams.indexOf(teamId);
    if (i >= 0) uses.push({ ...common, role: "team", position: i + 1 });
    if (n.stage.fallbackTeamId === teamId) uses.push({ ...common, role: "fallback", position: 0 });
  }
  return uses;
}

/** Every stage that sends work to this team: published versions first, then drafts. */
export function teamStageUses(db: Database, teamId: ID): StageUse[] {
  const uses: StageUse[] = [];
  for (const wf of Object.values(db.workflows)) {
    const version = wf.currentVersionId ? db.workflowVersions[wf.currentVersionId] : null;
    if (version) {
      uses.push(...stageUsesIn(version.graph, teamId, { workflowId: wf.id, versionNo: version.versionNo, source: wf.status === "active" ? "live" : "inactive" }));
    }
    if (wf.draft) uses.push(...stageUsesIn(wf.draft, teamId, { workflowId: wf.id, versionNo: null, source: "draft" }));
  }
  const order = { live: 0, inactive: 1, draft: 2 };
  return uses.sort((a, b) => order[a.source] - order[b.source]);
}

const DECISION_OUTCOMES = new Set(["approve", "reject", "escalate", "moreInfo"]);

/** Open work and recent decisions for a team and each of its members. */
export function teamLoad(db: Database, teamId: ID, now: number) {
  const open = Object.values(db.requests).filter((r) => r.currentTeamId === teamId && OPEN_STATUSES.includes(r.status));
  const weekAgo = now - 7 * DAY;
  const members = new Map<ID, { claims: number; decisions: number }>();
  for (const m of db.teams[teamId]?.members ?? []) members.set(m.userId, { claims: 0, decisions: 0 });
  for (const r of open) {
    const m = r.claimedBy && r.status === "under_review" ? members.get(r.claimedBy) : undefined;
    if (m) m.claims++;
  }
  let decisions = 0;
  for (const e of Object.values(db.stageExecutions)) {
    if (e.teamId !== teamId || !e.completedAt || Date.parse(e.completedAt) < weekAgo || !e.outcome || !DECISION_OUTCOMES.has(e.outcome)) continue;
    decisions++;
    if (e.assignedUserId) {
      const m = members.get(e.assignedUserId);
      if (m) m.decisions++;
    }
  }
  return {
    open: open.length,
    late: open.filter((r) => isLate(db, r, now)).length,
    unclaimed: open.filter((r) => !r.claimedBy && (r.status === "pending_review" || r.status === "escalated")).length,
    waitingOnAttendee: open.filter((r) => r.status === "more_info_required").length,
    decisions,
    members,
  };
}

export type Blocker = { type: "openRequests"; count: number } | { type: "liveStage"; use: StageUse };

/** 5.5: a team with open requests, or used in a live workflow, cannot be deactivated. */
export function deactivationBlockers(db: Database, teamId: ID): Blocker[] {
  const blockers: Blocker[] = [];
  const open = Object.values(db.requests).filter((r) => r.currentTeamId === teamId && OPEN_STATUSES.includes(r.status)).length;
  if (open) blockers.push({ type: "openRequests", count: open });
  for (const use of teamStageUses(db, teamId)) if (use.source === "live") blockers.push({ type: "liveStage", use });
  return blockers;
}

// ─── Validation ─────────────────────────────────────────────────────────

export type TeamSection = "basics" | "members" | "scope" | "access" | "conditions" | "assignment";

export type IssueCode =
  | "nameRequired"
  | "nameTooLong"
  | "nameTaken"
  | "descriptionTooLong"
  | "membersRequired"
  | "memberNoQueueAccess"
  | "memberInactive"
  | "eventsRequired"
  | "badgesRequired"
  | "accessRequired"
  | "accessOutOfScope"
  | "conditionsMax"
  | "conditionIncomplete"
  | "leadRequired"
  | "maxClaimsInvalid"
  | "deactivateInUse"
  | "lastReviewerInUse";

export interface TeamIssue {
  code: IssueCode;
  severity: "error" | "warning";
  section: TeamSection;
  /** The member, registration or condition the issue is about. */
  ref?: ID;
}

const norm = (s: string) => s.trim().toLocaleLowerCase();

export function validateTeam(db: Database, draft: TeamDraft, teamId: ID | null): TeamIssue[] {
  const issues: TeamIssue[] = [];
  const add = (code: IssueCode, section: TeamSection, ref?: ID, severity: TeamIssue["severity"] = "error") =>
    issues.push({ code, section, ref, severity });

  // Basics
  if (!draft.name.en.trim()) add("nameRequired", "basics");
  if (draft.name.en.length > NAME_MAX || draft.name.ar.length > NAME_MAX) add("nameTooLong", "basics");
  const others = Object.values(db.teams).filter((t) => t.id !== teamId && t.status === "active");
  const clash = (key: "en" | "ar") => !!norm(draft.name[key]) && others.some((t) => norm(t.name[key]) === norm(draft.name[key]));
  if (draft.status === "active" && (clash("en") || clash("ar"))) add("nameTaken", "basics");
  if (draft.description.en.length > DESCRIPTION_MAX || draft.description.ar.length > DESCRIPTION_MAX) add("descriptionTooLong", "basics");

  // Members
  if (draft.members.length === 0) add("membersRequired", "members");
  for (const m of draft.members) {
    const user = db.users[m.userId];
    if (!user?.active) add("memberInactive", "members", m.userId, "warning");
    else if (!can(db, m.userId, "queue.access")) add("memberNoQueueAccess", "members", m.userId, "warning");
  }

  // Scope
  if (draft.eventScope !== "all" && draft.eventScope.length === 0) add("eventsRequired", "scope");
  if (draft.badgeScope !== "all" && draft.badgeScope.length === 0) add("badgesRequired", "scope");

  // Registration & field access
  if (draft.access.length === 0) add("accessRequired", "access");
  const fits = new Set(registrationsInScope(db, draft).map((r) => r.id));
  for (const a of draft.access) if (!fits.has(a.registrationId)) add("accessOutOfScope", "access", a.registrationId);

  // Conditions
  if (draft.conditions.length > CONDITIONS_MAX) add("conditionsMax", "conditions");
  for (const c of draft.conditions) if (!conditionComplete(c)) add("conditionIncomplete", "conditions", c.id);

  // Assignment
  if (draft.assignmentMode === "leadAssigns" && !draft.members.some((m) => m.role === "lead")) add("leadRequired", "assignment");
  if (!Number.isInteger(draft.maxOpenClaims) || draft.maxOpenClaims < 1 || draft.maxOpenClaims > MAX_CLAIMS_LIMIT) {
    add("maxClaimsInvalid", "assignment");
  }

  // In-use rules (5.5)
  if (teamId && db.teams[teamId]) {
    const inUse = deactivationBlockers(db, teamId).length > 0;
    if (inUse && draft.status === "inactive" && db.teams[teamId].status === "active") add("deactivateInUse", "basics");
    const reviewers = draft.members.filter((m) => db.users[m.userId]?.active && can(db, m.userId, "queue.access"));
    if (inUse && draft.members.length > 0 && reviewers.length === 0) add("lastReviewerInUse", "members");
  }
  return issues;
}

export const blocking = (issues: TeamIssue[]) => issues.filter((i) => i.severity === "error");

// ─── Change list for history ────────────────────────────────────────────

const sameList = (a: "all" | ID[], b: "all" | ID[]) =>
  a === "all" || b === "all" ? a === b : a.length === b.length && a.every((x) => b.includes(x));

function changedFields(a: Record<string, FieldAccessLevel>, b: Record<string, FieldAccessLevel>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let n = 0;
  for (const k of keys) if ((a[k] ?? "hidden") !== (b[k] ?? "hidden")) n++;
  return n;
}

export function diffTeam(before: TeamDraft, after: TeamDraft): TeamChange[] {
  const changes: TeamChange[] = [];
  if (before.name.en !== after.name.en || before.name.ar !== after.name.ar) changes.push({ type: "name" });
  if (before.description.en !== after.description.en || before.description.ar !== after.description.ar) changes.push({ type: "description" });

  const was = new Map(before.members.map((m) => [m.userId, m.role]));
  const now = new Map(after.members.map((m) => [m.userId, m.role]));
  for (const m of after.members) {
    if (!was.has(m.userId)) changes.push({ type: "memberAdded", userId: m.userId, role: m.role });
    else if (was.get(m.userId) !== m.role) changes.push({ type: "memberRole", userId: m.userId, role: m.role });
  }
  for (const m of before.members) if (!now.has(m.userId)) changes.push({ type: "memberRemoved", userId: m.userId });

  if (!sameList(before.eventScope, after.eventScope)) changes.push({ type: "events" });
  if (!sameList(before.badgeScope, after.badgeScope)) changes.push({ type: "badgeTypes" });

  const prevAccess = new Map(before.access.map((a) => [a.registrationId, a.fields]));
  const nextAccess = new Map(after.access.map((a) => [a.registrationId, a.fields]));
  for (const a of after.access) {
    const prev = prevAccess.get(a.registrationId);
    if (!prev) changes.push({ type: "accessAdded", registrationId: a.registrationId });
    else {
      const n = changedFields(prev, a.fields);
      if (n) changes.push({ type: "accessChanged", registrationId: a.registrationId, fields: n });
    }
  }
  for (const a of before.access) if (!nextAccess.has(a.registrationId)) changes.push({ type: "accessRemoved", registrationId: a.registrationId });

  const condKey = (d: TeamDraft) => JSON.stringify([d.conditionMatch, d.conditions.map((c) => [c.field, c.operator, c.value])]);
  if (condKey(before) !== condKey(after)) changes.push({ type: "conditions", count: after.conditions.length });
  if (before.assignmentMode !== after.assignmentMode) changes.push({ type: "assignment", mode: after.assignmentMode });
  if (before.maxOpenClaims !== after.maxOpenClaims) changes.push({ type: "maxClaims", value: after.maxOpenClaims });
  return changes;
}

// ─── Actions ────────────────────────────────────────────────────────────

export type TeamError = "forbidden" | "notFound" | "stale" | "invalid" | "inUse" | "noChanges";

export type TeamResult =
  | { ok: true; db: Database; teamId: ID }
  | { ok: false; error: TeamError; issues?: TeamIssue[]; blockers?: Blocker[] };

interface TeamActor {
  actorId: ID;
  now: number;
}

/** A removed member's claimed requests go back to the team (unclaimed). */
function releaseClaims(tx: Tx, teamId: ID, userId: ID): number {
  let n = 0;
  for (const r of Object.values(tx.db.requests)) {
    if (r.currentTeamId !== teamId || r.claimedBy !== userId || r.status !== "under_review" || r.awaitingCapacity) continue;
    const exec = openExecution(tx.db, r.id);
    if (exec) tx.put("stageExecutions", { ...exec, status: "open", assignedUserId: null, claimedAt: null });
    tx.updateRequest(r, { status: "pending_review", claimedBy: null });
    tx.log({ requestId: r.id, action: "released", actorId: "system", fromStatus: "under_review", toStatus: "pending_review", teamId, meta: { reason: "removedFromTeam", userId } });
    n++;
  }
  return n;
}

function logTeam(tx: Tx, e: Omit<TeamHistoryEvent, "id">) {
  tx.put("teamHistory", { ...e, id: tx.id("th") });
}

export function saveTeam(
  db: Database,
  a: TeamActor & { teamId: ID | null; draft: TeamDraft; expectedRevision: number },
): TeamResult {
  if (!can(db, a.actorId, "teams.edit")) return { ok: false, error: "forbidden" };
  const existing = a.teamId ? db.teams[a.teamId] : null;
  if (a.teamId && !existing) return { ok: false, error: "notFound" };
  if (existing && existing.revision !== a.expectedRevision) return { ok: false, error: "stale" };

  const draft: TeamDraft = {
    ...a.draft,
    name: { en: a.draft.name.en.trim(), ar: a.draft.name.ar.trim() },
    description: { en: a.draft.description.en.trim(), ar: a.draft.description.ar.trim() },
  };
  const issues = validateTeam(db, draft, a.teamId);
  if (blocking(issues).length) return { ok: false, error: "invalid", issues };

  const at = new Date(a.now).toISOString();
  const tx = new Tx(db, a.now);

  if (!existing) {
    const id = tx.id("t");
    tx.put("teams", { ...draft, id, revision: 1, createdAt: at, updatedAt: at });
    logTeam(tx, {
      teamId: id,
      kind: "created",
      actorId: a.actorId,
      at,
      changes: draft.members.map((m) => ({ type: "memberAdded", userId: m.userId, role: m.role })),
    });
    return { ok: true, db: tx.db, teamId: id };
  }

  const changes = diffTeam(draftOf(existing), draft);
  const statusChanged = existing.status !== draft.status;
  if (!changes.length && !statusChanged) return { ok: false, error: "noChanges" };

  for (const c of changes) {
    if (c.type !== "memberRemoved") continue;
    const count = releaseClaims(tx, existing.id, c.userId);
    if (count) changes.push({ type: "claimsReleased", userId: c.userId, count });
  }
  tx.put("teams", { ...existing, ...draft, revision: existing.revision + 1, updatedAt: at });
  if (changes.length) logTeam(tx, { teamId: existing.id, kind: "updated", actorId: a.actorId, at, changes });
  if (statusChanged) {
    logTeam(tx, { teamId: existing.id, kind: draft.status === "active" ? "activated" : "deactivated", actorId: a.actorId, at, changes: [] });
  }
  return { ok: true, db: tx.db, teamId: existing.id };
}

export function setTeamStatus(
  db: Database,
  a: TeamActor & { teamId: ID; status: Team["status"]; expectedRevision: number },
): TeamResult {
  if (!can(db, a.actorId, "teams.edit")) return { ok: false, error: "forbidden" };
  const team = db.teams[a.teamId];
  if (!team) return { ok: false, error: "notFound" };
  if (team.revision !== a.expectedRevision) return { ok: false, error: "stale" };
  if (team.status === a.status) return { ok: false, error: "noChanges" };
  if (a.status === "inactive") {
    const blockers = deactivationBlockers(db, team.id);
    if (blockers.length) return { ok: false, error: "inUse", blockers };
  } else {
    const issues = blocking(validateTeam(db, { ...draftOf(team), status: "active" }, team.id));
    if (issues.length) return { ok: false, error: "invalid", issues };
  }
  const at = new Date(a.now).toISOString();
  const tx = new Tx(db, a.now);
  tx.put("teams", { ...team, status: a.status, revision: team.revision + 1, updatedAt: at });
  logTeam(tx, { teamId: team.id, kind: a.status === "active" ? "activated" : "deactivated", actorId: a.actorId, at, changes: [] });
  return { ok: true, db: tx.db, teamId: team.id };
}

export const memberRoleOrder = (m: TeamMember) => (m.role === "lead" ? 0 : 1);
