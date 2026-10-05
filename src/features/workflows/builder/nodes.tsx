"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { BadgeCheck, CircleAlert, Clock, GitBranch, Lock, MessageCircleQuestion, Play, TriangleAlert, Users, XCircle } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { WorkflowIssue } from "@/domain/workflowAdmin";
import type { Database, WorkflowNode } from "@/domain/types";
import { cn } from "@/lib/cn";
import { handleLabel } from "../text";

export interface BlockData extends Record<string, unknown> {
  block: WorkflowNode;
  issues: WorkflowIssue[];
  db: Database;
  conditionText: (field: string, operator: string, value: string[]) => string;
}

export type BlockNode = Node<BlockData>;

/** Connection colours: one per action, shared by handles, edges and the legend. */
export const HANDLE_COLOR: Record<string, string> = {
  next: "#6366f1",
  approve: "#10b981",
  reject: "#e11d48",
  escalate: "#f59e0b",
  otherwise: "#94a3b8",
  branch: "#6366f1",
};
export const colorFor = (handle: string) => HANDLE_COLOR[handle] ?? HANDLE_COLOR.branch;

const handleStyle = (color: string, left?: string): CSSProperties => ({
  width: 11,
  height: 11,
  background: color,
  border: "2px solid #fff",
  boxShadow: `0 0 0 1px ${color}55`,
  ...(left ? { left } : {}),
});

function InHandle() {
  return <Handle type="target" position={Position.Top} id="in" style={handleStyle("#94a3b8")} />;
}

function IssueBadge({ issues }: { issues: WorkflowIssue[] }) {
  const errors = issues.filter((i) => i.severity === "error").length;
  if (!issues.length) return null;
  return (
    <span
      className={cn(
        "absolute -top-2 -right-2 inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-white",
        errors ? "bg-rose-500" : "bg-amber-500",
      )}
    >
      {errors ? <CircleAlert className="size-3" /> : <TriangleAlert className="size-3" />}
      {errors || issues.length}
    </span>
  );
}

function Shell({
  selected,
  issues,
  className,
  children,
}: {
  selected: boolean;
  issues: WorkflowIssue[];
  className?: string;
  children: ReactNode;
}) {
  const error = issues.some((i) => i.severity === "error");
  const warn = !error && issues.length > 0;
  return (
    <div
      className={cn(
        "relative bg-white shadow-[0_1px_2px_rgb(16_24_40/0.06),0_4px_12px_-4px_rgb(16_24_40/0.1)] transition-shadow",
        selected ? "ring-2 ring-indigo-500" : error ? "ring-2 ring-rose-300" : warn ? "ring-2 ring-amber-300" : "ring-1 ring-slate-200",
        className,
      )}
    >
      <IssueBadge issues={issues} />
      {children}
    </div>
  );
}

/** Labelled outgoing handles along the bottom edge, evenly spaced. */
function OutHandles({ handles, block }: { handles: string[]; block: WorkflowNode }) {
  return (
    <div className="relative mt-3 flex h-6 items-end border-t border-slate-100">
      {handles.map((h, i) => {
        const left = `${((i + 0.5) / handles.length) * 100}%`;
        const color = colorFor(h === "otherwise" || h === "approve" || h === "reject" || h === "escalate" || h === "next" ? h : "branch");
        return (
          <span key={h}>
            <span
              className="absolute bottom-2 max-w-[45%] -translate-x-1/2 truncate text-[10px] font-semibold"
              style={{ left, color }}
            >
              {handleLabel(block, h)}
            </span>
            <Handle type="source" position={Position.Bottom} id={h} style={handleStyle(color, left)} />
          </span>
        );
      })}
    </div>
  );
}

export function StartBlock({ data, selected }: NodeProps<BlockNode>) {
  return (
    <Shell selected={!!selected} issues={data.issues} className="rounded-full">
      <div className="flex items-center gap-2 py-2 ps-2 pe-4">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-indigo-500 text-white">
          <Play className="size-3.5 fill-current" />
        </span>
        <span className="text-sm font-bold text-slate-900">Start</span>
        <span className="text-[11px] text-slate-500">Request submitted</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="next" style={handleStyle(HANDLE_COLOR.next)} />
    </Shell>
  );
}

