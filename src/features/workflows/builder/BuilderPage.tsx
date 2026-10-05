"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  Eye,
  GitBranch,
  History,
  Loader2,
  Lock,
  Pencil,
  Play,
  Redo2,
  Rocket,
  Save,
  SearchX,
  Share2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Undo2,
  Users,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ActionDialog, DialogIcon } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  allotmentsOf,
  edge as makeEdge,
  errorsOf,
  newNode,
  normalizeGraph,
  openRequestsByVersion,
  stagesOf,
  validateGraph,
  validateMeta,
  versionsOf,
  type WorkflowIssue,
  type WorkflowMeta,
} from "@/domain/workflowAdmin";
import type { ID, Workflow, WorkflowGraph, WorkflowNode } from "@/domain/types";
import { useFormat } from "@/i18n/format";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";
import { WORKFLOW_ERRORS, workflowService, workflowWroteLocally } from "@/services/workflows";
import { useAppStore, useDb } from "@/store/app";
import { useViewer } from "@/store/useViewer";
import { WorkflowStatusPill } from "../WorkflowsListPage";
import { handleLabel, issueText as describeIssue, NODE_LABEL } from "../text";
import { AllotDialog } from "./AllotDialog";
import { Inspector, type Selection } from "./Inspector";
import { colorFor, NODE_TYPES, type BlockNode } from "./nodes";
import { useBuilder, type Snapshot } from "./useBuilder";

const metaOf = (wf: Workflow): WorkflowMeta => ({ name: wf.name, label: wf.label, description: wf.description, badgeTypeId: wf.badgeTypeId });

