"use client";

import { useCallback, useReducer } from "react";
import { normalizeGraph, type WorkflowMeta } from "@/domain/workflowAdmin";
import type { WorkflowGraph } from "@/domain/types";

/**
 * Builder state with undo / redo. Every structural edit pushes a snapshot;
 * dragging pushes one snapshot when the drag starts, not on every move.
 */

export interface Snapshot {
  meta: WorkflowMeta;
  graph: WorkflowGraph;
}

interface State extends Snapshot {
  past: Snapshot[];
  future: Snapshot[];
}

type Action =
  | { type: "reset"; snap: Snapshot }
  | { type: "graph"; fn: (g: WorkflowGraph) => WorkflowGraph; history: boolean }
  | { type: "meta"; patch: Partial<WorkflowMeta> }
  | { type: "checkpoint" }
  | { type: "undo" }
  | { type: "redo" };

const LIMIT = 60;
const snap = (s: State): Snapshot => ({ meta: s.meta, graph: s.graph });

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "reset":
      return { ...a.snap, past: [], future: [] };
    case "checkpoint":
      return { ...s, past: [...s.past.slice(-LIMIT), snap(s)], future: [] };
    case "graph": {
      const graph = normalizeGraph(a.fn(s.graph));
      return a.history ? { ...s, graph, past: [...s.past.slice(-LIMIT), snap(s)], future: [] } : { ...s, graph };
    }
    case "meta":
      return { ...s, meta: { ...s.meta, ...a.patch }, past: [...s.past.slice(-LIMIT), snap(s)], future: [] };
    case "undo": {
      const prev = s.past.at(-1);
      return prev ? { ...prev, past: s.past.slice(0, -1), future: [snap(s), ...s.future] } : s;
    }
    case "redo": {
      const next = s.future[0];
      return next ? { ...next, past: [...s.past, snap(s)], future: s.future.slice(1) } : s;
    }
  }
}

export function useBuilder(initial: Snapshot) {
  const [state, dispatch] = useReducer(reducer, initial, (i) => ({ ...i, graph: normalizeGraph(i.graph), past: [], future: [] }));
  return {
    meta: state.meta,
    graph: state.graph,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    reset: useCallback((s: Snapshot) => dispatch({ type: "reset", snap: s }), []),
    edit: useCallback((fn: (g: WorkflowGraph) => WorkflowGraph, history = true) => dispatch({ type: "graph", fn, history }), []),
    setMeta: useCallback((patch: Partial<WorkflowMeta>) => dispatch({ type: "meta", patch }), []),
    checkpoint: useCallback(() => dispatch({ type: "checkpoint" }), []),
    undo: useCallback(() => dispatch({ type: "undo" }), []),
    redo: useCallback(() => dispatch({ type: "redo" }), []),
  };
}

export type Builder = ReturnType<typeof useBuilder>;
