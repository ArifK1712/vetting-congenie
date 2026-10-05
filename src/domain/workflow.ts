import { evaluateCondition, readField } from "./conditions";
import type { Attendee, Database, ID, StageConfig, VettingRequest, WorkflowGraph, WorkflowNode } from "./types";

export type StageNode = Extract<WorkflowNode, { type: "stage" }>;

/**
 * Watchlist extra review (10.3): "watchlist_review" is the standard stage;
 * "watchlist_review:<nodeId>" is a copy of one of the workflow's own stages.
 * Neither is drawn in the graph; they run once, just before final approval.
 */
export const WATCHLIST_REVIEW = "watchlist_review";

export const STANDARD_WATCHLIST_STAGE: StageConfig = {
  name: { en: "Watchlist Review", ar: "مراجعة قائمة المراقبة" },
  instructions: { en: "This applicant matched the watchlist. Read the reviewer note and check carefully before approving.", ar: "" },
  teams: ["t_senior"],
  fallbackTeamId: "t_secreview",
  allowedActions: ["approve", "reject", "moreInfo"],
  escalateTo: [],
  afterMoreInfoReturnTo: "same",
  rejectReasonRequired: true,
  timeLimitHours: 24,
  mandatory: true,
};

export const isWatchlistStage = (id: ID | null | undefined) => !!id && (id === WATCHLIST_REVIEW || id.startsWith(`${WATCHLIST_REVIEW}:`));

export function nodeById(graph: WorkflowGraph, id: ID | null): WorkflowNode | undefined {
  if (!id) return undefined;
  if (isWatchlistStage(id)) {
    if (id === WATCHLIST_REVIEW) return { id, type: "stage", position: { x: 0, y: 0 }, stage: STANDARD_WATCHLIST_STAGE };
    const base = graph.nodes.find((n) => n.id === id.slice(WATCHLIST_REVIEW.length + 1));
    if (base?.type !== "stage") return { id, type: "stage", position: { x: 0, y: 0 }, stage: STANDARD_WATCHLIST_STAGE };
    return { ...base, id, stage: { ...base.stage, name: { en: `${base.stage.name.en} (watchlist)`, ar: base.stage.name.ar }, escalateTo: [], allowedActions: base.stage.allowedActions.filter((a) => a !== "escalate") } };
  }
  return graph.nodes.find((n) => n.id === id);
}

export function stageOf(graph: WorkflowGraph, id: ID | null): StageConfig | undefined {
  const node = nodeById(graph, id);
  return node?.type === "stage" ? node.stage : undefined;
}

export function target(graph: WorkflowGraph, source: ID, handle: string): ID | undefined {
  return graph.edges.find((e) => e.source === source && e.handle === handle)?.target;
}

type ConditionNode = Extract<WorkflowNode, { type: "condition" }>;

/**
 * The approval path: from Start, follow "next"/"approve" edges until Final
 * Approval. At condition nodes `chooseBranch` picks a branch id; returning
 * undefined takes "otherwise". Escalation-only stages sit off this path.
 */
export function resolvePath(
  graph: WorkflowGraph,
  chooseBranch: (node: ConditionNode) => ID | undefined = () => undefined,
): StageNode[] {
  const start = graph.nodes.find((n) => n.type === "start");
  const out: StageNode[] = [];
  const seen = new Set<ID>();
  let current = start ? target(graph, start.id, "next") : undefined;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = nodeById(graph, current);
    if (!node) break;
    if (node.type === "stage") {
      out.push(node);
      current = target(graph, node.id, "approve");
    } else if (node.type === "condition") {
      current = target(graph, node.id, chooseBranch(node) ?? "otherwise");
    } else break;
  }
  return out;
}

/** The stage path for one request, evaluating condition nodes against its data. */
export function requestPath(
  graph: WorkflowGraph,
  attendee: Attendee,
  request: Pick<VettingRequest, "watchlistLevel" | "badgeTypeId" | "registrationId">,
): StageNode[] {
  return resolvePath(graph, (node) =>
    node.condition.branches.find((b) =>
      evaluateCondition(b.condition, readField(b.condition.field, attendee, request)),
    )?.id,
  );
}

/**
 * The extra watchlist stage a request still owes before final approval, if
 * any: an open match on an active "add a review stage" entry, and the stage
 * not run yet for this request (it runs once).
 */
export function pendingWatchlistStage(db: Database, r: VettingRequest, graph: WorkflowGraph): StageNode | undefined {
  const done = new Set(Object.values(db.stageExecutions).filter((e) => e.requestId === r.id).map((e) => e.stageNodeId));
  if ([...done].some(isWatchlistStage)) return undefined;
  for (const m of Object.values(db.matches)) {
    if (m.requestId !== r.id || m.listType !== "watchlist" || m.status === "cleared") continue;
    const entry = db.watchlist[m.entryId];
    if (!entry || entry.status !== "active" || entry.onMatch !== "markStage") continue;
    const choice = entry.extraStage ?? WATCHLIST_REVIEW;
    const [workflowId, nodeId] = choice.includes(":") ? choice.split(":") : [null, null];
    const id = workflowId && workflowId === r.workflowId ? `${WATCHLIST_REVIEW}:${nodeId}` : WATCHLIST_REVIEW;
    const node = nodeById(graph, id);
    if (node?.type === "stage") return node as StageNode;
  }
  return undefined;
}