const OPERATOR_TEXT: Record<string, string> = {
  is: "is",
  isNot: "is not",
  isAnyOf: "is any of",
  isNoneOf: "is none of",
  contains: "contains",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

// ─── Palette ────────────────────────────────────────────────────────────

const PALETTE: { type: WorkflowNode["type"]; icon: LucideIcon; tone: string; hint: string }[] = [
  { type: "stage", icon: Users, tone: "bg-indigo-50 text-indigo-600", hint: "A team reviews and decides" },
  { type: "condition", icon: GitBranch, tone: "bg-amber-50 text-amber-600", hint: "Split by applicant data" },
  { type: "final", icon: BadgeCheck, tone: "bg-emerald-50 text-emerald-600", hint: "Approve and issue the badge" },
  { type: "rejected", icon: XCircle, tone: "bg-rose-50 text-rose-600", hint: "End with a rejection" },
  { type: "start", icon: Play, tone: "bg-indigo-50 text-indigo-600", hint: "Where requests enter (one only)" },
];

function Palette({ graph, onAdd }: { graph: WorkflowGraph; onAdd: (type: WorkflowNode["type"]) => void }) {
  const hasStart = graph.nodes.some((n) => n.type === "start");
  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-e border-line bg-surface">
      <p className="eyebrow px-4 pt-4 pb-2">Blocks</p>
      <ul className="space-y-1.5 px-3">
        {PALETTE.map((p) => {
          const disabled = p.type === "start" && hasStart;
          return (
            <li key={p.type}>
              <button
                type="button"
                draggable={!disabled}
                disabled={disabled}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-workflow-block", p.type);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => onAdd(p.type)}
                className="flex w-full cursor-grab items-center gap-2.5 rounded-lg bg-surface px-2.5 py-2 text-start ring-1 ring-line transition-colors outline-none hover:bg-subtle hover:ring-line-strong focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", p.tone)}>
                  <p.icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{NODE_LABEL[p.type]}</span>
                  <span className="block truncate text-2xs text-ink-3">{p.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="eyebrow px-4 pt-5 pb-2">Connections</p>
      <ul className="space-y-1.5 px-4 text-xs text-ink-2">
        {[
          ["approve", "Approve"],
          ["reject", "Reject"],
          ["escalate", "Escalate"],
          ["next", "Next / condition path"],
          ["otherwise", "Otherwise"],
        ].map(([k, label]) => (
          <li key={k} className="flex items-center gap-2">
            <span className={cn("h-0.5 w-6 rounded-full", k === "escalate" && "bg-transparent border-t-2 border-dashed")} style={k === "escalate" ? { borderColor: colorFor(k) } : { background: colorFor(k) }} />
            {label}
          </li>
        ))}
      </ul>
      <div className="mt-auto space-y-1.5 border-t border-line px-4 py-4 text-2xs leading-relaxed text-ink-3">
        <p>Drag a block onto the canvas, or click to add it.</p>
        <p>Drag from a coloured dot to another block to connect.</p>
        <p>Select a block or line and press Delete to remove it.</p>
        <p>Blacklist and watchlist checks run automatically; they aren’t blocks.</p>
      </div>
    </aside>
  );
}

// ─── Problems panel ─────────────────────────────────────────────────────

function ProblemsPanel({ issues, text, open, setOpen, onPick }: { issues: WorkflowIssue[]; text: (i: WorkflowIssue) => string; open: boolean; setOpen: (o: boolean) => void; onPick: (i: WorkflowIssue) => void }) {
  const errors = errorsOf(issues).length;
  const warnings = issues.length - errors;
  return (
    <div className="absolute bottom-4 left-4 z-10 w-[26rem] max-w-[calc(100%-2rem)] overflow-hidden rounded-xl bg-surface shadow-pop ring-1 ring-line">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-start text-sm outline-none hover:bg-subtle">
        {errors ? <CircleAlert className="size-4 text-rose-500" /> : warnings ? <TriangleAlert className="size-4 text-amber-500" /> : <CircleCheck className="size-4 text-emerald-500" />}
        <span className="flex-1 font-semibold text-ink">
          {errors ? `${errors} problem${errors === 1 ? "" : "s"} to fix before publishing` : "Ready to publish"}
          {warnings > 0 && <span className="ms-1.5 font-normal text-ink-3">· {warnings} warning{warnings === 1 ? "" : "s"}</span>}
        </span>
        {issues.length > 0 && (open ? <ChevronDown className="size-4 text-ink-3" /> : <ChevronUp className="size-4 text-ink-3" />)}
      </button>
      {open && issues.length > 0 && (
        <ul className="max-h-64 overflow-y-auto border-t border-line p-1.5">
          {issues.map((i, n) => (
            <li key={n}>
              <button type="button" onClick={() => onPick(i)} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start text-xs text-ink-2 outline-none hover:bg-hover focus-visible:bg-hover">
                {i.severity === "error" ? <CircleAlert className="mt-px size-3.5 shrink-0 text-rose-500" /> : <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber-500" />}
                {text(i)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Versions ───────────────────────────────────────────────────────────

function VersionsPanel({ wf, viewing, onView, onClose }: { wf: Workflow; viewing: ID | null; onView: (id: ID | null) => void; onClose: () => void }) {
  const db = useDb();
  const fmt = useFormat();
  const versions = versionsOf(db, wf.id);
  const open = openRequestsByVersion(db, wf.id);
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
          <History className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">Versions</p>
          <p className="text-xs text-ink-3">Published versions never change.</p>
        </div>
        <Button size="sm" variant="ghost" iconOnly aria-label="Close versions" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <ol className="p-3">
        <li>
          <button
            type="button"
            onClick={() => onView(null)}
            className={cn("flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start outline-none hover:bg-subtle", viewing === null && "bg-accent-soft ring-1 ring-indigo-200")}
          >
            <span className="mt-0.5 inline-flex h-5 items-center rounded-md bg-amber-50 px-1.5 text-2xs font-semibold text-amber-800 ring-1 ring-amber-600/20">{wf.draft ? "Draft" : "Working"}</span>
            <span className="min-w-0 flex-1 text-xs text-ink-2">
              {wf.draft ? `Saved ${wf.draftSavedAt ? fmt.dateTime(wf.draftSavedAt) : ""}` : "The version you’re looking at or editing"}
            </span>
          </button>
        </li>
        {versions.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => onView(v.id)}
              className={cn("flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start outline-none hover:bg-subtle", viewing === v.id && "bg-accent-soft ring-1 ring-indigo-200")}
            >
              <span className="mt-0.5 font-mono text-xs font-bold text-ink">v{v.versionNo}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  {fmt.date(v.publishedAt)}
                  {v.id === wf.currentVersionId && (
                    <span className="inline-flex h-5 items-center rounded-md bg-emerald-50 px-1.5 text-2xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">{wf.status === "active" ? "Live" : "Latest"}</span>
                  )}
                </span>
                <span className="block text-xs text-ink-3">
                  {db.users[v.publishedBy]?.name ?? "Unknown"} · {stagesOf(v.graph).length} stages · {open.get(v.id) ?? 0} in progress
                </span>
              </span>
              <Eye className="mt-1 size-3.5 text-ink-3" />
            </button>
          </li>
        ))}
      </ol>
      <p className="mx-5 mb-5 rounded-lg bg-subtle px-3 py-2.5 text-xs text-ink-2 ring-1 ring-line">
        Publishing makes a new version for new requests. Requests already in progress stay on the version they started with.
      </p>
    </div>
  );
}

// ─── Canvas ─────────────────────────────────────────────────────────────

function edgeStyle(handle: string, block: WorkflowNode | undefined, selected: boolean): Partial<Edge> {
  const kind = ["approve", "reject", "escalate", "next", "otherwise"].includes(handle) ? handle : "branch";
  const color = colorFor(kind);
  return {
    type: "smoothstep",
    label: handleLabel(block, handle),
    style: { stroke: color, strokeWidth: selected ? 3 : 2, strokeDasharray: kind === "escalate" ? "6 4" : undefined },
    labelStyle: { fill: color, fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: "#ffffff" },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
    pathOptions: { borderRadius: 14 },
  } as Partial<Edge>;
}

function Canvas({
  graph,
  issues,
  editable,
  selection,
  setSelection,
  b,
  focus,
  overlay,
}: {
  overlay?: ReactNode;
  graph: WorkflowGraph;
  issues: WorkflowIssue[];
  editable: boolean;
  selection: Selection;
  setSelection: (s: Selection) => void;
  b: ReturnType<typeof useBuilder>;
  focus: { id: ID; n: number } | null;
}) {
  const db = useDb();
  const flow = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const fmt = useFormat();

  const conditionText = useCallback(
    (field: string, operator: string, value: string[]) => {
      const [source, key] = field.split(".");
      const q = source === "answer" ? Object.values(db.registrations).flatMap((r) => r.questions).find((x) => x.id === key) : null;
      const name =
        source === "profile" ? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()) : source === "answer" ? (q?.label.en ?? key) : source === "payment" ? "Payment status" : "Watchlist level";
      const values = value.map((v) => (key === "nationality" ? fmt.country(v) : (q?.options?.find((o) => o.value === v)?.label.en ?? v.charAt(0).toUpperCase() + v.slice(1))));
      return `${name} ${OPERATOR_TEXT[operator] ?? operator} ${values.join(", ")}`.trim();
    },
    [db, fmt],
  );

  const nodes: BlockNode[] = useMemo(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: { block: n, issues: issues.filter((i) => i.nodeId === n.id), db, conditionText },
        selected: selection?.kind === "node" && selection.id === n.id,
        deletable: editable,
      })),
    [graph.nodes, issues, db, conditionText, selection, editable],
  );
  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        const selected = selection?.kind === "edge" && selection.id === e.id;
        return { id: e.id, source: e.source, sourceHandle: e.handle, target: e.target, targetHandle: "in", selected, deletable: editable, ...edgeStyle(e.handle, graph.nodes.find((n) => n.id === e.source), selected) };
      }),
    [graph, selection, editable],
  );

  // Focus a block picked from the problems list.
  useEffect(() => {
    if (focus) void flow.fitView({ nodes: [{ id: focus.id }], duration: 350, maxZoom: 1.1, padding: 0.6 });
  }, [focus, flow]);

  const onNodesChange = (changes: NodeChange<BlockNode>[]) => {
    const moves = changes.filter((c) => c.type === "position" && c.position);
    if (moves.length) {
      b.edit(
        (g) => ({
          ...g,
          nodes: g.nodes.map((n) => {
            const c = moves.find((m) => m.type === "position" && m.id === n.id);
            return c && c.type === "position" && c.position ? { ...n, position: { x: Math.round(c.position.x), y: Math.round(c.position.y) } } : n;
          }),
        }),
        false,
      );
    }
    const removed = changes.filter((c) => c.type === "remove").map((c) => (c as { id: string }).id);
    if (removed.length && editable) {
      b.edit((g) => ({ nodes: g.nodes.filter((n) => !removed.includes(n.id)), edges: g.edges.filter((e) => !removed.includes(e.source) && !removed.includes(e.target)) }));
      setSelection(null);
    }
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    const removed = changes.filter((c) => c.type === "remove").map((c) => (c as { id: string }).id);
    if (removed.length && editable) {
      b.edit((g) => ({ ...g, edges: g.edges.filter((e) => !removed.includes(e.id)) }));
      setSelection(null);
    }
  };
  const isValidConnection = (c: Connection | Edge) => {
    const target = graph.nodes.find((n) => n.id === c.target);
    if (!target || c.source === c.target || target.type === "start") return false;
    if (c.sourceHandle === "escalate" && target.type !== "stage") return false;
    return true;
  };
  const onConnect = (c: Connection) => {
    if (!c.sourceHandle || !isValidConnection(c)) return;
    b.edit((g) => ({ ...g, edges: [...g.edges, makeEdge(c.source, c.sourceHandle!, c.target)] }));
  };

  const add = (type: WorkflowNode["type"], at?: { x: number; y: number }) => {
    const rect = wrapper.current?.getBoundingClientRect();
    const position = at ?? flow.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2 - 130, y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2 - 60 });
    const block = newNode(type, graph, { x: Math.round(position.x), y: Math.round(position.y) });
    b.edit((g) => ({ ...g, nodes: [...g.nodes, block] }));
    setSelection({ kind: "node", id: block.id });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/x-workflow-block") as WorkflowNode["type"];
    if (!type || !editable) return;
    add(type, flow.screenToFlowPosition({ x: e.clientX - 130, y: e.clientY - 30 }));
  };

  return (
    <>
      {editable && <Palette graph={graph} onAdd={(t) => add(t)} />}
      <div ref={wrapper} className="relative min-w-0 flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeDragStart={() => b.checkpoint()}
          onNodeClick={(_, n) => setSelection({ kind: "node", id: n.id })}
          onEdgeClick={(_, e) => setSelection({ kind: "edge", id: e.id })}
          onPaneClick={() => setSelection(null)}
          nodesDraggable={editable}
          nodesConnectable={editable}
          deleteKeyCode={editable ? ["Delete", "Backspace"] : null}
          snapToGrid
          snapGrid={[10, 10]}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          minZoom={0.3}
          maxZoom={1.6}
          defaultEdgeOptions={{ type: "smoothstep" }}
          proOptions={{ hideAttribution: true }}
          className="bg-[#f6f7fb]"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="#d5d9e4" />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
        {overlay}
      </div>
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

function BuilderInner({ wf }: { wf: Workflow }) {
  const db = useDb();
  const viewer = useViewer();
  const router = useRouter();
  const params = useSearchParams();
  const fmt = useFormat();
  const now = useNow();
  const canEdit = viewer.can("workflows.edit");
  const canPublish = viewer.can("workflows.publish");

  const currentGraph = wf.currentVersionId ? db.workflowVersions[wf.currentVersionId]?.graph : null;
  const initialEditing = !!wf.draft || (params.get("edit") === "1" && canEdit) || (!wf.currentVersionId && canEdit);
  const [editing, setEditing] = useState(initialEditing && canEdit);
  const startSnap = (): Snapshot => ({ meta: metaOf(wf), graph: normalizeGraph(structuredClone(wf.draft ?? currentGraph ?? { nodes: [], edges: [] })) });
  const [baseline, setBaseline] = useState(() => JSON.stringify(startSnap()));
  const [loadedRevision, setLoadedRevision] = useState(wf.revision);
  const b = useBuilder(JSON.parse(baseline));

  const [selection, setSelection] = useState<Selection>(null);
  const [viewing, setViewing] = useState<ID | null>(null);
  const [side, setSide] = useState<"inspector" | "versions">("inspector");
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [focus, setFocus] = useState<{ id: ID; n: number } | null>(null);
  const [busy, setBusy] = useState<null | "save" | "publish" | "discard">(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [allotting, setAllotting] = useState(params.get("allot") === "1");

  const viewingVersion = viewing ? db.workflowVersions[viewing] : null;
  const graph = viewingVersion ? viewingVersion.graph : b.graph;
  const editable = editing && canEdit && !viewingVersion;
  const dirty = editing && (JSON.stringify({ meta: b.meta, graph: b.graph }) !== baseline || !wf.draft);
  const stale = wf.revision !== loadedRevision && !workflowWroteLocally(wf.id, wf.revision);

  const issues = useMemo(
    () => (viewingVersion ? [] : [...validateMeta(db, b.meta, wf.id), ...validateGraph(db, b.graph, b.meta.badgeTypeId)]),
    [db, b.meta, b.graph, wf.id, viewingVersion],
  );
  const text = useCallback((i: WorkflowIssue) => describeIssue(db, b.graph, i), [db, b.graph]);
  const errors = errorsOf(issues);
  const versions = versionsOf(db, wf.id);
  const nextVersion = (versions[0]?.versionNo ?? 0) + 1;
  const inProgress = wf.currentVersionId ? (openRequestsByVersion(db, wf.id).get(wf.currentVersionId) ?? 0) : 0;
  const allotted = allotmentsOf(db, wf.id).length;

  // Leaving with unsaved changes (6.2).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Undo / redo shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!editable || ["INPUT", "TEXTAREA"].includes(t.tagName) || !(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        b.undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        b.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, b]);

  const startEditing = () => {
    const snap = startSnap();
    b.reset(snap);
    setBaseline(JSON.stringify(snap));
    setEditing(true);
    setViewing(null);
  };

  const saveDraft = async () => {
    setBusy("save");
    const r = await workflowService.saveDraft({ workflowId: wf.id, expectedRevision: loadedRevision, meta: b.meta, graph: b.graph, actorId: viewer.id });
    setBusy(null);
    if (!r.ok) {
      if (r.issues) setProblemsOpen(true);
      return toast(WORKFLOW_ERRORS[r.error]);
    }
    setBaseline(JSON.stringify({ meta: b.meta, graph: normalizeGraph(b.graph) }));
    setLoadedRevision(r.db.workflows[wf.id].revision);
    toast("Draft saved");
  };

  const tryPublish = useCallback(() => {
    if (errorsOf(issues).length) {
      setProblemsOpen(true);
      toast("Fix the problems before publishing");
      return;
    }
    setConfirmPublish(true);
  }, [issues]);

  // ?publish=1 from the list opens the publish step once.
  const autoPublish = useRef(params.get("publish") === "1");
  useEffect(() => {
    if (autoPublish.current && editing) {
      autoPublish.current = false;
      tryPublish();
    }
  }, [editing, tryPublish]);

  const publish = async () => {
    setBusy("publish");
    const r = await workflowService.publish({ workflowId: wf.id, expectedRevision: loadedRevision, meta: b.meta, graph: b.graph, actorId: viewer.id });
    setBusy(null);
    if (!r.ok) {
      setConfirmPublish(false);
      if (r.issues) setProblemsOpen(true);
      return toast(WORKFLOW_ERRORS[r.error]);
    }
    const fresh = r.db.workflows[wf.id];
    setConfirmPublish(false);
    setEditing(false);
    setLoadedRevision(fresh.revision);
    const snap = { meta: metaOf(fresh), graph: r.db.workflowVersions[fresh.currentVersionId!].graph };
    b.reset(snap);
    setBaseline(JSON.stringify(snap));
    toast(`Version ${r.versionNo} published. New requests use it from now on.`);
    if (!allotmentsOf(r.db, wf.id).length) setAllotting(true);
  };

  const discard = async () => {
    setBusy("discard");
    const r = await workflowService.discardDraft({ workflowId: wf.id, expectedRevision: loadedRevision, actorId: viewer.id });
    setBusy(null);
    setConfirmDiscard(false);
    if (!r.ok) return toast(WORKFLOW_ERRORS[r.error]);
    const fresh = r.db.workflows[wf.id];
    const snap = { meta: metaOf(fresh), graph: r.db.workflowVersions[fresh.currentVersionId!].graph };
    b.reset(snap);
    setBaseline(JSON.stringify(snap));
    setLoadedRevision(fresh.revision);
    setEditing(false);
    toast("Draft discarded");
  };

  const reloadLatest = () => {
    const latest = useAppStore.getState().db?.workflows[wf.id];
    if (!latest) return;
    const snap = { meta: metaOf(latest), graph: normalizeGraph(structuredClone(latest.draft ?? (latest.currentVersionId ? useAppStore.getState().db!.workflowVersions[latest.currentVersionId].graph : { nodes: [], edges: [] }))) };
    b.reset(snap);
    setBaseline(JSON.stringify(snap));
    setLoadedRevision(latest.revision);
    setEditing(!!latest.draft && canEdit);
  };

  const pickIssue = (i: WorkflowIssue) => {
    if (i.nodeId) {
      setSelection({ kind: "node", id: i.nodeId });
      setFocus({ id: i.nodeId, n: Date.now() });
    } else setSelection(null);
    setSide("inspector");
  };

  return (
    <div className="flex h-full min-h-[640px] flex-col">
      {/* Toolbar */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-5 py-3">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Back to workflows"
          onClick={() => (dirty ? setConfirmLeave(true) : router.push("/workflows"))}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-bold tracking-tight text-ink">{b.meta.name.en || "Untitled workflow"}</h1>
            <WorkflowStatusPill status={wf.status} />
            {wf.currentVersionId && (
              <span className="inline-flex h-5 items-center rounded-md bg-hover px-1.5 font-mono text-2xs font-semibold text-ink-2">
                v{db.workflowVersions[wf.currentVersionId]?.versionNo} live
              </span>
            )}
          </div>
          <p className="truncate text-xs text-ink-3">
            {db.badgeTypes[b.meta.badgeTypeId]?.name.en} · {stagesOf(graph).length} stages · {allotted} registration{allotted === 1 ? "" : "s"}
            {editing && <span className={cn("ms-2 font-medium", dirty ? "text-amber-700" : "text-ink-3")}>{dirty ? "● Unsaved changes" : wf.draftSavedAt ? `Draft saved ${fmt.ago(wf.draftSavedAt, now)}` : ""}</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {editable && (
            <>
              <Tooltip content="Undo (Ctrl+Z)">
                <Button size="sm" variant="ghost" iconOnly aria-label="Undo" disabled={!b.canUndo} onClick={b.undo}>
                  <Undo2 className="size-4" />
                </Button>
              </Tooltip>
              <Tooltip content="Redo (Ctrl+Y)">
                <Button size="sm" variant="ghost" iconOnly aria-label="Redo" disabled={!b.canRedo} onClick={b.redo}>
                  <Redo2 className="size-4" />
                </Button>
              </Tooltip>
              <span className="mx-1 h-5 w-px bg-line" />
            </>
          )}
          <Button size="sm" onClick={() => setSide(side === "versions" ? "inspector" : "versions")}>
            <History className="size-3.5" />
            Versions
            <span className="tabular text-ink-3">{versions.length}</span>
          </Button>
          {canEdit && wf.currentVersionId && wf.status === "active" && (
            <Button size="sm" onClick={() => setAllotting(true)}>
              <Share2 className="size-3.5" />
              Allot
              <span className="tabular text-ink-3">{allotted}</span>
            </Button>
          )}
          <span className="mx-1 h-5 w-px bg-line" />
          {editing ? (
            <>
              {wf.draft && wf.currentVersionId && (
                <Button size="sm" variant="ghost" onClick={() => setConfirmDiscard(true)} disabled={busy !== null}>
                  <Trash2 className="size-3.5" />
                  Discard draft
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setProblemsOpen(true);
                  toast(errors.length ? `${errors.length} problem${errors.length === 1 ? "" : "s"} found` : "No problems found");
                }}
              >
                <ShieldCheck className="size-3.5" />
                Validate
              </Button>
              <Button size="sm" onClick={() => void saveDraft()} disabled={busy !== null || stale || !dirty}>
                {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Save draft
              </Button>
              {canPublish && (
                <Button size="sm" variant="primary" onClick={tryPublish} disabled={busy !== null || stale}>
                  <Rocket className="size-3.5" />
                  Publish
                </Button>
              )}
            </>
          ) : canEdit ? (
            <Button size="sm" variant="primary" onClick={startEditing}>
              <Pencil className="size-3.5" />
              Edit workflow
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3">
              <Lock className="size-3.5" />
              View only
            </span>
          )}
        </div>
      </header>

      {stale && (
        <div role="alert" className="flex items-center gap-3 border-b border-attention/20 bg-attention-soft px-5 py-2.5 text-sm text-attention">
          <TriangleAlert className="size-4 shrink-0" />
          <span className="flex-1">Someone changed this workflow in another session. Load the latest version before saving.</span>
          <Button size="sm" onClick={reloadLatest}>
            Load latest
          </Button>
        </div>
      )}
      {!editing && !viewingVersion && wf.currentVersionId && (
        <div className="flex items-center gap-2.5 border-b border-line bg-subtle px-5 py-2 text-xs text-ink-2">
          <Eye className="size-3.5 text-ink-3" />
          Showing the live version (v{db.workflowVersions[wf.currentVersionId]?.versionNo}). Published versions can’t be changed.
          {canEdit && " Edit workflow starts a new draft."}
        </div>
      )}
      {viewingVersion && (
        <div className="flex items-center gap-2.5 border-b border-violet-200 bg-violet-50 px-5 py-2 text-xs text-violet-900">
          <History className="size-3.5" />
          <span className="flex-1">
            Viewing version {viewingVersion.versionNo}, read-only. {openRequestsByVersion(db, wf.id).get(viewingVersion.id) ?? 0} request(s) in progress still use it.
          </span>
          <Button size="sm" onClick={() => setViewing(null)}>
            Back to {editing ? "draft" : "current"}
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <ReactFlowProvider key={viewing ?? (editing ? "edit" : "view")}>
          <Canvas
            graph={graph}
            issues={issues}
            editable={editable}
            selection={selection}
            setSelection={setSelection}
            b={b}
            focus={focus}
            overlay={!viewingVersion && editing ? <ProblemsPanel issues={issues} text={text} open={problemsOpen} setOpen={setProblemsOpen} onPick={pickIssue} /> : null}
          />
        </ReactFlowProvider>
        <aside className="w-[22rem] shrink-0 overflow-y-auto border-s border-line bg-surface">
          {side === "versions" ? (
            <VersionsPanel wf={wf} viewing={viewing} onView={setViewing} onClose={() => setSide("inspector")} />
          ) : (
            <fieldset disabled={!editable} className="contents">
              <Inspector
                db={db}
                meta={b.meta}
                graph={graph}
                selection={selection}
                editable={editable}
                published={!!wf.currentVersionId}
                issues={issues}
                issueText={text}
                b={b}
                onSelect={setSelection}
              />
            </fieldset>
          )}
        </aside>
      </div>

      {confirmPublish && (
        <ActionDialog
          open
          onOpenChange={(o) => !o && setConfirmPublish(false)}
          title={`Publish version ${nextVersion}?`}
          description="Published versions can’t be changed. To change it later, edit the workflow and publish again."
          icon={
            <DialogIcon className="bg-indigo-50 text-indigo-600">
              <Rocket className="size-5" />
            </DialogIcon>
          }
          confirmLabel={`Publish v${nextVersion}`}
          busy={busy === "publish"}
          onConfirm={() => void publish()}
        >
          <ul className="space-y-2 text-sm text-ink-2">
            <li className="flex gap-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              All publish checks pass{issues.length ? ` (${issues.length} warning${issues.length === 1 ? "" : "s"})` : ""}.
            </li>
            <li className="flex gap-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              New requests for {allotted || "no"} allotted registration{allotted === 1 ? "" : "s"} will use v{nextVersion}.
            </li>
            {wf.currentVersionId && (
              <li className="flex gap-2">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                {inProgress} request{inProgress === 1 ? "" : "s"} in progress stay on v{db.workflowVersions[wf.currentVersionId]?.versionNo}.
              </li>
            )}
          </ul>
        </ActionDialog>
      )}
      {confirmDiscard && (
        <ActionDialog
          open
          onOpenChange={(o) => !o && setConfirmDiscard(false)}
          title="Discard this draft?"
          description="The draft is deleted and the builder goes back to the live version. This can't be undone."
          confirmLabel="Discard draft"
          confirmVariant="danger"
          busy={busy === "discard"}
          onConfirm={() => void discard()}
        />
      )}
      {confirmLeave && (
        <ActionDialog
          open
          onOpenChange={(o) => !o && setConfirmLeave(false)}
          title="Leave without saving?"
          description="Your changes since the last save will be lost."
          confirmLabel="Leave"
          confirmVariant="danger"
          onConfirm={() => router.push("/workflows")}
        />
      )}
      {allotting && wf.currentVersionId && wf.status === "active" && <AllotDialog db={db} wf={wf} onClose={() => setAllotting(false)} />}
    </div>
  );
}

export function BuilderPage({ id }: { id: ID }) {
  const db = useDb();
  const viewer = useViewer();
  const wf = db.workflows[id];
  if (!viewer.can("workflows.view") && !viewer.can("workflows.edit")) {
    return <EmptyState icon={Lock} title="You can't see workflows" body="Workflows need the Workflows View permission." />;
  }
  if (!wf) {
    return (
      <EmptyState
        icon={SearchX}
        title="Workflow not found"
        action={
          <Link href="/workflows" className="text-sm text-accent-text hover:underline">
            Back to workflows
          </Link>
        }
      />
    );
  }
  return <BuilderInner key={wf.id} wf={wf} />;
}
