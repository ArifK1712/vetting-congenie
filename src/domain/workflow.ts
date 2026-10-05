import { evaluateCondition, readField } from "./conditions";
import type { Attendee, ID, StageConfig, VettingRequest, WorkflowGraph, WorkflowNode } from "./types";

export type StageNode = Extract<WorkflowNode, { type: "stage" }>;

export function nodeById(graph: WorkflowGraph, id: ID | null): WorkflowNode | undefined {
  return id ? graph.nodes.find((n) => n.id === id) : undefined;
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