export function StageBlock({ data, selected }: NodeProps<BlockNode>) {
  const block = data.block;
  if (block.type !== "stage") return null;
  const s = block.stage;
  const teams = s.teams.map((id) => data.db.teams[id]?.name.en ?? "Unknown team");
  const fallback = s.fallbackTeamId ? data.db.teams[s.fallbackTeamId]?.name.en : null;
  const handles = ["approve", ...(s.allowedActions.includes("escalate") ? ["escalate"] : []), "reject"];
  return (
    <Shell selected={!!selected} issues={data.issues} className="w-[270px] rounded-xl">
      <InHandle />
      <div className="px-3.5 pt-3">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
            <Users className="size-3.5" />
          </span>
          <span className="text-[10px] font-semibold tracking-[0.06em] text-slate-400 uppercase">Review stage</span>
          <span className="ms-auto flex items-center gap-1">
            {s.timeLimitHours !== null && (
              <span className="inline-flex h-5 items-center gap-1 rounded-md bg-sky-50 px-1.5 text-[10px] font-semibold text-sky-700">
                <Clock className="size-2.5" />
                {s.timeLimitHours}h
              </span>
            )}
            {s.mandatory && (
              <span title="Mandatory" className="inline-flex h-5 items-center gap-1 rounded-md bg-violet-50 px-1.5 text-[10px] font-semibold text-violet-700">
                <Lock className="size-2.5" />
                Mandatory
              </span>
            )}
          </span>
        </div>
        <p className="mt-2 truncate text-sm font-bold text-slate-900">{s.name.en || "Untitled stage"}</p>
        <div className="mt-1.5 space-y-0.5 text-[11px] leading-snug">
          {teams.length ? (
            teams.map((name, i) => (
              <p key={i} className="flex items-center gap-1.5 truncate text-slate-600">
                <span className="tabular inline-flex size-3.5 shrink-0 items-center justify-center rounded bg-slate-100 text-[9px] font-bold text-slate-500">{i + 1}</span>
                <span className="truncate">{name}</span>
              </p>
            ))
          ) : (
            <p className="font-medium text-rose-600">No team yet</p>
          )}
          <p className="truncate text-slate-400">Fallback · {fallback ?? <span className="text-rose-600">none</span>}</p>
        </div>
        {s.allowedActions.includes("moreInfo") && (
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            <MessageCircleQuestion className="size-3" />
            More info returns to {s.afterMoreInfoReturnTo === "same" ? "this stage" : "another stage"}
          </p>
        )}
      </div>
      <OutHandles handles={handles} block={block} />
    </Shell>
  );
}

export function ConditionBlock({ data, selected }: NodeProps<BlockNode>) {
  const block = data.block;
  if (block.type !== "condition") return null;
  const c = block.condition;
  return (
    <Shell selected={!!selected} issues={data.issues} className="w-[270px] rounded-xl">
      <InHandle />
      <div className="px-3.5 pt-3">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-amber-50 text-amber-600">
            <GitBranch className="size-3.5" />
          </span>
          <span className="text-[10px] font-semibold tracking-[0.06em] text-slate-400 uppercase">Condition</span>
        </div>
        <p className="mt-2 truncate text-sm font-bold text-slate-900">{c.label.en || "Condition"}</p>
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-600">
          {c.branches.map((b) => (
            <li key={b.id} className="truncate">
              <span className="font-semibold text-indigo-600">{b.label.en || "Branch"}:</span>{" "}
              {b.condition.field ? data.conditionText(b.condition.field, b.condition.operator, b.condition.value) : <span className="text-rose-600">rule not set</span>}
            </li>
          ))}
          <li className="text-slate-400">Otherwise: everything else</li>
        </ul>
      </div>
      <OutHandles handles={[...c.branches.map((b) => b.id), "otherwise"]} block={block} />
    </Shell>
  );
}

export function FinalBlock({ data, selected }: NodeProps<BlockNode>) {
  return (
    <Shell selected={!!selected} issues={data.issues} className="w-[230px] rounded-xl bg-emerald-50/60">
      <InHandle />
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
          <BadgeCheck className="size-4" />
        </span>
        <div>
          <p className="text-sm font-bold text-emerald-900">Final approval</p>
          <p className="text-[11px] leading-snug text-emerald-800/80">Re-checks the lists, takes a place from the limit, issues the badge.</p>
        </div>
      </div>
    </Shell>
  );
}

export function RejectedBlock({ data, selected }: NodeProps<BlockNode>) {
  const block = data.block;
  const reason = block.type === "rejected" && block.defaultReasonId ? data.db.rejectReasons[block.defaultReasonId]?.label.en : null;
  return (
    <Shell selected={!!selected} issues={data.issues} className="w-[230px] rounded-xl bg-rose-50/60">
      <InHandle />
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-rose-500 text-white">
          <XCircle className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-rose-900">Rejected</p>
          <p className="truncate text-[11px] text-rose-800/80">{reason ? `Default reason: ${reason}` : "Sends the rejection email"}</p>
        </div>
      </div>
    </Shell>
  );
}

export const NODE_TYPES = {
  start: StartBlock,
  stage: StageBlock,
  condition: ConditionBlock,
  final: FinalBlock,
  rejected: RejectedBlock,
};
