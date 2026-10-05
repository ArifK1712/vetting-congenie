import { nodeById, requestPath, type StageNode } from "./workflow";
import type { Database, ID, LocalizedText, StageExecution, VettingRequest } from "./types";

export type StepState = "done" | "current" | "upcoming" | "rejected" | "skipped" | "held";

export interface ProgressStep {
  nodeId: ID;
  kind: "stage" | "escalation" | "final";
  name: LocalizedText | null;
  state: StepState;
  mandatory: boolean;
  timeLimitHours: number | null;
  /** Executions of this stage, oldest first (a stage can be visited more than once). */
  visits: StageExecution[];
}

/**
 * Stage-by-stage view of one request: its resolved path, any escalation
 * stage it was sent to, and final approval.
 */
export function buildProgress(db: Database, request: VettingRequest): ProgressStep[] {
  const version = request.workflowVersionId ? db.workflowVersions[request.workflowVersionId] : undefined;
  if (!version) return [];
  const attendee = db.attendees[request.attendeeId];
  const path = requestPath(version.graph, attendee, request);
  const executions = Object.values(db.stageExecutions)
    .filter((e) => e.requestId === request.id)
    .sort((a, b) => Date.parse(a.enteredAt) - Date.parse(b.enteredAt));

  const visitedOffPath = [...new Set(executions.map((e) => e.stageNodeId))]
    .filter((id) => !path.some((p) => p.id === id))
    .map((id) => nodeById(version.graph, id))
    .filter((n): n is StageNode => n?.type === "stage");

  // Escalation stages are shown where they were visited: after the stage that escalated.
  const ordered: { node: StageNode; kind: "stage" | "escalation" }[] = [];
  for (const node of path) {
    ordered.push({ node, kind: "stage" });
    for (const esc of visitedOffPath) {
      const escalatedFromHere = executions.some((e) => e.stageNodeId === node.id && e.outcome === "escalate");
      if (escalatedFromHere && !ordered.some((o) => o.node.id === esc.id)) ordered.push({ node: esc, kind: "escalation" });
    }
  }

  const terminal = request.status === "rejected" || request.status === "withdrawn";
  let afterStop = false;

  const steps: ProgressStep[] = ordered.map(({ node, kind }) => {
    const visits = executions.filter((e) => e.stageNodeId === node.id);
    const last = visits[visits.length - 1];
    let state: StepState;
    if (afterStop) state = "skipped";
    else if (request.currentStageNodeId === node.id && !terminal && request.status !== "approved" && !request.awaitingCapacity) {
      state = request.status === "screening_hold" ? "held" : "current";
      afterStop = true;
    } else if (last?.outcome === "reject") {
      state = "rejected";
      afterStop = true;
    } else if (last?.outcome === "approve" || last?.outcome === "escalate") state = "done";
    else if (terminal && visits.length) {
      state = "skipped";
      afterStop = true;
    } else state = terminal ? "skipped" : "upcoming";
    return {
      nodeId: node.id,
      kind,
      name: node.stage.name,
      state,
      mandatory: node.stage.mandatory,
      timeLimitHours: node.stage.timeLimitHours,
      visits,
    };
  });

  const finalNode = version.graph.nodes.find((n) => n.type === "final");
  steps.push({
    nodeId: finalNode?.id ?? "final",
    kind: "final",
    name: null,
    state: request.status === "approved" ? "done" : request.awaitingCapacity ? "current" : terminal || afterStop ? "skipped" : "upcoming",
    mandatory: true,
    timeLimitHours: null,
    visits: [],
  });
  // Steps after the active one are simply upcoming for open requests.
  if (!terminal) for (const s of steps) if (s.state === "skipped") s.state = "upcoming";
  return steps;
}
