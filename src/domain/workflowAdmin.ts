import { Tx } from "./actions";
import { can } from "./permissions";
import { OPEN_STATUSES } from "./status";
import type {
  Database,
  ID,
  LocalizedText,
  StageAction,
  StageConfig,
  Team,
  Workflow,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from "./types";
import type { StageNode } from "./workflow";

/**
 * Workflow administration (spec 6): building blocks, the publish checks
 * (6.4), versions (6.5), allotment (6.6) and the save / publish actions.
 * Pure functions over the Database.
 */

export type ConditionNode = Extract<WorkflowNode, { type: "condition" }>;
export type WorkflowMeta = Pick<Workflow, "name" | "label" | "description" | "badgeTypeId">;

export const NAME_MAX = 100;

/** Text edited in the English-only builder; the Arabic copy is cleared so screens fall back to English. */
export const englishText = (en: string): LocalizedText => ({ en, ar: "" });

// ─── Building blocks ────────────────────────────────────────────────────

export function newId(prefix: string, graph: WorkflowGraph) {
  const taken = new Set(graph.nodes.map((n) => n.id));
  let i = graph.nodes.length + 1;
  while (taken.has(`${prefix}_${i}`)) i++;
  return `${prefix}_${i}`;
}

export function newStageConfig(name = "New stage"): StageConfig {
  return {
    name: englishText(name),
    instructions: englishText(""),
    teams: [],
    fallbackTeamId: null,
    allowedActions: ["approve", "reject"],
    escalateTo: [],
    afterMoreInfoReturnTo: "same",
    rejectReasonRequired: true,
    timeLimitHours: null,
    mandatory: false,
  };
}

export function newNode(type: WorkflowNode["type"], graph: WorkflowGraph, position: { x: number; y: number }): WorkflowNode {
  switch (type) {
    case "start":
      return { id: newId("start", graph), type, position };
    case "stage":
      return { id: newId("stage", graph), type, position, stage: newStageConfig() };
    case "condition":
      return {
        id: newId("cond", graph),
        type,
        position,
        condition: {
          label: englishText("Condition"),
          branches: [{ id: "b1", label: englishText("Branch 1"), condition: { id: "b1c", field: "", operator: "is", value: [] } }],
        },
      };
    case "final":
      return { id: newId("final", graph), type, position };
    case "rejected":
      return { id: newId("rejected", graph), type, position };
  }
}

/** A new workflow starts as Start → one stage → Final approval, with Rejected beside it. */
export function starterGraph(): WorkflowGraph {
  const start: WorkflowNode = { id: "start", type: "start", position: { x: 0, y: 0 } };
  const review: WorkflowNode = { id: "stage_1", type: "stage", position: { x: -40, y: 150 }, stage: newStageConfig("Security Review") };
  const final: WorkflowNode = { id: "final", type: "final", position: { x: -20, y: 470 } };
  const rejected: WorkflowNode = { id: "rejected", type: "rejected", position: { x: 380, y: 470 } };
  return {
    nodes: [start, review, final, rejected],
    edges: [edge("start", "next", "stage_1"), edge("stage_1", "approve", "final"), edge("stage_1", "reject", "rejected")],
  };
}

export function edge(source: ID, handle: string, target: ID): WorkflowEdge {
  return { id: handle === "escalate" ? `${source}:escalate:${target}` : `${source}:${handle}`, source, handle, target };
}

/** Handles a block offers for outgoing connections. */
export function sourceHandles(node: WorkflowNode): string[] {
  switch (node.type) {
    case "start":
      return ["next"];
    case "stage":
      return ["approve", "reject", ...(node.stage.allowedActions.includes("escalate") ? ["escalate"] : [])];
    case "condition":
      return [...node.condition.branches.map((b) => b.id), "otherwise"];
    default:
      return [];
  }
}

/**
 * Keeps the graph consistent after any edit: drops edges to missing blocks
 * or from handles that no longer exist, keeps one edge per single handle,
 * and mirrors escalate edges into each stage's `escalateTo` (which request
 * actions read).
 */
export function normalizeGraph(graph: WorkflowGraph): WorkflowGraph {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const edges: WorkflowEdge[] = [];
  for (const e of [...graph.edges].reverse()) {
    const src = byId.get(e.source);
    const dst = byId.get(e.target);
    if (!src || !dst || e.source === e.target || dst.type === "start") continue;
    if (!sourceHandles(src).includes(e.handle)) continue;
    if (e.handle === "escalate" && dst.type !== "stage") continue;
    const key = e.handle === "escalate" ? `${e.source}:escalate:${e.target}` : `${e.source}:${e.handle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.unshift({ ...e, id: key });
  }
  const nodes = graph.nodes.map((n): WorkflowNode => {
    if (n.type !== "stage") return n;
    const escalateTo = edges.filter((e) => e.source === n.id && e.handle === "escalate").map((e) => e.target);
    const returnTo = n.stage.afterMoreInfoReturnTo;
    const afterMoreInfoReturnTo = returnTo !== "same" && byId.get(returnTo)?.type !== "stage" ? "same" : returnTo;
    return { ...n, stage: { ...n.stage, escalateTo, afterMoreInfoReturnTo } };
  });
  return { nodes, edges };
}

// ─── Checks before publishing (6.4) ─────────────────────────────────────

export type WorkflowIssueCode =
  | "nameRequired"
  | "nameTaken"
  | "labelRequired"
  | "badgeTypeRequired"
  | "noStart"
  | "multipleStart"
  | "noFinal"
  | "notConnected"
  | "unreachable"
  | "noPathToEnd"
  | "endlessLoop"
  | "stageNameRequired"
  | "noTeam"
  | "noFallback"
  | "teamInactive"
  | "teamNoReviewer"
  | "conditionNoBranches"
  | "conditionIncomplete"
  | "teamsShareBadgeType"
  | "onlyFallbackCovers";

export interface WorkflowIssue {
  code: WorkflowIssueCode;
  severity: "error" | "warning";
  nodeId?: ID;
  /** Action, branch or team the issue is about. */
  detail?: string;
}

const norm = (s: string) => s.trim().toLocaleLowerCase();

function teamCovers(team: Team | undefined, badgeTypeId: ID) {
  return !!team && team.status === "active" && (team.badgeScope === "all" || team.badgeScope.includes(badgeTypeId));
}

function hasReviewer(db: Database, team: Team) {
  return team.members.some((m) => db.users[m.userId]?.active && can(db, m.userId, "queue.access"));
}

export function validateMeta(db: Database, meta: WorkflowMeta, workflowId: ID | null): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  if (!meta.name.en.trim()) issues.push({ code: "nameRequired", severity: "error" });
  else if (Object.values(db.workflows).some((w) => w.id !== workflowId && norm(w.name.en) === norm(meta.name.en))) {
    issues.push({ code: "nameTaken", severity: "error" });
  }
  if (!meta.label.en.trim()) issues.push({ code: "labelRequired", severity: "error" });
  if (!meta.badgeTypeId || !db.badgeTypes[meta.badgeTypeId]) issues.push({ code: "badgeTypeRequired", severity: "error" });
  return issues;
}

export function validateGraph(db: Database, graph: WorkflowGraph, badgeTypeId: ID): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const add = (code: WorkflowIssueCode, nodeId?: ID, detail?: string, severity: WorkflowIssue["severity"] = "error") =>
    issues.push({ code, nodeId, detail, severity });

  const starts = graph.nodes.filter((n) => n.type === "start");
  if (starts.length === 0) add("noStart");
  if (starts.length > 1) for (const s of starts.slice(1)) add("multipleStart", s.id);
  if (!graph.nodes.some((n) => n.type === "final")) add("noFinal");

  // Every outgoing handle needs a connection.
  for (const n of graph.nodes) {
    for (const h of sourceHandles(n)) {
      if (!graph.edges.some((e) => e.source === n.id && e.handle === h)) add("notConnected", n.id, h);
    }
  }

  // Reachable from Start, and able to reach an end block.
  const out = new Map<ID, ID[]>();
  const into = new Map<ID, ID[]>();
  for (const e of graph.edges) {
    out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
    into.set(e.target, [...(into.get(e.target) ?? []), e.source]);
  }
  const walk = (from: ID[], next: Map<ID, ID[]>) => {
    const seen = new Set<ID>(from);
    const queue = [...from];
    while (queue.length) {
      for (const m of next.get(queue.shift()!) ?? []) {
        if (seen.has(m)) continue;
        seen.add(m);
        queue.push(m);
      }
    }
    return seen;
  };
  if (starts.length) {
    const reachable = walk([starts[0].id], out);
    for (const n of graph.nodes) if (!reachable.has(n.id) && n.type !== "start") add("unreachable", n.id);
  }
  const ends = graph.nodes.filter((n) => n.type === "final" || n.type === "rejected").map((n) => n.id);
  const canEnd = walk(ends, into);
  for (const n of graph.nodes) {
    if (n.type === "final" || n.type === "rejected" || canEnd.has(n.id)) continue;
    const loops = walk(out.get(n.id) ?? [], out).has(n.id);
    add(loops ? "endlessLoop" : "noPathToEnd", n.id);
  }

  // Stage and condition settings.
  for (const n of graph.nodes) {
    if (n.type === "stage") {
      const s = n.stage;
      if (!s.name.en.trim()) add("stageNameRequired", n.id);
      if (s.teams.length === 0) add("noTeam", n.id);
      if (!s.fallbackTeamId) add("noFallback", n.id);
      for (const id of [...s.teams, ...(s.fallbackTeamId ? [s.fallbackTeamId] : [])]) {
        const team = db.teams[id];
        if (!team || team.status !== "active") add("teamInactive", n.id, id);
        else if (!hasReviewer(db, team)) add("teamNoReviewer", n.id, id);
      }
      const covering = s.teams.filter((id) => teamCovers(db.teams[id], badgeTypeId));
      if (covering.length > 1) add("teamsShareBadgeType", n.id, covering.slice(0, 2).join(","), "warning");
      if (s.teams.length && !covering.length && teamCovers(db.teams[s.fallbackTeamId ?? ""], badgeTypeId)) {
        add("onlyFallbackCovers", n.id, undefined, "warning");
      }
    }
    if (n.type === "condition") {
      if (!n.condition.branches.length) add("conditionNoBranches", n.id);
      for (const b of n.condition.branches) {
        const c = b.condition;
        const valueless = c.operator === "isEmpty" || c.operator === "isNotEmpty";
        if (!c.field || (!valueless && !c.value.some((v) => v.trim()))) add("conditionIncomplete", n.id, b.id);
      }
    }
  }
  return issues;
}

export const errorsOf = <T extends { severity: string }>(issues: T[]) => issues.filter((i) => i.severity === "error");

// ─── Reading ────────────────────────────────────────────────────────────

export const stagesOf = (graph: WorkflowGraph | null | undefined) =>
  (graph?.nodes.filter((n) => n.type === "stage") ?? []) as StageNode[];

export function versionsOf(db: Database, workflowId: ID) {
  return Object.values(db.workflowVersions)
    .filter((v) => v.workflowId === workflowId)
    .sort((a, b) => b.versionNo - a.versionNo);
}

export function allotmentsOf(db: Database, workflowId: ID) {
  return Object.values(db.allotments).filter((a) => a.workflowId === workflowId);
}

/** Requests still in progress on each version (they stay on it after a new publish). */
export function openRequestsByVersion(db: Database, workflowId: ID) {
  const counts = new Map<ID, number>();
  for (const r of Object.values(db.requests)) {
    if (r.workflowId !== workflowId || !r.workflowVersionId || !OPEN_STATUSES.includes(r.status)) continue;
    counts.set(r.workflowVersionId, (counts.get(r.workflowVersionId) ?? 0) + 1);
  }
  return counts;
}

/** 6.6: registrations with vetting on and a badge type that no active workflow covers. */
export function coverageGaps(db: Database) {
  const gaps: { registrationId: ID; badgeTypeId: ID }[] = [];
  for (const reg of Object.values(db.registrations)) {
    const settings = db.vettingSettings[reg.id];
    if (!settings?.enabled) continue;
    for (const badgeTypeId of reg.badgeTypeIds) {
      if (settings.uncoveredBadgeBehaviour[badgeTypeId] === "noVetting") continue;
      const covered = Object.values(db.allotments).some(
        (a) => a.registrationId === reg.id && a.badgeTypeId === badgeTypeId && db.workflows[a.workflowId]?.status === "active",
      );
      if (!covered) gaps.push({ registrationId: reg.id, badgeTypeId });
    }
  }
  return gaps;
}

/** Registrations that can use a workflow (they include its badge type), with any current owner. */
export function allotmentOptions(db: Database, workflow: Workflow) {
  return Object.values(db.registrations)
    .filter((r) => r.badgeTypeIds.includes(workflow.badgeTypeId))
    .map((reg) => {
      const current = Object.values(db.allotments).find((a) => a.registrationId === reg.id && a.badgeTypeId === workflow.badgeTypeId);
      return { registration: reg, current: current ?? null, mine: current?.workflowId === workflow.id };
    });
}

// ─── Actions ────────────────────────────────────────────────────────────

export type WorkflowError = "forbidden" | "notFound" | "stale" | "invalid" | "badgeTypeLocked" | "notPublished" | "clash" | "noChanges";

export type WorkflowResult =
  | { ok: true; db: Database; workflowId: ID; versionNo?: number }
  | { ok: false; error: WorkflowError; issues?: WorkflowIssue[]; clashes?: ID[] };

interface Actor {
  actorId: ID;
  now: number;
}

function guard(db: Database, a: Actor & { workflowId: ID; expectedRevision: number }, permission: "workflows.edit" | "workflows.publish") {
  if (!can(db, a.actorId, permission)) return { error: "forbidden" as const };
  const wf = db.workflows[a.workflowId];
  if (!wf) return { error: "notFound" as const };
  if (wf.revision !== a.expectedRevision) return { error: "stale" as const };
  return { wf };
}

const cleanMeta = (m: WorkflowMeta): WorkflowMeta => ({
  ...m,
  name: { ...m.name, en: m.name.en.trim() },
  label: { ...m.label, en: m.label.en.trim() },
  description: { ...m.description, en: m.description.en.trim() },
});

export function createWorkflow(db: Database, a: Actor & { meta: WorkflowMeta }): WorkflowResult {
  if (!can(db, a.actorId, "workflows.edit")) return { ok: false, error: "forbidden" };
  const meta = cleanMeta(a.meta);
  const issues = validateMeta(db, meta, null);
  if (errorsOf(issues).length) return { ok: false, error: "invalid", issues };
  const tx = new Tx(db, a.now);
  const id = tx.id("wf");
  const at = new Date(a.now).toISOString();
  tx.db.workflows = {
    ...db.workflows,
    [id]: { id, ...meta, status: "draft", currentVersionId: null, draft: starterGraph(), draftSavedAt: at, revision: 1, createdAt: at, updatedAt: at },
  };
  return { ok: true, db: tx.db, workflowId: id };
}

function withMeta(db: Database, wf: Workflow, meta: WorkflowMeta): { error: WorkflowError; issues?: WorkflowIssue[] } | null {
  const issues = validateMeta(db, meta, wf.id);
  if (errorsOf(issues).length) return { error: "invalid", issues };
  if (wf.currentVersionId && meta.badgeTypeId !== wf.badgeTypeId) return { error: "badgeTypeLocked" };
  return null;
}

/** Saves an unfinished draft: only the details are checked, the graph may be incomplete. */
export function saveDraft(
  db: Database,
  a: Actor & { workflowId: ID; expectedRevision: number; meta: WorkflowMeta; graph: WorkflowGraph },
): WorkflowResult {
  const g = guard(db, a, "workflows.edit");
  if ("error" in g) return { ok: false, error: g.error! };
  const meta = cleanMeta(a.meta);
  const bad = withMeta(db, g.wf, meta);
  if (bad) return { ok: false, ...bad };
  const at = new Date(a.now).toISOString();
  return {
    ok: true,
    workflowId: g.wf.id,
    db: {
      ...db,
      workflows: {
        ...db.workflows,
        [g.wf.id]: { ...g.wf, ...meta, draft: normalizeGraph(a.graph), draftSavedAt: at, revision: g.wf.revision + 1, updatedAt: at },
      },
    },
  };
}

export function discardDraft(db: Database, a: Actor & { workflowId: ID; expectedRevision: number }): WorkflowResult {
  const g = guard(db, a, "workflows.edit");
  if ("error" in g) return { ok: false, error: g.error! };
  if (!g.wf.currentVersionId) return { ok: false, error: "notPublished" };
  const at = new Date(a.now).toISOString();
  return {
    ok: true,
    workflowId: g.wf.id,
    db: { ...db, workflows: { ...db.workflows, [g.wf.id]: { ...g.wf, draft: null, draftSavedAt: null, revision: g.wf.revision + 1, updatedAt: at } } },
  };
}

/**
 * 6.5: publishing freezes the graph as a new version. New requests use it;
 * requests already in progress stay on the version they started with.
 */
export function publishWorkflow(
  db: Database,
  a: Actor & { workflowId: ID; expectedRevision: number; meta: WorkflowMeta; graph: WorkflowGraph },
): WorkflowResult {
  const g = guard(db, a, "workflows.publish");
  if ("error" in g) return { ok: false, error: g.error! };
  const meta = cleanMeta(a.meta);
  const bad = withMeta(db, g.wf, meta);
  if (bad) return { ok: false, ...bad };
  const graph = normalizeGraph(a.graph);
  const issues = validateGraph(db, graph, meta.badgeTypeId);
  if (errorsOf(issues).length) return { ok: false, error: "invalid", issues };

  const versionNo = (versionsOf(db, g.wf.id)[0]?.versionNo ?? 0) + 1;
  const versionId = `wfv_${g.wf.id}_${versionNo}`;
  const at = new Date(a.now).toISOString();
  return {
    ok: true,
    workflowId: g.wf.id,
    versionNo,
    db: {
      ...db,
      workflowVersions: { ...db.workflowVersions, [versionId]: { id: versionId, workflowId: g.wf.id, versionNo, graph, publishedBy: a.actorId, publishedAt: at } },
      workflows: {
        ...db.workflows,
        [g.wf.id]: { ...g.wf, ...meta, status: "active", currentVersionId: versionId, draft: null, draftSavedAt: null, revision: g.wf.revision + 1, updatedAt: at },
      },
    },
  };
}

export function duplicateWorkflow(db: Database, a: Actor & { workflowId: ID }): WorkflowResult {
  if (!can(db, a.actorId, "workflows.edit")) return { ok: false, error: "forbidden" };
  const src = db.workflows[a.workflowId];
  if (!src) return { ok: false, error: "notFound" };
  const graph = src.draft ?? (src.currentVersionId ? db.workflowVersions[src.currentVersionId]?.graph : null) ?? starterGraph();
  const names = new Set(Object.values(db.workflows).map((w) => norm(w.name.en)));
  let name = `Copy of ${src.name.en}`;
  for (let i = 2; names.has(norm(name)); i++) name = `Copy of ${src.name.en} (${i})`;
  const tx = new Tx(db, a.now);
  const id = tx.id("wf");
  const at = new Date(a.now).toISOString();
  tx.db.workflows = {
    ...db.workflows,
    [id]: {
      id,
      name: englishText(name),
      label: { ...src.label },
      description: { ...src.description },
      badgeTypeId: src.badgeTypeId,
      status: "draft",
      currentVersionId: null,
      draft: structuredClone(graph),
      draftSavedAt: at,
      revision: 1,
      createdAt: at,
      updatedAt: at,
    },
  };
  return { ok: true, db: tx.db, workflowId: id };
}

/** Inactive: no new requests start on it; requests in progress continue. */
export function setWorkflowStatus(
  db: Database,
  a: Actor & { workflowId: ID; expectedRevision: number; status: "active" | "inactive" },
): WorkflowResult {
  const g = guard(db, a, "workflows.publish");
  if ("error" in g) return { ok: false, error: g.error! };
  if (!g.wf.currentVersionId) return { ok: false, error: "notPublished" };
  if (g.wf.status === a.status) return { ok: false, error: "noChanges" };
  const at = new Date(a.now).toISOString();
  return {
    ok: true,
    workflowId: g.wf.id,
    db: { ...db, workflows: { ...db.workflows, [g.wf.id]: { ...g.wf, status: a.status, revision: g.wf.revision + 1, updatedAt: at } } },
  };
}

/**
 * 6.6: sets which registrations use this workflow for its badge type. A
 * registration already using another workflow is a clash: refused unless
 * `replace` lists it. Changes affect new requests only.
 */
export function setAllotments(
  db: Database,
  a: Actor & { workflowId: ID; registrationIds: ID[]; replace: ID[] },
): WorkflowResult {
  if (!can(db, a.actorId, "workflows.edit")) return { ok: false, error: "forbidden" };
  const wf = db.workflows[a.workflowId];
  if (!wf) return { ok: false, error: "notFound" };
  if (!wf.currentVersionId || wf.status !== "active") return { ok: false, error: "notPublished" };

  const options = new Map(allotmentOptions(db, wf).map((o) => [o.registration.id, o]));
  const wanted = a.registrationIds.filter((id) => options.has(id));
  const clashes = wanted.filter((id) => {
    const o = options.get(id)!;
    return o.current && !o.mine && !a.replace.includes(id);
  });
  if (clashes.length) return { ok: false, error: "clash", clashes };

  const allotments = { ...db.allotments };
  for (const o of options.values()) {
    if (o.mine && !wanted.includes(o.registration.id)) delete allotments[o.current!.id];
  }
  const at = new Date(a.now).toISOString();
  for (const id of wanted) {
    const o = options.get(id)!;
    if (o.mine) continue;
    if (o.current) delete allotments[o.current.id];
    const allotId = `al_${id}_${wf.badgeTypeId}`;
    allotments[allotId] = { id: allotId, workflowId: wf.id, registrationId: id, badgeTypeId: wf.badgeTypeId, allottedBy: a.actorId, allottedAt: at };
  }
  return {
    ok: true,
    workflowId: wf.id,
    db: { ...db, allotments, workflows: { ...db.workflows, [wf.id]: { ...wf, revision: wf.revision + 1, updatedAt: at } } },
  };
}

export const STAGE_ACTIONS: StageAction[] = ["approve", "reject", "moreInfo", "escalate"];
