import type { WorkflowIssue } from "@/domain/workflowAdmin";
import type { Database, StageAction, Workflow, WorkflowGraph, WorkflowNode } from "@/domain/types";

/** English copy for the Workflows area (kept English-only by product decision). */

export const ACTION_LABEL: Record<StageAction, string> = {
  approve: "Approve",
  reject: "Reject",
  moreInfo: "Ask for more information",
  escalate: "Escalate",
};

export const NODE_LABEL: Record<WorkflowNode["type"], string> = {
  start: "Start",
  stage: "Review stage",
  condition: "Condition",
  final: "Final approval",
  rejected: "Rejected",
};

export const STATUS_LABEL: Record<Workflow["status"], string> = { draft: "Draft", active: "Active", inactive: "Inactive" };

export function handleLabel(node: WorkflowNode | undefined, handle: string) {
  if (handle === "next") return "Next";
  if (handle === "otherwise") return "Otherwise";
  if (node?.type === "condition") return node.condition.branches.find((b) => b.id === handle)?.label.en || "Branch";
  return ACTION_LABEL[handle as StageAction] ?? handle;
}

export function nodeName(node: WorkflowNode | undefined) {
  if (!node) return "Block";
  if (node.type === "stage") return node.stage.name.en || "Untitled stage";
  if (node.type === "condition") return node.condition.label.en || "Condition";
  return NODE_LABEL[node.type];
}

/** One sentence per issue, naming the block it is about. */
export function issueText(db: Database, graph: WorkflowGraph, i: WorkflowIssue) {
  const node = graph.nodes.find((n) => n.id === i.nodeId);
  const name = `“${nodeName(node)}”`;
  const team = i.detail ? (db.teams[i.detail]?.name.en ?? "A team") : "";
  switch (i.code) {
    case "nameRequired":
      return "Enter a workflow name.";
    case "nameTaken":
      return "Another workflow already has this name.";
    case "labelRequired":
      return "Enter a label. It is shown on every request.";
    case "badgeTypeRequired":
      return "Choose the badge type this workflow checks.";
    case "noStart":
      return "Add a Start block.";
    case "multipleStart":
      return "Only one Start block is allowed. Remove the extra one.";
    case "noFinal":
      return "Add a Final approval block.";
    case "notConnected":
      return `${name}: connect “${handleLabel(node, i.detail ?? "")}” to the next block.`;
    case "unreachable":
      return `${name} can't be reached from Start.`;
    case "noPathToEnd":
      return `${name} has no path to Final approval or Rejected.`;
    case "endlessLoop":
      return `${name} is in a loop a request can never leave.`;
    case "stageNameRequired":
      return "A stage has no name.";
    case "noTeam":
      return `${name} has no team.`;
    case "noFallback":
      return `${name} has no fallback team.`;
    case "teamInactive":
      return `${name}: ${team} is inactive.`;
    case "teamNoReviewer":
      return `${name}: ${team} has no reviewer with Review Queue Access.`;
    case "conditionNoBranches":
      return `${name} needs at least one branch.`;
    case "conditionIncomplete":
      return `${name}: finish the rule for “${handleLabel(node, i.detail ?? "")}”.`;
    case "teamsShareBadgeType": {
      const [a, b] = (i.detail ?? "").split(",").map((id) => db.teams[id]?.name.en ?? "");
      return `${name}: ${a} and ${b} both cover this badge type, so ${b} only gets requests ${a} doesn't match.`;
    }
    case "onlyFallbackCovers":
      return `${name}: none of its teams covers this badge type, so every request goes to the fallback team.`;
  }
}
